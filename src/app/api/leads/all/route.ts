import { NextRequest, NextResponse } from "next/server";
import { getActiveUserFromNextRequest } from "@/lib/auth";
import { listAllLeads } from "@/lib/leads/list-all";

// GET: 리드관리 전체 탭 — 볼 수 있는 모든 사업부 리드함의 최근 리드 (?important=1 중요만 · search)
export async function GET(req: NextRequest) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) {
        return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }
    const sp = req.nextUrl.searchParams;
    try {
        const result = await listAllLeads(user, { important: sp.get("important") === "1", search: (sp.get("search") || "").trim().slice(0, 100) });
        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        console.error("All leads error:", error);
        return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
    }
}
