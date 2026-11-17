import { apiRequest } from "@/lib/swr-fetcher";

export const healthRecipientsKey = (workspaceId: number) => `/api/leadgen/health-recipients?workspaceId=${workspaceId}`;

/** 알림 담당자 켜기·끄기 (관리자) */
export function setHealthRecipient(workspaceId: number, userId: string, enabled: boolean) {
    return apiRequest(healthRecipientsKey(workspaceId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, enabled }),
    });
}
