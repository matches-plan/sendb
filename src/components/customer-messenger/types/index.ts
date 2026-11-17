import type { MessengerSettings } from "@/lib/customer-messenger/rules";
export type MessengerBrand = {
    logoUrl: string;
    iconUrl?: string;
};
export type PublicMessengerSettings = Omit<
    MessengerSettings,
    "emailSubject" | "emailBody" | "customerNameFallback" | "alimtalkSenderKey" | "alimtalkTemplateCode" | "alimtalkTemplateName" | "alimtalkVariables"
> & {
    aiAvailable: boolean;
    weekly: { day: number; start: string; end: string }[];
    timezone?: string;
};
export type NoticeSettings = Pick<
    MessengerSettings,
    | "emailNotifications"
    | "emailSubject"
    | "emailBody"
    | "customerNameFallback"
    | "alimtalkNotifications"
    | "alimtalkSenderKey"
    | "alimtalkTemplateCode"
    | "alimtalkTemplateName"
    | "alimtalkVariables"
>;
export type NoticeLog = {
    id: string;
    conversationId: string;
    medium: "email" | "alimtalk";
    recipient: string;
    state: string;
    reason: string | null;
    createdAt: string;
    sentAt: string | null;
    customerName: string | null;
    conversationName: string;
};
export type NoticeSettingsData = {
    settings: NoticeSettings;
    status: { worker: boolean; email: boolean; alimtalk: boolean; contactEnabled: boolean };
    logs: NoticeLog[];
};
