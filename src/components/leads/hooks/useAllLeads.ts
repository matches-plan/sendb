import useSWR from "swr";
import { defaultFetcher } from "@/lib/swr-fetcher";
import type { LeadRecord } from "../types";

export const ALL_LEADS_KEY = "/api/leads/all?";

/** 리드관리 전체 탭 — 모든 사업부 리드함의 최근 리드 */
export function useAllLeads(p: { important: boolean; search: string }) {
    const qs = new URLSearchParams();
    if (p.important) qs.set("important", "1");
    if (p.search) qs.set("search", p.search);
    const { data, isLoading, error } = useSWR<{ success: boolean; data: LeadRecord[]; total: number; importantTotal: number }>(
        `${ALL_LEADS_KEY}${qs.toString()}`,
        defaultFetcher,
    );
    return { records: data?.data ?? [], total: data?.total ?? 0, importantTotal: data?.importantTotal ?? 0, isLoading, error };
}
