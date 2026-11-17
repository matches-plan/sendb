import { and, eq, desc, gte } from "drizzle-orm";
import {
    customerReplyContacts as contacts,
    customerReplyNotifications as notices,
    inboxMessages as messages,
    inboxConversations as chats,
    inboxChannels as channels,
} from "@/lib/db";
import { messengerSettingsSchema, notificationWorkerEnabled } from "./rules";
import type { DbExec } from "@/lib/db/tx";
/** 상담 답장이 나가면 2분 뒤 답변 알림을 예약한다. 이메일·알림톡은 따로 한 줄씩 (받는 곳이 있고 켜 둔 수단만) */
export async function queueCustomerReplyNotice(
    exec: DbExec,
    chat: { id: string; medium: string; historyOnly: boolean },
    message: { id: number; kind: string; createdAt: Date },
) {
    if (!notificationWorkerEnabled()) return;
    if (message.kind !== "reply" || chat.medium !== "web" || chat.historyOnly)
        return;
    const [row] = await exec
        .select({ contact: contacts, settings: channels.messengerSettings })
        .from(contacts)
        .innerJoin(chats, eq(chats.id, contacts.conversationId))
        .innerJoin(channels, eq(channels.id, chats.channelId))
        .where(eq(contacts.conversationId, chat.id));
    if (!row?.contact.consentAt) return;
    const settings = messengerSettingsSchema.parse(row.settings ?? {});
    const targets = [
        ...(settings.emailNotifications && row.contact.email ? [{ medium: "email", recipient: row.contact.email }] : []),
        ...(settings.alimtalkNotifications && settings.alimtalkTemplateCode && row.contact.phone
            ? [{ medium: "alimtalk", recipient: row.contact.phone }]
            : []),
    ];
    if (!targets.length) return;
    await exec
        .insert(notices)
        .values(
            targets.map((t) => ({
                conversationId: chat.id,
                messageId: message.id,
                contactVersion: row.contact.version,
                medium: t.medium,
                recipient: t.recipient,
                dueAt: new Date(message.createdAt.getTime() + 120000),
            })),
        )
        .onConflictDoNothing();
}
export async function queueLatestCustomerReply(
    exec: DbExec,
    chat: { id: string; medium: string; historyOnly: boolean },
    now = new Date(),
) {
    const [reply] = await exec
        .select()
        .from(messages)
        .where(
            and(
                eq(messages.conversationId, chat.id),
                eq(messages.kind, "reply"),
                gte(messages.createdAt, new Date(now.getTime() - 86400000)),
            ),
        )
        .orderBy(desc(messages.id))
        .limit(1);
    if (reply) await queueCustomerReplyNotice(exec, chat, reply);
}
