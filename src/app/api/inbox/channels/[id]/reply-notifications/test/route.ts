import { NextRequest } from "next/server";
import { handleInbox, inboxActor, jsonBody } from "@/lib/inbox/http";
import { sendNoticeTest } from "@/lib/customer-messenger/notice-settings";
/** 상담 설정 › 답변 알림 — 이메일·알림톡 시험 발송 */
export async function POST(req: NextRequest, c: { params: Promise<{ id: string }> }) {
    return handleInbox(async () => sendNoticeTest(inboxActor(req), Number((await c.params).id), await jsonBody(req)));
}
