import { NextRequest } from "next/server";
import { copyAdminApi } from "@/lib/ai-copy/api";
import { loadLeaderboard, type LeaderboardMetric } from "@/lib/model-lab/leaderboard";

const METRICS: LeaderboardMetric[] = ["open", "click", "reply"];
const intParam = (req: NextRequest, name: string, fallback: number) => {
    const value = Number(req.nextUrl.searchParams.get(name) ?? fallback);
    return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
};

// GET /api/ai/model-lab/leaderboard?days=30&workspaceId=0&ruleId=0&metric=open — 모델별 오픈·클릭·회신률 (관리자)
export async function GET(req: NextRequest) {
    return copyAdminApi(req, (conn, user) => {
        const metricParam = req.nextUrl.searchParams.get("metric") as LeaderboardMetric | null;
        return loadLeaderboard(conn, {
            orgId: user.orgId,
            days: Math.min(Math.max(intParam(req, "days", 30), 14), 90),
            workspaceId: intParam(req, "workspaceId", 0),
            ruleId: intParam(req, "ruleId", 0),
            metric: metricParam && METRICS.includes(metricParam) ? metricParam : "open",
        });
    });
}
