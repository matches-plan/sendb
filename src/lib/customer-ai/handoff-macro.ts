import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { inboxAuditEvents, inboxMacros, inboxMessages } from "@/lib/db";
import type { DbExec } from "@/lib/db/tx";
import { sendSystemReply } from "@/lib/inbox/repository";
import { publishedDocs } from "./library";
import { followupMacroName } from "./handoff-followup-rules";
import { requestUuid } from "./rules";

export const HANDOFF_AUTOMATIC_AUTHOR = "상담 자동 안내";

export async function findHandoffMacro(
    exec: DbExec, orgId: string, workspaceId: number, question: string,
) {
    const name = followupMacroName(question, await publishedDocs(orgId, workspaceId, exec));
    if (!name) return undefined;

    const [macro] = await exec
        .select({ body: inboxMacros.body })
        .from(inboxMacros)
        .where(and(
            eq(inboxMacros.orgId, orgId),
            eq(inboxMacros.workspaceId, workspaceId),
            eq(inboxMacros.name, name),
        ))
        .limit(1);
    return macro?.body.trim() || undefined;
}

// The caller already holds the conversation lock acquired while appending the
// customer message, so a simultaneous staff reply is serialized with this check.
export async function respondOrScheduleHandoffFollowup(
    exec: DbExec,
    chat: { id: string; orgId: string },
    workspaceId: number,
    message: { id: number; body: string },
    attachmentCount: number,
) {
    const [handoff] = await exec
        .select({ id: inboxAuditEvents.id, createdAt: inboxAuditEvents.createdAt })
        .from(inboxAuditEvents)
        .where(and(eq(inboxAuditEvents.conversationId, chat.id), eq(inboxAuditEvents.action, "ai.handoff")))
        .orderBy(desc(inboxAuditEvents.createdAt), desc(inboxAuditEvents.id))
        .limit(1);
    if (!handoff) return;

    const [staffReply] = await exec.select({ id: inboxMessages.id }).from(inboxMessages)
        .where(and(
            eq(inboxMessages.conversationId, chat.id),
            eq(inboxMessages.kind, "reply"),
            isNotNull(inboxMessages.authorId),
            sql`${inboxMessages.createdAt} >= ${handoff.createdAt.toISOString()}::timestamptz`,
        ))
        .limit(1);
    if (staffReply) return;

    const body = attachmentCount ? undefined : await findHandoffMacro(exec, chat.orgId, workspaceId, message.body);
    if (body) {
        await sendSystemReply(exec, chat.id, body,
            requestUuid(`handoff-macro:${chat.id}:${message.id}`), undefined, HANDOFF_AUTOMATIC_AUTHOR);
        return;
    }

    // A new unanswered inquiry can schedule follow-up on older handoffs too.
    await exec.update(inboxAuditEvents)
        .set({ changes: sql`${inboxAuditEvents.changes} || '{"macroFollowup":{"before":null,"after":"scheduled"}}'::jsonb` })
        .where(and(eq(inboxAuditEvents.id, handoff.id), sql`not (${inboxAuditEvents.changes} ? 'macroFollowup')`));
}
