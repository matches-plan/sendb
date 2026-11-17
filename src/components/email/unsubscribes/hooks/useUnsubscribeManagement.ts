"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { addUnsubscribe, getUnsubscribes, removeUnsubscribe } from "../api/unsubscribes";

type Result = { ok: true } | { ok: false; error: string };

/** 한 사업부의 수신거부 목록 (그 사업부 + 모든 사업부를 막는 예전 줄) */
export function useUnsubscribeManagement(orgId: string, sessionEpoch: number, workspaceId: number) {
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [isAdding, setIsAdding] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    const [addedEmail, setAddedEmail] = useState<string | null>(null);
    const alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    const query = new URLSearchParams({ workspaceId: String(workspaceId), page: String(page), pageSize: "20", q: search });
    const { data, error, isLoading, mutate } = useSWR(
        [`/api/email/unsubscribes?${query}`, orgId, sessionEpoch],
        ([url, organization]) => getUnsubscribes(url, organization),
    );

    /** 등록 결과 — 실패면 화면 확인창이 그 이유를 그대로 보인다 (UX-234) */
    async function add(email: string, reason: string): Promise<Result> {
        setIsAdding(true);
        setAddError(null);
        setAddedEmail(null);
        try {
            const result = await addUnsubscribe(orgId, workspaceId, email, reason);
            if (!alive.current) return { ok: true };
            setAddedEmail(result.email);
            await mutate();
            return { ok: true };
        } catch (error) {
            const message = error instanceof Error ? error.message : "등록에 실패했습니다.";
            if (alive.current) setAddError(message);
            return { ok: false, error: message };
        } finally {
            if (alive.current) setIsAdding(false);
        }
    }

    async function remove(id: number): Promise<Result> {
        try {
            await removeUnsubscribe(orgId, workspaceId, id);
            if (alive.current) setAddedEmail(null);
            await mutate();
            return { ok: true };
        } catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : "해제에 실패했습니다." };
        }
    }

    return {
        data, error, isLoading, page, setPage, search,
        searchFor: (q: string) => { setSearch(q); setPage(1); },
        refresh: () => mutate(), add, isAdding, addError, addedEmail, remove,
    };
}
