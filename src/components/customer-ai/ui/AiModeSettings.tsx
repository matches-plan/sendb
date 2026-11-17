"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsSection } from "@/components/inbox/ui/SettingsSection";
import { cn } from "@/lib/utils";
import type { SupportCatalog, SupportSettings } from "../types";

/**
 * 상담 설정 › AI 응대 › AI 자동 답변 설정.
 * 제목 오른쪽 토글로 자동 답변(AI가 먼저 답하고 필요할 때만 상담원에게 넘김)을 켜고 끈다. 끄면 아래 칸은 모두 비활성.
 */
export function AiModeSettings({
    catalog,
    members,
    canManage,
    onSave,
}: {
    catalog: SupportCatalog;
    members: { id: string; name: string }[];
    canManage: boolean;
    onSave: (value: SupportSettings) => Promise<SupportSettings>;
}) {
    const [draft, setDraft] = useState(catalog.settings);
    const [busy, setBusy] = useState(false);
    const on = catalog.settings.mode === "reply";
    const changed = JSON.stringify({ ...draft, mode: null }) !== JSON.stringify({ ...catalog.settings, mode: null });
    const locked = !on || !canManage || busy;

    async function save(next: SupportSettings, message: string) {
        setBusy(true);
        try {
            const saved = await onSave(next);
            setDraft(saved);
            toast.success(message);
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <SettingsSection
            title="AI 자동 답변 설정"
            action={
                <Switch
                    aria-label="AI 자동 답변"
                    checked={on}
                    disabled={!canManage || busy}
                    onCheckedChange={(checked) =>
                        void save({ ...catalog.settings, mode: checked ? "reply" : "manual" }, checked ? "AI 자동 답변을 켰어요." : "AI 자동 답변을 껐어요.")
                    }
                />
            }
        >
            {on && !catalog.workerEnabled && <p className="text-sm text-amber-700">서버에서 AI 처리가 꺼져 있어 실제 답변은 나가지 않아요.</p>}
            <fieldset disabled={locked} className={cn("space-y-5", !on && "opacity-50")}>
                <label className="block space-y-1.5">
                    <span className="block text-sm font-medium">AI 모델</span>
                    <Select value={draft.model} onValueChange={(model) => setDraft({ ...draft, model })} disabled={locked}>
                        <SelectTrigger className="w-full border-border/70" aria-label="AI 모델">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {catalog.models.map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                    {m.label}
                                    {m.configured ? "" : " (연결 필요)"}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </label>
                <label className="block space-y-1.5">
                    <span className="block text-sm font-medium">상담원에게 넘길 때 담당자</span>
                    <Select
                        value={draft.handoffAssigneeId ?? "none"}
                        onValueChange={(v) => setDraft({ ...draft, handoffAssigneeId: v === "none" ? null : v })}
                        disabled={locked}
                    >
                        <SelectTrigger className="w-full border-border/70" aria-label="상담원에게 넘길 때 담당자">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">지정 안 함</SelectItem>
                            {members.map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                    {m.name}
                                </SelectItem>
                            ))}
                            {draft.handoffAssigneeId && !members.some((m) => m.id === draft.handoffAssigneeId) && (
                                <SelectItem value={draft.handoffAssigneeId}>예전 담당자</SelectItem>
                            )}
                        </SelectContent>
                    </Select>
                </label>
                <label className="block space-y-1.5">
                    <span className="block text-sm font-medium">상담원에게 넘길 때 고객 안내</span>
                    <Textarea className="min-h-20 border-border/70" maxLength={500} value={draft.handoffMessage} onChange={(e) => setDraft({ ...draft, handoffMessage: e.target.value })} />
                </label>
                <label className="block space-y-1.5">
                    <span className="block text-sm font-medium">하루 최대 AI 답변 횟수</span>
                    <Input type="number" min={1} max={1000} className="w-40 border-border/70" value={draft.maxJobsPerDay} onChange={(e) => setDraft({ ...draft, maxJobsPerDay: Number(e.target.value) })} />
                </label>
                {canManage && (
                    <div className="flex justify-end">
                        <Button disabled={!changed || busy} onClick={() => void save({ ...draft, mode: catalog.settings.mode }, "저장했어요.")}>
                            {busy ? "저장 중…" : "저장"}
                        </Button>
                    </div>
                )}
            </fieldset>
        </SettingsSection>
    );
}
