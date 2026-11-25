import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, emailSendLogs, partitions } from "@/lib/db";
import { getActiveUserFromNextRequest } from "@/lib/auth";

// GET: 리드관리 유입경로 — 이 리드가 받은 콜드메일(발송 기록 하나)의 제목·본문
export async function GET(req: NextRequest, { params }: { params: Promise<{ logId: string }> }) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) {
        return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }
    const logId = Number((await params).logId);
    if (!logId) {
        return NextResponse.json({ success: false, error: "잘못된 요청입니다." }, { status: 400 });
    }
    const [mail] = await db
        .select({
            id: emailSendLogs.id,
            subject: emailSendLogs.subject,
            body: emailSendLogs.body,
            recipientEmail: emailSendLogs.recipientEmail,
            senderEmail: emailSendLogs.senderEmail,
            sentAt: emailSendLogs.sentAt,
            partitionName: partitions.name,
        })
        .from(emailSendLogs)
        .leftJoin(partitions, eq(partitions.id, emailSendLogs.partitionId))
        .where(and(eq(emailSendLogs.id, logId), eq(emailSendLogs.orgId, user.orgId)));
    if (!mail) {
        return NextResponse.json({ success: false, error: "메일을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: mail });
}
