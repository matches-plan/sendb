"use client";

import useSWR from "swr";
import { toast } from "sonner";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAsyncConfirm } from "@/components/ui/alert-dialog";
import { defaultFetcher } from "@/lib/swr-fetcher";
import { ClickCountCell } from "@/components/email/clicks/ui/ClickCountCell";
import { OpenCountCell } from "@/components/email/opens/ui/OpenCountCell";
import type { ClickSignal } from "@/components/email/clicks/types";
import type { OpenSignal } from "@/components/email/opens/types";
import { FOLLOWUP_STATUS_MAP, STOP_REASON_MAP, STOP_REASON_TITLE } from "../labels";

export type SentFollowup = Partial<ClickSignal> & Partial<OpenSignal> & {
    id: number;
    step: number;
    recipientEmail: string;
    subject: string | null;
    body: string | null;
    status: string;
    triggerType: string | null;
    sentAt: string;
    resultMessage: string | null;
    senderEmail: string | null;
};

type ScheduledFollowup = {
    id: number;
    sourceType: string;
    stepIndex: number;
    checkAt: string;
    status: string;
    result: string | null;
    stopReason: string | null;
};

type Badgeish = { label: string; variant: "default" | "secondary" | "outline" | "destructive" };

function shortDate(value: string) {
    const d = new Date(value);
    return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 발송 이력 한 줄을 펼쳤을 때 그 아래에 붙는 후속 메일 줄들 (나간 것 + 기다리는·멈춘 것) */
export function FollowupRows({
    logId,
    colSpan,
    statusMap,
    onOpen,
}: {
    logId: number;
    colSpan: number;
    statusMap: Record<string, Badgeish>;
    onOpen: (log: SentFollowup) => void;
}) {
    const { data, isLoading, mutate } = useSWR<{ success: boolean; data?: { sent: SentFollowup[]; scheduled: ScheduledFollowup[] } }>(
        `/api/email/logs/${logId}/followups`,
        defaultFetcher
    );
    const { confirm, confirmationDialog } = useAsyncConfirm();

    if (isLoading) {
        return (
            <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableCell colSpan={colSpan}><Skeleton className="h-6 w-full" /></TableCell>
            </TableRow>
        );
    }
    const sent = data?.data?.sent ?? [];
    const scheduled = data?.data?.scheduled ?? [];

    const cancel = (item: ScheduledFollowup) => {
        confirm({
            title: "후속 메일 취소",
            description: `${item.stepIndex + 1}단계 후속 메일을 취소합니다.\n취소한 후속 메일은 다시 예약할 수 없습니다.`,
            confirmLabel: "후속 취소",
            pendingLabel: "취소하는 중...",
            onConfirm: async () => {
                const res = await fetch(`/api/email/followup-queue/${item.id}`, { method: "PATCH" });
                const json = await res.json();
                mutate();
                if (!json?.success) throw new Error(json?.error || "취소에 실패했습니다.");
                toast.success("후속 메일을 취소했습니다.");
            },
        });
    };

    return (
        <>
            {confirmationDialog}
            {sent.map((log) => {
                const st = statusMap[log.status] ?? { label: log.status, variant: "secondary" as const };
                return (
                    <TableRow key={`s${log.id}`} className="cursor-pointer bg-muted/30" onClick={() => onOpen(log)}>
                        <TableCell />
                        <TableCell className="text-xs text-muted-foreground">└ {log.step}차 후속</TableCell>
                        <TableCell className="max-w-[220px] truncate font-mono text-xs text-muted-foreground">{log.senderEmail ?? "—"}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground">{log.subject || "(제목 없음)"}</TableCell>
                        <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                        <TableCell><ClickCountCell log={log} /></TableCell>
                        <TableCell><OpenCountCell log={log} /></TableCell>
                        <TableCell className="text-sm text-muted-foreground">후속</TableCell>
                        <TableCell />
                        <TableCell className="text-sm text-muted-foreground">{shortDate(log.sentAt)}</TableCell>
                    </TableRow>
                );
            })}
            {scheduled.map((item) => {
                const st = FOLLOWUP_STATUS_MAP[item.status] ?? { label: item.status, variant: "outline" as const };
                const waiting = item.status === "pending" || item.status === "held";
                return (
                    <TableRow key={`q${item.id}`} className="group bg-muted/30 hover:bg-muted/50">
                        <TableCell />
                        <TableCell className="text-xs text-muted-foreground">
                            └ {item.sourceType === "visit_ack" ? "방문 감사" : `${item.stepIndex + 1}차 후속`}
                        </TableCell>
                        <TableCell colSpan={2} className="text-xs text-muted-foreground">
                            {waiting ? `${shortDate(item.checkAt)}에 확인 후 발송` : "보내지 않음"}
                        </TableCell>
                        <TableCell colSpan={4}>
                            <Badge variant={st.variant}>{st.label}</Badge>
                            {item.stopReason && STOP_REASON_MAP[item.stopReason] && (
                                <span className="ml-1 text-xs text-muted-foreground" title={STOP_REASON_TITLE[item.stopReason]}>
                                    {STOP_REASON_MAP[item.stopReason]}
                                </span>
                            )}
                        </TableCell>
                        <TableCell colSpan={2} className="text-right">
                            {waiting && (
                                <Button
                                    variant="ghost"
                                    size="xs"
                                    className="text-destructive opacity-0 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                                    onClick={() => cancel(item)}
                                >
                                    발송 취소
                                </Button>
                            )}
                        </TableCell>
                    </TableRow>
                );
            })}
            {sent.length === 0 && scheduled.length === 0 && (
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={colSpan} className="text-center text-xs text-muted-foreground">후속 메일이 없습니다.</TableCell>
                </TableRow>
            )}
        </>
    );
}
