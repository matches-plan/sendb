"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsSection } from "@/components/inbox/ui/SettingsSection";
import { cn } from "@/lib/utils";
import { useOperationsSettings } from "../hooks/useOperations";
import { saveOperations } from "../api";
import type { OperationsPolicy } from "../types";
import { TimeInput } from "./TimeInput";

const days = ["일", "월", "화", "수", "목", "금", "토"];
const timezones = [
    ["Asia/Seoul", "한국 (Asia/Seoul)"],
    ["Asia/Tokyo", "일본 (Asia/Tokyo)"],
    ["Asia/Singapore", "싱가포르 (Asia/Singapore)"],
    ["America/Los_Angeles", "미국 서부 (America/Los_Angeles)"],
    ["America/New_York", "미국 동부 (America/New_York)"],
    ["Europe/London", "영국 (Europe/London)"],
    ["UTC", "UTC"],
] as const;
type Weekly = OperationsPolicy["calendar"]["weekly"];
const presets: { label: string; weekly: Weekly }[] = [
    { label: "평일 09:00~18:00", weekly: [1, 2, 3, 4, 5].map((day) => ({ day, start: "09:00", end: "18:00" })) },
    { label: "매일 24시간", weekly: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: "00:00", end: "24:00" })) },
];
const same = (a: Weekly, b: Weekly) => JSON.stringify(a) === JSON.stringify(b);

/** 상담 설정 › 업무 시간 / 응대 목표 — 둘 다 같은 운영 설정에 저장한다 */
export function OperationsSettingsEditor({ channelId, canManage, section }: { channelId: number; canManage: boolean; section: "hours" | "goals" }) {
    const { data, error, mutate } = useOperationsSettings(channelId);
    const [draft, setDraft] = useState<OperationsPolicy | null>(null);
    const [busy, setBusy] = useState(false);
    if (error)
        return (
            <p role="alert" className="text-sm text-red-700">
                {error.message} <button className="underline" onClick={() => void mutate()}>다시 불러오기</button>
            </p>
        );
    if (!data) return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
    const policy = draft ?? data.policy;
    const edit = (value: Partial<OperationsPolicy>) => setDraft({ ...policy, ...value });
    const setWeekly = (weekly: Weekly) => edit({ calendar: { ...policy.calendar, weekly } });
    const locked = !canManage || busy;

    async function save(next: OperationsPolicy, message: string) {
        setBusy(true);
        try {
            await saveOperations(channelId, data!.version, next);
            setDraft(null);
            await mutate();
            toast.success(message);
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            setBusy(false);
        }
    }
    const saveButton = canManage && (
        <div className="flex justify-end">
            <Button disabled={!draft || busy} onClick={() => void save(policy, "저장했어요.")}>
                {busy ? "저장 중…" : "저장"}
            </Button>
        </div>
    );

    if (section === "goals")
        return (
            <SettingsSection
                title="응대 목표"
                action={
                    // 끄면 초과 알림(직원에게 가는 알림) 검사를 멈춘다
                    <Switch
                        aria-label="응대 목표 사용"
                        checked={data.policy.enabled}
                        disabled={locked}
                        onCheckedChange={(enabled) => void save({ ...data.policy, enabled }, enabled ? "응대 목표를 켰어요." : "응대 목표를 껐어요.")}
                    />
                }
            >
                {data.policy.enabled && !data.workerEnabled && <p className="text-sm text-amber-700">서버에서 초과 알림이 꺼져 있어요.</p>}
                <fieldset disabled={locked || !data.policy.enabled} className={cn("space-y-5", !data.policy.enabled && "opacity-50")}>
                    <div className="grid gap-4 sm:grid-cols-3">
                        {(
                            [
                                ["firstMinutes", "첫 답변 (분)"],
                                ["nextMinutes", "추가 답변 (분)"],
                                ["resolutionMinutes", "해결 (분)"],
                            ] as const
                        ).map(([key, label]) => (
                            <label key={key} className="block space-y-1.5">
                                <span className="block text-sm font-medium">{label}</span>
                                <Input
                                    aria-label={label}
                                    type="number"
                                    min={1}
                                    max={43200}
                                    className="border-border/70"
                                    value={policy[key]}
                                    onChange={(e) => edit({ [key]: Number(e.target.value) })}
                                />
                            </label>
                        ))}
                    </div>
                    <label className="flex items-center justify-between gap-4 text-sm">
                        AI 자동 답변도 응답으로 집계
                        <Switch checked={policy.includeAi} disabled={locked || !data.policy.enabled} onCheckedChange={(includeAi) => edit({ includeAi })} />
                    </label>
                    <label className="flex items-center justify-between gap-4 text-sm">
                        보류 중 시간은 제외
                        <Switch checked={policy.pauseOnSnooze} disabled={locked || !data.policy.enabled} onCheckedChange={(pauseOnSnooze) => edit({ pauseOnSnooze })} />
                    </label>
                    {saveButton}
                </fieldset>
            </SettingsSection>
        );

    return (
        <SettingsSection title="업무 시간">
            <fieldset disabled={locked} className="space-y-6">
                <label className="block space-y-1.5">
                    <span className="block text-sm font-medium">시간대</span>
                    <Select value={policy.calendar.timezone} onValueChange={(timezone) => edit({ calendar: { ...policy.calendar, timezone } })} disabled={locked}>
                        <SelectTrigger className="w-72 border-border/70" aria-label="시간대">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {timezones.map(([id, label]) => (
                                <SelectItem key={id} value={id}>
                                    {label}
                                </SelectItem>
                            ))}
                            {!timezones.some(([id]) => id === policy.calendar.timezone) && <SelectItem value={policy.calendar.timezone}>{policy.calendar.timezone}</SelectItem>}
                        </SelectContent>
                    </Select>
                </label>
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="mr-2 text-sm font-medium">응대 시간</span>
                        {presets.map((p) => (
                            <button
                                key={p.label}
                                type="button"
                                onClick={() => setWeekly(p.weekly)}
                                className={cn(
                                    "rounded-full border px-3 py-1 text-xs",
                                    same(policy.calendar.weekly, p.weekly) ? "border-foreground bg-foreground text-background" : "border-border/70 hover:bg-muted",
                                )}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    {policy.calendar.weekly.map((row, i) => {
                        const set = (value: Partial<Weekly[number]>) => setWeekly(policy.calendar.weekly.map((r, n) => (n === i ? { ...r, ...value } : r)));
                        return (
                            <div key={i} className="flex items-center gap-2">
                                <Select value={String(row.day)} onValueChange={(v) => set({ day: Number(v) })} disabled={locked}>
                                    <SelectTrigger className="w-28 border-border/70" aria-label={`${i + 1}번째 요일`}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {days.map((d, n) => (
                                            <SelectItem key={n} value={String(n)}>
                                                {d}요일
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <TimeInput ariaLabel={`${i + 1}번째 시작`} value={row.start} onChange={(start) => set({ start })} disabled={locked} />
                                <span className="text-muted-foreground">~</span>
                                <TimeInput ariaLabel={`${i + 1}번째 종료`} value={row.end} onChange={(end) => set({ end })} disabled={locked} />
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`${i + 1}번째 시간 삭제`}
                                    onClick={() => setWeekly(policy.calendar.weekly.filter((_, n) => n !== i))}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        );
                    })}
                    <Button
                        variant="outline"
                        className="border-border/70"
                        disabled={locked || policy.calendar.weekly.length >= 21}
                        onClick={() => setWeekly([...policy.calendar.weekly, { day: 1, start: "09:00", end: "18:00" }])}
                    >
                        <Plus className="h-4 w-4" />
                        시간 추가
                    </Button>
                </div>
                <label className="flex items-center justify-between gap-4 text-sm font-medium">
                    사이트 상담창에 업무 시간 표시
                    <Switch checked={policy.showHours} disabled={locked} onCheckedChange={(showHours) => edit({ showHours })} />
                </label>
                <label className="block space-y-1.5">
                    <span className="block text-sm font-medium">업무 시간 밖 안내</span>
                    <Textarea className="min-h-20 border-border/70" maxLength={500} value={policy.awayMessage} onChange={(e) => edit({ awayMessage: e.target.value })} />
                </label>
                {saveButton}
            </fieldset>
        </SettingsSection>
    );
}
