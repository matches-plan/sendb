import { NextRequest, NextResponse } from "next/server";
import { getActiveUserFromNextRequest } from "@/lib/auth";
import { resolveHealthProblem } from "@/lib/sender-health-focus-db";
import { describeReplyError } from "@/lib/email-reply-rules";

/**
 * 발송 이력 위 "확인할 문제" 해결 완료 — 조직 구성원이면 누구나 (멤버 포함).
 * 지금 보류 중인 명단·자동 멈춤인 주소의 문제는 발송 다시 시작(관리자)으로 끝내야 해서 409.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) {
        return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }
    const eventId = Number((await params).id);
    if (!Number.isSafeInteger(eventId) || eventId <= 0) {
        return NextResponse.json({ success: false, error: "문제를 찾을 수 없습니다." }, { status: 404 });
    }
    try {
        const result = await resolveHealthProblem(user.orgId, eventId, user.userId);
        if (result === "not_found") {
            return NextResponse.json({ success: false, error: "문제를 찾을 수 없습니다." }, { status: 404 });
        }
        if (result === "active") {
            return NextResponse.json({ success: false, error: "발송이 멈춰 있어요. 발송을 다시 시작하면 해결돼요." }, { status: 409 });
        }
        return NextResponse.json({ success: true, data: { eventId } });
    } catch (error) {
        console.error("[send-health] problem resolve error:", describeReplyError(error));
        return NextResponse.json({ success: false, error: "해결 완료로 바꾸지 못했습니다." }, { status: 500 });
    }
}
