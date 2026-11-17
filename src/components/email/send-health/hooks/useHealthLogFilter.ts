"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { defaultFetcher } from "@/lib/swr-fetcher";
import { defaultCats, healthLogParams, type HealthCat, type HealthFocusItem } from "@/lib/sender-health-focus";
import { healthAlertKey } from "../api/sendHealthApi";
import type { ApiResult } from "../types";

interface HealthFocusView {
    alertId: number;
    createdAt: string;
    workspaceId: number | null;
    items: HealthFocusItem[];
}

/**
 * 발송 경고 알림(?health=<알림 id>)으로 연 발송 이력의 거르기. 사건이 여럿이면 하나씩 고른다.
 * 갈래(반송·발신 인증 실패 등)는 사건이 센 것부터 — 그 기간에 메일이 없으면 같이 볼 갈래로.
 * waiting: 알림 내용을 읽는 중이라 아직 발송 이력을 부르지 않는다.
 * eventId(?hev=): "확인할 문제" 카드로 열면 그 사건부터 고른다. workspaceId: 갈래별 메일 수를 그 사업부 것만 센다 (아래 표와 같게).
 */
export function useHealthLogFilter(alertId: number | null, eventId: number | null = null, workspaceId: number | null = null) {
    const { data, error, isLoading } = useSWR<ApiResult<HealthFocusView>>(alertId ? healthAlertKey(alertId, workspaceId) : null, defaultFetcher);
    const view = data?.success ? data.data ?? null : null;
    const items = view?.items ?? [];
    const key = `${alertId}:${eventId}`;
    const [picked, setPicked] = useState<{ key: string; index: number | null; cats: HealthCat[] | null }>({ key, index: null, cats: null });
    // 다른 알림·사건을 열면 처음부터 (사건을 정했으면 그 사건)
    const state = picked.key === key ? picked : { key, index: null, cats: null };
    const index = state.index ?? Math.max(0, eventId ? items.findIndex((it) => it.eventId === eventId) : 0);
    const item = items[Math.min(index, Math.max(items.length - 1, 0))] ?? null;
    const cats = useMemo(() => (item ? state.cats ?? defaultCats(item) : []), [item, state.cats]);
    const params = useMemo(() => (item && cats.length > 0 ? healthLogParams(item.scope, cats) : null), [item, cats]);

    return {
        alertId,
        active: alertId !== null,
        waiting: alertId !== null && isLoading,
        failed: alertId !== null && !isLoading && (!!error || (data !== undefined && !data.success)),
        items,
        item,
        index,
        cats,
        params,
        selectItem: (i: number) => setPicked({ key, index: i, cats: null }),
        toggleCat: (cat: HealthCat) => {
            const next = cats.includes(cat) ? cats.filter((c) => c !== cat) : [...cats, cat];
            setPicked({ key, index, cats: next.length > 0 ? next : cats });
        },
    };
}

export type HealthLogFilter = ReturnType<typeof useHealthLogFilter>;
