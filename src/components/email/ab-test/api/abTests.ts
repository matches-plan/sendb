import type { AbTestDraft } from "../types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    const json = await res.json().catch(() => null);
    if (!res.ok || json?.success !== true) throw new Error(json?.error ?? "요청을 처리하지 못했습니다.");
    return json.data as T;
}

/** 규칙 저장 뒤 AB 테스트 맞추기 — 지시사항이 바뀌었으면 진행 중 테스트 중단, start가 있으면 새로 시작 */
export const syncRuleAbTest = (ruleId: number, start: AbTestDraft | null) =>
    request<{ experimentId: number | null; stopped: number | null }>(`/api/email/auto-personalized/${ruleId}/ab-test`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start }),
    });

/** 고른 안 바로 적용 — AB 테스트(prompt)는 규칙에 넣은 지시사항을 돌려준다 */
export const applyAbTestArm = (id: number, arm: "A" | "B") =>
    request<{ prompt?: string | null } | null>(`/api/email/ab-tests/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arm }),
    });

/** 진행 중인 AB 테스트 중단 */
export const stopAbTest = (id: number) => request<{ stopped: boolean }>(`/api/email/ab-tests/${id}`, { method: "DELETE" });

/** AB 테스트 이름 바꾸기 */
export const renameAbTest = (id: number, name: string) =>
    request<{ name: string }>(`/api/email/ab-tests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
    });

export const abTestFetcher = <T,>(url: string) => request<T>(url);
