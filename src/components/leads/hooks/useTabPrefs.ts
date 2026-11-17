import useSWR from "swr";
import { defaultFetcher } from "@/lib/swr-fetcher";
import type { TabPrefs, UserPreferences } from "@/lib/db/schema";

type PrefsResponse = { success: boolean; data: UserPreferences };

/**
 * 사업부 탭 설정은 메뉴 대분류마다 하나 — 같은 대분류 화면은 순서·숨김·추가한 탭을 같이 쓴다.
 * 값은 예전에 화면마다 따로 저장하던 key (대분류 설정이 아직 없으면 앞에 있는 것부터 이어받는다).
 */
export const TAB_GROUPS = {
    leadgen: ["leadgen-stats", "records", "web-forms"],
    leads: ["leads", "lead-stats"],
    sales: ["sales"],
    customer: ["customer-contacts", "inbox"],
} as const;
export type TabGroup = keyof typeof TAB_GROUPS;

/** 내 사업부 탭 설정 (대분류별) — 순서·숨긴 탭·꺼낸 탭. 바꾸면 화면에 먼저 보이고 저장한다 */
export function useTabPrefs(group: TabGroup | undefined) {
    const { data, mutate } = useSWR<PrefsResponse>(group ? "/api/auth/preferences" : null, defaultFetcher);
    const tabs = data?.data?.tabs ?? {};
    const prefs: TabPrefs = (group && (tabs[group] ?? TAB_GROUPS[group].map((k) => tabs[k]).find(Boolean))) || {};

    const save = async (patch: TabPrefs) => {
        if (!group) return { success: false };
        // 대분류 설정을 처음 저장할 때 이어받은 값까지 함께 저장한다
        const next = { order: prefs.order ?? [], hidden: prefs.hidden ?? [], added: prefs.added ?? [], ...patch };
        const optimistic = (cur: PrefsResponse | undefined): PrefsResponse => ({
            success: true,
            data: { ...cur?.data, tabs: { ...(cur?.data?.tabs ?? {}), [group]: next } },
        });
        await mutate(optimistic, { revalidate: false });
        const res = await fetch("/api/auth/preferences", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tabKey: group, ...next }),
        }).catch(() => null);
        const result = (await res?.json().catch(() => null)) ?? { success: false };
        await mutate();
        return result as { success: boolean; error?: string };
    };

    return { prefs, loaded: !group || data !== undefined, save };
}

/**
 * 저장한 순서대로 놓고, 저장에 없는 탭(새 사업부·다른 화면에만 있는 탭)은 기본 순서에서 바로 앞에 있던 탭 뒤에 끼운다
 * (예: 디하 다음이던 디하파트너즈는 순서를 바꿔도 디하 바로 뒤)
 */
export function applyOrder<T extends { id: number }>(items: T[], order: number[] | null | undefined): T[] {
    if (!order?.length) return items;
    const rank = new Map(order.map((id, i) => [id, i]));
    const out = items.filter((w) => rank.has(w.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    items.forEach((w, i) => {
        if (rank.has(w.id)) return;
        const prev = items.slice(0, i).findLast((x) => out.includes(x));
        out.splice(prev ? out.indexOf(prev) + 1 : 0, 0, w);
    });
    return out;
}

/**
 * 한 화면에서 바꾼 순서를 대분류 전체 순서에 합친다 — 이 화면 탭이 있던 자리만 새 순서로 채우고,
 * 이 화면에 없는 다른 화면 탭은 제자리에 둔다.
 */
export function mergeOrder(saved: number[], shown: number[], next: number[]): number[] {
    const full = [...saved, ...shown.filter((id) => !saved.includes(id))];
    const moving = new Set(next);
    const queue = [...next];
    return full.map((id) => (moving.has(id) ? queue.shift()! : id));
}
