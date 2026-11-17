import { and, eq, asc, desc } from "drizzle-orm";
import { db, emailConfigs, emailSenderProfiles } from "@/lib/db";
import type { DbExec } from "@/lib/db/tx";
import { NhnEmailClient } from "@/lib/nhn-email";
export async function notificationSender(orgId: string, exec: DbExec = db) {
    const [config] = await exec
        .select()
        .from(emailConfigs)
        .where(
            and(eq(emailConfigs.orgId, orgId), eq(emailConfigs.isActive, 1)),
        );
    if (!config?.appKey || !config.secretKey) return null;
    const [sender] = await exec
        .select()
        .from(emailSenderProfiles)
        .where(
            and(
                eq(emailSenderProfiles.orgId, orgId),
                eq(emailSenderProfiles.isPaused, false),
            ),
        )
        .orderBy(
            desc(emailSenderProfiles.isDefault),
            asc(emailSenderProfiles.id),
        )
        .limit(1);
    const address = config.fromEmail || sender?.fromEmail;
    return address ? { config, address } : null;
}
export { escapeEmailHtml } from "./notice-text";
export async function sendNotificationMail(
    input: {
        orgId: string;
        name: string;
        email: string;
        subject: string;
        body: string;
    },
    exec: DbExec = db,
) {
    const sender = await notificationSender(input.orgId, exec);
    if (!sender) throw new Error("notification_sender_unavailable");
    const result = await new NhnEmailClient(
        sender.config.appKey,
        sender.config.secretKey,
        { timeoutMs: 30000, orgId: input.orgId },
    ).sendEachMail({
        senderAddress: sender.address,
        senderName: input.name,
        title: input.subject,
        body: input.body,
        receiverList: [{ receiveMailAddr: input.email, receiveType: "MRT0" }],
    });
    if (
        !result.header.isSuccessful ||
        !result.data?.requestId ||
        result.data.results?.some((r) => r.resultCode !== 0)
    )
        throw new Error("notification_delivery_unconfirmed");
    return result.data.requestId;
}
/** 답변 알림톡 — 기존 알림톡 발송(발송 기록 alimtalk_send_logs 포함)을 그대로 쓴다 */
export async function sendNotificationAlimtalk(input: {
    orgId: string;
    senderKey?: string;
    templateCode: string;
    phone: string;
    parameters: Record<string, string>;
}) {
    const { sendAlimtalkForOrg } = await import("@/lib/alimtalk/send-service");
    const result = await sendAlimtalkForOrg({
        orgId: input.orgId,
        senderKey: input.senderKey,
        templateCode: input.templateCode,
        triggerType: "customer_reply",
        recipients: [{ phoneNumber: input.phone, templateParameter: input.parameters }],
    });
    if (!result.ok) throw new Error(result.error);
    const failed = result.data.results.find((r) => r.status === "failed");
    if (failed || result.data.failCount) throw new Error(failed?.resultMessage || "알림톡 발송 실패");
    return result.data.requestId;
}
