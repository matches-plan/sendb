"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requestErrorMessage } from "@/lib/swr-fetcher";
import { useResearchStats } from "../hooks/useModelLab";

const MODE_LABELS: Record<string, string> = {
    compact: "간단 조사(저장된 정보·홈페이지 소개문)",
    serper: "Serper 검색 + 정리",
    search: "Claude 웹검색(예전 방식)",
    invalid: "설정 오류",
};

/** 회사 조사 30일 관찰 — Qwen을 계속 쓸지 정하는 자료 */
export function ResearchPanel() {
    const { stats, error, isLoading } = useResearchStats(30);
    if (error) return <p className="text-sm text-destructive">{requestErrorMessage(error, "회사 조사 통계를 불러오지 못했습니다.")}</p>;
    if (isLoading || !stats) return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
    const total = stats.days.reduce(
        (sum, d) => ({ qwen: sum.qwen + d.qwenCalls, cost: sum.cost + d.estCostUsd, serper: sum.serper + d.serperNew, fallbacks: sum.fallbacks + d.fallbacks }),
        { qwen: 0, cost: 0, serper: 0, fallbacks: 0 },
    );
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline">{MODE_LABELS[stats.mode] ?? stats.mode}</Badge>
                {stats.mode === "serper" ? <Badge variant="outline">정리 모델: {stats.summarizer === "qwen" ? "Qwen3.7 Flash" : stats.summarizer === "claude" ? "Claude Haiku 5.5" : "없음"}</Badge> : null}
                {!stats.serperConnected ? <Badge variant="outline">Serper 키 없음</Badge> : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
                <Stat label="Qwen 정리(30일)" value={`${total.qwen.toLocaleString()}회`} />
                <Stat label="추정 정리 비용" value={`$${total.cost.toFixed(2)}`} />
                <Stat label="새로 쌓인 회사" value={`${total.serper.toLocaleString()}곳`} />
                <Stat label="간단 조사로 대신" value={`${total.fallbacks.toLocaleString()}건`} />
            </div>
            <p className="text-xs text-muted-foreground">
                보관함 {stats.cache.total.toLocaleString()}곳 (Serper {stats.cache.serper.toLocaleString()} · 가져온 조사 {stats.cache.import.toLocaleString()}). 검색 횟수는 Serper 대시보드에서 봅니다. 실패 원인은 서버 로그 「[CompanyResearch] Serper 조사 실패」로 찾습니다.
            </p>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>날짜</TableHead>
                        <TableHead className="text-right">Qwen 정리</TableHead>
                        <TableHead className="text-right">Claude 정리·검색</TableHead>
                        <TableHead className="text-right">토큰(입력/출력)</TableHead>
                        <TableHead className="text-right">추정 비용</TableHead>
                        <TableHead className="text-right">새 회사</TableHead>
                        <TableHead className="text-right">간단 조사로 대신</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {stats.days.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">최근 30일 회사 조사 기록이 없습니다.</TableCell></TableRow>
                    ) : null}
                    {stats.days.map((d) => (
                        <TableRow key={d.day}>
                            <TableCell>{d.day}</TableCell>
                            <TableCell className="text-right">{d.qwenCalls.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{d.claudeCalls.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{`${Math.round(d.promptTokens).toLocaleString()} / ${Math.round(d.completionTokens).toLocaleString()}`}</TableCell>
                            <TableCell className="text-right">${d.estCostUsd.toFixed(3)}</TableCell>
                            <TableCell className="text-right">{d.serperNew.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{d.fallbacks.toLocaleString()}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-md border border-border/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold">{value}</p>
        </div>
    );
}
