export interface UnsubscribeEntry {
    id: number;
    email: string;
    /** null = 사업부 없는 예전 수신거부 — 모든 사업부에서 막는다 ("전체") */
    workspaceId: number | null;
    source: string;
    reason: string | null;
    unsubscribedAt: string;
}

export interface UnsubscribeList {
    items: UnsubscribeEntry[];
    totalCount: number;
    page: number;
    pageSize: number;
    canManage: boolean;
}

export interface UnsubscribeTarget {
    query: string;
    kind: "email" | "domain";
}
