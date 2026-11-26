"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoTip } from "@/components/ui/info-tip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PromptWithVariableInsert } from "@/components/email/PromptWithVariableInsert";
import type { useRuleAbTest } from "../hooks/useRuleAbTest";
import type { AbTestMetric, AbTestRow, AbTestScope } from "../types";
import { METRIC_LABELS, SCOPE_FIELD_LABEL, SCOPE_LABELS, SCOPE_METRICS, SCOPE_PROMPT_LABELS, abTestDisplayName, shortDay, DECISION_TIP, MODEL_METRICS, modelPairLabel } from "../utils/labels";
import { ModelSelectItems } from "@/components/ai/ui/ModelSelectItems";
import { DEFAULT_MODEL_ID } from "@/lib/ai/models";
import { AbTestCard, AbTestResultBadge } from "./AbTestCard";


const KIND_LABELS: Record<"prompt" | "model", string> = { prompt: "AI 지시사항", model: "AI 모델" };

const PLACEHOLDERS: Record<AbTestScope, string> = {
    subject: "B안 제목을 어떻게 쓸지 입력하세요. 본문은 A안 그대로 씁니다.",
    opening: "B안 첫 문장을 어떻게 쓸지 입력하세요. 나머지는 A안 그대로 씁니다.",
    all: "A안(위 AI 지시사항)과 비교할 내용·방향을 입력하세요.",
};

function Choice<T extends string>({ label, value, options, labels, onChange }: {
    label: string; value: T; options: T[]; labels: Record<T, string>; onChange: (v: T) => void;
}) {
    return (
        <div className="space-y-2">
            <Label>{label}</Label>
            <Select value={value} onValueChange={(v) => onChange(v as T)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                    {options.map((o) => <SelectItem key={o} value={o}>{labels[o]}</SelectItem>)}
                </SelectContent>
            </Select>
        </div>
    );
}

function testMeta(test: AbTestRow) {
    const running = test.result === "running";
    return [
        test.kind === "model" ? `모델 ${modelPairLabel(test.modelA, test.modelB)}` : SCOPE_LABELS[test.scope ?? "all"],
        `평가 기준 ${METRIC_LABELS[test.metric]}`,
        `${shortDay(test.startedAt)} ~ ${running ? "" : shortDay(test.closedAt)}`.trim(),
    ].join(" · ");
}

/** 끝난 테스트 한 줄 — 누르면 숫자 */
function FinishedTest({ test, name, onApplied }: {
    test: AbTestRow; name: string; onApplied: (result: { prompt: string | null; model?: string | null }) => void;
}) {
    const [open, setOpen] = useState(false);
    return (
        <div>
            <div
                role="button"
                tabIndex={0}
                className="flex cursor-pointer flex-wrap items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-muted/40"
                onClick={() => setOpen((v) => !v)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), setOpen((v) => !v))}
            >
                {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <span className="text-sm font-medium">{name}</span>
                <AbTestResultBadge test={test} />
                <span className="text-xs text-muted-foreground">{testMeta(test)}</span>
            </div>
            {open && (
                <div className="pb-2 pl-6 pt-1">
                    <AbTestCard test={test} compact onApplied={onApplied} />
                </div>
            )}
        </div>
    );
}

/**
 * AI 지시사항 아래 'AB 테스트' — 끝난 테스트 목록, 진행 중 테스트(진행 상황·중단), 추가 중 테스트(테스트명·테스트 선택·B안 지시·평가 기준).
 * 한 번에 하나만 — 진행 중이거나 추가 중이면 '+ AB 테스트 추가' 칸을 숨긴다. 추가한 테스트는 규칙을 저장할 때 시작한다.
 */
export function AbTestField({
    abTest,
    fields,
    prompt,
    model,
    onApplied,
    onModelApplied,
}: {
    abTest: ReturnType<typeof useRuleAbTest>;
    fields: { key: string; label: string }[];
    /** 지금 편집 중인 AI 지시사항 — 진행 중 테스트의 A안과 다르면 저장 때 중단된다고 알린다 */
    prompt?: string;
    /** 지금 고른 규칙의 AI 모델 — 모델 AB 테스트의 A안. 바꾸면 저장 때 중단된다고 알린다 */
    model?: string;
    /** 바로 적용한 뒤 — 규칙에 들어간 지시사항 */
    onApplied?: (prompt: string | null) => void;
    /** 모델 AB 테스트를 바로 적용한 뒤 — 규칙에 들어간 모델 (화면의 선택값도 맞춘다) */
    onModelApplied?: (model: string) => void;
}) {
    const { tests, draft, runningTest } = abTest;
    const promptChanged = runningTest?.kind === "prompt" && prompt !== undefined && prompt.trim() !== (runningTest.promptA ?? "").trim();
    const modelChanged = runningTest?.kind === "model" && model !== undefined && (model || DEFAULT_MODEL_ID) !== runningTest.modelA;
    const applied = (result: { prompt: string | null; model?: string | null }) => {
        void abTest.reload();
        if (result.model) onModelApplied?.(result.model);
        else onApplied?.(result.prompt);
    };
    const finished = tests.filter((t) => t.result !== "running");
    const runningIndex = runningTest ? tests.indexOf(runningTest) + 1 : 0;
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-1">
                <Label>AB 테스트</Label>
                <InfoTip text={DECISION_TIP} />
            </div>

            {finished.length > 0 && (
                <div>
                    {finished.map((test) => (
                        <FinishedTest
                            key={test.id}
                            test={test}
                            name={abTestDisplayName(test, tests.indexOf(test) + 1)}
                            onApplied={applied}
                        />
                    ))}
                </div>
            )}

            {runningTest && (
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{abTestDisplayName(runningTest, runningIndex)}</span>
                        <AbTestResultBadge test={runningTest} />
                        <span className="text-xs text-muted-foreground">{testMeta(runningTest)}</span>
                    </div>
                    {promptChanged && <p className="text-xs text-destructive">지시사항을 바꿔 저장하면 이 테스트는 중단됩니다.</p>}
                    {modelChanged && <p className="text-xs text-destructive">AI 모델을 바꿔 저장하면 이 테스트는 중단됩니다.</p>}
                    <AbTestCard test={runningTest} compact onApplied={applied} onChanged={() => void abTest.reload()} />
                </div>
            )}

            {draft && (
                <div className="relative space-y-4 rounded-lg border border-border/40 p-4 pt-10">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        aria-label="테스트 삭제"
                        onClick={abTest.cancel}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                    <div className="space-y-2">
                        <Label htmlFor="ab-test-name">테스트명</Label>
                        <Input
                            id="ab-test-name"
                            value={draft.name}
                            maxLength={100}
                            onChange={(e) => abTest.setName(e.target.value)}
                        />
                    </div>
                    <Choice<"prompt" | "model">
                        label="비교 대상"
                        value={draft.kind}
                        options={["prompt", "model"]}
                        labels={KIND_LABELS}
                        onChange={abTest.setKind}
                    />
                    {draft.kind === "model" ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label>B안 AI 모델</Label>
                                <Select value={draft.modelB} onValueChange={abTest.setModelB}>
                                    <SelectTrigger className="w-full"><SelectValue placeholder="비교할 모델 선택" /></SelectTrigger>
                                    <SelectContent>
                                        <ModelSelectItems current={draft.modelB} exclude={model || DEFAULT_MODEL_ID} />
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">A안은 지금 규칙 모델이고, 지시사항은 두 안이 같습니다.</p>
                            </div>
                            <Choice<AbTestMetric>
                                label="평가 기준"
                                value={draft.metric}
                                options={MODEL_METRICS}
                                labels={METRIC_LABELS}
                                onChange={abTest.setMetric}
                            />
                        </div>
                    ) : (
                    <>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Choice<AbTestScope>
                            label={SCOPE_FIELD_LABEL}
                            value={draft.scope}
                            options={["subject", "opening", "all"]}
                            labels={SCOPE_LABELS}
                            onChange={abTest.setScope}
                        />
                        <Choice<AbTestMetric>
                            label="평가 기준"
                            value={draft.metric}
                            options={SCOPE_METRICS[draft.scope]}
                            labels={METRIC_LABELS}
                            onChange={abTest.setMetric}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>{SCOPE_PROMPT_LABELS[draft.scope]}</Label>
                        <PromptWithVariableInsert
                            value={draft.promptB}
                            onChange={abTest.setPromptB}
                            fields={fields}
                            placeholder={PLACEHOLDERS[draft.scope]}
                            rows={draft.scope === "all" ? 5 : 3}
                        />
                    </div>
                    </>
                    )}
                </div>
            )}

            {abTest.canAdd && (
                <button
                    type="button"
                    className="flex h-20 w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border/70 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                    onClick={abTest.add}
                >
                    <Plus className="h-4 w-4" />
                    AB 테스트 추가
                </button>
            )}
        </div>
    );
}
