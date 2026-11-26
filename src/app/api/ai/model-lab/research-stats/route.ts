import { NextRequest } from "next/server";
import { copyAdminApi } from "@/lib/ai-copy/api";
import { loadResearchStats } from "@/lib/model-lab/research-stats";

// GET /api/ai/model-lab/research-stats?days=30 — 회사 조사(Serper·Qwen) 날짜별 관찰 (관리자)
export async function GET(req: NextRequest) {
    return copyAdminApi(req, (conn, user) => {
        const days = Number(req.nextUrl.searchParams.get("days") ?? 30);
        return loadResearchStats(conn, { orgId: user.orgId, days: Number.isSafeInteger(days) ? Math.min(Math.max(days, 1), 90) : 30 });
    });
}
