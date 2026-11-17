"use client";

import useSWR from "swr";
import { defaultFetcher } from "@/lib/swr-fetcher";
import { healthProblemsKey } from "../api/sendHealthApi";
import type { ApiResult, HealthProblem } from "../types";

/** 발송 이력 위 "확인할 문제" — 고른 사업부(없으면 전체)의 최근 발송 경고 사건 */
export function useHealthProblems(workspaceId: number | null) {
    const { data } = useSWR<ApiResult<HealthProblem[]>>(healthProblemsKey(workspaceId), defaultFetcher, { revalidateOnFocus: false });
    return data?.success ? data.data ?? [] : [];
}
