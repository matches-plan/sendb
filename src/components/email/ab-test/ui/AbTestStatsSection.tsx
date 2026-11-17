"use client";

import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QueryErrorState } from "@/components/layouts/WorkspaceLayout";
import { useSession } from "@/contexts/SessionContext";
import type { CopyObservations } from "@/lib/ai-copy/observations";
import { abTestFetcher } from "../api/abTests";
import { useAbTests } from "../hooks/useAbTests";
import type { AbTestRow, ArmMetrics } from "../types";
import { METRIC_LABELS, SCOPE_FIELD_LABEL, SCOPE_LABELS, decisionRuleText, leaderOf, metricCount, pct, winnerOf } from "../utils/labels";
import { AbTestResultBadge } from "./AbTestCard";

/** AI 메일 작성 성공률·비용 한 줄 (자동 관찰 요약) — 관리자에게만 */
function GenerationSummary({ workspaceId }: { workspaceId: number | null }) {
    const { data } = useSWR<CopyObservations>(`/api/ai/copy-observations?workspaceId=${workspaceId ?? 0}&days=30`, abTestFetcher, {
        shouldRetryOnError: false,
    });
    const initial = data?.purposes.find((p) => p.purpose === "initial_email");
    if (!initial) return null;
    return (
        <span className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
            <span>최근 30일 AI 메일 작성 {initial.jobs.toLocaleString()}건</span>
            <span>첫 시도 성공 {initial.firstAttemptSuccess === null ? "—" : `${(initial.firstAttemptSuccess * 100).toFixed(1)}%`}</span>
            <span>비용 {initial.costKrw === null ? "—" : `${Math.round(initial.costKrw).toLocaleString()}원`}</span>
        </span>
    );
}

function ArmCell({ m, test, on }: { m: ArmMetrics; test: AbTestRow; on: boolean }) {
    return (
        <TableCell className={`text-right tabular-nums ${on ? "font-semibold text-primary" : ""}`}>
            {pct(metricCount(m, test.metric), m.sent)}
            {/* 오픈은 Apple 메일 미리 열람으로 부풀 수 있어 회신률을 함께 본다 */}
            {test.metric === "open" && <div className="text-xs font-normal text-muted-foreground">회신 {pct(m.replied, m.sent)}</div>}
        </TableCell>
    );
}

/** 리드젠통계 AB 테스트 탭 — 사업부·기간에 진행된 AB 테스트 (규칙에서 만든 것과 자동 준비가 연 것) */
export function AbTestStatsSection({ workspaceId, from, to }: { workspaceId: number | null; from: string; to: string }) {
    const router = useRouter();
    const { user } = useSession();
    const { data, error, isLoading, mutate } = useAbTests({ workspaceId, from, to });
    return (
        <section className="space-y-2">
            {user && user.role !== "member" && (
                <div className="flex justify-end">
                    <GenerationSummary workspaceId={workspaceId} />
                </div>
            )}
            {error ? (
                <QueryErrorState error={error} onRetry={() => mutate()} />
            ) : isLoading ? (
                <Skeleton className="h-32 w-full" />
            ) : !data?.length ? (
                <p className="rounded-lg border border-border/40 bg-card py-8 text-center text-sm text-muted-foreground">
                    해당 기간에 AB 테스트가 없습니다.
                </p>
            ) : (
                <div className="rounded-lg border border-border/40 bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>규칙</TableHead>
                                <TableHead className="w-[90px]">{SCOPE_FIELD_LABEL}</TableHead>
                                <TableHead className="w-[90px]">결과</TableHead>
                                <TableHead className="w-[80px]">평가 기준</TableHead>
                                <TableHead className="w-[110px] text-right">A안</TableHead>
                                <TableHead className="w-[110px] text-right">B안</TableHead>
                                <TableHead className="w-[90px] text-right">발송 A / B</TableHead>
                                <TableHead className="w-[70px] text-center">앞선 안</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.map((test) => {
                                const running = test.result === "running";
                                const leader = running ? leaderOf(test) : winnerOf(test);
                                return (
                                    <TableRow
                                        key={test.id}
                                        className={test.rulePartitionId ? "cursor-pointer hover:bg-muted/50" : undefined}
                                        onClick={test.rulePartitionId ? () => router.push(`/email/ai-auto/${test.ruleId}?partitionId=${test.rulePartitionId}`) : undefined}
                                    >
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <span className="truncate font-medium">{test.ruleName ?? test.name}</span>
                                                {test.kind === "policy" && <Badge variant="secondary">자동</Badge>}
                                            </div>
                                            {workspaceId === null && <div className="text-xs text-muted-foreground">{test.workspaceName}</div>}
                                            {running && <div className="text-xs tabular-nums text-muted-foreground">{decisionRuleText(test)}</div>}
                                        </TableCell>
                                        <TableCell>{test.scope ? SCOPE_LABELS[test.scope] : "—"}</TableCell>
                                        <TableCell>
                                            <AbTestResultBadge test={test} />
                                        </TableCell>
                                        <TableCell>{METRIC_LABELS[test.metric]}</TableCell>
                                        <ArmCell m={test.arms.A} test={test} on={leader === "A"} />
                                        <ArmCell m={test.arms.B} test={test} on={leader === "B"} />
                                        <TableCell className="text-right tabular-nums text-muted-foreground">
                                            {test.arms.A.sent.toLocaleString()} / {test.arms.B.sent.toLocaleString()}
                                        </TableCell>
                                        <TableCell className={`text-center ${running ? "text-muted-foreground" : "font-medium"}`}>{leader ? `${leader}안` : "—"}</TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            )}
        </section>
    );
}
