"use client";
import { useRef, useState } from "react";
import { ArrowRight, Braces, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SettingsSection } from "@/components/inbox/ui/SettingsSection";
import { inboxWrite } from "@/components/inbox/api";
import { useAlimtalkSenders } from "@/hooks/useAlimtalkSenders";
import { useAlimtalkTemplates } from "@/hooks/useAlimtalkTemplates";
import { extractAllTemplateVariables } from "@/lib/alimtalk-template-utils";
import { NOTICE_TEXT_VARIABLES, NOTICE_VALUE_LABELS, noticeValue, type NoticeValue } from "@/lib/customer-messenger/rules";
import { cn } from "@/lib/utils";
import { replyNoticesUrl, useReplyNotices } from "../hooks/useReplyNotices";
import type { NoticeLog, NoticeSettings, NoticeSettingsData } from "../types";

type Update = (patch: Partial<NoticeSettings>) => void;

/** 상담 설정 › 답변 알림 — 상담 답장이 나간 뒤 고객이 2분 안에 읽지 않으면 남긴 이메일·전화번호로 알린다 */
export function ReplyNoticeSettings({ channelId, canManage }: { channelId: number; canManage: boolean }) {
    const { data, error, mutate } = useReplyNotices(channelId);
    if (error) return <p role="alert" className="text-sm text-red-700">{error.message}</p>;
    if (!data) return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
    return (
        <div className="space-y-10">
            <NoticeForm key={JSON.stringify(data.settings)} channelId={channelId} data={data} canManage={canManage} onSaved={() => mutate()} />
            <NoticeLogs logs={data.logs} />
        </div>
    );
}

function NoticeForm({
    channelId,
    data,
    canManage,
    onSaved,
}: {
    channelId: number;
    data: NoticeSettingsData;
    canManage: boolean;
    onSaved: () => Promise<unknown>;
}) {
    const [value, setValue] = useState<NoticeSettings>(data.settings);
    const [busy, setBusy] = useState(false);
    const update: Update = (patch) => setValue((v) => ({ ...v, ...patch }));
    const changed = JSON.stringify(value) !== JSON.stringify(data.settings);
    const { status } = data;
    return (
        <form
            className="space-y-10"
            onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                    await inboxWrite(replyNoticesUrl(channelId), value, "PUT");
                    await onSaved();
                    toast.success("저장했어요.");
                } catch (err) {
                    toast.error((err as Error).message);
                } finally {
                    setBusy(false);
                }
            }}
        >
            {(!status.worker || !status.contactEnabled) && (
                <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {!status.worker
                        ? "이 서버에서는 답변 알림 발송이 꺼져 있어요. 운영 서버 설정(CUSTOMER_REPLY_NOTIFICATIONS)이 필요해요."
                        : "사이트 상담창의 연락처 받기가 꺼져 있어 고객 연락처를 받지 않아요."}
                </p>
            )}
            <SettingsSection
                title="이메일 알림"
                action={<Switch aria-label="이메일 알림 사용" disabled={!canManage} checked={value.emailNotifications} onCheckedChange={(emailNotifications) => update({ emailNotifications })} />}
            >
                {!status.email && <p className="text-sm text-amber-700">이메일 발송 설정이 없어 보낼 수 없어요.</p>}
                {value.emailNotifications && (
                    <div className="space-y-5">
                        <EmailFields value={value} update={update} disabled={!canManage} />
                        {canManage && <TestSend channelId={channelId} medium="email" settings={value} />}
                    </div>
                )}
            </SettingsSection>
            <SettingsSection
                title="알림톡 알림"
                action={
                    <Switch
                        aria-label="알림톡 알림 사용"
                        disabled={!canManage || !status.alimtalk}
                        checked={value.alimtalkNotifications}
                        onCheckedChange={(alimtalkNotifications) => update({ alimtalkNotifications })}
                    />
                }
            >
                {!status.alimtalk && <p className="text-sm text-amber-700">알림톡 설정이 없어 보낼 수 없어요.</p>}
                {value.alimtalkNotifications && status.alimtalk && (
                    <div className="space-y-5">
                        <AlimtalkFields value={value} update={update} disabled={!canManage} />
                        {canManage && value.alimtalkTemplateCode && <TestSend channelId={channelId} medium="alimtalk" settings={value} />}
                    </div>
                )}
            </SettingsSection>
            {canManage && (
                <div className="flex justify-end">
                    <Button type="submit" disabled={busy || !changed || (value.alimtalkNotifications && !value.alimtalkTemplateCode)}>
                        {busy ? "저장 중…" : "저장"}
                    </Button>
                </div>
            )}
        </form>
    );
}

/** 변수 표의 작은 제목 줄 */
function VariableHead({ labels }: { labels: { text: string; className?: string }[] }) {
    return (
        <div className="flex items-center gap-3 px-4 py-2 text-xs font-medium text-muted-foreground">
            <span className="w-36 shrink-0">변수</span>
            <span className="w-4 shrink-0" />
            {labels.map((l) => (
                <span key={l.text} className={l.className}>
                    {l.text}
                </span>
            ))}
        </div>
    );
}

/** 변수 → 값 → 비었을 때 넣을 말, 한 줄 */
function VariableRow({ variable, children }: { variable: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-3 px-4 py-2">
            <span className="w-36 shrink-0 truncate font-mono text-sm">{variable}</span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            {children}
        </div>
    );
}

/** 제목·본문 — 위 "변수 넣기"로 마지막에 누른 칸의 커서 자리에 ##고객명## 등을 넣는다 */
function EmailFields({ value, update, disabled }: { value: NoticeSettings; update: Update; disabled: boolean }) {
    const subject = useRef<HTMLInputElement>(null);
    const body = useRef<HTMLTextAreaElement>(null);
    const last = useRef<"emailSubject" | "emailBody">("emailBody");
    function insert(token: string) {
        const key = last.current;
        const el = key === "emailSubject" ? subject.current : body.current;
        const text = value[key];
        const start = el?.selectionStart ?? text.length,
            end = el?.selectionEnd ?? text.length;
        update({ [key]: text.slice(0, start) + token + text.slice(end) });
        requestAnimationFrame(() => {
            el?.focus();
            el?.setSelectionRange(start + token.length, start + token.length);
        });
    }
    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button type="button" variant="outline" className="border-border/70" disabled={disabled}>
                            <Braces className="h-4 w-4" />
                            변수 넣기
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        {NOTICE_TEXT_VARIABLES.map((v) => (
                            <DropdownMenuItem key={v.token} onSelect={() => insert(v.token)}>
                                {NOTICE_VALUE_LABELS[v.value]}
                                <span className="ml-auto pl-4 font-mono text-xs text-muted-foreground">{v.token}</span>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <label className="block space-y-1.5">
                <span className="block text-sm font-medium">제목</span>
                <Input
                    ref={subject}
                    className="border-border/70"
                    maxLength={200}
                    required
                    disabled={disabled}
                    value={value.emailSubject}
                    onFocus={() => (last.current = "emailSubject")}
                    onChange={(e) => update({ emailSubject: e.target.value })}
                />
            </label>
            <label className="block space-y-1.5">
                <span className="block text-sm font-medium">본문</span>
                <Textarea
                    ref={body}
                    className="min-h-28 border-border/70"
                    maxLength={2000}
                    required
                    disabled={disabled}
                    value={value.emailBody}
                    onFocus={() => (last.current = "emailBody")}
                    onChange={(e) => update({ emailBody: e.target.value })}
                />
            </label>
            <div className="space-y-1.5">
                <span className="block text-sm font-medium">변수 값이 없을 때</span>
                <div className="divide-y divide-border/40 rounded-lg border border-border/40">
                    <VariableHead labels={[{ text: "대신 넣을 말" }]} />
                    <VariableRow variable="##고객명##">
                        <Input
                            aria-label="##고객명## 값이 없을 때 넣을 말"
                            className="w-40 border-border/70"
                            maxLength={30}
                            disabled={disabled}
                            placeholder="고객"
                            value={value.customerNameFallback}
                            onChange={(e) => update({ customerNameFallback: e.target.value })}
                        />
                    </VariableRow>
                </div>
            </div>
        </div>
    );
}

/** 지금 화면의 문구(저장 전)로 시험 발송 */
function TestSend({ channelId, medium, settings }: { channelId: number; medium: "email" | "alimtalk"; settings: NoticeSettings }) {
    const [to, setTo] = useState("");
    const [busy, setBusy] = useState(false);
    return (
        <div className="space-y-1.5">
            <span className="block text-sm font-medium">테스트 발송</span>
            <div className="flex gap-2">
                <Input
                    aria-label={medium === "email" ? "테스트 받을 이메일" : "테스트 받을 전화번호"}
                    type={medium === "email" ? "email" : "tel"}
                    className="border-border/70"
                    placeholder={medium === "email" ? "받을 이메일" : "받을 전화번호"}
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                />
                <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 border-border/70"
                    disabled={busy || !to.trim()}
                    onClick={async () => {
                        setBusy(true);
                        try {
                            await inboxWrite(`${replyNoticesUrl(channelId)}/test`, { medium, to, settings });
                            toast.success(`${to}로 테스트 ${medium === "email" ? "메일" : "알림톡"}을 보냈어요.`);
                        } catch (e) {
                            toast.error((e as Error).message);
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    <Send className="h-4 w-4" />
                    {busy ? "보내는 중…" : "보내기"}
                </Button>
            </div>
        </div>
    );
}

function AlimtalkFields({ value, update, disabled }: { value: NoticeSettings; update: Update; disabled: boolean }) {
    const { senders } = useAlimtalkSenders();
    const senderKey = value.alimtalkSenderKey || senders[0]?.senderKey || "";
    const { templates, isLoading } = useAlimtalkTemplates(senderKey || null);
    const approved = templates.filter((t) => t.status === "TSC03");
    const template = approved.find((t) => t.templateCode === value.alimtalkTemplateCode);
    const variables = extractAllTemplateVariables(template);
    return (
        <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5">
                    <span className="block text-sm font-medium">발신 프로필</span>
                    <Select
                        disabled={disabled}
                        value={senderKey}
                        onValueChange={(key) =>
                            update({ alimtalkSenderKey: key, alimtalkTemplateCode: "", alimtalkTemplateName: "", alimtalkVariables: {}, alimtalkFallbacks: {} })
                        }
                    >
                        <SelectTrigger className="w-full border-border/70" aria-label="발신 프로필">
                            <SelectValue placeholder="발신 프로필 선택" />
                        </SelectTrigger>
                        <SelectContent>
                            {senders.map((s) => (
                                <SelectItem key={s.senderKey} value={s.senderKey}>
                                    {s.plusFriendId}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </label>
                <label className="block space-y-1.5">
                    <span className="block text-sm font-medium">템플릿</span>
                    <Select
                        disabled={disabled || !senderKey}
                        value={value.alimtalkTemplateCode}
                        onValueChange={(code) => {
                            const picked = approved.find((t) => t.templateCode === code);
                            const vars = extractAllTemplateVariables(picked);
                            update({
                                alimtalkSenderKey: senderKey,
                                alimtalkTemplateCode: code,
                                alimtalkTemplateName: picked?.templateName ?? "",
                                alimtalkVariables: Object.fromEntries(vars.map((v) => [v, guessValue(v)])),
                                alimtalkFallbacks: Object.fromEntries(vars.filter((v) => guessValue(v) === "customerName").map((v) => [v, value.customerNameFallback || "고객"])),
                            });
                        }}
                    >
                        <SelectTrigger className="w-full border-border/70" aria-label="알림톡 템플릿">
                            <SelectValue placeholder={isLoading ? "불러오는 중…" : approved.length ? "템플릿 선택" : "승인된 템플릿이 없어요"} />
                        </SelectTrigger>
                        <SelectContent>
                            {approved.map((t) => (
                                <SelectItem key={t.templateCode} value={t.templateCode}>
                                    {t.templateName}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </label>
            </div>
            {template && (
                <>
                    <p className="whitespace-pre-wrap rounded-lg bg-muted px-4 py-3 text-sm leading-relaxed">{template.templateContent}</p>
                    {variables.length > 0 && (
                        <div className="space-y-1.5">
                            <span className="block text-sm font-medium">변수</span>
                            <div className="divide-y divide-border/40 rounded-lg border border-border/40">
                                <VariableHead labels={[{ text: "넣을 값", className: "w-44 shrink-0" }, { text: "변수 값이 없을 때 넣을 말" }]} />
                                {variables.map((v) => (
                                    <VariableRow key={v} variable={`#{${v}}`}>
                                        <Select
                                            disabled={disabled}
                                            value={value.alimtalkVariables[v] ?? ""}
                                            onValueChange={(next) => update({ alimtalkVariables: { ...value.alimtalkVariables, [v]: next as NoticeValue } })}
                                        >
                                            <SelectTrigger className="w-44 border-border/70" aria-label={`${v}에 넣을 값`}>
                                                <SelectValue placeholder="넣을 값" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {noticeValue.options.map((o) => (
                                                    <SelectItem key={o} value={o}>
                                                        {NOTICE_VALUE_LABELS[o]}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Input
                                            aria-label={`${v} 값이 없을 때 넣을 말`}
                                            className="min-w-0 flex-1 border-border/70"
                                            maxLength={30}
                                            disabled={disabled}
                                            placeholder="예: 고객"
                                            value={value.alimtalkFallbacks[v] ?? ""}
                                            onChange={(e) => update({ alimtalkFallbacks: { ...value.alimtalkFallbacks, [v]: e.target.value } })}
                                        />
                                    </VariableRow>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

/** 변수 이름으로 넣을 값을 미리 골라 둔다 */
function guessValue(name: string): NoticeValue {
    if (/링크|url|주소|link/i.test(name)) return "link";
    if (/시간|일시|날짜/.test(name)) return "replyTime";
    if (/상담|회사|브랜드|업체|사업/.test(name)) return "channelName";
    return "customerName";
}

const STATE: Record<string, { label: string; className: string }> = {
    sent: { label: "보냄", className: "bg-emerald-50 text-emerald-700" },
    pending: { label: "대기", className: "bg-blue-50 text-blue-700" },
    processing: { label: "보내는 중", className: "bg-blue-50 text-blue-700" },
    skipped: { label: "안 보냄", className: "bg-muted text-muted-foreground" },
    uncertain: { label: "확인 필요", className: "bg-amber-50 text-amber-700" },
};
const REASON: Record<string, string> = {
    disabled: "알림 꺼짐",
    no_consent: "연락처 없음",
    missing_contact: "연락처 없음",
    newer_reply: "새 답장으로 대체",
    already_read: "고객이 이미 읽음",
    unsupported_conversation: "알림 대상 아님",
    expired: "24시간 지남",
    site_unavailable: "설치 도메인 없음",
};
const when = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });

function NoticeLogs({ logs }: { logs: NoticeLog[] }) {
    return (
        <SettingsSection title="발송 기록">
            {!logs.length ? (
                <p className="text-sm text-muted-foreground">아직 보낸 알림이 없어요.</p>
            ) : (
                <div className="rounded-lg border border-border/40">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>시간</TableHead>
                                <TableHead>고객</TableHead>
                                <TableHead>방법</TableHead>
                                <TableHead>받는 곳</TableHead>
                                <TableHead>결과</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {logs.map((log) => {
                                const state = STATE[log.state] ?? { label: log.state, className: "bg-muted text-muted-foreground" };
                                return (
                                    <TableRow key={log.id}>
                                        <TableCell className="whitespace-nowrap text-muted-foreground">{when.format(new Date(log.sentAt ?? log.createdAt))}</TableCell>
                                        <TableCell>
                                            <a className="hover:underline" href={`/inbox?conversation=${log.conversationId}`}>
                                                {log.customerName || log.conversationName}
                                            </a>
                                        </TableCell>
                                        <TableCell>{log.medium === "alimtalk" ? "알림톡" : "이메일"}</TableCell>
                                        <TableCell className="text-muted-foreground">{log.recipient}</TableCell>
                                        <TableCell>
                                            <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", state.className)}>{state.label}</span>
                                            {log.reason && <span className="ml-2 text-xs text-muted-foreground">{REASON[log.reason] ?? log.reason}</span>}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            )}
        </SettingsSection>
    );
}
