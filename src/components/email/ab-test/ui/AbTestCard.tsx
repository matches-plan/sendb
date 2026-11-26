"use client";

import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAsyncConfirm } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { applyAbTestArm, stopAbTest } from "../api/abTests";
import type { AbTestRow } from "../types";
import {
    METRIC_LABELS, RESULT_LABELS, SCOPE_LABELS, SCOPE_PROMPT_LABELS, decisionRuleText, leaderOf, pct, resultBadgeClass, shortDay, winnerOf, modelPairLabel } from "../utils/labels";

function MetricRow({ label, a, b, aBase, bBase, highlight, muted }: {
    label: string; a: number; b: number; aBase?: number; bBase?: number; highlight?: "A" | "B" | null; muted?: boolean;
}) {
    const cell = (n: number, base: number | undefined, on: boolean) => (
        <td className={`px-3 py-2 text-right tabular-nums ${on ? "font-semibold text-primary" : ""}`}>
            {n.toLocaleString()}
            {base !== undefined && <span className="ml-1 text-xs text-muted-foreground">{pct(n, base)}</span>}
        </td>
    );
    return (
        <tr className="border-t border-border/40">
            <td className="px-3 py-2 text-muted-foreground">
                {label}
                {muted && <span className="ml-1 text-xs">(참고)</span>}
            </td>
            {cell(a, aBase, highlight === "A")}
            {cell(b, bBase, highlight === "B")}
        </tr>
    );
}

export function AbTestResultBadge({ test }: { test: Pick<AbTestRow, "result"> }) {
    return <Badge variant="outline" className={cn(resultBadgeClass(test.result))}>{RESULT_LABELS[test.result]}</Badge>;
}

/**
 * AB 테스트 한 건의 A·B 성과 — 발송·오픈·클릭·회신, 판정 규칙 한 줄, 진행 중이면 '바로 적용'·'중단'.
 * compact: 규칙 수정 화면처럼 규칙 이름·사업부를 이미 아는 곳 (머리글 없이 본문만)
 */
export function AbTestCard({ test, onApplied, onChanged, compact = false }: {
    test: AbTestRow;
    onApplied: (result: { arm: "A" | "B"; prompt: string | null; model?: string | null }) => void;
    /** 중단한 뒤 */
    onChanged?: () => void;
    compact?: boolean;
}) {
    const { confirm, confirmationDialog } = useAsyncConfirm();
    const { A, B } = test.arms;
    const active = test.result === "running";
    const leader = active ? leaderOf(test) : winnerOf(test);
    const scope = test.scope ?? "all";
    const apply = (arm: "A" | "B") =>
        confirm({
            title: `${arm}안을 바로 적용할까요?`,
            description: [
                test.kind === "prompt" ? `${arm}안 지시사항을 규칙에 넣고 테스트를 끝냅니다.`
                    : test.kind === "model" ? `${arm}안 AI 모델을 규칙에 넣고 테스트를 끝냅니다.` : arm === "B"
                    ? "자동으로 만든 B안 작성 지침을 이 규칙에 연결하고 실험을 끝냅니다."
                    : "기존 방식을 유지하고 실험을 끝냅니다.",
                test.significantLeader === arm ? "" : "아직 확실한 차이는 아닙니다 (95% 기준).",
            ].filter(Boolean).join("\n"),
            confirmLabel: `${arm}안 적용`,
            pendingLabel: "적용하는 중...",
            onConfirm: async () => {
                const result = await applyAbTestArm(test.id, arm);
                toast.success(`${arm}안을 적용했습니다.`);
                onApplied({ arm, prompt: result?.prompt ?? null, model: result?.model ?? null });
            },
        });
    const stop = () =>
        confirm({
            title: "AB 테스트를 중단할까요?",
            description: "이후 메일은 모두 A안(지금 규칙 지시사항)으로 보냅니다.",
            confirmLabel: "중단",
            pendingLabel: "중단하는 중...",
            onConfirm: async () => {
                await stopAbTest(test.id);
                toast.success("AB 테스트를 중단했습니다.");
                onChanged?.();
            },
        });
    const meta = [
        !compact && test.workspaceName,
        `${shortDay(test.startedAt)} ~ ${active ? "진행 중" : shortDay(test.closedAt)}`,
        test.kind === "prompt" && SCOPE_LABELS[scope],
        test.kind === "model" && `모델 ${modelPairLabel(test.modelA, test.modelB)}`,
        `평가 기준 ${METRIC_LABELS[test.metric]}`,
    ].filter(Boolean).join(" · ");
    return (
        <div className={cn("space-y-3", !compact && "rounded-lg border border-border/40 bg-card p-4")}>
            {confirmationDialog}
            {!compact && (
                <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{test.ruleName ?? test.name}</span>
                        {test.kind === "policy" && <Badge variant="secondary">자동</Badge>}
                        <AbTestResultBadge test={test} />
                    </div>
                    <p className="text-xs text-muted-foreground">{meta}</p>
                </div>
            )}

            <table className="w-full text-sm">
                <thead>
                    <tr className="text-xs text-muted-foreground">
                        <th className="px-3 py-1 text-left font-normal" />
                        <th className="px-3 py-1 text-right font-normal">A안</th>
                        <th className="px-3 py-1 text-right font-normal">B안</th>
                    </tr>
                </thead>
                <tbody>
                    <MetricRow label="발송" a={A.sent} b={B.sent} />
                    <MetricRow label="오픈" a={A.opened} b={B.opened} aBase={A.sent} bBase={B.sent} highlight={test.metric === "open" ? leader : null} />
                    <MetricRow label="클릭" a={A.clicked} b={B.clicked} aBase={A.sent} bBase={B.sent} highlight={test.metric === "click" ? leader : null} />
                    <MetricRow label="회신" a={A.replied} b={B.replied} aBase={A.sent} bBase={B.sent}
                        highlight={test.metric === "reply" ? leader : null} muted={test.metric === "open"} />
                </tbody>
            </table>

            {active && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs tabular-nums text-muted-foreground">{decisionRuleText(test)}</span>
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" disabled={!leader} onClick={() => leader && apply(leader)}>
                            {leader ? `${leader}안 바로 적용` : "바로 적용"}
                        </Button>
                        {(test.kind === "prompt" || test.kind === "model") && (
                            <Button size="sm" variant="outline" onClick={stop}>중단</Button>
                        )}
                    </div>
                </div>
            )}
            {test.result === "insufficient" && (
                <p className="text-xs text-muted-foreground">
                    {test.maxEnrollmentDays}일 안에 안마다 {test.plannedPerArm.toLocaleString()}통을 못 채워 판정하지 않고 A안을 그대로 씁니다.
                </p>
            )}
            {test.result === "B" && test.applied === false && (
                <p className="text-xs text-muted-foreground">
                    {test.kind === "model" ? "테스트 중 규칙 모델이 바뀌었거나 B 모델 연결이 끊겨 B안을 규칙에 넣지 않았습니다." : "테스트 중 지시사항이 바뀌어 B안을 규칙에 넣지 않았습니다."}
                </p>
            )}

            {test.kind === "prompt" && (
                <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground">지시사항 보기</summary>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {(["A", "B"] as const).map((arm) => (
                            <div key={arm} className="rounded-lg bg-muted/40 p-3">
                                <p className="mb-1 text-xs font-medium">{arm === "A" ? "A안" : SCOPE_PROMPT_LABELS[scope]}</p>
                                <p className="whitespace-pre-wrap text-xs text-muted-foreground">{arm === "A" ? test.promptA : test.promptB}</p>
                            </div>
                        ))}
                    </div>
                </details>
            )}
        </div>
    );
}
