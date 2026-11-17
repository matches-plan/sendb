import { NextRequest } from "next/server";
import { handleInbox, inboxActor, jsonBody } from "@/lib/inbox/http";
import { noticeSettings, saveNoticeSettings } from "@/lib/customer-messenger/notice-settings";
type Context = { params: Promise<{ id: string }> };
/** 상담 설정 › 답변 알림 — 설정·발송 가능 여부·최근 발송 기록 */
export async function GET(req: NextRequest, c: Context) {
    return handleInbox(async () => noticeSettings(inboxActor(req), Number((await c.params).id)));
}
export async function PUT(req: NextRequest, c: Context) {
    return handleInbox(async () => saveNoticeSettings(inboxActor(req), Number((await c.params).id), await jsonBody(req)));
}
