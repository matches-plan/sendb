import { useMemo } from "react";
import useSWR from "swr";
import { defaultFetcher } from "@/lib/swr-fetcher";

/** 조직 내 모든 파티션 — 워크스페이스가 여럿이면 이름 앞에 [워크스페이스]를 붙인다 */
export function useAllPartitionOptions() {
    const { data, error, mutate } = useSWR("/api/partitions", defaultFetcher);

    const partitions = useMemo(() => {
        const items: Array<{ id: number; name: string; workspaceId: number; workspaceName: string }> = data?.data ?? [];
        const hasMultipleWorkspaces = new Set(items.map((p) => p.workspaceId)).size > 1;
        return items.map((p) => ({
            id: p.id,
            workspaceId: p.workspaceId,
            name: hasMultipleWorkspaces ? `[${p.workspaceName}] ${p.name}` : p.name,
        }));
    }, [data]);

    return { partitions, error: error && !data ? error : undefined, retry: () => mutate() };
}
