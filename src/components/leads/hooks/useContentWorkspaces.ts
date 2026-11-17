import useSWR from "swr";
import { defaultFetcher } from "@/lib/swr-fetcher";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import type { TabItem } from "../ui/LeadWorkspaceTabs";

/** 레코드(콜드 파티션)·웹 폼이 있는 사업부 — 그 화면 탭에 기본으로 보인다. 나머지는 "사업부 추가"로 꺼낸다 */
export function useContentWorkspaces(kind: "records" | "web-forms" | null) {
    const all = useWorkspaces();
    const { data, isLoading, mutate } = useSWR<{ success: boolean; data: { id: number; count: number }[] }>(kind ? `/api/workspaces/with-content?kind=${kind}` : null, defaultFetcher);
    const counts = new Map((data?.data ?? []).map((r) => [r.id, r.count]));
    const items: TabItem[] | undefined = data ? all.workspaces.filter((w) => counts.has(w.id)).map((w) => ({ id: w.id, name: w.name, displayNo: w.displayNo ?? null })) : undefined;
    return { items, counts, isLoading: all.isLoading || isLoading, mutate };
}
