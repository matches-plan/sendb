import useSWR from "swr";
import type { EmailSendLog } from "@/lib/db";
import { blockingError, defaultFetcher } from "@/lib/swr-fetcher";

interface LogsResponse {
    success: boolean;
    data?: EmailSendLog[];
    totalCount?: number;
}


export function useEmailLogs(params?: { partitionId?: number; search?: string; status?: string; triggerType?: string; templateLinkId?: number; autoPersonalizedLinkId?: number; isClicked?: string; hasReply?: string; startDate?: string; endDate?: string; page?: number; roots?: boolean; workspaceId?: number; hasFollowup?: boolean; extra?: Record<string, string>; paused?: boolean }) {
    const qs = new URLSearchParams();
    if (params?.partitionId) qs.set("partitionId", String(params.partitionId));
    if (params?.search) qs.set("search", params.search);
    if (params?.status) qs.set("status", params.status);
    if (params?.triggerType) qs.set("triggerType", params.triggerType);
    if (params?.templateLinkId) qs.set("templateLinkId", String(params.templateLinkId));
    if (params?.autoPersonalizedLinkId) qs.set("autoPersonalizedLinkId", String(params.autoPersonalizedLinkId));
    if (params?.isClicked) qs.set("isClicked", params.isClicked);
    if (params?.hasReply) qs.set("hasReply", params.hasReply);
    if (params?.startDate) qs.set("startDate", params.startDate);
    if (params?.endDate) qs.set("endDate", params.endDate);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.roots) qs.set("roots", "1");
    if (params?.hasFollowup) qs.set("hasFollowup", "1");
    if (params?.workspaceId) qs.set("workspaceId", String(params.workspaceId));
    // 발송 경고 알림에서 온 거르기 (명단·발신 주소·기간·건강 갈래)
    for (const [k, v] of Object.entries(params?.extra ?? {})) qs.set(k, v);
    const query = qs.toString() ? `?${qs.toString()}` : "";

    const { data, error, isLoading, mutate } = useSWR<LogsResponse>(
        // paused: 거르기 값을 아직 모른다 (알림 내용을 읽는 중) — 거르지 않은 목록을 먼저 띄우지 않는다
        params?.paused ? null : `/api/email/logs${query}`,
        defaultFetcher
    );

    const syncLogs = async () => {
        const res = await fetch("/api/email/logs/sync", { method: "POST" });
        const result = await res.json();
        if (result.success) mutate();
        return result;
    };

    return {
        logs: data?.data ?? [],
        totalCount: data?.totalCount ?? 0,
        isLoading,
        error,
        loadError: blockingError(data, error),
        mutate,
        syncLogs,
    };
}
