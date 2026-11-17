import { NextRequest, NextResponse } from "next/server";
import { getActiveUserFromNextRequest } from "@/lib/auth";
import { loadHealthFocus } from "@/lib/sender-health-focus-db";
import { describeReplyError } from "@/lib/email-reply-rules";

/**
 * 발송 경고 알림 한 줄 → 무엇이 일어났나·할 일·발송 이력 거르기 (발송 이력 위 문제 칸). 조직 구성원이면 본다 (멤버 포함).
 * ?workspaceId= 사업부를 주면 갈래별 메일 수는 그 사업부 것만. { alertId, createdAt, workspaceId, items[] }. 받는 사람 주소는 없다 (숫자·이름만).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) {
        return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }
    const alertId = Number((await params).id);
    if (!Number.isSafeInteger(alertId) || alertId <= 0) {
        return NextResponse.json({ success: false, error: "알림을 찾을 수 없습니다." }, { status: 404 });
    }
    const wsRaw = Number(req.nextUrl.searchParams.get("workspaceId"));
    const workspaceId = Number.isSafeInteger(wsRaw) && wsRaw > 0 ? wsRaw : null;
    try {
        const data = await loadHealthFocus(user.orgId, alertId, workspaceId);
        if (!data) return NextResponse.json({ success: false, error: "알림을 찾을 수 없습니다." }, { status: 404 });
        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error("[send-health] alert focus error:", describeReplyError(error));
        return NextResponse.json({ success: false, error: "알림 내용을 불러오지 못했습니다." }, { status: 500 });
    }
}
