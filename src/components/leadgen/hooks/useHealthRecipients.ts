"use client";
import useSWR from "swr";
import { defaultFetcher } from "@/lib/swr-fetcher";
import { healthRecipientsKey, setHealthRecipient } from "../api/healthRecipients";
import type { HealthRecipientList } from "../types/healthRecipients";

/** 이 사업의 콜드메일 알림 담당자 */
export function useHealthRecipients(workspaceId: number | null) {
    const { data, error, mutate } = useSWR<{ success: boolean; data: HealthRecipientList }>(
        workspaceId ? healthRecipientsKey(workspaceId) : null,
        defaultFetcher,
    );
    return {
        list: data?.data ?? null,
        error: error as Error | undefined,
        toggle: async (userId: string, enabled: boolean) => {
            if (!workspaceId) return;
            try {
                await setHealthRecipient(workspaceId, userId, enabled);
            } finally {
                await mutate();
            }
        },
    };
}
