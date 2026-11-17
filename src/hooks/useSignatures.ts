import useSWR, { useSWRConfig } from "swr";
import { defaultFetcher } from "@/lib/swr-fetcher";

export interface EmailSignatureData {
    id: number;
    orgId: string;
    /** null이면 공통 서명 (모든 사업부에서 고를 수 있다) */
    workspaceId: number | null;
    name: string;
    signature: string;
    isDefault: boolean;
    createdAt: string;
    updatedAt: string;
}

const BASE = "/api/email/signatures";

/** 서명 목록 주소 — 사업부를 주면 그 사업부 서명과 공통 서명만 */
export const signaturesKey = (workspaceId?: number | null) => (workspaceId ? `${BASE}?workspaceId=${workspaceId}` : BASE);

/** workspaceId를 주면 그 사업부 서명 + 공통 서명, 새로 만든 서명은 그 사업부에 붙는다 */
export function useSignatures(workspaceId?: number | null) {
    const { data, error, isLoading } = useSWR<{ success: boolean; data: EmailSignatureData[] }>(signaturesKey(workspaceId), defaultFetcher);
    const { mutate: globalMutate } = useSWRConfig();
    // 사업부별 목록·전체 목록을 모두 새로 읽는다
    const mutate = () => globalMutate((key) => typeof key === "string" && key.startsWith(BASE));

    /** workspaceId를 따로 주지 않으면 이 훅의 사업부에 붙는다 (null이면 공통) */
    const createSignature = async (sig: { name: string; signature: string; workspaceId?: number | null }) => {
        const res = await fetch(BASE, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...sig, workspaceId: sig.workspaceId !== undefined ? sig.workspaceId : workspaceId ?? null }),
        });
        const result = await res.json();
        if (result.success) mutate();
        return result;
    };

    const updateSignature = async (id: number, sig: Partial<{ name: string; signature: string; isDefault: boolean; workspaceId: number | null }>) => {
        const res = await fetch(`${BASE}/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(sig),
        });
        const result = await res.json();
        if (result.success) mutate();
        return result;
    };

    const deleteSignature = async (id: number) => {
        const res = await fetch(`${BASE}/${id}`, {
            method: "DELETE",
        });
        const result = await res.json();
        if (result.success) mutate();
        return result;
    };

    const signatures = data?.data ?? [];

    return {
        signatures,
        // 기본 서명은 사업부마다 하나 + 공통에 하나 — 이 사업부 기본 → 공통 기본 순
        defaultSignature:
            (workspaceId ? signatures.find((s) => s.isDefault && s.workspaceId === workspaceId) : undefined) ??
            signatures.find((s) => s.isDefault && s.workspaceId === null) ??
            signatures.find((s) => s.isDefault) ??
            signatures[0] ??
            null,
        isLoading,
        error,
        mutate,
        createSignature,
        updateSignature,
        deleteSignature,
    };
}
