"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatKstShort } from "@/lib/kst";
import { HEALTH_CAT_LABELS, type HealthCat } from "@/lib/sender-health-focus";
import { isHealthAlertsKey } from "../api/sendHealthApi";
import { usePartitionHolds, useSendHealth } from "../hooks/useSendHealth";
import type { HealthLogFilter } from "../hooks/useHealthLogFilter";
import type { HealthProblem, ReleaseTarget } from "../types";
import ProblemHeadline from "./ProblemHeadline";
import ReleaseDialog from "./ReleaseDialog";

/**
 * 발송 경고 알림으로 연 발송 이력 위의 문제 칸 — 무엇이 일어났나 · 할 일 · 갈래 · 기간 · (보류·멈춤이면) 다시 시작(관리자) · 필터 해제.
 * problem을 주면 "확인할 문제" 목록에서 고른 카드 자리에 그대로 펼쳐진다 (고른 표시 · 해결 완료). 아래 표는 이 사건의 명단·주소·기간·갈래로 걸러져 있다.
 */
export default function HealthFocusPanel({
    filter,
    onClear,
    problem = null,
    showCommon = false,
    onResolve,
}: {
    filter: HealthLogFilter;
    onClear: () => void;
    problem?: HealthProblem | null;
    showCommon?: boolean;
    onResolve?: (p: HealthProblem) => void;
}) {
    const { item, items, index, cats } = filter;
    const { byPartition, isAdmin, releaseHold } = usePartitionHolds(filter.active);
    const wantsSender = isAdmin && item?.pausedProfileId != null;
    const { senderById, releaseSender } = useSendHealth(wantsSender);
    const { mutate } = useSWRConfig();
    const [target, setTarget] = useState<ReleaseTarget | null>(null);
    const frame = cn(
        "rounded-lg border",
        problem ? "border-amber-400/80 bg-amber-50/40 dark:border-amber-700 dark:bg-amber-950/20" : "border-border/40 bg-background"
    );

    const clearButton = (
        <Button variant="ghost" className="text-muted-foreground" onClick={onClear}>
            <X className="mr-1 h-3.5 w-3.5" />
            필터 해제
        </Button>
    );

    if (filter.waiting) {
        return <div className={cn(frame, "h-24 animate-pulse", !problem && "bg-muted/30")} />;
    }
    if (filter.failed || !item) {
        return (
            <div className={cn(frame, "flex items-center justify-between gap-2 px-4 py-2 text-sm text-muted-foreground")}>
                알림 내용을 찾지 못했어요.
                {clearButton}
            </div>
        );
    }

    const hold = item.heldPartitionId !== null ? byPartition.get(item.heldPartitionId) : undefined;
    const sender = item.pausedProfileId !== null ? senderById.get(item.pausedProfileId) : undefined;
    const releaseTarget: ReleaseTarget | null = hold
        ? { kind: "hold", holdId: hold.id, name: hold.partitionName, queued: hold.queued }
        : sender?.isPaused
          ? { kind: "sender", profileId: sender.profileId, email: sender.email, reason: sender.pausedReason, preview: sender.releasePreview }
          : null;
    const catList: HealthCat[] = [...item.primaryCats, ...item.relatedCats];
    const quiet = item.cause === "sync_ok" || item.cause === "release";

    return (
        <div className={cn(frame, "space-y-3 p-4")}>
            {!problem && items.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                    {items.map((it, i) => (
                        <Button key={it.eventId} size="xs" variant={i === index ? "secondary" : "ghost"} onClick={() => filter.selectItem(i)}>
                            {it.headline}
                        </Button>
                    ))}
                </div>
            )}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <ProblemHeadline
                    headline={item.headline}
                    detail={item.detail}
                    outcome={item.outcome}
                    todo={item.todo}
                    devIssue={item.devIssue}
                    tone={quiet ? "muted" : problem && !problem.active ? "warn" : "active"}
                    common={showCommon && !!problem?.common}
                />
                <div className="flex shrink-0 items-center gap-2">
                    {isAdmin && releaseTarget && (
                        <Button variant="outline" onClick={() => setTarget(releaseTarget)}>
                            <Play className="mr-1 h-3.5 w-3.5" />
                            발송 다시 시작
                        </Button>
                    )}
                    {problem && !problem.active && onResolve && (
                        <Button variant="outline" onClick={() => onResolve(problem)}>
                            해결 처리
                        </Button>
                    )}
                    {clearButton}
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {catList.map((c) => (
                    <Button key={c} size="xs" variant={cats.includes(c) ? "secondary" : "ghost"} onClick={() => filter.toggleCat(c)} aria-pressed={cats.includes(c)}>
                        {HEALTH_CAT_LABELS[c]} {(item.counts[c] ?? 0).toLocaleString("ko-KR")}
                    </Button>
                ))}
                <span className="ml-1">
                    {formatKstShort(new Date(item.scope.from))} ~ {formatKstShort(new Date(item.scope.to))}
                </span>
            </div>
            <ReleaseDialog
                target={target}
                onClose={() => setTarget(null)}
                onConfirm={async (t, note) => {
                    const r = t.kind === "hold" ? await releaseHold(t.holdId, note) : await releaseSender(t.profileId, note);
                    if (r.success) {
                        await mutate(isHealthAlertsKey);
                        // 다시 시작하면 문제가 끝나 목록에서 빠진다 — 거르기도 푼다
                        if (problem) onClear();
                    }
                    return r;
                }}
            />
        </div>
    );
}
