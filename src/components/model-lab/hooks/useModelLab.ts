import useSWR from "swr";
import { defaultFetcher } from "@/lib/swr-fetcher";
import type { Leaderboard, LeaderboardMetric, ResearchStats } from "../types";

export function useModelLeaderboard(filters: { days: number; ruleId: number; metric: LeaderboardMetric }) {
    const q = new URLSearchParams({ days: String(filters.days), ruleId: String(filters.ruleId), metric: filters.metric });
    const { data, error, isLoading } = useSWR<{ success: boolean; data: Leaderboard }>(`/api/ai/model-lab/leaderboard?${q}`, defaultFetcher, {
        revalidateOnFocus: false,
    });
    return { leaderboard: data?.data, error, isLoading };
}

export function useResearchStats(days: number) {
    const { data, error, isLoading } = useSWR<{ success: boolean; data: ResearchStats }>(`/api/ai/model-lab/research-stats?days=${days}`, defaultFetcher, {
        revalidateOnFocus: false,
    });
    return { stats: data?.data, error, isLoading };
}
