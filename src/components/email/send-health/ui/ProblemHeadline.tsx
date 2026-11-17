"use client";

import { AlertTriangle, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

/** 확인할 문제 카드·문제 칸 머리 — 경고 · 머리 · 숫자 → 자동 조치 · (공통) / 할 일 */
export default function ProblemHeadline({
    headline,
    detail,
    outcome,
    todo,
    devIssue,
    tone,
    common = false,
    clampTodo = false,
}: {
    headline: string;
    detail: string;
    outcome: string | null;
    todo: string;
    devIssue: boolean;
    /** active: 지금 보류·멈춤 중 · warn: 확인할 문제 · muted: 회복·풀림 */
    tone: "active" | "warn" | "muted";
    common?: boolean;
    clampTodo?: boolean;
}) {
    return (
        <div className="min-w-0 flex-1 space-y-1">
            <p className="flex flex-wrap items-center gap-x-1.5 text-sm font-medium">
                <AlertTriangle
                    className={cn("size-4 shrink-0", tone === "active" ? "text-destructive" : tone === "warn" ? "text-amber-600" : "text-muted-foreground")}
                />
                <span>{headline}</span>
                <span className="text-muted-foreground">·</span>
                <span className="font-normal">{detail}</span>
                {outcome && <span className={cn("font-normal", tone === "active" ? "text-destructive" : "text-muted-foreground")}>→ {outcome}</span>}
                {common && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">공통</span>}
            </p>
            <p className={cn("flex items-start gap-1.5 text-sm text-muted-foreground", clampTodo && "min-w-0")}>
                {devIssue && <Wrench className="mt-0.5 size-3.5 shrink-0" />}
                <span className={cn(clampTodo && "line-clamp-1")} title={clampTodo ? todo : undefined}>
                    할 일: {todo}
                </span>
            </p>
        </div>
    );
}
