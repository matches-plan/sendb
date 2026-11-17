import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db, memos, records } from "@/lib/db";
import type { OrgRole } from "@/types";
import { importantLeadCondition } from "./important";
import { resolveLeadInflows, type LeadInflow } from "./inflow";
import { accessibleLeadPartitions } from "./stats";

type LeadUser = { userId: string; orgId: string; role: OrgRole };

/** 리드관리 전체 탭 한 번에 보이는 최대 건수 — 사업부별로 묶어 보여 주므로 페이지를 나누지 않는다 */
export const ALL_LEADS_LIMIT = 200;

/**
 * 리드관리 전체 탭 — 볼 수 있는 모든 사업부 리드함의 최근 리드 (최근 등록순 200건).
 * important: 중요(오늘 연락·연락일 지남) 리드만. 댓글 수·마지막 댓글·유입경로를 같이 붙인다
 */
export async function listAllLeads(user: LeadUser, opts: { important: boolean; search: string }) {
    const parts = await accessibleLeadPartitions(user, null);
    if (parts.length === 0) return { data: [], total: 0, importantTotal: 0 };
    const base = [eq(records.orgId, user.orgId), inArray(records.partitionId, parts.map((p) => p.id))];
    if (opts.search) base.push(sql`${records.data}::text ILIKE ${"%" + opts.search + "%"}`);
    const where = and(...base, opts.important ? importantLeadCondition() : undefined);

    const [[{ value: total }], [{ value: importantTotal }], rows] = await Promise.all([
        db.select({ value: count() }).from(records).where(where),
        db.select({ value: count() }).from(records).where(and(...base.slice(0, 2), importantLeadCondition())),
        db
            .select({
                id: records.id,
                orgId: records.orgId,
                workspaceId: records.workspaceId,
                partitionId: records.partitionId,
                integratedCode: records.integratedCode,
                data: records.data,
                distributionOrder: records.distributionOrder,
                registeredAt: records.registeredAt,
                createdAt: records.createdAt,
                updatedAt: records.updatedAt,
            })
            .from(records)
            .where(where)
            .orderBy(desc(records.registeredAt), desc(records.id))
            .limit(ALL_LEADS_LIMIT),
    ]);
    if (rows.length === 0) return { data: [], total, importantTotal };

    const ids = rows.map((r) => r.id);
    // 유입경로는 사업부마다 따로 찾는다 (이 페이지에 나온 사업부 수만큼)
    const byWorkspace = new Map<number, typeof rows>();
    for (const r of rows) byWorkspace.set(r.workspaceId, [...(byWorkspace.get(r.workspaceId) ?? []), r]);
    const [memoCounts, latest, inflowMaps] = await Promise.all([
        db.select({ recordId: memos.recordId, n: count() }).from(memos).where(inArray(memos.recordId, ids)).groupBy(memos.recordId),
        db
            .selectDistinctOn([memos.recordId], { recordId: memos.recordId, content: memos.content })
            .from(memos)
            .where(inArray(memos.recordId, ids))
            .orderBy(memos.recordId, desc(memos.createdAt)),
        Promise.all([...byWorkspace].map(([wsId, list]) => resolveLeadInflows(user.orgId, wsId, list))),
    ]);
    const countBy = new Map(memoCounts.map((m) => [m.recordId, m.n]));
    const latestBy = new Map(latest.map((m) => [m.recordId, m.content]));
    const inflows = new Map<number, LeadInflow>();
    for (const m of inflowMaps) for (const [id, v] of m) inflows.set(id, v);
    return {
        data: rows.map((r) => ({ ...r, memoCount: countBy.get(r.id) ?? 0, latestMemo: latestBy.get(r.id) ?? null, inflow: inflows.get(r.id) })),
        total,
        importantTotal,
    };
}
