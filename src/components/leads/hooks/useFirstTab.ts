import { useWorkspaces } from "@/hooks/useWorkspaces";
import { applyOrder, useTabPrefs } from "./useTabPrefs";
import { visibleTabs, withDisplayNo, type TabItem } from "../ui/LeadWorkspaceTabs";

/**
 * 사업부 탭 줄에서 지금 맨 앞에 보이는 사업부 id — 처음 들어왔을 때 고를 사업부.
 * 내 숨김·순서 설정까지 반영한다. 아직 불러오는 중이면 undefined, 탭이 없으면 null.
 */
export function useFirstTab(prefKey: string, items: TabItem[] | undefined, pool?: TabItem[]): number | null | undefined {
    const all = useWorkspaces();
    const { prefs, loaded } = useTabPrefs(prefKey);
    if (!items || !loaded || all.isLoading) return undefined;
    const orgPool: TabItem[] = all.workspaces.map((w) => ({ id: w.id, name: w.name, displayNo: w.displayNo ?? null }));
    const tabs = visibleTabs(withDisplayNo(items, orgPool), pool ? withDisplayNo(pool, orgPool) : orgPool, prefs);
    return applyOrder(tabs, prefs.order)[0]?.id ?? null;
}
