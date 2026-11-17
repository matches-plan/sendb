"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, RotateCcw } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { cn } from "@/lib/utils";
import { LeadWorkspaceTabs } from "@/components/leads/ui/LeadWorkspaceTabs";
import { RangePills } from "@/components/leads/ui/stats/RangePills";
import { KpiGrid } from "@/components/email/dashboard/ui/KpiGrid";
import { TrendPanel } from "@/components/email/dashboard/ui/TrendPanel";
import { CompareTable } from "@/components/email/dashboard/ui/CompareTable";
import { StatsFreshness } from "@/components/email/dashboard/ui/StatsFreshness";
import { LEADGEN_RANGES, useLeadgenFilters } from "../hooks/useLeadgenFilters";
import { useCampaignOptions } from "../hooks/useCampaignOptions";
import { useLeadgenWorkspaces } from "../hooks/useLeadgenWorkspaces";
import { CampaignPicker } from "./CampaignPicker";
import { CompareKpiGrid } from "./CompareKpiGrid";
import { CompareTrend } from "./CompareTrend";
import { groupName } from "../utils/groups";
import { PeriodCompareBar } from "@/components/leads/ui/stats/PeriodCompareBar";
import { periodName } from "@/components/leads/hooks/usePeriodCompare";
import { AbTestStatsSection } from "@/components/email/ab-test/ui/AbTestStatsSection";
import { AB_STATS_TIP } from "@/components/email/ab-test/utils/labels";
import { InfoTip } from "@/components/ui/info-tip";

const VIEWS = [
    { value: "summary", label: "요약" },
    { value: "detail", label: "상세 통계" },
    { value: "ab", label: "AB 테스트" },
] as const;
type View = (typeof VIEWS)[number]["value"];

/** 하위 탭(?view=summary|detail|ab) — 사업부·기간 필터는 탭끼리 같이 쓴다 */
function useStatsView() {
    const params = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const raw = params.get("view");
    const view: View = VIEWS.some((v) => v.value === raw) ? (raw as View) : "summary";
    const setView = (next: string) => {
        const q = new URLSearchParams(params.toString());
        if (next === "summary") q.delete("view");
        else q.set("view", next);
        router.replace(q.size ? `${pathname}?${q}` : pathname, { scroll: false });
    };
    return { view, setView };
}

/** 리드젠통계 — 사업부별 콜드메일 발송·도달·오픈·클릭·방문·회신 (리드통계와 같은 틀) */
export function LeadgenStatsPage() {
    return (
        <Suspense>
            <LeadgenStats />
        </Suspense>
    );
}

function LeadgenStats() {
    const { view, setView } = useStatsView();
    const f = useLeadgenFilters();
    const campaigns = useCampaignOptions(f.base);
    const tabs = useLeadgenWorkspaces();
    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <LeadWorkspaceTabs
                value={f.workspaceId}
                onChange={f.setWorkspaceId}
                items={tabs.items}
                loading={tabs.isLoading}
                allTab={{ onSelect: () => f.setWorkspaceId(null) }}
                prefKey="leadgen-stats"
            />
            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="space-y-3 px-8 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <h1 className="text-2xl font-semibold tracking-tight">콜드메일통계</h1>
                            <StatsFreshness query={f.query} />
                        </div>
                        {f.periods.periods ? (
                            <PeriodCompareBar pc={f.periods} />
                        ) : (
                            <div className="flex flex-wrap items-center gap-2">
                                <RangePills ranges={LEADGEN_RANGES} value={f.range} onChange={f.selectRange} />
                                <DateRangePicker
                                    from={f.custom.from}
                                    to={f.custom.to}
                                    maxDate={new Date()}
                                    placeholder="날짜 직접 선택"
                                    align="end"
                                    triggerClassName={cn("bg-background", f.isCustom && "border-primary/40 text-primary")}
                                    onChange={f.selectCustom}
                                />
                                {f.isCustom && (
                                    <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={f.reset}>
                                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
                                        초기화
                                    </Button>
                                )}
                                <Button variant="outline" size="sm" onClick={f.startPeriods}>
                                    <CalendarRange className="mr-1 h-4 w-4" />
                                    기간 비교
                                </Button>
                            </div>
                        )}
                    </div>
                    {/* 다른 화면(콜드메일 등)과 같은 탭 모양 */}
                    <Tabs value={view} onValueChange={setView}>
                        <div className="overflow-x-auto">
                            <TabsList className="[&>button]:flex-none">
                                {VIEWS.map((v) => (
                                    <TabsTrigger key={v.value} value={v.value}>
                                        {v.label}
                                        {v.value === "ab" && <InfoTip text={AB_STATS_TIP} className="-ml-1 [&>svg]:size-3" />}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </div>
                    </Tabs>
                    {view !== "ab" && (
                        <div className="flex flex-wrap items-end justify-between gap-3">
                            <CampaignPicker f={f} options={campaigns.options} />
                            {!f.periodGroups && <p className="text-xs text-muted-foreground">{f.periodText}</p>}
                        </div>
                    )}
                    {view === "summary" &&
                        (f.periodGroups ? (
                            <>
                                <CompareKpiGrid groups={f.periodGroups} />
                                <CompareTrend groups={f.periodGroups} names={f.periods.periods!.map(periodName)} byDay />
                            </>
                        ) : f.compare ? (
                            f.groups ? (
                                <>
                                    <CompareKpiGrid groups={f.groups} />
                                    <CompareTrend groups={f.groups} names={f.groups.map((g) => groupName(g.keys, campaigns.nameOf))} />
                                </>
                            ) : (
                                <p className="rounded-lg border border-border/40 bg-card p-8 text-center text-sm text-muted-foreground">
                                    비교할 메일 묶음을 두 개 이상 골라 주세요.
                                </p>
                            )
                        ) : (
                            <>
                                <KpiGrid query={f.query} />
                                <TrendPanel query={f.query} />
                            </>
                        ))}
                    {/* 기간 비교 중에는 A 기간 기준 */}
                    {view === "detail" && (
                        <CompareTable query={f.periodGroups ? f.periodGroups[0].query : f.compare ? f.base : f.query} />
                    )}
                    {view === "ab" && <AbTestStatsSection workspaceId={f.workspaceId} from={f.query.from} to={f.query.to} />}
                </div>
            </div>
        </div>
    );
}
