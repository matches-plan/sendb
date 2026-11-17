"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAsyncConfirm } from "@/components/ui/alert-dialog";
import { LeadWorkspaceTabs } from "@/components/leads/ui/LeadWorkspaceTabs";
import { workspaceAbilities } from "@/components/customer-access/utils/abilities";
import { crmRequest, crmWrite } from "@/components/customer-crm/api";
import type { InboxBootstrap } from "@/components/inbox/types";
import { useFirstTab } from "@/components/leads/hooks/useFirstTab";
import { cn } from "@/lib/utils";
import { groupContacts, type Sort, type SortKey } from "../utils/contact-columns";
import type { ContactListRow } from "../types";

const day = new Intl.DateTimeFormat("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" });
// 리드관리 표(LeadTable)와 같은 머리·칸
const HEAD = "sticky top-0 z-10 bg-background px-3 py-2 text-left text-xs font-medium text-muted-foreground border-b";
const CELL = "px-3 py-2.5 align-top text-sm";
const COLUMNS: { key: SortKey; label: string; width?: string }[] = [
    { key: "company", label: "기업명", width: "w-[200px]" },
    { key: "name", label: "이름", width: "w-[140px]" },
    { key: "email", label: "이메일", width: "w-[220px]" },
    { key: "phone", label: "휴대폰번호", width: "w-[140px]" },
    { key: "source", label: "유입경로" },
    { key: "createdAt", label: "등록일", width: "w-[100px]" },
];

/** 상담 연락처 — 사업부별 연락처. 같은 기업명은 묶어 보이고, 칸 제목을 눌러 정렬한다 */
export function ContactList() {
    const params = useSearchParams();
    const bootstrap = useSWR<InboxBootstrap>("/api/inbox", crmRequest);
    const contactWorkspaces = useSWR<number[]>("/api/customer-crm/contact-workspaces", crmRequest);
    const [chosen, setChosen] = useState<number | null>(Number(params.get("workspaceId")) || null);
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState<Sort>({ key: "createdAt", dir: "desc" });
    const workspaceItems = (bootstrap.data?.workspaces ?? []).map((w) => ({ id: w.id, name: w.name, displayNo: w.displayNo }));
    const tabItems = bootstrap.data && contactWorkspaces.data ? workspaceItems.filter((w) => contactWorkspaces.data!.includes(w.id)) : undefined;
    // 처음엔 탭 줄 맨 앞 사업부
    const first = useFirstTab("customer-contacts", tabItems, workspaceItems);
    const workspaceId = chosen ?? first ?? null;
    const { manage } = workspaceAbilities(bootstrap.data, workspaceId);
    const list = useSWR<ContactListRow[]>(workspaceId ? `/api/customer-crm/contact-list?workspaceId=${workspaceId}` : null, crmRequest);
    const groups = useMemo(() => groupContacts(list.data ?? [], sort, query), [list.data, sort, query]);
    const { confirm, confirmationDialog } = useAsyncConfirm();
    const colCount = COLUMNS.length + (manage ? 1 : 0);
    const toggleSort = (key: SortKey) =>
        setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "createdAt" ? "desc" : "asc" }));
    const remove = (contact: ContactListRow) =>
        confirm({
            title: `"${contact.name}" 연락처를 삭제할까요?`,
            description: "목록에서 빠지고, 이 연락처로 진행 중인 고객 자동화도 멈춰요.",
            confirmLabel: "삭제",
            onConfirm: async () => {
                await crmWrite(`/api/customer-crm/contacts/${contact.id}`, { workspaceId, action: "archive", version: contact.version });
                await list.mutate();
                toast.success("삭제했어요.");
            },
        });
    return (
        <main className="flex h-[calc(100vh-3.5rem)] min-h-0 flex-col bg-background">
            {confirmationDialog}
            <LeadWorkspaceTabs
                value={workspaceId}
                items={tabItems}
                pool={workspaceItems}
                prefKey="customer-contacts"
                loading={!bootstrap.data || !contactWorkspaces.data}
                onChange={(id) => {
                    setChosen(id);
                    setQuery("");
                }}
            />
            <div className="flex flex-wrap items-center gap-2 border-b p-3">
                <div className="relative w-72">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input aria-label="연락처 검색" className="border-border/70 pl-9" placeholder="기업명·이름·이메일·전화·유입경로 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                {query && (
                    <Button variant="ghost" onClick={() => setQuery("")}>
                        초기화
                    </Button>
                )}
                {list.data && <span className="ml-auto text-xs text-muted-foreground">{groups.reduce((n, g) => n + g.rows.length, 0).toLocaleString()}명</span>}
            </div>
            {list.error && <p role="alert" className="p-3 text-sm text-red-700">{(list.error as Error).message}</p>}
            <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full min-w-[1000px] table-fixed border-collapse">
                    <colgroup>
                        {COLUMNS.map((c) => (
                            <col key={c.key} className={c.width} />
                        ))}
                        {manage && <col className="w-[52px]" />}
                    </colgroup>
                    <thead>
                        <tr>
                            {COLUMNS.map((c) => {
                                const on = sort.key === c.key;
                                const Icon = !on ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
                                return (
                                    <th key={c.key} className={HEAD} aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                                        <button type="button" onClick={() => toggleSort(c.key)} className={cn("inline-flex items-center gap-1 hover:text-foreground", on && "text-foreground")}>
                                            {c.label}
                                            <Icon className={cn("h-3 w-3", !on && "opacity-40")} />
                                        </button>
                                    </th>
                                );
                            })}
                            {manage && <th className={HEAD} />}
                        </tr>
                    </thead>
                    <tbody>
                        {!list.data &&
                            !list.error &&
                            Array.from({ length: 6 }).map((_, i) => (
                                <tr key={i}>
                                    <td colSpan={colCount} className="px-3 py-2">
                                        <Skeleton className="h-6 w-full" />
                                    </td>
                                </tr>
                            ))}
                        {list.data && !groups.length && (
                            <tr>
                                <td colSpan={colCount} className="py-16 text-center text-sm text-muted-foreground">
                                    {query ? "찾는 연락처가 없어요." : "연락처가 없어요."}
                                </td>
                            </tr>
                        )}
                        {groups.map((group) =>
                            group.rows.map((contact, i) => (
                                <tr key={contact.id} className="group border-b last:border-b-0 hover:bg-muted/40">
                                    {i === 0 && (
                                        <td rowSpan={group.rows.length} className="border-r bg-muted/30 px-3 py-2.5 align-top text-xs">
                                            <div className="break-words font-medium">{group.company || "-"}</div>
                                            {group.company && <div className="text-muted-foreground">{group.rows.length}명</div>}
                                        </td>
                                    )}
                                    <td className={cn(CELL, "truncate")}>{contact.name}</td>
                                    <td className={cn(CELL, "truncate text-muted-foreground")}>{contact.email || "-"}</td>
                                    <td className={cn(CELL, "truncate tabular-nums text-muted-foreground")}>{contact.phone || "-"}</td>
                                    <td className={cn(CELL, "truncate text-muted-foreground")}>{contact.source || "-"}</td>
                                    <td className={cn(CELL, "tabular-nums text-muted-foreground")}>{day.format(new Date(contact.createdAt))}</td>
                                    {manage && (
                                        <td className="px-2 py-1 align-middle">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                                                aria-label={`${contact.name} 삭제`}
                                                onClick={() => remove(contact)}
                                            >
                                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                                            </Button>
                                        </td>
                                    )}
                                </tr>
                            )),
                        )}
                    </tbody>
                </table>
            </div>
        </main>
    );
}
