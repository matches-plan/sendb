import useSWR from "swr";
import { abTestFetcher } from "../api/abTests";
import type { AbTestRow } from "../types";

/** AB 테스트 목록 — 규칙 하나(ruleId) 또는 사업부·기간(from·to, yyyy-MM-dd)으로 거른다 */
export function useAbTests(filter: { ruleId?: number | null; workspaceId?: number | null; from?: string; to?: string } | null) {
    const params = filter
        ? new URLSearchParams({
              workspaceId: String(filter.workspaceId ?? 0),
              ...(filter.ruleId ? { ruleId: String(filter.ruleId) } : {}),
              ...(filter.from ? { from: filter.from } : {}),
              ...(filter.to ? { to: filter.to } : {}),
          })
        : null;
    return useSWR<AbTestRow[]>(params ? `/api/email/ab-tests?${params}` : null, abTestFetcher);
}
