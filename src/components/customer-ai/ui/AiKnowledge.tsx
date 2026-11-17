"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, FileText, Globe, Loader2, PenLine, Plus, Search, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { InfoTip } from "@/components/ui/info-tip";
import { useAsyncConfirm } from "@/components/ui/alert-dialog";
import { RichTextInput } from "@/components/inbox-composer/ui/RichTextInput";
import { isTranscriptDocument, readTranscriptFile } from "@/components/sales/utils/read-transcript-file";
import { cn } from "@/lib/utils";
import { supportRequest, supportWrite } from "../api";
import { aiDocsUrl, useAiDocs } from "../hooks/useAiLibrary";
import type { AiDoc } from "../types";

type Kind = AiDoc["kind"];
type Draft = Pick<AiDoc, "kind" | "title" | "body" | "published" | "questions" | "source" | "sourceRef"> & { id?: number };
type Step = { at: "list" } | { at: "pick" } | { at: "website" } | { at: "file" } | { at: "edit"; draft: Draft };
const day = new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit" });
const names = { article: "문서", faq: "FAQ" } as const;
const preview = (body: string) => body.replace(/[#*`>_-]/g, "").replace(/\s+/g, " ").trim();
const blank = (kind: Kind): Draft => ({ kind, title: "", body: "", published: true, questions: [], source: "manual", sourceRef: null });
// 테두리 없는 입력칸 — 카드 안에서 한 번 더 감싸지 않는다
const bare = "border-0 bg-transparent px-0 shadow-none focus-visible:ring-0";

/** 상담 설정 › AI 응대 › 상담 지식 — 문서(웹사이트·파일·직접 입력)와 FAQ. 공개한 것만 AI가 참고한다 */
export function AiKnowledge({ workspaceId, canManage }: { workspaceId: number; canManage: boolean }) {
    const { data, error, mutate } = useAiDocs(workspaceId);
    const [kind, setKind] = useState<Kind>("article");
    const [query, setQuery] = useState("");
    const [step, setStep] = useState<Step>({ at: "list" });
    const rows = (data ?? []).filter((d) => d.kind === kind && [d.title, d.body, ...(d.questions ?? [])].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
    const count = (k: Kind) => (data ?? []).filter((d) => d.kind === k).length;
    const back = () => setStep({ at: "list" });
    const imported = async (input: Record<string, unknown>, title?: string) => {
        // AI 정리는 1분 안팎 걸려 기본 15초보다 길게 기다린다
        const doc = await supportRequest<Pick<Draft, "title" | "body" | "source" | "sourceRef">>(
            "/api/customer-ai/docs/import",
            { method: "POST", body: JSON.stringify({ workspaceId, ...input }) },
            200_000,
        );
        setStep({ at: "edit", draft: { ...blank("article"), ...doc, title: title?.trim() || doc.title } });
    };

    if (step.at === "edit") return <DocEditor key={step.draft.id ?? "new"} initial={step.draft} workspaceId={workspaceId} canManage={canManage} onDone={async () => { await mutate(); back(); }} onBack={back} />;
    if (step.at === "pick")
        return (
            <section className="space-y-5">
                <BackTitle title="지식 추가" onBack={back} />
                <div className="grid gap-3 sm:grid-cols-3">
                    {(
                        [
                            ["website", Globe, "웹사이트"],
                            ["file", FileText, "파일"],
                            ["manual", PenLine, "직접 입력"],
                        ] as const
                    ).map(([id, Icon, label]) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setStep(id === "manual" ? { at: "edit", draft: blank("article") } : { at: id })}
                            className="flex flex-col items-start gap-4 rounded-lg border border-border/40 p-5 text-left hover:bg-muted/40"
                        >
                            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-50 text-amber-600">
                                <Icon className="h-5 w-5" />
                            </span>
                            <span className="font-semibold">{label}</span>
                        </button>
                    ))}
                </div>
            </section>
        );
    if (step.at === "website") return <WebsiteStep onBack={() => setStep({ at: "pick" })} onNext={(url, title) => imported({ source: "website", url }, title)} />;
    if (step.at === "file") return <FileStep onBack={() => setStep({ at: "pick" })} onNext={(fileName, text) => imported({ source: "file", fileName, text })} />;

    return (
        <section className="space-y-5">
            <header className="flex items-start gap-4">
                <h2 className="flex-1 text-lg font-semibold">상담 지식</h2>
                {canManage && (
                    <Button onClick={() => setStep(kind === "faq" ? { at: "edit", draft: blank("faq") } : { at: "pick" })}>
                        <Plus className="h-4 w-4" />
                        추가
                    </Button>
                )}
            </header>
            <div className="flex items-center gap-4 border-b border-border/40">
                {(["article", "faq"] as const).map((k) => (
                    <button
                        key={k}
                        type="button"
                        onClick={() => setKind(k)}
                        className={cn("-mb-px border-b-2 px-1 pb-2.5 text-sm", kind === k ? "border-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground")}
                    >
                        {names[k]} <span className="text-xs text-muted-foreground">{count(k)}</span>
                    </button>
                ))}
                <label className="mb-2 ml-auto flex w-64 items-center gap-2 rounded-lg bg-muted/60 px-3 py-2">
                    <Search size={14} className="text-muted-foreground" />
                    <input aria-label={`${names[kind]} 검색`} className="w-full bg-transparent text-xs outline-none" placeholder="검색" value={query} onChange={(e) => setQuery(e.target.value)} />
                </label>
            </div>
            {error && <p role="alert" className="text-sm text-red-700">{error.message}</p>}
            {!data && !error && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
            {data && (
                <table className="w-full table-fixed text-sm">
                    <thead>
                        <tr className="border-b border-border/40 text-left text-xs text-muted-foreground">
                            <th className="py-2 font-medium">{kind === "faq" ? "질문 및 답변" : "제목"}</th>
                            <th className="w-20 py-2 font-medium">상태</th>
                            <th className="w-20 py-2 font-medium">최근 수정</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((d) => (
                            <tr key={d.id} className="cursor-pointer border-b border-border/40 hover:bg-muted/40" onClick={() => setStep({ at: "edit", draft: { ...d, questions: d.questions ?? [] } })}>
                                <td className="py-3 pr-4">
                                    <p className="truncate font-semibold">{d.title}</p>
                                    <p className="mt-0.5 truncate text-muted-foreground">{preview(d.body)}</p>
                                </td>
                                <td className="py-3">
                                    <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", d.published ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground")}>{d.published ? "공개" : "비공개"}</span>
                                </td>
                                <td className="py-3 text-muted-foreground">{day.format(new Date(d.updatedAt))}</td>
                            </tr>
                        ))}
                        {!rows.length && (
                            <tr>
                                <td colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                                    {query ? "검색 결과가 없어요." : `아직 ${names[kind]}가 없어요.`}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            )}
        </section>
    );
}

function BackTitle({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="뒤로" onClick={onBack}>
                <ArrowLeft className="h-4 w-4" />
            </Button>
            <h2 className="flex-1 text-lg font-semibold">{title}</h2>
            {right}
        </div>
    );
}

/** 웹사이트 — 주소와 이름(선택)을 넣고 다음을 누르면 AI가 페이지 글을 정리해 문서 초안을 만든다 */
function WebsiteStep({ onBack, onNext }: { onBack: () => void; onNext: (url: string, title: string) => Promise<void> }) {
    const [url, setUrl] = useState("");
    const [title, setTitle] = useState("");
    const [busy, setBusy] = useState(false);
    return (
        <section className="space-y-6">
            <BackTitle title="웹사이트" onBack={onBack} />
            <div className="grid max-w-2xl grid-cols-[8rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3">
                <span className="text-sm font-medium">웹사이트 URL</span>
                <Input autoFocus className="border-border/70" placeholder="예: https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy} />
                <span className="text-sm font-medium">이름 (선택)</span>
                <Input className="border-border/70" placeholder="예: 요금 안내" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
            </div>
            <div className="flex justify-end">
                <Button
                    disabled={busy || !url.trim()}
                    onClick={async () => {
                        setBusy(true);
                        try {
                            await onNext(url, title);
                        } catch (e) {
                            toast.error((e as Error).message);
                            setBusy(false);
                        }
                    }}
                >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    {busy ? "가져오는 중…" : "다음"}
                </Button>
            </div>
        </section>
    );
}

/** 파일 — PDF·Word·텍스트를 끌어다 놓으면 브라우저에서 글을 읽고 AI가 정리해 문서 초안을 만든다 */
function FileStep({ onBack, onNext }: { onBack: () => void; onNext: (fileName: string, text: string) => Promise<void> }) {
    const [busy, setBusy] = useState<string | null>(null);
    const [over, setOver] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    async function take(file?: File) {
        if (!file) return;
        if (!isTranscriptDocument(file)) return void toast.error("PDF·Word(docx)·텍스트 파일만 올릴 수 있어요.");
        setBusy(file.name);
        try {
            const text = (await readTranscriptFile(file)).trim();
            if (!text) throw new Error("파일에서 글을 찾지 못했어요. 스캔한 이미지 PDF는 읽을 수 없어요.");
            await onNext(file.name, text.slice(0, 200000));
        } catch (e) {
            toast.error((e as Error).message);
            setBusy(null);
        }
    }
    return (
        <section className="space-y-6">
            <BackTitle title="파일" onBack={onBack} />
            <button
                type="button"
                disabled={!!busy}
                onClick={() => input.current?.click()}
                onDragOver={(e) => {
                    e.preventDefault();
                    setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setOver(false);
                    void take(e.dataTransfer.files[0]);
                }}
                className={cn("flex w-full flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-sm text-muted-foreground", over ? "border-violet-400 bg-violet-50/60" : "border-border/70 hover:bg-muted/40")}
            >
                {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
                {busy ? `${busy} 정리하는 중…` : "PDF·Word·텍스트 파일을 끌어다 놓거나 눌러서 고르세요"}
            </button>
            <input ref={input} type="file" accept=".pdf,.docx,.txt,.md,.csv" className="hidden" onChange={(e) => void take(e.target.files?.[0])} />
        </section>
    );
}

/** 문서·FAQ 편집 — 카드 안에서 칸을 한 번 더 감싸지 않고 제목·본문을 바로 쓴다 */
function DocEditor({ initial, workspaceId, canManage, onDone, onBack }: { initial: Draft; workspaceId: number; canManage: boolean; onDone: () => Promise<void>; onBack: () => void }) {
    const [draft, setDraft] = useState(initial);
    const [busy, setBusy] = useState(false);
    const { confirm, confirmationDialog } = useAsyncConfirm();
    const faq = draft.kind === "faq";
    const set = (value: Partial<Draft>) => setDraft((d) => ({ ...d, ...value }));
    const questions = draft.questions;

    async function save() {
        setBusy(true);
        try {
            const body = {
                title: draft.title,
                body: draft.body,
                published: draft.published,
                questions: questions.map((q) => q.trim()).filter(Boolean),
                source: draft.source,
                sourceRef: draft.sourceRef,
            };
            if (draft.id) await supportWrite(`/api/customer-ai/docs/${draft.id}`, body, "PATCH");
            else await supportWrite(aiDocsUrl(workspaceId), { workspaceId, kind: draft.kind, ...body });
            toast.success("저장했어요.");
            await onDone();
        } catch (e) {
            toast.error((e as Error).message);
            setBusy(false);
        }
    }

    return (
        <section className="space-y-4">
            {confirmationDialog}
            <BackTitle
                title={draft.id ? names[draft.kind] : faq ? "새 FAQ" : "새 문서"}
                onBack={onBack}
                right={
                    <label className="flex items-center gap-2 text-sm">
                        {draft.published ? "공개" : "비공개"}
                        <Switch aria-label="공개" checked={draft.published} disabled={!canManage} onCheckedChange={(published) => set({ published })} />
                    </label>
                }
            />
            <fieldset disabled={!canManage || busy} className="divide-y divide-border/40">
                <Input
                    autoFocus={!draft.id && !draft.body}
                    aria-label={faq ? "질문" : "제목"}
                    className={cn(bare, "h-12 text-xl font-semibold md:text-xl")}
                    maxLength={200}
                    placeholder={faq ? "질문" : "제목"}
                    value={draft.title}
                    onChange={(e) => set({ title: e.target.value })}
                />
                {faq && (
                    <div className="space-y-1 py-3">
                        <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                            추가 질문
                            <InfoTip text={"같은 뜻을 다르게 묻는 표현이에요.\n예: '요금제가 얼마인가요?' 대신 '플랜이 뭐가 있어요?'\n고객이 어떻게 물어도 이 답을 찾도록 최대 10개까지 넣을 수 있어요."} />
                        </div>
                        {questions.map((q, i) => (
                            <div key={i} className="flex items-center gap-1">
                                <Input
                                    aria-label={`추가 질문 ${i + 1}`}
                                    className={cn(bare, "h-9")}
                                    maxLength={200}
                                    placeholder="같은 뜻의 다른 질문"
                                    value={q}
                                    onChange={(e) => set({ questions: questions.map((x, n) => (n === i ? e.target.value : x)) })}
                                />
                                <Button variant="ghost" size="icon" aria-label={`추가 질문 ${i + 1} 삭제`} onClick={() => set({ questions: questions.filter((_, n) => n !== i) })}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                        {questions.length < 10 && (
                            <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => set({ questions: [...questions, ""] })}>
                                <Plus className="h-4 w-4" />
                                추가 질문
                            </Button>
                        )}
                    </div>
                )}
                <div className="py-3">
                    {/* 노션처럼 **굵게**·## 제목·- 목록을 치면 바로 서식으로 바뀐다. 저장은 마크다운 */}
                    <RichTextInput
                        ariaLabel={faq ? "답변" : "본문"}
                        value={draft.body}
                        onChange={(body) => set({ body })}
                        placeholder={faq ? "답변" : "내용을 입력하세요"}
                        disabled={!canManage || busy}
                        headings={!faq}
                        className={cn("leading-relaxed", faq ? "[&_.rich-input]:min-h-28" : "[&_.rich-input]:min-h-[400px]")}
                    />
                </div>
            </fieldset>
            {draft.sourceRef && <p className="truncate text-xs text-muted-foreground">출처 · {draft.sourceRef}</p>}
            {canManage && (
                <div className="flex items-center gap-2 border-t border-border/40 pt-4">
                    {draft.id && (
                        <Button
                            variant="ghost"
                            className="text-red-700 hover:text-red-700"
                            disabled={busy}
                            onClick={() =>
                                confirm({
                                    title: `"${draft.title}"을 삭제할까요?`,
                                    description: "되돌릴 수 없어요.",
                                    onConfirm: async () => {
                                        await supportRequest(`/api/customer-ai/docs/${draft.id}`, { method: "DELETE" });
                                        await onDone();
                                    },
                                })
                            }
                        >
                            삭제
                        </Button>
                    )}
                    <div className="flex-1" />
                    <Button variant="outline" className="border-border/70" disabled={busy} onClick={onBack}>
                        취소
                    </Button>
                    <Button disabled={busy || !draft.title.trim() || !draft.body.trim()} onClick={() => void save()}>
                        {busy ? "저장 중…" : "저장"}
                    </Button>
                </div>
            )}
        </section>
    );
}
