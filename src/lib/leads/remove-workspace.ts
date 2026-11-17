import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/** 리드관리 탭 삭제 — 빈 리드함·리드 폴더를 지운다 */
export function removeLeadWorkspace(orgId: string, workspaceId: number) {
    return removeWorkspaceBoxes(orgId, workspaceId, "lead");
}

/**
 * 리드관리(lead)·레코드(cold)에서 사업부 탭 빼기 — 그 사업부의 그 종류 파티션과 폴더를 지운다.
 * 레코드가 하나라도 있거나, 웹 폼·자동발송·광고 연동이 걸린 파티션이 있으면 지우지 않는다 (함께 지워지므로).
 */
export async function removeWorkspaceBoxes(orgId: string, workspaceId: number, category: "lead" | "cold"): Promise<{ ok: true } | { ok: false; error: string }> {
    const unit = category === "lead" ? "리드" : "레코드";
    return db.transaction(async (tx) => {
        const [check] = Array.from(
            await tx.execute<{ owned: boolean; parts: number; leads: number; linked: number }>(sql`
                WITH p AS (
                    SELECT p.id FROM partitions p JOIN workspaces w ON w.id = p.workspace_id
                    WHERE w.id = ${workspaceId} AND w.org_id = ${orgId} AND p.category = ${category}
                )
                SELECT
                    EXISTS (SELECT 1 FROM workspaces WHERE id = ${workspaceId} AND org_id = ${orgId}) AS owned,
                    (SELECT count(*) FROM p)::int AS parts,
                    (SELECT count(*) FROM records WHERE partition_id IN (SELECT id FROM p))::int AS leads,
                    ((SELECT count(*) FROM web_forms WHERE partition_id IN (SELECT id FROM p))
                     + (SELECT count(*) FROM email_template_links WHERE partition_id IN (SELECT id FROM p))
                     + (SELECT count(*) FROM alimtalk_template_links WHERE partition_id IN (SELECT id FROM p))
                     + (SELECT count(*) FROM email_auto_personalized_links WHERE partition_id IN (SELECT id FROM p))
                     + (SELECT count(*) FROM ad_lead_integrations WHERE partition_id IN (SELECT id FROM p)))::int AS linked
            `),
        );
        if (!check?.owned) return { ok: false as const, error: "사업부를 찾을 수 없습니다." };
        if (check.leads > 0) return { ok: false as const, error: `${unit}가 ${check.leads}건 있어 뺄 수 없습니다.` };
        if (check.linked > 0) return { ok: false as const, error: "웹 폼이나 자동발송이 연결된 파티션이 있어 뺄 수 없습니다." };

        await tx.execute(sql`DELETE FROM partitions WHERE workspace_id = ${workspaceId} AND category = ${category}`);
        await tx.execute(sql`DELETE FROM folders WHERE workspace_id = ${workspaceId} AND category = ${category}`);
        return { ok: true as const };
    });
}
