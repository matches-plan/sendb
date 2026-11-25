import useSWR from "swr";
import { defaultFetcher } from "@/lib/swr-fetcher";

export interface InflowMail {
    id: number;
    subject: string | null;
    body: string | null;
    recipientEmail: string;
    senderEmail: string | null;
    sentAt: string;
    partitionName: string | null;
}

/** 리드가 받은 콜드메일 한 통 (유입경로에서 열 때만 불러온다) */
export function useInflowMail(logId: number | null) {
    const { data, error, isLoading } = useSWR<{ success: boolean; data: InflowMail }>(
        logId ? `/api/leads/inflow-mail/${logId}` : null,
        defaultFetcher,
    );
    return { mail: data?.data ?? null, error, isLoading };
}
