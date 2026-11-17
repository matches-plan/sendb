import { and, eq, lte, desc } from "drizzle-orm";
import {
    db,
    customerReplyContacts as contacts,
    customerReplyNotifications as notices,
    inboxConversations as chats,
    inboxChannels as channels,
    inboxMessages as messages,
} from "@/lib/db";
import type { DbExec } from "@/lib/db/tx";
import {
    fillNoticeText,
    noticeLink,
    noticeReplyTime,
    notificationDecision,
    notificationWorkerEnabled,
    messengerSettingsSchema,
    type MessengerSettings,
    type NoticeValues,
} from "./rules";
import { issueVisitorAccess } from "@/lib/inbox/visitor-access";

type NoticeSettingsPart = Pick<
    MessengerSettings,
    | "emailSubject"
    | "emailBody"
    | "customerNameFallback"
    | "alimtalkSenderKey"
    | "alimtalkTemplateCode"
    | "alimtalkVariables"
    | "alimtalkFallbacks"
>;
import { sendNotificationMail, sendNotificationAlimtalk } from "./transport";
import { noticeMailBody } from "./notice-text";

export type Senders = { mail: typeof sendNotificationMail; alimtalk: typeof sendNotificationAlimtalk };
const defaultSenders: Senders = { mail: sendNotificationMail, alimtalk: sendNotificationAlimtalk };

export async function processCustomerReplyNotifications(
    exec: DbExec = db,
    senders: Senders = defaultSenders,
    now = new Date(),
) {
    // A crashed/inconclusive transport is never automatically sent again.
    await exec
        .update(notices)
        .set({ state: "uncertain", reason: "발송 결과 확인 필요" })
        .where(
            and(
                eq(notices.state, "processing"),
                lte(notices.claimedAt, new Date(now.getTime() - 300000)),
            ),
        );
    let processed = 0;
    for (let i = 0; i < 10; i++) {
        const claimed = await exec.transaction(async (tx) => {
            const [n] = await tx
                .select()
                .from(notices)
                .where(
                    and(eq(notices.state, "pending"), lte(notices.dueAt, now)),
                )
                .orderBy(notices.dueAt)
                .limit(1)
                .for("update", { skipLocked: true });
            if (!n) return null;
            const [chat] = await tx
                .select()
                .from(chats)
                .where(eq(chats.id, n.conversationId));
            const [channel] = chat
                ? await tx
                      .select()
                      .from(channels)
                      .where(eq(channels.id, chat.channelId))
                : [];
            const [contact] = await tx
                .select()
                .from(contacts)
                .where(eq(contacts.conversationId, n.conversationId))
                .for("update");
            const [latest] = await tx
                .select({ id: messages.id })
                .from(messages)
                .where(
                    and(
                        eq(messages.conversationId, n.conversationId),
                        eq(messages.kind, "reply"),
                    ),
                )
                .orderBy(desc(messages.id))
                .limit(1);
            const settings = messengerSettingsSchema.parse(channel?.messengerSettings ?? {});
            const recipient = n.medium === "alimtalk" ? contact?.phone : contact?.email;
            const reason =
                chat && channel && contact
                    ? notificationDecision({
                          enabled:
                              channel.enabled &&
                              (n.medium === "alimtalk"
                                  ? settings.alimtalkNotifications && !!settings.alimtalkTemplateCode
                                  : settings.emailNotifications),
                          consent:
                              !!contact.consentAt &&
                              contact.version === n.contactVersion &&
                              !!recipient,
                          read: contact.readMessageId >= n.messageId,
                          superseded: latest?.id !== n.messageId,
                          historyOnly: chat.historyOnly || !!chat.mergedIntoId,
                          medium: chat.medium,
                      })
                    : "missing_contact";
            if (n.createdAt.getTime() < now.getTime() - 86400000) {
                await tx
                    .update(notices)
                    .set({ state: "skipped", reason: "expired" })
                    .where(eq(notices.id, n.id));
                return { skipped: true as const };
            }
            if (reason !== "send") {
                await tx
                    .update(notices)
                    .set({ state: "skipped", reason })
                    .where(eq(notices.id, n.id));
                return { skipped: true as const };
            }
            await tx
                .update(notices)
                .set({ state: "processing", claimedAt: now })
                .where(eq(notices.id, n.id));
            return {
                skipped: false as const,
                notice: n,
                chat: chat!,
                channel: channel!,
                contact: contact!,
                settings,
            };
        });
        if (!claimed) break;
        processed++;
        if (claimed.skipped) continue;
        const { channel, chat, contact, notice, settings } = claimed;
        try {
            const providerId = await deliver(senders, {
                medium: notice.medium,
                orgId: channel.orgId,
                channelName: channel.name,
                color: channel.color,
                contact,
                link: noticeLink(
                    process.env.NEXT_PUBLIC_APP_URL || "https://sendb.kr",
                    channel.publicKey,
                    await issueVisitorAccess(exec, chat.id),
                ),
                replyTime: noticeReplyTime(new Date(notice.dueAt.getTime() - 120000)),
                settings,
            });
            await exec
                .update(notices)
                .set({
                    state: "sent",
                    providerId,
                    sentAt: new Date(),
                    reason: null,
                })
                .where(
                    and(
                        eq(notices.id, notice.id),
                        eq(notices.state, "processing"),
                    ),
                );
        } catch (e) {
            await exec
                .update(notices)
                .set({
                    state: "uncertain",
                    reason: ((e as Error).message || "발송 결과 확인 필요").slice(0, 200),
                })
                .where(eq(notices.id, notice.id));
        }
    }
    return { processed };
}

export function deliver(
    senders: Senders,
    input: {
        medium: string;
        orgId: string;
        channelName: string;
        color: string;
        contact: { name: string; email: string; phone: string };
        link: string;
        replyTime: string;
        settings: NoticeSettingsPart;
    },
) {
    const name = input.contact.name.trim();
    const known: NoticeValues = {
        customerName: name && name !== "방문 고객" ? name : "",
        channelName: input.channelName,
        replyTime: input.replyTime,
        link: input.link,
    };
    const values: NoticeValues = { ...known, customerName: known.customerName || input.settings.customerNameFallback || "고객" };
    if (input.medium === "alimtalk")
        return senders.alimtalk({
            orgId: input.orgId,
            senderKey: input.settings.alimtalkSenderKey || undefined,
            templateCode: input.settings.alimtalkTemplateCode,
            phone: input.contact.phone,
            // 값이 비면 그 변수에 적어 둔 말을 넣는다
            parameters: Object.fromEntries(
                Object.entries(input.settings.alimtalkVariables).map(([variable, value]) => [
                    variable,
                    known[value] || input.settings.alimtalkFallbacks[variable] || values[value],
                ]),
            ),
        });
    return senders.mail({
        orgId: input.orgId,
        name: input.channelName,
        email: input.contact.email,
        subject: fillNoticeText(input.settings.emailSubject, values),
        body: noticeMailBody(fillNoticeText(input.settings.emailBody, values), input.link, input.color),
    });
}

let running = false;
export function startCustomerReplyNotificationScheduler() {
    if (!notificationWorkerEnabled()) return;
    const tick = async () => {
        if (running) return;
        running = true;
        try {
            await processCustomerReplyNotifications();
        } catch {
            console.error("[customer-reply-notification] 처리 실패");
        } finally {
            running = false;
        }
    };
    setInterval(() => void tick(), 15000).unref();
    void tick();
}
