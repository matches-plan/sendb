import { z } from "zod";

export const contactField = z.enum(["name", "phone", "email"]);
export type ContactField = z.infer<typeof contactField>;
export const CONTACT_FIELD_LABELS: Record<ContactField, string> = { name: "이름", phone: "전화번호", email: "이메일" };
export const DEFAULT_CONTACT_PROMPT =
    "연락처를 남겨주세요. 답변이 도착하면 알려드려요.\n\n(수집된 개인정보는 상담 답변 알림 목적으로만 이용되고, 삭제 요청을 주시기 전까지 보유됩니다. 제출하지 않으시면 상담 답변 알림을 받을 수 없어요.)";
/** 알림에 넣을 수 있는 값 */
export const noticeValue = z.enum(["customerName", "channelName", "replyTime", "link"]);
export type NoticeValue = z.infer<typeof noticeValue>;
export type NoticeValues = Record<NoticeValue, string>;
export const NOTICE_VALUE_LABELS: Record<NoticeValue, string> = {
    customerName: "고객 이름",
    channelName: "상담창 이름",
    replyTime: "답변 시간",
    link: "답변 확인 링크",
};
/** 이메일 제목·본문에 넣을 수 있는 변수 (##고객명## 등, 콜드메일과 같은 문법) — 링크는 본문 아래 버튼으로 붙는다 */
export const NOTICE_TEXT_VARIABLES: { token: string; value: Exclude<NoticeValue, "link"> }[] = [
    { token: "##고객명##", value: "customerName" },
    { token: "##상담창이름##", value: "channelName" },
    { token: "##답변시간##", value: "replyTime" },
];
export function fillNoticeText(text: string, values: Omit<NoticeValues, "link">) {
    return NOTICE_TEXT_VARIABLES.reduce((t, v) => t.replaceAll(v.token, values[v.value]), text);
}
/** 답변 확인 링크 — Sendb 상담 화면을 열고, 링크의 열쇠로 지난 대화를 보여준다 (다른 기기에서도) */
export function noticeLink(appUrl: string, publicKey: string, accessToken: string) {
    const url = new URL(`/chat/${publicKey}`, appUrl);
    url.searchParams.set("resume", accessToken);
    return url.href;
}
export const noticeReplyTime = (at: Date) =>
    at.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
export const messengerLink = z.object({
    label: z.string().trim().min(1, "링크 문구를 입력해주세요.").max(40),
    url: z.url().refine((s) => s.startsWith("https://"), "https:// 로 시작하는 주소를 넣어주세요."),
});
export type MessengerLink = z.infer<typeof messengerLink>;
export const messengerSettingsSchema = z.object({
    tagline: z.string().trim().max(120).default(""),
    /** 예전 "1:1 도입 상담 링크" — 저장된 값은 링크 카드로 옮겨 읽는다 (messengerLinks) */
    consultationUrl: z.string().default(""),
    /** 상담 홈 아래 링크 카드 (도입 상담 신청·카카오 채널 등) */
    links: z.array(messengerLink).max(5).default([]),
    emailNotifications: z.boolean().default(false),
    /** 상담창 머리·답장 옆에 보이는 1:1 프로필 이미지 */
    profileImageUrl: z
        .union([z.url().refine((s) => s.startsWith("https://")), z.literal("")])
        .default(""),
    /** 상담 홈의 "다른 방법으로 문의" 전화 버튼 */
    phoneEnabled: z.boolean().default(false),
    phone: z
        .string()
        .trim()
        .max(30)
        .refine((s) => !s || /^\+?[\d -]{7,30}$/.test(s), "전화번호를 확인해주세요.")
        .default(""),
    /** 고객이 첫 메시지를 남기면 연락처 받기 메시지를 보인다 */
    contactEnabled: z.boolean().default(true),
    contactPrompt: z.string().trim().max(500).default(DEFAULT_CONTACT_PROMPT),
    contactFields: z.array(contactField).min(1).max(3).default(["email"]),
    /** 답변 알림 — 이메일 (상담 설정 › 답변 알림). ##고객명## 등 콜드메일과 같은 변수 문법 */
    emailSubject: z.string().trim().min(1).max(200).default("[##상담창이름##] 상담에 새 답변이 도착했어요"),
    emailBody: z
        .string()
        .trim()
        .min(1)
        .max(2000)
        .default("##고객명##님, 남겨주신 문의에 답변이 도착했어요.\n아래 버튼을 눌러 상담창에서 확인해주세요."),
    /** 고객 이름을 모를 때 ##고객명## 대신 넣을 말 (이메일·알림톡 공통) */
    customerNameFallback: z.string().trim().max(30).default("고객"),
    /** 답변 알림 — 알림톡. 템플릿 변수(#{...})마다 넣을 값을 고른다 */
    alimtalkNotifications: z.boolean().default(false),
    alimtalkSenderKey: z.string().max(100).default(""),
    alimtalkTemplateCode: z.string().max(100).default(""),
    alimtalkTemplateName: z.string().max(200).default(""),
    alimtalkVariables: z.record(z.string().max(50), noticeValue).default({}),
});
export type MessengerSettings = z.infer<typeof messengerSettingsSchema>;
export const defaultMessengerSettings = messengerSettingsSchema.parse({});
export const contactInput = z
    .object({
        action: z.literal("contact"),
        name: z.string().trim().max(100).default(""),
        phone: z
            .string()
            .trim()
            .max(30)
            .refine(
                (s) => !s || /^\+?[\d ()-]{7,30}$/.test(s),
                "연락처를 확인해주세요.",
            )
            .default(""),
        email: z.union([z.email().max(254), z.literal("")]).default(""),
        notifyEmail: z.boolean().default(false),
    })
    .strict()
    .refine(
        (v) => !v.notifyEmail || !!v.email,
        "답변 알림을 받을 이메일을 입력해주세요.",
    );
export type ReplyContactDraft = z.infer<typeof contactInput>;
export function notificationWorkerEnabled(
    env: NodeJS.ProcessEnv = process.env,
) {
    return (
        env.NODE_ENV === "production" &&
        env.CUSTOMER_REPLY_NOTIFICATIONS === "on"
    );
}
export function notificationDecision(input: {
    enabled: boolean;
    consent: boolean;
    read: boolean;
    superseded: boolean;
    historyOnly: boolean;
    medium: string;
}) {
    if (!input.enabled) return "disabled";
    if (input.historyOnly || input.medium !== "web")
        return "unsupported_conversation";
    if (!input.consent) return "no_consent";
    if (input.superseded) return "newer_reply";
    if (input.read) return "already_read";
    return "send";
}

/** 링크 카드 목록 — 예전 도입 상담 링크만 있으면 카드 하나로 바꿔 보인다 */
export function messengerLinks(settings: Pick<MessengerSettings, "links" | "consultationUrl">): MessengerLink[] {
    if (settings.links.length) return settings.links;
    const legacy = messengerLink.safeParse({ label: "1:1 도입 상담 신청하기", url: settings.consultationUrl });
    return legacy.success ? [legacy.data] : [];
}
