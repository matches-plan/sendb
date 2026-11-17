"use client";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAsyncConfirm } from "@/components/ui/alert-dialog";
import { SettingsSection } from "@/components/inbox/ui/SettingsSection";
import { cn } from "@/lib/utils";
import { supportRequest, supportWrite } from "../api";
import { aiRulesUrl, useAiRules } from "../hooks/useAiLibrary";
import type { AiRule } from "../types";

const day = new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit" });

/** 상담 설정 › AI 응대 › 톤앤매너 규칙 — 카드를 펼치면 바로 제목·내용을 고친다. 작동 중인 규칙만 AI에 적용 */
export function AiRules({ workspaceId, canManage }: { workspaceId: number; canManage: boolean }) {
    const { data, error, mutate } = useAiRules(workspaceId);
    const [open, setOpen] = useState<number | "new" | null>(null);
    return (
        <SettingsSection
            title="톤앤매너 규칙"
            action={
                canManage &&
                open !== "new" && (
                    <Button onClick={() => setOpen("new")}>
                        <Plus className="h-4 w-4" />
                        규칙 만들기
                    </Button>
                )
            }
        >
            {error && <p role="alert" className="text-sm text-red-700">{error.message}</p>}
            {!data && !error && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
            {data && !data.length && open !== "new" && <p className="text-sm text-muted-foreground">아직 규칙이 없어요.</p>}
            <div className="space-y-3">
                {open === "new" && (
                    <RuleCard key="new" workspaceId={workspaceId} canManage={canManage} expanded onToggle={() => setOpen(null)} onSaved={async () => { await mutate(); setOpen(null); }} />
                )}
                {data?.map((r) => (
                    <RuleCard
                        key={`${r.id}:${r.updatedAt}`}
                        rule={r}
                        workspaceId={workspaceId}
                        canManage={canManage}
                        expanded={open === r.id}
                        onToggle={() => setOpen(open === r.id ? null : r.id)}
                        onSaved={() => mutate()}
                    />
                ))}
            </div>
        </SettingsSection>
    );
}

function RuleCard({
    rule,
    workspaceId,
    canManage,
    expanded,
    onToggle,
    onSaved,
}: {
    rule?: AiRule;
    workspaceId: number;
    canManage: boolean;
    expanded: boolean;
    onToggle: () => void;
    onSaved: () => Promise<unknown>;
}) {
    const [title, setTitle] = useState(rule?.title ?? "");
    const [body, setBody] = useState(rule?.body ?? "");
    const [busy, setBusy] = useState(false);
    const { confirm, confirmationDialog } = useAsyncConfirm();
    const changed = title !== (rule?.title ?? "") || body !== (rule?.body ?? "");

    async function run(action: () => Promise<unknown>, message: string) {
        setBusy(true);
        try {
            await action();
            await onSaved();
            toast.success(message);
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            setBusy(false);
        }
    }
    const save = () =>
        run(
            () =>
                rule
                    ? supportWrite(`/api/customer-ai/rules/${rule.id}`, { title, body }, "PATCH")
                    : supportWrite(aiRulesUrl(workspaceId), { workspaceId, title, body }),
            "저장했어요.",
        );

    return (
        <div className="rounded-lg border border-border/40 bg-background">
            {confirmationDialog}
            <div className="flex items-center gap-3 px-5 py-4">
                {expanded && canManage ? (
                    <input
                        autoFocus={!rule}
                        aria-label="규칙 제목"
                        className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-muted-foreground"
                        maxLength={100}
                        placeholder="규칙 제목"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                    />
                ) : (
                    <button type="button" className="min-w-0 flex-1 truncate text-left font-semibold" onClick={onToggle}>
                        {rule?.title}
                    </button>
                )}
                {rule && (
                    <>
                        <span className="shrink-0 text-xs text-muted-foreground">{day.format(new Date(rule.updatedAt))}</span>
                        <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-xs font-medium", rule.enabled ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground")}>
                            {rule.enabled ? "작동중" : "꺼짐"}
                        </span>
                        <Switch
                            aria-label={`${rule.title} 작동`}
                            checked={rule.enabled}
                            disabled={!canManage || busy}
                            onCheckedChange={(enabled) => void run(() => supportWrite(`/api/customer-ai/rules/${rule.id}`, { enabled }, "PATCH"), enabled ? "규칙을 켰어요." : "규칙을 껐어요.")}
                        />
                    </>
                )}
                <button type="button" aria-label={expanded ? "접기" : "펼치기"} aria-expanded={expanded} onClick={onToggle} className="text-muted-foreground">
                    <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
                </button>
            </div>
            {expanded && (
                <>
                    <div className="border-t border-border/40 px-5 py-4">
                        {canManage ? (
                            <textarea
                                aria-label="규칙 내용"
                                className="min-h-40 w-full resize-y bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
                                maxLength={2000}
                                placeholder={"[적용방법]\n- 고객의 감정을 먼저 공감하는 한 줄을 전합니다.\n\n[유의사항]\n- 강한 불만이 있으면 사과 후 상담 연결을 물어봅니다."}
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                            />
                        ) : (
                            <p className="whitespace-pre-wrap text-sm leading-relaxed">{body}</p>
                        )}
                        <p className="text-right text-xs text-muted-foreground">{body.length.toLocaleString()}/2,000</p>
                    </div>
                    {canManage && (
                        <div className="flex items-center gap-2 border-t border-border/40 px-5 py-3">
                            {rule && (
                                <Button
                                    variant="ghost"
                                    className="text-red-700 hover:text-red-700"
                                    disabled={busy}
                                    onClick={() =>
                                        confirm({
                                            title: `"${rule.title}" 규칙을 삭제할까요?`,
                                            description: "되돌릴 수 없어요.",
                                            onConfirm: async () => {
                                                await supportRequest(`/api/customer-ai/rules/${rule.id}`, { method: "DELETE" });
                                                await onSaved();
                                            },
                                        })
                                    }
                                >
                                    삭제
                                </Button>
                            )}
                            <div className="flex-1" />
                            {!rule && (
                                <Button variant="outline" className="border-border/70" disabled={busy} onClick={onToggle}>
                                    취소
                                </Button>
                            )}
                            <Button disabled={busy || !changed || !title.trim() || !body.trim()} onClick={() => void save()}>
                                {busy ? "저장 중…" : "저장"}
                            </Button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
