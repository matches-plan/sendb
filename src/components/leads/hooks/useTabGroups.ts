import { toast } from "sonner";
import { useLeadgenWorkspaces } from "@/components/leadgen/hooks/useLeadgenWorkspaces";
import { createLeadBox, removeLeadBox, removeRecordBox } from "../api";
import { useContentWorkspaces } from "./useContentWorkspaces";
import { useLeadWorkspaces } from "./useLeadWorkspaces";
import type { TabItem } from "../ui/LeadWorkspaceTabs";

const n = (v: number) => v.toLocaleString();

/**
 * 리드관리 대분류(리드관리·리드통계) 탭 — 리드함이 있는 사업부.
 * "사업부 추가"는 리드함을 만들고, "탭 삭제"는 리드가 없을 때 빈 리드함을 지운다.
 */
export function useLeadTabs() {
    const lead = useLeadWorkspaces();
    const contents = Object.fromEntries(lead.workspaces.filter((w) => w.leads > 0).map((w) => [w.id, `리드가 ${n(w.leads)}건`]));
    const result = async (r: { success: boolean; error?: string }, fallback: string) => {
        if (!r.success) {
            toast.error(r.error || fallback);
            return false;
        }
        await lead.mutate();
        return true;
    };
    return {
        contents,
        onCreate: async (id: number) => result(await createLeadBox(id), "사업부를 추가하지 못했습니다."),
        onRemove: async (id: number) => result(await removeLeadBox(id), "탭을 삭제하지 못했습니다."),
    };
}

/**
 * 리드젠 대분류(리드젠통계·레코드·웹 폼) 탭 — 세 화면이 같은 탭을 쓴다.
 * 레코드 파티션·웹 폼·보낸 콜드메일 중 하나라도 있는 사업부가 기본 탭이고, 아무것도 없으면(빈 파티션만) "탭 삭제"로 뺀다.
 */
export function useLeadgenTabs() {
    const sent = useLeadgenWorkspaces();
    const records = useContentWorkspaces("records");
    const forms = useContentWorkspaces("web-forms");
    const loading = sent.isLoading || records.isLoading || forms.isLoading || !records.items || !forms.items;
    const items: TabItem[] | undefined = loading
        ? undefined
        : [...sent.items, ...records.items!, ...forms.items!].filter((w, i, all) => all.findIndex((x) => x.id === w.id) === i);
    const sentIds = new Set(sent.items.map((w) => w.id));
    const contents: Record<number, string> = {};
    for (const w of items ?? []) {
        const parts = [
            records.counts.get(w.id) ? `레코드가 ${n(records.counts.get(w.id)!)}건` : "",
            forms.counts.get(w.id) ? `웹 폼이 ${n(forms.counts.get(w.id)!)}개` : "",
            sentIds.has(w.id) ? "보낸 콜드메일이" : "",
        ].filter(Boolean);
        if (parts.length) contents[w.id] = parts.join(", ");
    }
    return {
        items,
        isLoading: loading,
        contents,
        onRemove: async (id: number) => {
            const r = await removeRecordBox(id);
            if (!r.success) {
                toast.error(r.error || "탭을 삭제하지 못했습니다.");
                return false;
            }
            await Promise.all([records.mutate(), forms.mutate()]);
            return true;
        },
    };
}
