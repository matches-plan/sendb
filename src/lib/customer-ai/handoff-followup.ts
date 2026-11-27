import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import {
    customerAiSettings as settings,
    inboxAttachments,
    inboxReads,
    inboxAuditEvents as events,
    inboxChannels as channels,
    inboxConversations as chats,
    inboxMessages as messages,
} from "@/lib/db";
import type { DbExec } from "@/lib/db/tx";
import { sendSystemReply } from "@/lib/inbox/repository";
import { getSupportSettings } from "./catalog";
import { requestUuid } from "./rules";
import { supportConversation } from "./queue";
import { BACKOFFICE_WORKSPACE_ID } from "./worker-policy";
import { HANDOFF_FOLLOWUP_DELAY, HANDOFF_WAITING_MESSAGE, HANDOFF_WAITING_MESSAGES } from "./handoff-followup-rules";

import { findHandoffMacro, HANDOFF_AUTOMATIC_AUTHOR as authorName } from "./handoff-macro";

export async function processHandoffFollowup(exec: DbExec, now: Date) {
    const [candidate] = await exec
        .select({ id: events.id, conversationId: chats.id })
        .from(channels)
        .innerJoin(chats, eq(chats.channelId, channels.id))
        .innerJoin(events, eq(events.conversationId, chats.id))
        .leftJoin(settings, and(eq(settings.orgId, chats.orgId), eq(settings.workspaceId, channels.workspaceId)))
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
                select 1 from inbox_reads staff_read
                where staff_read.conversation_id = ${chats.id}
                  and staff_read.user_id = coalesce(${settings.handoffAssigneeId}, ${chats.assigneeId})
                  and staff_read.customer_seq >= ${chats.customerSeq}
            )`,
            sql`not exists (
                select 1 from inbox_messages reply
                where reply.conversation_id = ${chats.id} and reply.kind = 'reply'
                  and reply.created_at >= ${events.createdAt}
                  and (
                    reply.author_id is not null or (
                        reply.author_name = ${authorName} and (
                            reply.body in (${sql.join(HANDOFF_WAITING_MESSAGES.map((message) => sql`${message}`), sql`, `)}) or
                            reply.id > (select max(customer.id) from inbox_messages customer
                                where customer.conversation_id = ${chats.id} and customer.kind = 'customer')
                        )
                    )
                  )
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

        const config = await getSupportSettings(chat.orgId, workspaceId, tx);
        const reviewerId = config.handoffAssigneeId ?? chat.assigneeId;
        if (reviewerId) {
            const [read] = await tx.select({ id: inboxReads.id }).from(inboxReads)
                .where(and(
                    eq(inboxReads.conversationId, chat.id),
                    eq(inboxReads.userId, reviewerId),
                    gte(inboxReads.customerSeq, chat.customerSeq),
                )).limit(1);
            if (read) return false;
        }

        const [customer] = await tx.select({ id: messages.id, body: messages.body })
            .from(messages)
            .where(and(eq(messages.conversationId, chat.id), eq(messages.kind, "customer")))
            .orderBy(desc(messages.id)).limit(1);
        if (!customer) return false;
        const [reply] = await tx.select({ id: messages.id }).from(messages)
            .where(and(
                eq(messages.conversationId, chat.id),
                eq(messages.kind, "reply"),
                sql`${messages.createdAt} >= ${handoff.createdAt.toISOString()}::timestamptz`,
                sql`(${messages.authorId} is not null or (
                    ${messages.authorName} = ${authorName} and
                    (${messages.body} in (${sql.join(HANDOFF_WAITING_MESSAGES.map((message) => sql`${message}`), sql`, `)}) or ${messages.id} > ${customer.id})
                ))`,
            )).limit(1);
        if (reply) return false;

        const [attachment] = await tx.select({ id: inboxAttachments.id }).from(inboxAttachments)
            .where(eq(inboxAttachments.messageId, customer.id)).limit(1);
        const body = attachment ? undefined :
            await findHandoffMacro(tx, chat.orgId, workspaceId, customer.body);
        await sendSystemReply(tx, chat.id, body || HANDOFF_WAITING_MESSAGE,
            requestUuid(`handoff-followup:${handoff.id}`), undefined, authorName);
        return true;
    });
}
