import { docSources, publishedDocs } from "./library";
import { isUsableSupportClaim } from "./knowledge-validity";
import {
    requireCustomerAccess,
    customerAccessPredicate,
} from "@/lib/customer-access/access";
import { and, desc, eq, ilike, lt, sql } from "drizzle-orm";
import {
    db,
    customerAiSettings as settings,
    customerAiSettingsHistory as history,
    aiCopyKnowledgeVersions as knowledge,
    workspaces,
    organizationMembers,
    users,
    queryClient,
} from "@/lib/db";
import type { DbExec } from "@/lib/db/tx";
import type { SalesActor } from "@/lib/customer-platform/sales-repository";
import { InboxError } from "@/lib/inbox/errors";
import { AI_MODELS } from "@/lib/ai/models";
import { getAiClient } from "@/lib/ai/client";
import {
    createKnowledgeVersion,
    approveKnowledge,
    blockVersion,
} from "@/lib/ai-copy/versions";
import { CopyActionError } from "@/lib/ai-copy/errors";
import type { CopyConnection } from "@/lib/ai-copy/types";
import {
    aiSettingsInput,
    defaultAiSettings,
    type AiSettingsSnapshot,
} from "./rules";
import { supportWorkerEnabled } from "./worker-policy";
export const aiWorkerEnabled = (workspaceId?: number) =>
    supportWorkerEnabled(process.env, workspaceId);
export async function getSupportSettings(
    orgId: string,
    workspaceId: number,
    exec: DbExec = db,
    lock = false,
): Promise<AiSettingsSnapshot> {
    const query = exec
        .select()
        .from(settings)
        .where(
            and(
                eq(settings.orgId, orgId),
                eq(settings.workspaceId, workspaceId),
            ),
        );
    const [row] = lock ? await query.for("share") : await query;
    return row
        ? aiSettingsInput.parse({
              version: row.version,
              mode: row.mode,
              knowledgeVersionId: row.knowledgeVersionId,
              model: row.model,
              instructions: row.instructions,
              handoffAssigneeId: row.handoffAssigneeId,
              handoffMessage: row.handoffMessage,
              maxJobsPerDay: row.maxJobsPerDay,
          })
        : { ...defaultAiSettings };
}
/**
 * 상담 AI가 답변 근거로 쓰는 지식 — 상담 설정 › AI 응대 › 상담 지식에서 공개한 문서·FAQ.
 * (예전 승인 지식 버전 id는 받기만 하고 쓰지 않는다. 0148에서 문서로 옮겼다)
 */
export async function chatKnowledge(
    orgId: string,
    workspaceId: number,
    _legacyVersionId: number | null,
    exec: DbExec = db,
    _now = new Date(),
    lock = false,
) {
    void _legacyVersionId;
    void _now;
    const sources = docSources(await publishedDocs(orgId, workspaceId, exec, lock));
    return { version: sources.length ? { fingerprint: sources[0].fingerprint } : null, sources };
}
export async function supportCatalog(
    actor: SalesActor,
    workspaceId: number,
    exec: DbExec = db,
) {
    await requireCustomerAccess(actor, workspaceId, "read", exec);
    const config = await getSupportSettings(actor.orgId, workspaceId, exec),
        versions = await exec
            .select()
            .from(knowledge)
            .where(
                and(
                    eq(knowledge.orgId, actor.orgId),
                    eq(knowledge.workspaceId, workspaceId),
                ),
            )
            .orderBy(desc(knowledge.id))
            .limit(100),
        events = await exec
            .select()
            .from(history)
            .where(
                and(
                    eq(history.orgId, actor.orgId),
                    eq(history.workspaceId, workspaceId),
                ),
            )
            .orderBy(desc(history.createdAt), desc(history.id))
            .limit(100);
    if (
        config.knowledgeVersionId &&
        !versions.some((v) => v.id === config.knowledgeVersionId)
    ) {
        const [bound] = await exec
            .select()
            .from(knowledge)
            .where(
                and(
                    eq(knowledge.id, config.knowledgeVersionId),
                    eq(knowledge.orgId, actor.orgId),
                    eq(knowledge.workspaceId, workspaceId),
                ),
            );
        if (bound) versions.push(bound);
    }
    const now = Date.now();
    return {
        settings: config,
        knowledge: versions.map((v) => ({
            id: v.id,
            name: v.name,
            state: v.state,
            fingerprint: v.fingerprint,
            claims: v.snapshot.claims.filter(
                (c) =>
                    isUsableSupportClaim(c, now),
            ).length,
            approvedAt: v.approvedAt,
        })),
        history: events,
        models: AI_MODELS.map((m) => ({
            ...m,
            configured: !!getAiClient(m.id),
        })),
        workerEnabled: aiWorkerEnabled(workspaceId),
    };
}
export async function saveSupportSettings(
    actor: SalesActor,
    workspaceId: number,
    raw: unknown,
    exec: DbExec = db,
) {
    const input = aiSettingsInput.parse(raw);
    await requireCustomerAccess(actor, workspaceId, "manage", exec);
    return exec.transaction(async (tx) => {
        await tx
            .select({ id: workspaces.id })
            .from(workspaces)
            .where(eq(workspaces.id, workspaceId))
            .for("update");
        const current = await getSupportSettings(actor.orgId, workspaceId, tx);
        if (input.version !== current.version)
            throw new InboxError(
                "AI 설정이 변경되었습니다. 최신 설정을 불러온 뒤 저장해주세요.",
                409,
            );
        if (input.mode !== "manual") {
            const facts = await chatKnowledge(actor.orgId, workspaceId, null, tx);
            if (!facts.sources.length)
                throw new InboxError("AI 자동 답변을 켜려면 상담 지식에 공개한 문서나 FAQ가 하나 이상 있어야 합니다.");
            if (!getAiClient(input.model)) throw new InboxError("선택한 AI 모델이 아직 연결되지 않았습니다.");
        }
        if (input.handoffAssigneeId) {
            const [member] = await tx
                .select({ id: users.id })
                .from(users)
                .innerJoin(
                    organizationMembers,
                    eq(organizationMembers.userId, users.id),
                )
                .where(
                    and(
                        eq(users.id, input.handoffAssigneeId),
                        eq(users.isActive, 1),
                        eq(organizationMembers.organizationId, actor.orgId),
                        customerAccessPredicate(
                            actor.orgId,
                            users.id,
                            sql`${workspaceId}`,
                            "respond",
                        ),
                    ),
                );
            if (!member)
                throw new InboxError("이 사업의 상담 권한이 있는 활성 담당자를 선택해주세요.");
        }
        const snapshot = { ...input, version: current.version + 1 };
        await tx
            .insert(settings)
            .values({
                ...snapshot,
                workspaceId,
                orgId: actor.orgId,
                changedBy: actor.userId,
            })
            .onConflictDoUpdate({
                target: settings.workspaceId,
                set: {
                    ...snapshot,
                    changedBy: actor.userId,
                    updatedAt: new Date(),
                },
            });
        await tx.insert(history).values({
            orgId: actor.orgId,
            workspaceId,
            version: snapshot.version,
            actorName: actor.name,
            snapshot,
        });
        return snapshot;
    });
}
export async function listSupportKnowledge(
    actor: SalesActor,
    workspaceId: number,
    before?: number,
    exec: DbExec = db,
    // 설정 선택기용(UX-301): 승인되었고 고객 상담 목적 사실이 있는 버전만, 이름 검색은 선택.
    filter: { approvedForChat?: boolean; q?: string } = {},
) {
    await requireCustomerAccess(actor, workspaceId, "read", exec);
    const q = filter.q?.trim();
    const rows = await exec
        .select()
        .from(knowledge)
        .where(
            and(
                eq(knowledge.orgId, actor.orgId),
                eq(knowledge.workspaceId, workspaceId),
                before ? lt(knowledge.id, before) : undefined,
                filter.approvedForChat ? eq(knowledge.state, "approved") : undefined,
                filter.approvedForChat
                    ? sql`EXISTS (SELECT 1 FROM jsonb_array_elements(${knowledge.snapshot}->'claims') AS c WHERE c->'purposes' @> '["customer_chat"]'::jsonb)`
                    : undefined,
                q ? ilike(knowledge.name, `%${q.replace(/[\\%_]/g, "\\$&")}%`) : undefined,
            ),
        )
        .orderBy(desc(knowledge.id))
        .limit(50);
    return {
        rows: rows.map((v) => ({
            ...v,
            workspace_id: v.workspaceId,
            created_by: v.createdBy,
            created_at: v.createdAt,
            last_changed_at: v.lastChangedAt,
            last_changed_by: v.lastChangedBy,
            state_reason: v.stateReason,
        })),
        hasMore: rows.length === 50,
    };
}
export async function manageSupportKnowledge(
    actor: SalesActor,
    workspaceId: number,
    input: {
        action: "create" | "approve" | "block";
        id?: number;
        name?: string;
        snapshot?: unknown;
        reason?: string;
    },
    exec: DbExec = db,
    provided?: CopyConnection,
) {
    await requireCustomerAccess(actor, workspaceId, "manage", exec);
    if (input.action !== "create") {
        const [owned] = await exec
            .select({ id: knowledge.id })
            .from(knowledge)
            .where(
                and(
                    eq(knowledge.id, input.id!),
                    eq(knowledge.orgId, actor.orgId),
                    eq(knowledge.workspaceId, workspaceId),
                ),
            );
        if (!owned) throw new InboxError("지식 버전을 찾을 수 없습니다.", 404);
    }
    const conn = provided ?? (await queryClient.reserve());
    try {
        if (input.action === "create")
            return await createKnowledgeVersion(conn, {
                orgId: actor.orgId,
                workspaceId,
                userId: actor.userId,
                name: input.name!,
                snapshot: input.snapshot,
            });
        if (input.action === "approve") {
            await approveKnowledge(conn, {
                orgId: actor.orgId,
                id: input.id!,
                userId: actor.userId,
                now: new Date(),
            });
            return { approved: true };
        }
        return await blockVersion(conn, {
            orgId: actor.orgId,
            userId: actor.userId,
            id: input.id!,
            kind: "knowledge",
            reason: input.reason ?? "",
        });
    } catch (error) {
        if (error instanceof CopyActionError)
            throw new InboxError(error.message);
        throw error;
    } finally {
        if (!provided) conn.release();
    }
}
