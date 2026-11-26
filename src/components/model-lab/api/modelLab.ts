import { apiRequest } from "@/lib/swr-fetcher";
import type { PreviewResult } from "../types";

/** 같은 규칙·레코드로 여러 모델이 쓴 메일 (보내지 않는다). 모델마다 실제 AI 호출이 일어난다 */
export async function requestPreview(input: { ruleId: number; recordId?: number; models: string[] }) {
    const res = await apiRequest<{ success: boolean; data: { company: string; results: PreviewResult[] } }>(
        "/api/ai/model-lab/preview",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
        130_000,
    );
    return res.data;
}
