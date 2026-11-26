"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAutoPersonalizedEmail } from "@/hooks/useAutoPersonalizedEmail";
import { useAiModels } from "@/components/ai/hooks/useAiModels";
import { requestErrorMessage } from "@/lib/swr-fetcher";
import { requestPreview } from "../api/modelLab";
import type { PreviewResult } from "../types";

const MAX_MODELS = 6;
const usd = (v: number | null | undefined) => (v == null ? "—" : `$${v < 0.01 ? v.toFixed(5) : v.toFixed(3)}`);

/** 같은 규칙·레코드로 여러 모델이 쓴 메일을 나란히 본다. 블라인드면 이름을 가리고 순서를 섞는다 */
export function PreviewPanel() {
    const { links } = useAutoPersonalizedEmail("all");
    const models = useAiModels();
    const [ruleId, setRuleId] = useState<string>("");
    const [recordId, setRecordId] = useState("");
    const [picked, setPicked] = useState<string[]>([]);
    const [blind, setBlind] = useState(false);
    const [revealed, setRevealed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [company, setCompany] = useState("");
    const [results, setResults] = useState<PreviewResult[]>([]);

    const rules = useMemo(() => links.filter((l) => !l.isDraft), [links]);
    const shown = useMemo(() => {
        if (!blind) return results;
        // 매번 같은 결과면 같은 순서 — 고르는 동안 카드가 움직이지 않게
        return [...results].sort((a, b) => hash(a.model + company) - hash(b.model + company));
    }, [blind, results, company]);

    const toggle = (id: string, on: boolean) =>
        setPicked((prev) => (on ? (prev.length >= MAX_MODELS ? prev : [...prev, id]) : prev.filter((m) => m !== id)));

    const run = async () => {
        setBusy(true);
        setError(null);
        setRevealed(false);
        try {
            const data = await requestPreview({
                ruleId: Number(ruleId),
                recordId: recordId.trim() ? Number(recordId) : undefined,
                models: picked,
            });
            setCompany(data.company);
            setResults(data.results);
        } catch (err) {
            setError(requestErrorMessage(err, "미리보기를 만들지 못했습니다."));
        } finally {
            setBusy(false);
        }
    };

    const recordValid = !recordId.trim() || /^\d+$/.test(recordId.trim());
    return (
        <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
                <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">규칙</Label>
                    <Select value={ruleId} onValueChange={setRuleId}>
                        <SelectTrigger className="h-9">
                            <SelectValue placeholder="AI 콜드메일 규칙 선택" />
                        </SelectTrigger>
                        <SelectContent>
                            {rules.map((r) => (
                                <SelectItem key={r.id} value={String(r.id)}>
                                    {(r.name || `규칙 #${r.id}`) + ((r as { partitionName?: string }).partitionName ? ` · ${(r as { partitionName?: string }).partitionName}` : "")}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">레코드 id (비우면 테스트 회사)</Label>
                    <Input className="h-9" inputMode="numeric" value={recordId} onChange={(e) => setRecordId(e.target.value)} placeholder="예: 410223" />
                </div>
            </div>

            <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">모델 (최대 {MAX_MODELS}개)</Label>
                <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-md border border-border/40 p-3">
                    {(models ?? []).map((m) => (
                        <label key={m.id} className={`flex items-center gap-2 text-sm ${m.available ? "" : "text-muted-foreground"}`}>
                            <Checkbox checked={picked.includes(m.id)} disabled={!m.available} onCheckedChange={(v) => toggle(m.id, v === true)} />
                            {m.label}
                            {!m.available ? <span className="text-xs">· 연결 필요</span> : m.route === "openrouter" ? <span className="text-xs text-muted-foreground">· OpenRouter</span> : null}
                        </label>
                    ))}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <Button className="h-9" disabled={busy || !ruleId || !picked.length || !recordValid} onClick={run}>
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    미리보기 생성
                </Button>
                <label className="flex items-center gap-2 text-sm">
                    <Switch checked={blind} onCheckedChange={(v) => { setBlind(v); setRevealed(false); }} />
                    블라인드
                </label>
                {blind && results.length ? (
                    <Button variant="outline" className="h-9" onClick={() => setRevealed(true)} disabled={revealed}>
                        모델 공개
                    </Button>
                ) : null}
                <span className="text-xs text-muted-foreground">모델마다 실제 AI 호출 비용이 듭니다. 메일은 보내지 않습니다.</span>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            {shown.length ? (
                <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                    {shown.map((r, i) => {
                        const name = blind && !revealed ? `안 ${i + 1}` : r.label;
                        return (
                            <div key={r.model} className="flex flex-col rounded-md border border-border/40">
                                <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2 text-sm">
                                    <span className="font-medium">{name}</span>
                                    {!blind || revealed ? (
                                        <span className="text-xs text-muted-foreground">
                                            {r.latencyMs != null ? `${(r.latencyMs / 1000).toFixed(1)}초` : ""}
                                            {r.promptTokens != null ? ` · 입력 ${r.promptTokens.toLocaleString()} / 출력 ${r.completionTokens?.toLocaleString()}` : ""}
                                            {r.estCostUsd !== undefined ? ` · ${usd(r.estCostUsd)}` : ""}
                                        </span>
                                    ) : null}
                                </div>
                                {r.error ? (
                                    <p className="p-3 text-sm text-destructive">{r.error}</p>
                                ) : (
                                    <div className="flex flex-1 flex-col gap-2 p-3">
                                        <p className="text-sm font-medium">{r.subject}</p>
                                        {/* 모델이 쓴 HTML은 스크립트 없이 격리해 보여 준다 */}
                                        <iframe title={name} sandbox="" srcDoc={r.htmlBody} className="min-h-[360px] w-full flex-1 rounded border border-border/40 bg-white" />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}

function hash(text: string) {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
    return h;
}
