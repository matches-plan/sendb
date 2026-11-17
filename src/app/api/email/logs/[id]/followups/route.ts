import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getActiveUserFromNextRequest } from "@/lib/auth";
import { clickSignalsForSendLogs, EMPTY_CLICK_SIGNAL } from "@/lib/email-click-signals";
import { openSignalsForSendLogs, EMPTY_OPEN_SIGNAL } from "@/lib/email-open-signals";

/** 발송 이력 한 줄 아래로 이어진 후속 메일 — 나간 후속(로그)과 아직 나가지 않은 후속(큐: 대기·보류·건너뜀·취소) */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) {
        return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }
    try {
        const rootId = Number((await params).id);
        if (!rootId) return NextResponse.json({ success: false, error: "유효하지 않은 ID입니다." }, { status: 400 });

        const logs = await db.execute(sql`
            WITH RECURSIVE chain AS (
                SELECT id, 0 AS depth FROM email_send_logs WHERE id = ${rootId} AND org_id = ${user.orgId}
                UNION ALL
                SELECT l.id, c.depth + 1 FROM email_send_logs l JOIN chain c ON l.parent_log_id = c.id
                WHERE l.org_id = ${user.orgId} AND c.depth < 20
            )
            SELECT l.*, c.depth FROM chain c JOIN email_send_logs l ON l.id = c.id ORDER BY l.sent_at
        `) as unknown as Array<Record<string, unknown> & { id: number; depth: number }>;
        if (logs.length === 0) return NextResponse.json({ success: false, error: "이력을 찾을 수 없습니다." }, { status: 404 });

        const chainIds = logs.map((l) => Number(l.id));
        const queue = await db.execute(sql`
            SELECT q.id, q.parent_log_id, q.source_type, q.step_index, q.check_at, q.status, q.result, q.stop_reason, q.processed_at
            FROM email_followup_queue q
            WHERE q.org_id = ${user.orgId} AND q.status <> 'sent'
              AND q.parent_log_id IN (${sql.join(chainIds.map((id) => sql`${id}`), sql`, `)})
            ORDER BY q.check_at
        `) as unknown as Array<Record<string, unknown>>;

        const childIds = chainIds.filter((id) => id !== rootId);
        const [clicks, opens] = await Promise.all([
            clickSignalsForSendLogs(user.orgId, childIds),
            openSignalsForSendLogs(user.orgId, childIds),
        ]);
        const sent = logs.filter((l) => Number(l.id) !== rootId).map((l) => ({
            id: Number(l.id),
            step: Number(l.depth),
            recipientEmail: l.recipient_email,
            subject: l.subject,
            body: l.body,
            status: l.status,
            triggerType: l.trigger_type,
            sentAt: l.sent_at,
            resultMessage: l.result_message,
            senderEmail: l.sender_email,
            senderProfileId: l.sender_profile_id,
            senderProfile: null,
            ...(clicks.get(Number(l.id)) ?? EMPTY_CLICK_SIGNAL),
            ...(opens.get(Number(l.id)) ?? EMPTY_OPEN_SIGNAL),
        }));
        const scheduled = queue.map((q) => ({
            id: Number(q.id),
            sourceType: q.source_type,
            stepIndex: Number(q.step_index),
            checkAt: q.check_at,
            status: q.status,
            result: q.result,
            stopReason: q.stop_reason,
            processedAt: q.processed_at,
        }));
        return NextResponse.json({ success: true, data: { sent, scheduled } });
    } catch (error) {
        console.error("Email log followups fetch error:", error);
        return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
    }
}
