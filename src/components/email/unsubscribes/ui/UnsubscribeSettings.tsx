"use client";

import { useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAsyncConfirm } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/contexts/SessionContext";
import { useUnsubscribeManagement } from "../hooks/useUnsubscribeManagement";
import type { UnsubscribeEntry } from "../types";

const sourceLabels: Record<string, string> = { link: "본문 링크", one_click: "메일앱 구독취소", manual: "관리자 등록" };
const dateFormatter = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });

function EntriesTable({ items, onRemove }: { items: UnsubscribeEntry[]; onRemove?: (item: UnsubscribeEntry) => void }) {
    return (
        <Table>
            <TableHeader><TableRow>
                <TableHead>이메일</TableHead><TableHead>등록 경로</TableHead><TableHead>등록일</TableHead><TableHead>사유</TableHead>
                {onRemove && <TableHead className="w-20" />}
            </TableRow></TableHeader>
            <TableBody>{items.map((item) => (
                <TableRow key={item.id} className="group">
                    <TableCell className="font-medium break-all">
                        {item.email}
                        {/* 사업부 없는 예전 수신거부는 모든 사업부에서 막는다 */}
                        {item.workspaceId === null && <Badge variant="secondary" className="ml-2">전체</Badge>}
                    </TableCell>
                    <TableCell>{sourceLabels[item.source] || item.source}</TableCell>
                    <TableCell className="whitespace-nowrap">{dateFormatter.format(new Date(item.unsubscribedAt))}</TableCell>
                    <TableCell className="max-w-72 whitespace-normal break-words">{item.reason || "—"}</TableCell>
                    {onRemove && <TableCell className="text-right">
                        <Button
                            variant="ghost"
                            size="xs"
                            className="text-destructive opacity-0 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                            onClick={() => onRemove(item)}
                        >
                            해제
                        </Button>
                    </TableCell>}
                </TableRow>
            ))}</TableBody>
        </Table>
    );
}

const panel = "space-y-4 rounded-lg border border-border/40 bg-background p-6";

function UnsubscribeManager({ orgId, sessionEpoch, workspaceId }: { orgId: string; sessionEpoch: number; workspaceId: number }) {
    const state = useUnsubscribeManagement(orgId, sessionEpoch, workspaceId);
    const [searchText, setSearchText] = useState("");
    const [email, setEmail] = useState("");
    const [reason, setReason] = useState("");
    const pages = Math.max(1, Math.ceil((state.data?.totalCount ?? 0) / 20));

    const { confirm, confirmationDialog } = useAsyncConfirm();
    // 이 사업부 발송에 바로 적용되므로 주소를 다시 보여 주고 확인을 받는다 (UX-234)
    function add(event: FormEvent) {
        event.preventDefault();
        const target = email.trim();
        confirm({
            title: "수신거부 등록",
            description: `${target} 주소로 이 사업부에서 메일을 보내지 않습니다.`,
            confirmLabel: "수신거부 등록",
            pendingLabel: "등록 중...",
            onConfirm: async () => {
                const result = await state.add(email, reason);
                if (!result.ok) throw new Error(result.error);
                setEmail("");
                setReason("");
            },
        });
    }

    function remove(item: UnsubscribeEntry) {
        confirm({
            title: "수신거부 해제",
            description: item.workspaceId === null
                ? `${item.email} 주소로 모든 사업부에서 다시 메일을 보낼 수 있게 됩니다.`
                : `${item.email} 주소로 다시 메일을 보낼 수 있게 됩니다.`,
            confirmLabel: "해제",
            pendingLabel: "해제 중...",
            onConfirm: async () => {
                const result = await state.remove(item.id);
                if (!result.ok) throw new Error(result.error);
                toast.success("수신거부를 해제했습니다.");
            },
        });
    }

    return (
        <div className="space-y-4">
            {confirmationDialog}
            <div className={panel}>
                <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); state.searchFor(searchText); }}>
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input aria-label="수신거부 목록 검색" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="이메일 또는 도메인 검색" maxLength={200} className="pl-9" />
                    </div>
                    <Button type="submit" variant="outline">검색</Button>
                    <Button type="button" variant="outline" size="icon" aria-label="목록 새로고침" onClick={() => void state.refresh()}><RefreshCw className="size-4" /></Button>
                </form>
                {state.error ? <p role="alert" className="text-sm text-destructive">{state.error.message}</p> : state.isLoading ? <p className="text-sm text-muted-foreground">불러오는 중...</p> : state.data?.items.length ? <EntriesTable items={state.data.items} onRemove={state.data.canManage ? remove : undefined} /> : <p className="py-8 text-center text-muted-foreground">{state.search ? "검색 결과가 없습니다." : "등록된 수신거부가 없습니다."}</p>}
                {state.data && <div className="flex items-center justify-between gap-3 text-sm">
                    <span>총 {state.data.totalCount.toLocaleString()}건 · {state.page}/{pages} 페이지</span>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={state.page <= 1 || state.isLoading} onClick={() => state.setPage(state.page - 1)}><ChevronLeft className="size-4" />이전</Button>
                        <Button variant="outline" size="sm" disabled={state.page >= pages || state.isLoading} onClick={() => state.setPage(state.page + 1)}>다음<ChevronRight className="size-4" /></Button>
                    </div>
                </div>}
            </div>

            {state.data?.canManage && <div className={panel}>
                <form className="space-y-3" onSubmit={add}>
                    <div className="space-y-2"><Label htmlFor="unsubscribe-email">직접 등록</Label><Input id="unsubscribe-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={200} required placeholder="person@example.com" /></div>
                    <div className="space-y-2"><Label htmlFor="unsubscribe-reason">사유 (선택)</Label><Textarea id="unsubscribe-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={2} /></div>
                    <Button type="submit" variant="destructive" disabled={state.isAdding}>{state.isAdding ? "등록 중..." : "수신거부 등록"}</Button>
                    {state.addError && <p role="alert" className="text-sm text-destructive">{state.addError}</p>}
                    {state.addedEmail && <p role="status" className="text-sm">{state.addedEmail} 주소를 수신거부에 등록했습니다.</p>}
                </form>
            </div>}
        </div>
    );
}

/** 리드젠 설정 › 사업부 › 수신거부 목록 — 고른 사업부의 수신거부 (사업부 없는 예전 줄은 "전체"로 함께 보인다) */
export function UnsubscribeSettings({ workspaceId }: { workspaceId: number }) {
    const { user, sessionEpoch, isSessionChanging } = useSession();
    return user && !isSessionChanging
        ? <UnsubscribeManager key={`${user.orgId}:${sessionEpoch}:${workspaceId}`} orgId={user.orgId} sessionEpoch={sessionEpoch} workspaceId={workspaceId} />
        : <p className="text-sm text-muted-foreground">불러오는 중...</p>;
}
