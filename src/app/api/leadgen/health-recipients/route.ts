import { NextRequest, NextResponse } from "next/server";
import { getActiveUserFromNextRequest } from "@/lib/auth";
import { listHealthRecipients, recipientInput, setHealthRecipient } from "@/lib/user-notifications/repository";

function workspaceIdOf(req: NextRequest): number | null {
    const id = Number(req.nextUrl.searchParams.get("workspaceId"));
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** 콜드메일 알림 담당자 — 조직의 활성 직원과 이 사업 담당 여부. 누구나 보고, 관리자만 바꾼다 */
export async function GET(req: NextRequest) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    const workspaceId = workspaceIdOf(req);
    if (!workspaceId) return NextResponse.json({ success: false, error: "사업부를 골라주세요." }, { status: 400 });
    try {
        const members = await listHealthRecipients(user.orgId, workspaceId);
        if (!members) return NextResponse.json({ success: false, error: "사업부를 찾을 수 없습니다." }, { status: 404 });
        return NextResponse.json({ success: true, data: { members, canManage: user.role !== "member" } });
    } catch (error) {
        console.error("[health-recipients] list error:", error);
        return NextResponse.json({ success: false, error: "알림 담당자를 불러오지 못했습니다." }, { status: 500 });
    }
}

/** 알림 담당자 켜기·끄기 — { userId, enabled } (관리자) */
export async function PATCH(req: NextRequest) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    if (user.role === "member") return NextResponse.json({ success: false, error: "관리자만 알림 담당자를 바꿀 수 있습니다." }, { status: 403 });
    const workspaceId = workspaceIdOf(req);
    if (!workspaceId) return NextResponse.json({ success: false, error: "사업부를 골라주세요." }, { status: 400 });
    const parsed = recipientInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: "직원을 골라주세요." }, { status: 400 });
    try {
        const result = await setHealthRecipient(user.orgId, workspaceId, parsed.data);
        if (result === "not_found") return NextResponse.json({ success: false, error: "이 조직의 사업부·직원을 찾을 수 없습니다." }, { status: 404 });
        return NextResponse.json({ success: true, data: parsed.data });
    } catch (error) {
        console.error("[health-recipients] update error:", error);
        return NextResponse.json({ success: false, error: "알림 담당자를 바꾸지 못했습니다." }, { status: 500 });
    }
}
