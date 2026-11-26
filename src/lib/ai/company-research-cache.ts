import { db, records, companyResearchCache } from "@/lib/db";
import { and, eq, sql } from "drizzle-orm";
import { normalizeCompanyName } from "./company-name";
import { companyResearchMode } from "./company-research-mode";
import { logAiUsage } from "./quota";
import type { CompanyResearchResult } from "./search";

/** 조사 실패 시 search.ts가 채워 넣는 문구 — 캐시로 재사용하면 안 된다. */
export const NOT_FOUND_MARK = "정보를 찾을 수 없습니다";

type CachedResearch = Omit<CompanyResearchResult, "usage">;

/**
 * 같은 org에서 이미 조사한 회사 정보를 찾아 반환한다. 없으면 null.
 *
 * 웹서치 1건이 약 19,000 input tokens + 검색요청 1.6회이므로, 대량 발송에서
 * 같은 회사가 여러 레코드에 걸쳐 있으면 그만큼 그대로 중복 과금된다.
 *
 * 미리 조사해 가져온 회사 조사 보관함(company_research_cache)을 먼저 보고,
 * 없으면 레코드에 붙은 지난 조사 결과를 찾는다.
 *
 * 조사에 실패한("정보를 찾을 수 없습니다") 결과는 재사용하지 않는다 —
 * 다음 기회에 다시 시도할 수 있어야 한다.
 *
 * @security orgId로 조회 범위를 제한한다. 호출부가 넘기는 orgId가 곧 격리 경계이므로
 *           요청에서 검증된 값만 넘길 것.
 */
export async function findCachedCompanyResearch(
    orgId: string,
    companyName: string
): Promise<CachedResearch | null> {
    const key = normalizeCompanyName(companyName);
    if (!key) return null;

    const [stored] = await db
        .select({ research: companyResearchCache.research })
        .from(companyResearchCache)
        .where(and(eq(companyResearchCache.orgId, orgId), eq(companyResearchCache.nameKey, key)))
        .limit(1);
    if (stored && !(stored.research.description ?? "").includes(NOT_FOUND_MARK)) return stored.research;

    const [row] = await db
        .select({ research: sql<CachedResearch>`${records.data} -> '_companyResearch'` })
        .from(records)
        .where(
            and(
                eq(records.orgId, orgId),
                sql`${records.data} ? '_companyResearch'`,
                // 저장된 회사명도 같은 규칙으로 정규화해서 비교한다.
                sql`regexp_replace(
                        lower(${records.data} -> '_companyResearch' ->> 'companyName'),
                        '\\(주\\)|㈜|주식회사|\\(유\\)|유한회사|\\s+',
                        '',
                        'g'
                    ) = ${key}`,
                sql`coalesce(${records.data} -> '_companyResearch' ->> 'description', '') NOT LIKE ${'%' + NOT_FOUND_MARK + '%'}`
            )
        )
        .limit(1);

    return row?.research ?? null;
}

/** 조사 결과를 조직 보관함에 넣는다. 이미 있는 회사는 새 결과로 바꾼다. */
export async function saveCompanyResearch(
    orgId: string,
    items: Array<{ nameKey: string; research: CachedResearch; researchedAt: Date }>,
    source: "import" | "serper"
) {
    if (!items.length) return 0;
    await db
        .insert(companyResearchCache)
        .values(items.map((i) => ({ orgId, nameKey: i.nameKey, research: i.research, source, researchedAt: i.researchedAt })))
        .onConflictDoUpdate({
            target: [companyResearchCache.orgId, companyResearchCache.nameKey],
            set: {
                research: sql`excluded.research`,
                source: sql`excluded.source`,
                researchedAt: sql`excluded.researched_at`,
                updatedAt: sql`now()`,
            },
        });
    return items.length;
}

/**
 * Serper로 새로 조사한 회사를 보관함에 쌓는다 — 같은 회사의 다음 레코드는 검색 없이 이 결과를 쓴다.
 * 레코드에 적힌 회사명으로 넣어야 findCachedCompanyResearch가 같은 값으로 찾는다.
 * 간단 조사(그 레코드의 CRM 정보)와 Claude 웹검색 결과는 넣지 않는다(후자는 레코드에서 찾는다).
 * serper 방식인데 간단 조사로 끝났으면(검색·정리 실패, 회사 확인 못 함) 토큰 0인 사용 기록을 남긴다 — 실험실의 회사 조사 관찰이 센다.
 * 넣다가 실패해도 메일은 그대로 진행한다.
 */
export async function rememberCompanyResearch(orgId: string, companyName: string, research: CompanyResearchResult) {
    if (research.method === "compact" && companyResearchMode() === "serper") {
        await logAiUsage({ orgId, userId: null, provider: "serper", model: "compact-fallback", promptTokens: 0, completionTokens: 0, purpose: "company_research_fallback" })
            .catch((error) => console.error("[CompanyResearch] 대체 기록 실패:", error));
        return;
    }
    const nameKey = normalizeCompanyName(companyName);
    if (!nameKey || research.method !== "serper") return;
    const { usage: _, ...stored } = research;
    void _;
    try {
        await saveCompanyResearch(orgId, [{ nameKey, research: stored, researchedAt: new Date() }], "serper");
    } catch (error) {
        console.error("[CompanyResearch] 보관함 저장 실패:", error);
    }
}
