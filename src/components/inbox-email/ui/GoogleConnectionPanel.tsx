"use client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { toast } from "sonner";
import { controlGoogleConnection } from "../api";
import { useGoogleConnection } from "../hooks/useGoogleConnection";
import type { EmailMailbox } from "../types";
import { reconnectWindow } from "../utils/reconnect-window";
import { jobReasonLabel, retryableFailures } from "../utils/job-reasons";
import { useAsyncConfirm } from "@/components/ui/alert-dialog";
const displayTime = (value?: string | null) =>
    value ? new Date(value).toLocaleString("ko-KR") : "아직 없음";
export function GoogleConnectionPanel({
    box,
    onChange,
}: {
    box: EmailMailbox;
    onChange: () => Promise<unknown>;
}) {
    const { data, error, mutate } = useGoogleConnection(box.id),
        [chosenDays, setDays] = useState<number | null>(null),
        [busy, setBusy] = useState(false);
    const { confirm, confirmationDialog } = useAsyncConfirm();
    const recovery = reconnectWindow(data?.connection.lastPollAt);
    const days = chosenDays ?? recovery.days;
    const act = async (
        action: "connect" | "disconnect" | "retry",
        fromDialog = false,
    ) => {
        setBusy(true);
        try {
            const result = await controlGoogleConnection(
                box.id,
                action === "connect"
                    ? { action, version: box.version, lookbackDays: days }
                    : action === "disconnect"
                      ? { action, version: data!.connection.version }
                      : { action },
            );
            if (result.authorizationUrl) {
                window.location.assign(result.authorizationUrl);
                return;
            }
            await Promise.all([mutate(), onChange()]);
            if (action === "retry")
                toast.success(
                    `${result.retried ?? 0}건을 다시 가져옵니다.${
                        result.permanent
                            ? ` 다시 시도해도 실패하는 ${result.permanent}건은 원본 메일함에서 확인해주세요.`
                            : ""
                    }`,
                );
        } catch (e) {
            // 확인창에서는 오류를 던져 창을 연 채 문구를 보여준다.
            if (fromDialog) throw e;
            toast.error((e as Error).message);
        } finally {
            setBusy(false);
        }
    };
    // 중지·재연결·해제는 발송 대기 답장을 모두 취소하므로 건수를 보여주고 확인받는다.
    const askFirst = (
        title: string,
        effect: string,
        confirmLabel: string,
        action: "connect" | "disconnect",
    ) => {
        const pending = data?.pendingReplies ?? 0;
        confirm({
            title,
            description: `${effect}
${
                pending
                    ? `발송 대기 중인 답장 ${pending}건이 취소되며 다시 보낼 수 없습니다(본문을 작성란에 다시 넣어 새로 보내야 합니다).`
                    : "지금 발송 대기 중인 답장은 없습니다."
            }`,
            confirmLabel,
            onConfirm: () => act(action, true),
        });
    };
    if (error)
        return (
            <p role="alert" className="text-sm">
                메일 계정 상태를 불러오지 못했습니다.{" "}
                <button className="underline" onClick={() => void mutate()}>다시 불러오기</button>
            </p>
        );
    if (!data) return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
    const connected = data.connection.status === "connected";
    return (
        <section
            aria-label={`${box.name} Google 연결`}
            className="space-y-3 border-t border-border/40 pt-4 text-sm"
        >
            <h4 className="font-medium">
                Google 연결 ·{" "}
                {connected
                    ? "연결됨"
                    : data.connection.status === "reconnect"
                      ? "재연결 필요"
                      : "미연결"}
            </h4>
            {!data.configured && (
                <p className="text-amber-700">서버에 Google 앱 설정이 없어 연결할 수 없어요.</p>
            )}
            {data.configured && (
                <>
                    <div className="flex flex-wrap items-end gap-2">
                        <label className="block space-y-1.5">
                            <span className="block font-medium">연결할 때 가져올 메일</span>
                            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))} disabled={busy}>
                                <SelectTrigger className="w-48 border-border/70" aria-label={`${box.name} 수신 시작 범위`}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="0">연결한 이후</SelectItem>
                                    <SelectItem value="7">최근 7일부터</SelectItem>
                                    <SelectItem value="30">최근 30일부터</SelectItem>
                                </SelectContent>
                            </Select>
                        </label>
                        <Button
                            variant="outline"
                            className="border-border/70"
                            disabled={busy}
                            onClick={() =>
                                data.connection.status === "disconnected"
                                    ? void act("connect")
                                    : askFirst(
                                          "Google 계정을 다시 연결할까요?",
                                          "다시 연결하는 동안 수신·발송이 중지되고, 연결 후 수신·발송을 다시 켜야 합니다.",
                                          "다시 연결",
                                          "connect",
                                      )
                            }
                        >
                            {connected ? "다시 연결" : "Google 계정 연결"}
                        </Button>
                    </div>
                    {recovery.beyondWindow && <p className="text-xs text-amber-700">마지막 확인 후 30일이 지나 그 전 메일은 직접 확인해주세요.</p>}
                </>
            )}
            {connected && (
                <>
                    {!data.workerEnabled && <p className="text-amber-700">서버에서 자동 메일 처리가 꺼져 있어요.</p>}
                    <dl className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                        <dt>마지막 메일 확인</dt>
                        <dd>{displayTime(data.connection.lastPollAt)}</dd>
                        <dt>마지막 가져오기</dt>
                        <dd>{displayTime(data.connection.lastProcessedAt)}</dd>
                        <dt>가져오기 대기 / 완료</dt>
                        <dd>
                            {data.counts.pending} / {data.counts.done}
                        </dd>
                    </dl>
                </>
            )}
            {data.connection.errorCode && (
                <p role="status">
                    {data.connection.status === "reconnect"
                        ? "Google 권한이나 계정 설정을 확인하고 다시 연결해주세요."
                        : "메일 처리에 일시적인 문제가 있어 자동 재시도하고 있습니다."}
                </p>
            )}
            {data.counts.failed > 0 && (
                <div role="alert" className="space-y-1">
                    <p>가져오기 확인 필요 {data.counts.failed}건</p>
                    {!!data.failedReasons?.length && (
                        <ul className="list-disc pl-5 text-xs">
                            {data.failedReasons.map((r) => (
                                <li key={r.reasonCode ?? "unknown"}>
                                    {jobReasonLabel(r.reasonCode).text} ·{" "}
                                    {r.count}건
                                </li>
                            ))}
                        </ul>
                    )}
                    {connected &&
                        (data.failedReasons === undefined ||
                            retryableFailures(data.failedReasons) > 0) && (
                            <Button variant="outline" className="border-border/70" disabled={busy} onClick={() => void act("retry")}>
                                실패한 메일 다시 가져오기
                            </Button>
                        )}
                </div>
            )}
            {confirmationDialog}
            {data.connection.status !== "disconnected" && (
                <Button
                    variant="outline"
                    className="border-border/70 text-red-700 hover:text-red-700"
                    disabled={busy}
                    onClick={() =>
                        askFirst(
                            "Google 연결을 해제할까요?",
                            "새 문의 가져오기와 답장 발송이 멈추고, 다시 연결하기 전까지 이 주소의 문의를 받지 않습니다.",
                            "연결 해제",
                            "disconnect",
                        )
                    }
                >
                    연결 해제
                </Button>
            )}
        </section>
    );
}
