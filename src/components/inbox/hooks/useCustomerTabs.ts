import useSWR from "swr";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import type { TabItem } from "@/components/leads/ui/LeadWorkspaceTabs";
import { inboxRequest } from "../api";
import type { InboxBootstrap } from "../types";

/**
 * 고객관리 대분류(상담톡·상담통계·상담 설정·상담 연락처) 탭 — 네 화면이 같은 탭을 쓴다.
 * 상담창이나 연락처가 있는 사업부가 기본 탭이고, 나머지는 "사업부 추가"로 꺼낸다.
 */
export function useCustomerTabs(bootstrap: InboxBootstrap | undefined) {
    const { workspaces } = useWorkspaces();
    const contactIds = useSWR<number[]>("/api/customer-crm/contact-workspaces", inboxRequest);
    const label = (id: number, fallback: string): TabItem => {
        const ws = workspaces.find((w) => w.id === id);
        return { id, name: ws?.name ?? bootstrap?.workspaces.find((w) => w.id === id)?.name ?? fallback, displayNo: ws?.displayNo ?? null };
    };
    const channels = bootstrap?.channels ?? [];
    const withChannel = new Set(channels.map((c) => c.workspaceId));
    const withContacts = new Set(contactIds.data ?? []);
    const pool = (bootstrap?.workspaces ?? []).map((w) => label(w.id, w.name));
    const items = bootstrap && contactIds.data ? pool.filter((w) => withChannel.has(w.id) || withContacts.has(w.id)) : undefined;
    const contents: Record<number, string> = {};
    for (const w of items ?? []) {
        const parts = [withChannel.has(w.id) ? "상담창이" : "", withContacts.has(w.id) ? "연락처가" : ""].filter(Boolean);
        if (parts.length) contents[w.id] = parts.join(", ");
    }
    return { items, pool, contents, isLoading: !items };
}
