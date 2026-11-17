import { and, eq } from "drizzle-orm";
import { db, workspaces } from "@/lib/db";

/** 이 조직의 사업부(워크스페이스)인지 — 다른 조직 사업부 id를 받지 않게 */
export async function workspaceInOrg(orgId: string, workspaceId: number): Promise<boolean> {
    if (!Number.isSafeInteger(workspaceId) || workspaceId <= 0) return false;
    const [ws] = await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(and(eq(workspaces.id, workspaceId), eq(workspaces.orgId, orgId)));
    return !!ws;
}
