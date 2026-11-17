"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AsyncAlertDialog } from "@/components/ui/alert-dialog";
import { formatKstShort } from "@/lib/kst";
import { isHealthAlertsKey, resolveHealthProblem } from "../api/sendHealthApi";
import type { HealthLogFilter } from "../hooks/useHealthLogFilter";
import type { HealthProblem } from "../types";
import HealthFocusPanel from "./HealthFocusPanel";
import ProblemHeadline from "./ProblemHeadline";


/**
 * 발송 이력 위 "확인할 문제" 카드 — 머리의 "확인할 문제 N건" 버튼을 눌렀을 때만 모두 보인다.
 * 카드를 누르면 그 문제의 메일만 아래 표에 거르고, 고른 카드가 그 자리에서 문제 칸(갈래·기간·다시 시작·필터 해제)으로 펼쳐진다.
 * 목록에 없는 알림(?health=, 끝난 문제·구글 챗 링크)으로 열면 문제 칸만 따로 띄운다.
 * 해결 완료: 조직 구성원 누구나, 지금 보류·멈춤 중이 아닌 문제만 (그건 발송 다시 시작으로 끝난다).
 */
export default function HealthProblems({
    problems,
    filter,
    selectedEventId,
    showCommon,
    onPick,
    onClear,
}: {
    problems: HealthProblem[];
    filter: HealthLogFilter;
    selectedEventId: number | null;
    /** 사업부 화면 — 조직 공통 문제에 "공통" 표시 */
    showCommon: boolean;
    onPick: (p: HealthProblem) => void;
    onClear: () => void;
}) {
    const { mutate } = useSWRConfig();
    const [resolving, setResolving] = useState<HealthProblem | null>(null);

    const selId = filter.active ? (filter.item?.eventId ?? selectedEventId) : null;
    const selected = selId !== null ? problems.find((p) => p.eventId === selId && p.alertId === filter.alertId) ?? null : null;
    const visible = problems;

    const confirmResolve = async () => {
        if (!resolving) return;
        const r = await resolveHealthProblem(resolving.eventId);
        if (!r.success) return r;
        toast.success("해결 처리했어요.");
        if (selected?.eventId === resolving.eventId) onClear();
        await mutate(isHealthAlertsKey);
        return r;
    };

    return (
        <>
            {filter.active && !selected && <HealthFocusPanel filter={filter} onClear={onClear} />}
            {problems.length > 0 && (
                <div className="space-y-2">
                    {visible.map((p) =>
                        p === selected ? (
                            <HealthFocusPanel key={p.eventId} filter={filter} onClear={onClear} problem={p} showCommon={showCommon} onResolve={setResolving} />
                        ) : (
                            <ProblemCard key={p.eventId} problem={p} showCommon={showCommon} onPick={onPick} onResolve={setResolving} />
                        )
                    )}
                </div>
            )}
            <AsyncAlertDialog
                open={resolving !== null}
                onOpenChange={(open) => !open && setResolving(null)}
                title="해결 처리할까요?"
                description={resolving ? `${resolving.headline} · ${resolving.detail}\n같은 문제가 다시 생기면 다시 보여요.` : ""}
                confirmLabel="해결 처리"
                pendingLabel="처리 중..."
                confirmVariant="default"
                onConfirm={confirmResolve}
            />
        </>
    );
}

/** 접힌 문제 카드 — 머리·할 일·언제·메일 수. 누르면 그 문제로 거른다 */
function ProblemCard({
    problem: p,
    showCommon,
    onPick,
    onResolve,
}: {
    problem: HealthProblem;
    showCommon: boolean;
    onPick: (p: HealthProblem) => void;
    onResolve: (p: HealthProblem) => void;
}) {
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => onPick(p)}
            onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onPick(p);
                }
            }}
            className="flex cursor-pointer flex-wrap items-start justify-between gap-x-3 gap-y-1 rounded-lg border border-border/40 bg-background px-4 py-3 transition-colors hover:bg-muted/40"
        >
            <ProblemHeadline
                headline={p.headline}
                detail={p.detail}
                outcome={p.outcome}
                todo={p.todo}
                devIssue={p.devIssue}
                tone={p.active ? "active" : "warn"}
                common={showCommon && p.common}
                clampTodo
            />
            <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                <span>
                    {formatKstShort(new Date(p.createdAt))} · 메일 {p.mailCount.toLocaleString("ko-KR")}통
                </span>
                {!p.active && (
                    <Button
                        size="xs"
                        variant="outline"
                        className="border-border/70"
                        onClick={(e) => {
                            e.stopPropagation();
                            onResolve(p);
                        }}
                    >
                        해결 처리
                    </Button>
                )}
            </div>
        </div>
    );
}
