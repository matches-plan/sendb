import { NextRequest, NextResponse } from "next/server";
import { getActiveUserFromNextRequest } from "@/lib/auth";
import { listMyNotifications, markMyNotificationsRead, markReadInput } from "@/lib/user-notifications/repository";

/** 내 화면 알림 — 최근 30개와 안 읽은 수 (머리 종) */
export async function GET(req: NextRequest) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    try {
        return NextResponse.json({ success: true, data: await listMyNotifications(user.orgId, user.userId) });
    } catch (error) {
        console.error("[notifications] list error:", error);
        return NextResponse.json({ success: false, error: "알림을 불러오지 못했습니다." }, { status: 500 });
    }
}

/** 읽음 표시 — { ids: number[] } 또는 { all: true } */
export async function PATCH(req: NextRequest) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    const parsed = markReadInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: "읽음 표시할 알림을 골라주세요." }, { status: 400 });
    try {
        return NextResponse.json({ success: true, data: await markMyNotificationsRead(user.orgId, user.userId, parsed.data) });
    } catch (error) {
        console.error("[notifications] mark read error:", error);
        return NextResponse.json({ success: false, error: "읽음 표시를 하지 못했습니다." }, { status: 500 });
    }
}
