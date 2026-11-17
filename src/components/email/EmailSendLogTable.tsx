import { QueryErrorState } from "@/components/layouts/WorkspaceLayout";
import type { OpenSignal } from "@/components/email/opens/types";
import { OpenColumnHead } from "@/components/email/opens/ui/OpenColumnHead";
import { OpenCountCell } from "@/components/email/opens/ui/OpenCountCell";
import type { ClickSignal } from "@/components/email/clicks/types";
import { ClickCountCell } from "@/components/email/clicks/ui/ClickCountCell";
import { Fragment, useState, useCallback, useEffect, useRef } from "react";
import useSWR from "swr";
import { useEmailLogs } from "@/hooks/useEmailLogs";
import { RangePills } from "@/components/leads/ui/stats/RangePills";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { calendarDate } from "@/components/email/dashboard/utils/period";
import { cn } from "@/lib/utils";
import { defaultFetcher } from "@/lib/swr-fetcher";
import { presetRange } from "@/lib/email-stats/rules";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, RefreshCw, Loader2, Search, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { EmailSendLog } from "@/lib/db";
import {
    CURRENT_PROFILE_MARK,
    logSenderDetail,
    logSenderParts,
    type LogSenderSource,
} from "@/components/email/sender-profiles/utils/logSender";
import { ReplyKindBadge } from "@/components/email/replies/ui/ReplyKindBadge";
import { FollowupRows } from "@/components/email/followups/ui/FollowupRows";
import HealthFocusPanel from "@/components/email/send-health/ui/HealthFocusPanel";
import { useHealthLogFilter } from "@/components/email/send-health/hooks/useHealthLogFilter";
import { useHealthProblems } from "@/components/email/send-health/hooks/useHealthProblems";
import HealthProblems from "@/components/email/send-health/ui/HealthProblems";
import type { HealthProblem } from "@/components/email/send-health/types";
import { dsnLabel } from "@/lib/email-status-sync-rules";

/**
 * 서버가 붙여 주는 클릭 수·보낸 주소(보낼 때 주소 senderEmail, 프로필의 지금 값 senderProfile)·회신(사람 회신 먼저, DESIGN-RPL 11절)까지
 * 담은 이력 한 줄
 */
type EmailSendLogRow = EmailSendLog &
    LogSenderSource & Partial<OpenSignal> & Partial<ClickSignal> & { reply?: { id: number; kind: string; receivedAt: string } | null; followupCount?: number; followupPending?: number };

/** 표의 "보낸 주소" 칸. 보낼 때 주소가 없는 옛 이력은 프로필의 지금 주소 아래에 "(현재 프로필)"을 붙인다 */
function LogSenderCell({ log }: { log: LogSenderSource }) {
    const { email, fromCurrentProfile } = logSenderParts(log);
    if (!email) return <span className="font-mono">—</span>;
    return (
        <>
            <div className="truncate font-mono">{email}</div>
            {fromCurrentProfile && <div className="text-[11px] text-muted-foreground/80">{CURRENT_PROFILE_MARK}</div>}
        </>
    );
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
    // NHN에 보냈지만 응답이 끊겨 실제로 나갔는지 모르는 메일 — 중복 발송이 될까 봐 자동으로 다시 보내지 않는다
    unknown: { label: "발송 여부 확인 필요", variant: "secondary" },
    uncertain: { label: "결과 미확인", variant: "secondary" },
    cancelled: { label: "발송 취소", variant: "secondary" },
    pending: { label: "대기", variant: "secondary" },
    sent: { label: "발송", variant: "default" },
    failed: { label: "실패", variant: "destructive" },
    rejected: { label: "거부", variant: "destructive" },
};


const PERIOD_OPTIONS = [
    { value: "", label: "전체" },
    { value: "7", label: "7일" },
    { value: "30", label: "30일" },
    { value: "90", label: "90일" },
];

const CLICK_OPTIONS = [
    { value: "__all__", label: "클릭 전체" },
    { value: "1", label: "클릭" },
    { value: "0", label: "미클릭" },
];

/** NHN 결과로 본 배달 실패 (발송 상태가 '발송'이어도 받는 쪽이 반송한 메일) */
function deliveryFailBadge(log: Pick<EmailSendLog, "nhnStatusCode" | "deliveryFailSide" | "deliveryFailSource" | "deliveryStatusCode">) {
    const sender = log.deliveryFailSide === "sender" || log.nhnStatusCode === "SST7" || log.nhnStatusCode === "SST8";
    const label = sender ? "발신 인증 실패" : log.nhnStatusCode === "SST3" ? "반송" : log.deliveryFailSource === "dsn" ? "반송 안내" : null;
    if (!label) return null;
    return { label, title: log.deliveryStatusCode ? dsnLabel(log.deliveryStatusCode) : undefined };
}

/** workspaceId: 화면 위 사업부 탭이 고른 사업부 (null·없음: 전체) */
/** 유형 칸: 후속 메일만 '후속'이라고 적는다 */
export function logTypeLabel(log: { parentLogId?: number | null; triggerType?: string | null }) {
    return log.parentLogId || /followup/.test(log.triggerType ?? "") ? "후속" : "";
}

/**
 * healthAlertId: 발송 경고 알림(?health=)으로 열면 그 사건의 메일만 걸러 보이고 위에 문제 칸을 띄운다.
 * 표 위에 이 사업부(전체면 모두, 조직 공통 문제는 어느 사업부에나)의 확인할 문제 카드를 늘 보이고, 카드를 고르면 onPickHealth로 같은 거르기를 건다
 */
export default function EmailSendLogTable({ workspaceId = null, partitions = [], healthAlertId = null, healthEventId = null, onClearHealth, onPickHealth }: {
    workspaceId?: number | null;
    partitions?: Array<{ id: number; workspaceId: number }>;
    healthAlertId?: number | null;
    healthEventId?: number | null;
    onClearHealth?: () => void;
    onPickHealth?: (p: HealthProblem) => void;
} = {}) {
    const [page, setPage] = useState(1);
    const [searchInput, setSearchInput] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [status, setStatus] = useState("");
    const [ruleFilter, setRuleFilter] = useState("");  // AI 규칙 번호
    const [isClicked, setIsClicked] = useState("");
    const [hasReply, setHasReply] = useState("");
    const [period, setPeriod] = useState("");
    const [custom, setCustom] = useState<{ from?: Date; to?: Date }>({});
    const [hasFollowup, setHasFollowup] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [selectedLog, setSelectedLog] = useState<EmailSendLogRow | null>(null);
    const [expanded, setExpanded] = useState<Set<number>>(new Set());
    const toggleExpanded = (id: number) => setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const health = useHealthLogFilter(healthAlertId, healthEventId, workspaceId);
    const problems = useHealthProblems(workspaceId);
    const [showProblems, setShowProblems] = useState(false);
    // 사업부·알림 거르기를 바꾸면 첫 페이지부터
    const scopeKey = `${workspaceId ?? ""}|${health.params ? JSON.stringify(health.params) : ""}`;
    const [seenScope, setSeenScope] = useState(scopeKey);
    if (seenScope !== scopeKey) {
        setSeenScope(scopeKey);
        setPage(1);
    }

    // 연결 규칙 + AI 규칙 목록
    const { data: aiRulesData } = useSWR<{ success: boolean; data?: Array<{ id: number; partitionId: number; name: string | null; partitionName?: string; prompt?: string | null }> }>(
        "/api/email/auto-personalized",
        defaultFetcher
    );
    // 사업부 탭을 고르면 그 사업부 파티션의 규칙만
    const aiRules = (aiRulesData?.data ?? []).filter((r) => {
        if (!workspaceId) return true;
        const partition = partitions.find((p) => p.id === r.partitionId);
        return partition?.workspaceId === workspaceId;
    });

    // 최근 N일 = 오늘(KST) 포함 N일 — 이메일 통계 대시보드와 같은 기간 계약
    const dateRange = (() => {
        if (custom.from && custom.to) return { startDate: calendarDate(custom.from), endDate: calendarDate(custom.to) };
        if (!period) return {};
        const { from, to } = presetRange(Number(period), new Date());
        return { startDate: from, endDate: to };
    })();

    // 검색 debounce (300ms)
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    useEffect(() => {
        debounceRef.current = setTimeout(() => {
            setDebouncedSearch(searchInput);
            setPage(1);
        }, 300);
        return () => clearTimeout(debounceRef.current);
    }, [searchInput]);


    const { logs, totalCount, isLoading, syncLogs, loadError, mutate } = useEmailLogs({
        page,
        search: debouncedSearch || undefined,
        status: status || undefined,
        autoPersonalizedLinkId: ruleFilter ? Number(ruleFilter) : undefined,
        hasFollowup: hasFollowup || undefined,
        isClicked: isClicked || undefined,
        hasReply: hasReply || undefined,
        ...dateRange,
        // 알림 거르기는 후속 메일 실패도 함께 본다
        roots: !health.params,
        workspaceId: workspaceId ?? undefined,
        extra: health.params ?? undefined,
        paused: health.waiting,
    });

    const totalPages = Math.ceil(totalCount / 50);

    const handleSync = async () => {
        setSyncing(true);
        try {
            const result = await syncLogs();
            if (result.success && result.data?.busy) {
                toast.info(result.data.message || "다른 동기화가 도는 중입니다. 잠시 뒤 다시 눌러 주세요.");
            } else if (result.success && result.data?.warning) {
                // 키 오류·조회 실패를 "0건 업데이트" 성공으로 보이지 않게 한다 (UX-260)
                toast.warning(`동기화: ${result.data.updated}건 상태 업데이트`, { description: result.data.warning, duration: 10_000 });
            } else if (result.success) {
                toast.success(`동기화 완료: ${result.data.updated}건 상태 업데이트`);
            } else {
                toast.error(result.error || "동기화에 실패했습니다.");
            }
        } catch {
            // 네트워크·비JSON 응답에서도 버튼이 동기화 중에 묶이지 않게 한다 (UX-144)
            toast.error("동기화 응답을 받지 못했습니다. 잠시 후 다시 시도해주세요.");
        } finally {
            setSyncing(false);
        }
    };

    const hasFilters = !!(period || custom.from || status || ruleFilter || isClicked || hasReply || hasFollowup || debouncedSearch);
    const clearAll = useCallback(() => {
        setPeriod("");
        setCustom({});
        setStatus("");
        setRuleFilter("");
        setIsClicked("");
        setHasReply("");
        setHasFollowup(false);
        setSearchInput("");
        setDebouncedSearch("");
        setPage(1);
    }, []);

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    };

    const formatDateFull = (dateStr: string) => {
        return new Date(dateStr).toLocaleString("ko-KR");
    };

    return (
        <div className="space-y-4">
            {/* 헤더 */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-medium">
                    발송 이력
                    <span className="text-sm font-normal text-muted-foreground ml-2">{totalCount.toLocaleString()}건</span>
                </h3>
                <div className="flex items-center gap-2">
                    {problems.length > 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            className={cn("shrink-0 border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-500/40 dark:text-amber-400", showProblems && "bg-amber-50 dark:bg-amber-500/10")}
                            onClick={() => setShowProblems((v) => !v)}
                        >
                            <AlertTriangle className="h-4 w-4 mr-1.5" />
                            확인할 문제 {problems.length}건
                            <ChevronDown className={cn("ml-1 h-3.5 w-3.5 transition-transform", showProblems && "rotate-180")} />
                        </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="shrink-0">
                        {syncing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
                        동기화
                    </Button>
                </div>
            </div>

            {onPickHealth && onClearHealth ? (
                (showProblems || health.active) && <HealthProblems
                    problems={problems}
                    filter={health}
                    selectedEventId={healthEventId}
                    showCommon={workspaceId !== null}
                    onPick={onPickHealth}
                    onClear={onClearHealth}
                />
            ) : (
                health.active && onClearHealth && <HealthFocusPanel filter={health} onClear={onClearHealth} />
            )}

            {/* 거르기 — 한 줄 (리드젠통계와 같은 기간 고르기) */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="수신자 이메일 또는 제목"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        className="pl-9"
                    />
                </div>
                {aiRules.length > 0 && (
                    <Select value={ruleFilter || "__all__"} onValueChange={(v) => { setRuleFilter(v === "__all__" ? "" : v); setPage(1); }}>
                        <SelectTrigger className="w-full sm:w-48">
                            <SelectValue placeholder="규칙" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__all__">규칙 전체</SelectItem>
                            {aiRules.map((rule) => (
                                <SelectItem key={rule.id} value={String(rule.id)}>
                                    {rule.name || rule.partitionName || `규칙 #${rule.id}`}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
                <Select value={status || "__all__"} onValueChange={(v) => {
                    const next = v === "__all__" ? "" : v;
                    // '미클릭'은 발송된 메일만 본다 — 다른 상태를 고르면 미클릭 거르기를 푼다 (UX-231)
                    if (next && next !== "sent" && isClicked === "0") setIsClicked("");
                    setStatus(next); setPage(1);
                }}>
                    <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__all__">상태 전체</SelectItem>
                        {Object.entries(STATUS_MAP).map(([value, { label }]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={isClicked || "__all__"} onValueChange={(v) => {
                    const next = v === "__all__" ? "" : v;
                    if (next === "0" && status && status !== "sent") setStatus("");
                    setIsClicked(next); setPage(1);
                }}>
                    <SelectTrigger className="w-full sm:w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {CLICK_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                </Select>
                <label className="flex h-9 cursor-pointer items-center gap-2 px-1 text-sm">
                    <Checkbox
                        checked={hasFollowup}
                        onCheckedChange={(v) => { setHasFollowup(v === true); setExpanded(new Set()); setPage(1); }}
                    />
                    후속 있음
                </label>
                <label className="flex h-9 cursor-pointer items-center gap-2 px-1 text-sm">
                    <Checkbox
                        checked={hasReply === "1"}
                        onCheckedChange={(v) => { setHasReply(v === true ? "1" : ""); setPage(1); }}
                    />
                    회신 있음
                </label>
                {hasFilters && (
                    <Button variant="ghost" className="text-muted-foreground" onClick={clearAll}>
                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
                        초기화
                    </Button>
                )}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                <RangePills
                    ranges={PERIOD_OPTIONS}
                    value={custom.from ? "custom" : period}
                    onChange={(v) => { setPeriod(v); setCustom({}); setPage(1); }}
                />
                <DateRangePicker
                    from={custom.from}
                    to={custom.to}
                    maxDate={new Date()}
                    placeholder="날짜 직접 선택"
                    triggerClassName={cn("bg-background", custom.from && "border-primary/40 text-primary")}
                    onChange={(r) => { setCustom(r); setPage(1); }}
                />
                </div>
            </div>

            {/* 테이블 — 실패해도 검색·필터는 남겨 조건을 바꿀 수 있게 한다 */}
            {loadError ? (
                <QueryErrorState error={loadError} onRetry={() => mutate()} />
            ) : isLoading || health.waiting ? (
                <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <Skeleton key={i} className="h-10 w-full" />
                    ))}
                </div>
            ) : logs.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">
                    {hasFilters || health.active ? "조건에 맞는 이력이 없습니다." : "발송 이력이 없습니다."}
                </div>
            ) : (
                <>
                    <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-8" />
                                <TableHead>수신자</TableHead>
                                <TableHead>보낸 주소</TableHead>
                                <TableHead>제목</TableHead>
                                <TableHead>상태</TableHead>
                                <TableHead>클릭</TableHead>
                                <TableHead><OpenColumnHead /></TableHead>
                                <TableHead>유형</TableHead>
                                <TableHead>후속</TableHead>
                                <TableHead>발송일</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(logs as EmailSendLogRow[]).map((log) => {
                                const statusInfo = STATUS_MAP[log.status] || { label: log.status, variant: "secondary" as const };
                                const failBadge = deliveryFailBadge(log);

                                const followupTotal = (log.followupCount ?? 0) + (log.followupPending ?? 0);
                                // '후속 있음'으로 거르면 처음부터 펼쳐 첫 메일과 후속을 같이 본다 (그때 expanded는 접은 줄)
                                const isOpen = hasFollowup ? !expanded.has(log.id) : expanded.has(log.id);
                                return (
                                    <Fragment key={log.id}>
                                    <TableRow
                                        className="cursor-pointer"
                                        aria-expanded={followupTotal > 0 ? isOpen : undefined}
                                        onClick={() => (followupTotal > 0 ? toggleExpanded(log.id) : setSelectedLog(log))}
                                    >
                                        <TableCell className="w-8 pr-0">
                                            {followupTotal > 0 && (
                                                <ChevronDown className={`size-4 text-muted-foreground transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                                            )}
                                        </TableCell>
                                        <TableCell className="font-mono text-sm">{log.recipientEmail}</TableCell>
                                        <TableCell
                                            className="max-w-[220px] text-xs text-muted-foreground"
                                            title={logSenderDetail(log)}
                                        >
                                            <LogSenderCell log={log} />
                                        </TableCell>
                                        <TableCell className="max-w-[200px] text-muted-foreground">
                                            {/* 키보드로도 상세를 연다 — 행 클릭만으로는 Tab·Enter로 열 수 없었다 (UX-299) */}
                                            <button
                                                type="button"
                                                className="block max-w-full truncate rounded-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                aria-label={`${log.recipientEmail}에 보낸 '${log.subject || "제목 없음"}' 상세 보기`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedLog(log);
                                                }}
                                            >
                                                {log.subject || "(제목 없음)"}
                                            </button>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap items-center gap-1">
                                                <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                                                {failBadge && (
                                                    <Badge variant="destructive" title={failBadge.title}>{failBadge.label}</Badge>
                                                )}
                                                {log.reply && <ReplyKindBadge kind={log.reply.kind} />}
                                            </div>
                                        </TableCell>
                                        <TableCell><ClickCountCell log={log} /></TableCell>
                                        <TableCell><OpenCountCell log={log} /></TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{logTypeLabel(log)}</TableCell>
                                        <TableCell className="whitespace-nowrap text-sm">
                                            {followupTotal === 0 ? (
                                                <span className="text-muted-foreground">—</span>
                                            ) : (
                                                <>
                                                    {(log.followupCount ?? 0) > 0 && <span>{log.followupCount}건</span>}
                                                    {(log.followupPending ?? 0) > 0 && (
                                                        <span className="ml-1 text-xs text-muted-foreground">예정 {log.followupPending}</span>
                                                    )}
                                                </>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-sm">
                                            {formatDate(log.sentAt as unknown as string)}
                                        </TableCell>
                                    </TableRow>
                                    {isOpen && (
                                        <FollowupRows
                                            logId={log.id}
                                            colSpan={10}
                                            statusMap={STATUS_MAP}
                                            onOpen={(f) => setSelectedLog(f as unknown as EmailSendLogRow)}
                                        />
                                    )}
                                    </Fragment>
                                );
                            })}
                        </TableBody>
                    </Table>
                    </div>

                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 pt-2">
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setPage(Math.max(1, page - 1))}
                                disabled={page <= 1}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="text-sm text-muted-foreground">
                                {page} / {totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setPage(Math.min(totalPages, page + 1))}
                                disabled={page >= totalPages}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </>
            )}

            {/* 상세 보기 Sheet */}
            <Sheet open={selectedLog !== null} onOpenChange={(open) => { if (!open) setSelectedLog(null); }}>
                <SheetContent className="sm:max-w-lg overflow-y-auto">
                    {selectedLog && (() => {
                        const statusInfo = STATUS_MAP[selectedLog.status] || { label: selectedLog.status, variant: "secondary" as const };

                        return (
                            <>
                                <SheetHeader>
                                    <SheetTitle>발송 상세</SheetTitle>
                                    <SheetDescription>{selectedLog.recipientEmail}</SheetDescription>
                                </SheetHeader>

                                <div className="space-y-4 px-4">
                                    <div className="space-y-2">
                                        <div className="grid grid-cols-3 gap-2 py-2 border-b">
                                            <span className="text-sm text-muted-foreground">수신자</span>
                                            <span className="col-span-2 text-sm font-mono">{selectedLog.recipientEmail}</span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 py-2 border-b">
                                            <span className="text-sm text-muted-foreground">보낸 주소</span>
                                            <span className="col-span-2 text-sm break-all">
                                                {logSenderDetail(selectedLog)}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 py-2 border-b">
                                            <span className="text-sm text-muted-foreground">제목</span>
                                            <span className="col-span-2 text-sm">{selectedLog.subject || "-"}</span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 py-2 border-b">
                                            <span className="text-sm text-muted-foreground">상태</span>
                                            <span className="col-span-2">
                                                <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                                            </span>
                                        </div>
                                        {logTypeLabel(selectedLog) && (
                                            <div className="grid grid-cols-3 gap-2 py-2 border-b">
                                                <span className="text-sm text-muted-foreground">유형</span>
                                                <span className="col-span-2 text-sm">{logTypeLabel(selectedLog)}</span>
                                            </div>
                                        )}
                                        <div className="grid grid-cols-3 gap-2 py-2 border-b">
                                            <span className="text-sm text-muted-foreground">발송일시</span>
                                            <span className="col-span-2 text-sm">
                                                {formatDateFull(selectedLog.sentAt as unknown as string)}
                                            </span>
                                        </div>
                                        {selectedLog.reply && (
                                            <div className="grid grid-cols-3 gap-2 py-2 border-b">
                                                <span className="text-sm text-muted-foreground">회신</span>
                                                <span className="col-span-2 flex items-center gap-2 text-sm">
                                                    <ReplyKindBadge kind={selectedLog.reply.kind} />
                                                    <a className="text-primary hover:underline" href={`/email?tab=replies&reply=${selectedLog.reply.id}`}>
                                                        회신 보기
                                                    </a>
                                                </span>
                                            </div>
                                        )}
                                        {selectedLog.resultMessage && (
                                            <div className="grid grid-cols-3 gap-2 py-2 border-b">
                                                <span className="text-sm text-muted-foreground">결과</span>
                                                <span className="col-span-2 text-sm text-muted-foreground">
                                                    {selectedLog.resultMessage}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* 본문 미리보기 */}
                                    <div className="space-y-2">
                                        <h4 className="text-sm font-medium text-muted-foreground">본문</h4>
                                        {selectedLog.body ? (
                                            <div className="border border-border/40 rounded-lg overflow-hidden">
                                                <iframe
                                                    srcDoc={selectedLog.body}
                                                    className="w-full min-h-[400px] bg-white"
                                                    sandbox=""
                                                    title="이메일 본문"
                                                />
                                            </div>
                                        ) : (
                                            <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg border-dashed">
                                                본문 내용이 저장되지 않은 이메일입니다.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </>
                        );
                    })()}
                </SheetContent>
            </Sheet>
        </div>
    );
}
