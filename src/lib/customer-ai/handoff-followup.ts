import { and, asc, desc, eq, isNull, lte, sql } from "drizzle-orm";
import {
    inboxAttachments,
    inboxAuditEvents as events,
    inboxChannels as channels,
    inboxConversations as chats,
    inboxMacros,
    inboxMessages as messages,
} from "@/lib/db";
import type { DbExec } from "@/lib/db/tx";
import { sendSystemReply } from "@/lib/inbox/repository";
import { publishedDocs } from "./library";
import { requestUuid } from "./rules";
import { supportConversation } from "./queue";
import { BACKOFFICE_WORKSPACE_ID } from "./worker-policy";
import { followupMacroName, HANDOFF_FOLLOWUP_DELAY, HANDOFF_WAITING_MESSAGE } from "./handoff-followup-rules";

const authorName = "상담 자동 안내";

export async function processHandoffFollowup(exec: DbExec, now: Date) {
    const [candidate] = await exec
        .select({ id: events.id, conversationId: chats.id })
        .from(channels)
        .innerJoin(chats, eq(chats.channelId, channels.id))
        .innerJoin(events, eq(events.conversationId, chats.id))
        .where(and(
            eq(channels.workspaceId, BACKOFFICE_WORKSPACE_ID),
            eq(channels.enabled, true),
            eq(chats.medium, "web"),
            eq(chats.status, "open"),
            eq(chats.aiState, "human"),
            eq(chats.historyOnly, false),
            isNull(chats.mergedIntoId),
            eq(events.action, "ai.handoff"),
            sql`${events.changes} ? 'macroFollowup'`,
            lte(events.createdAt, new Date(now.getTime() - HANDOFF_FOLLOWUP_DELAY)),
            sql`not exists (
                select 1 from inbox_audit_events newer
                where newer.conversation_id = ${chats.id} and newer.action = 'ai.handoff'
                  and (newer.created_at, newer.id) > (${events.createdAt}, ${events.id})
            )`,
            sql`not exists (
                select 1 from inbox_messages reply
                where reply.conversation_id = ${chats.id} and reply.kind = 'reply'
                  and reply.created_at >= ${events.createdAt}
                  and (reply.author_id is not null or reply.author_name = ${authorName})
            )`,
        ))
        .orderBy(asc(events.createdAt), asc(events.id))
        .limit(1);
    if (!candidate) return false;

    return exec.transaction(async (tx) => {
        const { chat, workspaceId, enabled } = await supportConversation(candidate.conversationId, tx, true);
        if (!enabled || workspaceId !== BACKOFFICE_WORKSPACE_ID || chat.status !== "open" ||
            chat.medium !== "web" || chat.aiState !== "human" || chat.historyOnly || chat.mergedIntoId)
            return false;

        const [handoff] = await tx.select({ id: events.id, createdAt: events.createdAt })
            .from(events)
            .where(and(eq(events.conversationId, chat.id), eq(events.action, "ai.handoff")))
            .orderBy(desc(events.createdAt), desc(events.id))
            .limit(1);
        if (!handoff || handoff.id !== candidate.id) return false;

        const [reply] = await tx.select({ id: messages.id }).from(messages)
            .where(and(
                eq(messages.conversationId, chat.id),
                eq(messages.kind, "reply"),
                sql`${messages.createdAt} >= ${handoff.createdAt.toISOString()}::timestamptz`,
                sql`(${messages.authorId} is not null or ${messages.authorName} = ${authorName})`,
            )).limit(1);
        if (reply) return false;

        const [customer] = await tx.select({ id: messages.id, body: messages.body })
            .from(messages)
            .where(and(eq(messages.conversationId, chat.id), eq(messages.kind, "customer")))
            .orderBy(desc(messages.id)).limit(1);
        if (!customer) return false;
        const [attachment] = await tx.select({ id: inboxAttachments.id }).from(inboxAttachments)
            .where(eq(inboxAttachments.messageId, customer.id)).limit(1);
        const name = attachment ? undefined :
            followupMacroName(customer.body, await publishedDocs(chat.orgId, workspaceId, tx));
        const [macro] = name
            ? await tx.select({ body: inboxMacros.body }).from(inboxMacros)
                .where(and(eq(inboxMacros.orgId, chat.orgId), eq(inboxMacros.workspaceId, workspaceId), eq(inboxMacros.name, name)))
                .limit(1)
            : [];
        await sendSystemReply(tx, chat.id, macro?.body.trim() || HANDOFF_WAITING_MESSAGE,
            requestUuid(`handoff-followup:${handoff.id}`), undefined, authorName);
        return true;
    });
}
