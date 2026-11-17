import { eq } from "drizzle-orm";
import {
    db,
    customerAiSettings,
    inboxOperationsSettings,
    type inboxChannels,
} from "@/lib/db";
import type { DbExec } from "@/lib/db/tx";
import { supportWorkerEnabled } from "@/lib/customer-ai/worker-policy";
import { getAiClient } from "@/lib/ai/client";
import { chatKnowledge } from "@/lib/customer-ai/catalog";
import { messengerLinks, messengerSettingsSchema, notificationWorkerEnabled } from "./rules";
import { notificationSender } from "./transport";
export async function publicMessengerSettings(
    channel: typeof inboxChannels.$inferSelect,
    exec: DbExec = db,
) {
    const settings = messengerSettingsSchema.parse(
        channel.messengerSettings ?? {},
    );
    settings.phoneEnabled = settings.phoneEnabled && !!settings.phone;
    const [ai] = await exec
        .select()
        .from(customerAiSettings)
        .where(eq(customerAiSettings.workspaceId, channel.workspaceId));
    const [operations] = await exec
        .select()
        .from(inboxOperationsSettings)
        .where(eq(inboxOperationsSettings.channelId, channel.id));
    const facts = ai?.knowledgeVersionId
        ? await chatKnowledge(
              channel.orgId,
              channel.workspaceId,
              ai.knowledgeVersionId,
              exec,
          )
        : null;
    // 알림 문구·알림톡 발신 키는 직원용 설정이라 고객 화면에 내보내지 않는다
    const {
        emailSubject: _subject,
        emailBody: _body,
        customerNameFallback: _fallback,
        alimtalkSenderKey: _senderKey,
        alimtalkTemplateCode: _templateCode,
        alimtalkTemplateName: _templateName,
        alimtalkVariables: _variables,
        alimtalkFallbacks: _fallbacks,
        ...visible
    } = settings;
    void [_fallback, _subject, _body, _senderKey, _templateCode, _templateName, _variables, _fallbacks];
    return {
        ...visible,
        links: messengerLinks(settings),
        consultationUrl: "",
        aiAvailable:
            ai?.mode === "reply" &&
            !!facts?.sources.length &&
            supportWorkerEnabled(process.env, channel.workspaceId) &&
            !!getAiClient(ai.model),
        emailNotifications:
            settings.emailNotifications &&
            notificationWorkerEnabled() &&
            !!(await notificationSender(channel.orgId, exec)),
        weekly: operations?.policy.calendar.weekly ?? [],
        timezone: operations?.policy.calendar.timezone ?? "Asia/Seoul",
    };
}
