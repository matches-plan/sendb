"use client";
import { useState } from "react";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAsyncConfirm } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { controlGoogleConnection } from "../api";
import { useGoogleConnection } from "../hooks/useGoogleConnection";
import type { EmailMailbox } from "../types";
import { reconnectWindow } from "../utils/reconnect-window";
import { jobReasonLabel, retryableFailures } from "../utils/job-reasons";
import { MailboxName } from "./MailboxName";

/** 연결된 메일 한 개 — 주소·상태·보내는 이름. 연결이 끊겼을 때만 다시 연결 버튼 */
export function MailboxCard({ box, onChange }: { box: EmailMailbox; onChange: () => Promise<unknown> }) {
    const { data, mutate } = useGoogleConnection(box.id);
    const [busy, setBusy] = useState(false);
    const { confirm, confirmationDialog } = useAsyncConfirm();
    const status = data?.connection.status;
    const healthy = status === "connected" && box.enabled;
    async function connect() {
        setBusy(true);
        try {
            const result = await controlGoogleConnection(box.id, {
                action: "connect",
                version: box.version,
                lookbackDays: reconnectWindow(data?.connection.lastPollAt).days,
            });
            if (result.authorizationUrl) window.location.assign(result.authorizationUrl);
        } catch (e) {
            toast.error((e as Error).message);
            setBusy(false);
        }
    }
    async function retry() {
        setBusy(true);
        try {
            const result = await controlGoogleConnection(box.id, { action: "retry" });
            await Promise.all([mutate(), onChange()]);
            toast.success(`${result.retried ?? 0}건을 다시 가져와요.`);
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            setBusy(false);
        }
    }
    const label = !data ? "확인 중" : healthy ? "연결됨" : status === "reconnect" ? "다시 연결 필요" : status === "connected" ? "멈춤" : "연결 안 됨";
    return (
        <article className="space-y-4 rounded-lg border border-border/40 p-5">
            <div className="flex items-center gap-3">
                <h3 className="min-w-0 flex-1 truncate font-semibold">{box.address}</h3>
                <span
                    className={cn(
                        "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium",
                        healthy ? "bg-emerald-50 text-emerald-700" : data ? "bg-amber-50 text-amber-700" : "bg-muted text-muted-foreground",
                    )}
                >
                    {label}
                </span>
                {data?.configured && !healthy && (
                    <Button variant="outline" className="border-border/70" disabled={busy} onClick={() => void connect()}>
                        {status === "disconnected" ? "Google 연결" : "다시 연결"}
                    </Button>
                )}
                {data && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`${box.address} 더보기`}>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem
                                className="text-red-700 focus:text-red-700"
                                disabled={status === "disconnected"}
                                onSelect={() =>
                                    confirm({
                                        title: `${box.address} 연결을 해제할까요?`,
                                        description: data.pendingReplies
                                            ? `새 문의를 가져오지 않고, 보내는 중인 답장 ${data.pendingReplies}건이 취소돼요.`
                                            : "다시 연결하기 전까지 이 주소로 온 문의를 가져오지 않아요.",
                                        confirmLabel: "연결 해제",
                                        onConfirm: async () => {
                                            await controlGoogleConnection(box.id, { action: "disconnect", version: data.connection.version });
                                            await Promise.all([mutate(), onChange()]);
                                        },
                                    })
                                }
                            >
                                연결 해제
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
            {confirmationDialog}
            {data && !data.configured && <p className="text-sm text-amber-700">서버에 Google 연결 설정이 없어 연결할 수 없어요.</p>}
            <MailboxName key={`name:${box.name}`} box={box} onChange={onChange} />
            {!!data?.counts.failed && (
                <div role="alert" className="flex items-start justify-between gap-4 text-sm text-amber-800">
                    <p>
                        가져오지 못한 메일 {data.counts.failed}건
                        {!!data.failedReasons?.length && ` (${data.failedReasons.map((r) => jobReasonLabel(r.reasonCode).text).join(", ")})`}
                    </p>
                    {healthy && (data.failedReasons === undefined || retryableFailures(data.failedReasons) > 0) && (
                        <Button variant="outline" className="shrink-0 border-border/70" disabled={busy} onClick={() => void retry()}>
                            다시 가져오기
                        </Button>
                    )}
                </div>
            )}
        </article>
    );
}
