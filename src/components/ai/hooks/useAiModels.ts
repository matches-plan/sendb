import useSWR from "swr";
import { defaultFetcher } from "@/lib/swr-fetcher";
import type { AiProvider, AiRoute } from "@/lib/ai/models";

export interface AiModelAvailability {
    id: string;
    label: string;
    provider: AiProvider;
    lab: boolean;
    available: boolean;
    route: AiRoute | null;
    /** 연결에 필요한 환경변수 이름 (값은 오지 않는다) */
    missing: string[];
    /** 직접 연결이 중국 서버라 막혀 있음 */
    chinaBlocked: boolean;
    listPriceUsd: { input: number; output: number } | null;
}

/** 작성 모델별 연결 상태. 불러오는 동안은 undefined */
export function useAiModels() {
    const { data } = useSWR<{ success: boolean; data: AiModelAvailability[] }>("/api/ai/models", defaultFetcher, {
        revalidateOnFocus: false,
    });
    return data?.data;
}
