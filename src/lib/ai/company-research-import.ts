import { z } from "zod";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, companyResearchCache, emailAutoPersonalizedLinks, records, scheduledRegistrations } from "@/lib/db";
import { normalizeCompanyName } from "./company-name";
import { NOT_FOUND_MARK } from "./company-research-cache";
import type { CompanyResearchResult } from "./search";

// 미리 조사한 회사 정보를 가져와 보관함에 넣는다 (예: Gemini 구독으로 예약 등록 대기 명단을 미리 조사).
// 자동 메일은 findCachedCompanyResearch로 보관함을 먼저 보므로, 넣어 둔 회사는 웹검색 없이 메일을 쓴다.

export const MAX_IMPORT_ITEMS = 200;
export const MAX_TARGETS = 500;

type StoredResearch = Omit<CompanyResearchResult, "usage">;

const httpUrl = z.url().refine((u) => /^https?:\/\//i.test(u), "http(s) 주소만 받습니다.");
const itemSchema = z.object({
    companyName: z.string().trim().min(1).max(200),
    industry: z.string().trim().max(200).default(""),
    description: z.string().trim().min(1).max(2000),
    services: z.string().trim().max(1000).default(""),
    employees: z.string().trim().max(100).default(""),
    website: z.string().trim().max(300).default(""),
    sources: z.array(z.object({ url: httpUrl, title: z.string().trim().max(300).default("") })).max(10).default([]),
    researchedAt: z.iso.datetime({ offset: true }).optional(),
});

export interface ParsedResearchItem {
    nameKey: string;
    research: StoredResearch;
    researchedAt: Date;
}
export interface SkippedResearchItem {
    index: number;
    companyName: string | null;
    reason: string;
}

/**
 * 가져온 조사 결과를 검사한다. 형식이 틀리거나 조사 실패 문구인 항목은 건너뛰고(이유를 돌려준다),
 * 같은 회사(정규화 키)가 여러 번 오면 마지막 항목을 쓴다. 미래 조사 시각은 지금으로 맞춘다.
 */
export function parseResearchItems(items: unknown[], now: Date) {
    const byKey = new Map<string, ParsedResearchItem>();
    const skipped: SkippedResearchItem[] = [];
    items.forEach((raw, index) => {
        const rawName = (raw as { companyName?: unknown } | null)?.companyName;
        const companyName = typeof rawName === "string" ? rawName : null;
        const parsed = itemSchema.safeParse(raw);
        if (!parsed.success) {
            const fields = [...new Set(parsed.error.issues.map((i) => i.path.join(".") || "항목"))];
            skipped.push({ index, companyName, reason: `형식 오류(${fields.join(", ")})` });
            return;
        }
        const { researchedAt, ...research } = parsed.data;
        const nameKey = normalizeCompanyName(research.companyName);
        if (!nameKey) return void skipped.push({ index, companyName, reason: "회사명 없음" });
        if (research.description.includes(NOT_FOUND_MARK))
            return void skipped.push({ index, companyName, reason: "조사 실패 문구" });
        const at = researchedAt ? new Date(researchedAt) : now;
        byKey.set(nameKey, { nameKey, research, researchedAt: at > now ? now : at });
    });
    return { valid: [...byKey.values()], skipped };
}

// records의 0068 색인과 같은 식이어야 색인을 탄다 (normalizeCompanyName과 같은 규칙)
const recordResearchKey = sql<string>`regexp_replace(
    lower(${records.data} -> '_companyResearch' ->> 'companyName'),
    '\\(주\\)|㈜|주식회사|\\(유\\)|유한회사|\\s+',
    '',
    'g'
)`;

/**
 * 예약 등록 대기 명단에서 곧 들어올 회사 중 아직 조사하지 않은 회사를 등록 순서대로 고른다.
 * 회사 자동 조사가 켜진 활성 규칙의 회사명 칸만 본다. 보관함이나 레코드에 이미 조사 결과가 있는 회사는 뺀다.
 */
export async function listResearchTargets(orgId: string, partitionId: number, limit: number) {
    const rules = await db
        .select({ companyField: emailAutoPersonalizedLinks.companyField })
        .from(emailAutoPersonalizedLinks)
        .where(
            and(
                eq(emailAutoPersonalizedLinks.partitionId, partitionId),
                eq(emailAutoPersonalizedLinks.isActive, 1),
                eq(emailAutoPersonalizedLinks.autoResearch, 1),
            ),
        );
    const companyFields = [...new Set(rules.map((r) => r.companyField).filter(Boolean))];
    if (!companyFields.length) return { companyFields, scanned: 0, items: [] as { companyName: string }[] };

    // 대기 명단은 매일 id 순서대로 등록된다(scheduled-registration.ts) — 앞쪽부터 넉넉히 읽어 중복·조사된 회사를 거른다
    const rows = await db
        .select({ data: scheduledRegistrations.data })
        .from(scheduledRegistrations)
        .where(
            and(
                eq(scheduledRegistrations.orgId, orgId),
                eq(scheduledRegistrations.partitionId, partitionId),
                eq(scheduledRegistrations.status, "pending"),
            ),
        )
        .orderBy(asc(scheduledRegistrations.id))
        .limit(Math.min(limit * 4, MAX_TARGETS * 4));
    const names = new Map<string, string>();
    for (const row of rows)
        for (const field of companyFields) {
            const value = row.data?.[field];
            if (typeof value !== "string") continue;
            const key = normalizeCompanyName(value);
            if (key && !names.has(key)) names.set(key, value.trim());
        }
    const keys = [...names.keys()];
    if (!keys.length) return { companyFields, scanned: rows.length, items: [] };

    const [stored, researched] = await Promise.all([
        db
            .select({ key: companyResearchCache.nameKey })
            .from(companyResearchCache)
            .where(and(eq(companyResearchCache.orgId, orgId), inArray(companyResearchCache.nameKey, keys))),
        db
            .select({ key: recordResearchKey })
            .from(records)
            .where(
                and(
                    eq(records.orgId, orgId),
                    sql`${records.data} ? '_companyResearch'`,
                    inArray(recordResearchKey, keys),
                    sql`coalesce(${records.data} -> '_companyResearch' ->> 'description', '') NOT LIKE ${"%" + NOT_FOUND_MARK + "%"}`,
                ),
            )
            .groupBy(recordResearchKey),
    ]);
    const done = new Set([...stored, ...researched].map((r) => r.key));
    const items = keys
        .filter((k) => !done.has(k))
        .slice(0, limit)
        .map((k) => ({ companyName: names.get(k)! }));
    return { companyFields, scanned: rows.length, items };
}
