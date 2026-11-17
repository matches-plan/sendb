"use client";
import useSWR from "swr";
import { inboxRequest } from "@/components/inbox/api";
import type { NoticeSettingsData } from "../types";

/** 상담 설정 › 답변 알림 — 설정·발송 가능 여부·최근 발송 기록 */
export const replyNoticesUrl = (channelId: number) => `/api/inbox/channels/${channelId}/reply-notifications`;
export function useReplyNotices(channelId: number) {
    return useSWR<NoticeSettingsData>(replyNoticesUrl(channelId), (url: string) => inboxRequest<NoticeSettingsData>(url), {
        refreshInterval: 30000,
    });
}
