"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requestErrorMessage } from "@/lib/swr-fetcher";
import { useModelLeaderboard } from "../hooks/useModelLab";
import type { LeaderboardMetric, RateCell } from "../types";

const pct = (cell: RateCell) =>
    cell.rate == null ? "—" : `${(cell.rate * 100).toFixed(1)}%${cell.ci ? ` (${(cell.ci[0] * 100).toFixed(1)}~${(cell.ci[1] * 100).toFixed(1)})` : ""}`;

/** 모델별 오픈·클릭·회신률. 표본이 적은 행은 흐리게 */
export function LeaderboardPanel() {
    const [days, setDays] = useState(30);
    const [metric, setMetric] = useState<LeaderboardMetric>("open");
    const [ruleId, setRuleId] = useState(0);
    const { leaderboard, error, isLoading } = useModelLeaderboard({ days, ruleId, metric });

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
                    <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {[14, 30, 90].map((d) => <SelectItem key={d} value={String(d)}>{d}일</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={metric} onValueChange={(v) => setMetric(v as LeaderboardMetric)}>
                    <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="open">오픈률 순</SelectItem>
                        <SelectItem value="click">클릭률 순</SelectItem>
                        <SelectItem value="reply">회신률 순</SelectItem>
                    </SelectContent>
                </Select>
                {ruleId ? (
                    <button type="button" className="text-sm text-muted-foreground underline" onClick={() => setRuleId(0)}>
                        규칙 필터 해제
                    </button>
                ) : null}
            </div>
            {leaderboard ? <p className="text-xs text-muted-foreground">{leaderboard.caveat} 오픈률 괄호는 95% 범위, 표본 {leaderboard.minSample}통 미만은 흐리게 표시합니다.</p> : null}
            {error ? <p className="text-sm text-destructive">{requestErrorMessage(error, "순위표를 불러오지 못했습니다.")}</p> : null}
            {isLoading ? <p className="text-sm text-muted-foreground">불러오는 중…</p> : null}

            {leaderboard ? (
                <>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>모델</TableHead>
                                <TableHead className="text-right">발송</TableHead>
                                <TableHead className="text-right">오픈률</TableHead>
                                <TableHead className="text-right">클릭률</TableHead>
                                <TableHead className="text-right">회신률</TableHead>
                                <TableHead className="text-right">평균 작성 시간</TableHead>
                                <TableHead className="text-right">비용</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {leaderboard.rows.length === 0 ? (
                                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">이 기간에 AI가 쓴 첫 메일 발송이 없습니다.</TableCell></TableRow>
                            ) : null}
                            {leaderboard.rows.map((r) => (
                                <TableRow key={r.model} className={r.sampleOk ? "" : "opacity-60"}>
                                    <TableCell>
                                        {r.label}
                                        {!r.sampleOk ? <Badge variant="outline" className="ml-2">표본 부족</Badge> : null}
                                        <span className="ml-2 text-xs text-muted-foreground">규칙 {r.rules}개</span>
                                    </TableCell>
                                    <TableCell className="text-right">{r.sent.toLocaleString()}</TableCell>
                                    <TableCell className="text-right">{pct(r.open)}</TableCell>
                                    <TableCell className="text-right">{pct(r.click)}</TableCell>
                                    <TableCell className="text-right">{pct(r.reply)}</TableCell>
                                    <TableCell className="text-right">{r.avgLatencyMs != null ? `${(r.avgLatencyMs / 1000).toFixed(1)}초` : "—"}</TableCell>
                                    <TableCell className="text-right">{r.costKrw != null ? `${Math.round(r.costKrw).toLocaleString()}원` : "단가 미등록"}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>

                    {leaderboard.byRule.length ? (
                        <details className="rounded-md border border-border/40">
                            <summary className="cursor-pointer px-3 py-2 text-sm">규칙별 보기</summary>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>규칙</TableHead>
                                        <TableHead>모델</TableHead>
                                        <TableHead className="text-right">발송</TableHead>
                                        <TableHead className="text-right">오픈률</TableHead>
                                        <TableHead className="text-right">클릭률</TableHead>
                                        <TableHead className="text-right">회신률</TableHead>
                                        <TableHead />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {leaderboard.byRule.map((r) => (
                                        <TableRow key={`${r.ruleId}-${r.model}`} className={r.sampleOk ? "" : "opacity-60"}>
                                            <TableCell>
                                                <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => setRuleId(r.ruleId)}>
                                                    {r.ruleName || `규칙 #${r.ruleId}`}
                                                </button>
                                            </TableCell>
                                            <TableCell>{r.label}</TableCell>
                                            <TableCell className="text-right">{r.sent.toLocaleString()}</TableCell>
                                            <TableCell className="text-right">{pct(r.open)}</TableCell>
                                            <TableCell className="text-right">{pct(r.click)}</TableCell>
                                            <TableCell className="text-right">{pct(r.reply)}</TableCell>
                                            <TableCell className="text-right">
                                                <Link className="text-sm text-muted-foreground underline" href={`/email/ai-auto/${r.ruleId}${r.partitionId ? `?partitionId=${r.partitionId}` : ""}`}>
                                                    규칙에서 바꾸기
                                                </Link>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </details>
                    ) : null}
                </>
            ) : null}
        </div>
    );
}
