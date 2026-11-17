import useSWR from "swr";
import { defaultFetcher } from "@/lib/swr-fetcher";
import type { LeadStats } from "@/lib/leads/stats";

/**
 * workspace: 사업부 id, "all"이면 모든 사업부 합계, null이면 부르지 않는다.
 * period: { days } 빠른 기간 또는 { from, to } 날짜(YYYY-MM-DD), 둘 다 없으면 전체
 */
export function useLeadStats(workspace: number | "all" | null, period: { days?: number | null; from?: string; to?: string }) {
    const qs = new URLSearchParams();
    if (typeof workspace === "number") qs.set("workspaceId", String(workspace));
    if (period.from) qs.set("from", period.from);
    if (period.to) qs.set("to", period.to);
    if (!period.from && !period.to && period.days) qs.set("days", String(period.days));
    const key = workspace !== null ? `/api/leads/stats?${qs.toString()}` : null;
    const { data, isLoading, error } = useSWR<{ success: boolean; data: LeadStats }>(key, defaultFetcher);
    return { stats: data?.data ?? null, isLoading, error };
}
