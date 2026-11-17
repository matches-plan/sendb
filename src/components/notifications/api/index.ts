import { apiRequest } from "@/lib/swr-fetcher";

export const NOTIFICATIONS_KEY = "/api/notifications";

/** 읽음 표시 — 고른 알림 또는 모두 */
export function markNotificationsRead(input: { ids: number[] } | { all: true }) {
    return apiRequest<{ success: true; data: { updated: number } }>(NOTIFICATIONS_KEY, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
}
