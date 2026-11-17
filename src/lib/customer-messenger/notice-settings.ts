import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
    db,
    alimtalkConfigs,
    customerReplyContacts as contacts,
    customerReplyNotifications as notices,
    inboxChannels,
    inboxConversations as chats,
} from "@/lib/db";
import type { DbExec } from "@/lib/db/tx";
import type { CustomerActor } from "@/lib/customer-access/access";
import { requireCustomerChannel } from "@/lib/customer-access/access";
import { appendInboxAudit } from "@/lib/inbox/audit";
import { InboxError } from "@/lib/inbox/errors";
import { messengerSettingsSchema, noticeReplyTime, notificationWorkerEnabled } from "./rules";
import { notificationSender, sendNotificationAlimtalk, sendNotificationMail } from "./transport";
import { deliver } from "./worker";
import { phoneDigits } from "./crm-merge";

/** 상담 설정 › 답변 알림에서 바꾸는 칸만 받는다 */
export const noticeSettingsInput = messengerSettingsSchema
    .pick({
        emailNotifications: true,
        emailSubject: true,
        emailBody: true,
        customerNameFallback: true,
        alimtalkNotifications: true,
        alimtalkSenderKey: true,
        alimtalkTemplateCode: true,
        alimtalkTemplateName: true,
        alimtalkVariables: true,
    })
    .strict()
    .refine((v) => !v.alimtalkNotifications || !!v.alimtalkTemplateCode, "알림톡 템플릿을 골라주세요.");
export type NoticeSettings = z.infer<typeof noticeSettingsInput>;

/** 설정 화면: 저장된 값 + 지금 실제로 보낼 수 있는지 + 최근 발송 기록 */
export async function noticeSettings(actor: CustomerActor, channelId: number, exec: DbExec = db) {
    const channel = await requireCustomerChannel(actor, channelId, "read", exec);
    const settings = messengerSettingsSchema.parse(channel.messengerSettings ?? {});
    const [alimtalk] = await exec
        .select({ id: alimtalkConfigs.id })
        .from(alimtalkConfigs)
        .where(and(eq(alimtalkConfigs.orgId, actor.orgId), eq(alimtalkConfigs.isActive, 1)));
    const logs = await exec
        .select({
            id: notices.id,
            conversationId: notices.conversationId,
            medium: notices.medium,
            recipient: notices.recipient,
            state: notices.state,
            reason: notices.reason,
            createdAt: notices.createdAt,
            sentAt: notices.sentAt,
            customerName: contacts.name,
            conversationName: chats.name,
        })
        .from(notices)
        .innerJoin(chats, eq(chats.id, notices.conversationId))
        .leftJoin(contacts, eq(contacts.conversationId, notices.conversationId))
        .where(eq(chats.channelId, channel.id))
        .orderBy(desc(notices.createdAt))
        .limit(50);
    return {
        settings: noticeSettingsInput.parse({
            emailNotifications: settings.emailNotifications,
            emailSubject: settings.emailSubject,
            emailBody: settings.emailBody,
            customerNameFallback: settings.customerNameFallback,
            alimtalkNotifications: settings.alimtalkNotifications,
            alimtalkSenderKey: settings.alimtalkSenderKey,
            alimtalkTemplateCode: settings.alimtalkTemplateCode,
            alimtalkTemplateName: settings.alimtalkTemplateName,
            alimtalkVariables: settings.alimtalkVariables,
        }),
        status: {
            worker: notificationWorkerEnabled(),
            email: !!(await notificationSender(actor.orgId, exec)),
            alimtalk: !!alimtalk,
            contactEnabled: settings.contactEnabled,
        },
        logs,
    };
}

export async function saveNoticeSettings(actor: CustomerActor & { name: string }, channelId: number, raw: unknown, exec: DbExec = db) {
    const input = noticeSettingsInput.parse(raw);
    return exec.transaction(async (tx) => {
        const channel = await requireCustomerChannel(actor, channelId, "manage", tx);
        const [locked] = await tx.select().from(inboxChannels).where(eq(inboxChannels.id, channel.id)).for("update");
        const before = messengerSettingsSchema.parse(locked.messengerSettings ?? {});
        const after = { ...before, ...input };
        await tx.update(inboxChannels).set({ messengerSettings: after }).where(eq(inboxChannels.id, channel.id));
        await appendInboxAudit(tx, {
            orgId: actor.orgId,
            channelId: channel.id,
            actorId: actor.userId,
            actorName: actor.name,
            action: "channel.updated",
            changes: { messengerSettings: { before, after } },
        });
        return input;
    });
}

const testInput = z
    .object({
        medium: z.enum(["email", "alimtalk"]),
        to: z.string().trim().min(1).max(254),
        settings: noticeSettingsInput,
    })
    .strict()
    .superRefine((v, ctx) => {
        if (v.medium === "email" && !z.email().safeParse(v.to).success)
            ctx.addIssue({ code: "custom", message: "받을 이메일 주소를 확인해주세요." });
        if (v.medium === "alimtalk" && phoneDigits(v.to).length < 10)
            ctx.addIssue({ code: "custom", message: "받을 전화번호를 확인해주세요." });
        if (v.medium === "alimtalk" && !v.settings.alimtalkTemplateCode)
            ctx.addIssue({ code: "custom", message: "알림톡 템플릿을 골라주세요." });
    });

/** 지금 화면의 문구·템플릿으로 시험 발송 (저장 전 값, 고객 이름은 예시) */
export async function sendNoticeTest(actor: CustomerActor, channelId: number, raw: unknown, exec: DbExec = db) {
    const input = testInput.parse(raw);
    const channel = await requireCustomerChannel(actor, channelId, "manage", exec);
    try {
        await deliver(
            { mail: sendNotificationMail, alimtalk: sendNotificationAlimtalk },
            {
                medium: input.medium,
                orgId: channel.orgId,
                channelName: channel.name,
                color: channel.color,
                contact: { name: "홍길동", email: input.to, phone: input.to },
                link: new URL(`/chat/${channel.publicKey}`, process.env.NEXT_PUBLIC_APP_URL || "https://sendb.kr").href,
                replyTime: noticeReplyTime(new Date()),
                settings: input.settings,
            },
        );
    } catch (e) {
        const message = (e as Error).message;
        throw new InboxError(
            message === "notification_sender_unavailable"
                ? "이메일 발송 설정이 없어 보낼 수 없어요."
                : message === "notification_delivery_unconfirmed"
                  ? "발송 결과를 확인하지 못했어요. 잠시 후 다시 시도해주세요."
                  : message,
            409,
        );
    }
    return { sent: true };
}
