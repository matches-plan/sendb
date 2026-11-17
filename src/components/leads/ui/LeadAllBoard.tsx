"use client";

import { useEffect, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DeleteConfirmDialog from "@/components/records/DeleteConfirmDialog";
import { LEAD_STATUS_COLORS } from "@/lib/leads/statuses";
import { workspaceLabel } from "@/lib/workspace-label";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { deleteLeads } from "../api";
import { ALL_LEADS_KEY, useAllLeads } from "../hooks/useAllLeads";
import type { LeadRecord } from "../types";
import { LeadTable } from "./LeadTable";

/**
 * 리드관리 전체 탭 — 모든 사업부 리드함의 최근 리드를 사업부별로 묶어 보인다.
 * 리드를 누르면 그 사업부·리드함으로 옮겨 상세를 연다 (상태 목록·칸이 사업부마다 달라서 상세는 사업부 화면에서)
 */
export function LeadAllBoard({ onOpen }: { onOpen: (record: LeadRecord) => void }) {
    const [important, setImportant] = useState(false);
    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
    const [deleteOpen, setDeleteOpen] = useState(false);
    const { workspaces } = useWorkspaces();
    const list = useAllLeads({ important, search });
    const { mutate } = useSWRConfig();

    useEffect(() => {
        const t = setTimeout(() => setSearch(searchInput.trim()), 300);
        return () => clearTimeout(t);
    }, [searchInput]);

    const confirmDelete = async () => {
        const ids = [...checkedIds];
        const result = await deleteLeads(ids);
        if (!result.success) {
            toast.error(result.error || "삭제에 실패했습니다.");
            return;
        }
        toast.success(`리드 ${ids.length}건을 삭제했습니다.`);
        setCheckedIds(new Set());
        setDeleteOpen(false);
        mutate((key) => typeof key === "string" && key.startsWith(ALL_LEADS_KEY));
    };

    const sections = workspaces
        .map((ws) => ({ ws, rows: list.records.filter((r) => r.workspaceId === ws.id) }))
        .filter((s) => s.rows.length > 0);

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
                <Tabs
                    value={important ? "important" : "all"}
                    onValueChange={(v) => {
                        setImportant(v === "important");
                        setCheckedIds(new Set());
                    }}
                >
                    <TabsList>
                        <TabsTrigger value="all">전체</TabsTrigger>
                        <TabsTrigger value="important" className="gap-1.5">
                            중요
                            {list.importantTotal > 0 && (
                                <span className="rounded-full bg-rose-600 px-1.5 text-[10px] leading-4 text-white">{list.importantTotal}</span>
                            )}
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
                <div className="flex items-center gap-2">
                    {checkedIds.size > 0 ? (
                        <>
                            <span className="text-sm">{checkedIds.size}건 선택</span>
                            <Button variant="ghost" size="sm" onClick={() => setCheckedIds(new Set())}>
                                선택 해제
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                                <Trash2 className="mr-1 h-4 w-4" />
                                삭제
                            </Button>
                        </>
                    ) : (
                        <span className="text-sm text-muted-foreground">전체 {list.total.toLocaleString()}건</span>
                    )}
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="기업명 · 이름 · 연락처 검색"
                            className="w-64 pl-8"
                        />
                    </div>
                </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
                {list.error ? (
                    <p role="alert" className="py-16 text-center text-sm text-muted-foreground">
                        리드를 불러오지 못했습니다.
                    </p>
                ) : list.isLoading ? (
                    <LeadTable
                        records={[]}
                        fields={[]}
                        isLoading
                        selectedId={null}
                        onSelect={onOpen}
                        checkedIds={checkedIds}
                        onCheckedChange={setCheckedIds}
                        embedded
                    />
                ) : (
                    <>
                        {sections.map(({ ws, rows }) => (
                            <section key={ws.id} className="border-b">
                                <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2 text-sm">
                                    <span className="font-medium">{workspaceLabel(ws)}</span>
                                    <span className="text-muted-foreground">{rows.length}건</span>
                                </div>
                                <LeadTable
                                    records={rows}
                                    fields={[]}
                                    statusColors={LEAD_STATUS_COLORS}
                                    isLoading={false}
                                    selectedId={null}
                                    onSelect={onOpen}
                                    checkedIds={checkedIds}
                                    onCheckedChange={setCheckedIds}
                                    embedded
                                />
                            </section>
                        ))}
                        {list.records.length === 0 && <div className="py-16 text-center text-sm text-muted-foreground">리드가 없습니다.</div>}
                        {list.total > list.records.length && (
                            <p className="py-3 text-center text-xs text-muted-foreground">
                                최근 {list.records.length}건만 보여요. 사업부 탭이나 검색으로 좁혀 보세요.
                            </p>
                        )}
                    </>
                )}
            </div>
            <DeleteConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} count={checkedIds.size} onConfirm={confirmDelete} />
        </div>
    );
}
