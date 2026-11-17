import { NextRequest, NextResponse } from "next/server";
import { getActiveUserFromNextRequest } from "@/lib/auth";
import { listHealthProblems } from "@/lib/sender-health-focus-db";
import { describeReplyError } from "@/lib/email-reply-rules";

/**
 * 발송 이력 위 "확인할 문제" 목록 — 최근 발송 경고 사건 (조직 것만, 멤버 포함 조직 구성원이면 본다).
 * ?workspaceId= 사업부 (없으면 전체), ?days= 최근 며칠 (1~90, 기본 14). 받는 사람 주소는 없다.
 */
export async function GET(req: NextRequest) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) {
        return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }
    const sp = req.nextUrl.searchParams;
    const wsRaw = Number(sp.get("workspaceId"));
    const workspaceId = Number.isSafeInteger(wsRaw) && wsRaw > 0 ? wsRaw : null;
    const daysRaw = Number(sp.get("days"));
    const days = Number.isInteger(daysRaw) && daysRaw >= 1 && daysRaw <= 90 ? daysRaw : 14;
    try {
        const data = await listHealthProblems(user.orgId, { workspaceId, days });
        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error("[send-health] problem list error:", describeReplyError(error));
        return NextResponse.json({ success: false, error: "확인할 문제를 불러오지 못했습니다." }, { status: 500 });
    }
}
