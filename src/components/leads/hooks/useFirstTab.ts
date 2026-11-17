import { useWorkspaces } from "@/hooks/useWorkspaces";
import { applyOrder, useTabPrefs, type TabGroup } from "./useTabPrefs";
import { visibleTabs, withDisplayNo, type TabItem } from "../ui/LeadWorkspaceTabs";

/** 사업부 탭 줄에 지금 보이는 순서 (내 숨김·순서 설정 반영). 불러오는 중이면 undefined */
export function useOrderedTabs(group: TabGroup, items: TabItem[] | undefined, pool?: TabItem[], withAdded = true): number[] | undefined {
    const all = useWorkspaces();
    const { prefs, loaded } = useTabPrefs(group);
    if (!items || !loaded || all.isLoading) return undefined;
    const orgPool: TabItem[] = all.workspaces.map((w) => ({ id: w.id, name: w.name, displayNo: w.displayNo ?? null }));
    const tabs = visibleTabs(withDisplayNo(items, orgPool), pool ? withDisplayNo(pool, orgPool) : orgPool, prefs, withAdded);
    return applyOrder(tabs, prefs.order).map((w) => w.id);
}

/** 맨 앞 탭 — 처음 들어왔을 때 고를 사업부. 불러오는 중이면 undefined, 탭이 없으면 null */
export function useFirstTab(group: TabGroup, items: TabItem[] | undefined, pool?: TabItem[], withAdded = true): number | null | undefined {
    const ids = useOrderedTabs(group, items, pool, withAdded);
    return ids === undefined ? undefined : (ids[0] ?? null);
}
