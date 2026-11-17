"use client";
import useSWR from "swr";
import { defaultFetcher } from "@/lib/swr-fetcher";
import { NOTIFICATIONS_KEY, markNotificationsRead } from "../api";
import type { UserNotificationList } from "../types";

/** 내 알림 — 1분마다 새로 읽는다 */
export function useNotifications() {
    const { data, mutate } = useSWR<{ success: boolean; data: UserNotificationList }>(NOTIFICATIONS_KEY, defaultFetcher, {
        refreshInterval: 60_000,
    });
    const list = data?.data;
    return {
        items: list?.items ?? [],
        unreadCount: list?.unreadCount ?? 0,
        markRead: async (input: { ids: number[] } | { all: true }) => {
            await markNotificationsRead(input);
            await mutate();
        },
    };
}
