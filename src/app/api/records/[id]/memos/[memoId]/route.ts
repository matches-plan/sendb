import { NextRequest, NextResponse } from "next/server";
import { db, memos, records } from "@/lib/db";
import { eq, and, sql } from "drizzle-orm";
import { getActiveUserFromNextRequest } from "@/lib/auth";
import { requireRecordAccess } from "@/lib/partition-access";
import { canDeleteMemo, canEditMemo, MEMO_DELETE_FORBIDDEN } from "@/lib/memo-permissions";
import { MEMO_KINDS } from "@/lib/leads/memo-input";

// DELETE: 메모 삭제
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; memoId: string }> }
) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) {
        return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }

    const { id, memoId } = await params;
    const recordId = Number(id);
    const memoIdNum = Number(memoId);

    if (!recordId || !memoIdNum) {
        return NextResponse.json({ success: false, error: "잘못된 요청입니다." }, { status: 400 });
    }

    // 레코드 소유·파티션 접근 검증
    const access = await requireRecordAccess(user, recordId, "read");
    if (!access.ok) {
        return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const [memo] = await db
        .select({ id: memos.id, createdBy: memos.createdBy })
        .from(memos)
        .where(and(eq(memos.id, memoIdNum), eq(memos.recordId, recordId)));
    if (!memo) {
        return NextResponse.json({ success: false, error: "메모를 찾을 수 없습니다." }, { status: 404 });
    }
    // 동료의 상담 기록을 실수로 지우지 않도록 작성자 본인만
    if (!canDeleteMemo(memo, user)) {
        return NextResponse.json({ success: false, error: MEMO_DELETE_FORBIDDEN }, { status: 403 });
    }

    const [deleted] = await db
        .delete(memos)
        .where(and(eq(memos.id, memoIdNum), eq(memos.recordId, recordId)))
        .returning({ id: memos.id });
    if (!deleted) {
        return NextResponse.json({ success: false, error: "메모를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
}

// PATCH: 메모(댓글) 수정 — 작성자 본인만
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; memoId: string }> }
) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) {
        return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }

    const { id, memoId } = await params;
    const recordId = Number(id);
    const memoIdNum = Number(memoId);
    if (!recordId || !memoIdNum) {
        return NextResponse.json({ success: false, error: "잘못된 요청입니다." }, { status: 400 });
    }

    const { content, kind, nextContactAt: rawNext } = await req.json();
    // 다음 연락일: 안 보내면 그대로, null·빈 값이면 지우기
    let nextContactAt: Date | null | undefined;
    if (rawNext !== undefined) {
        nextContactAt = rawNext === null || rawNext === "" ? null : new Date(String(rawNext));
        if (nextContactAt && Number.isNaN(nextContactAt.getTime())) {
            return NextResponse.json({ success: false, error: "다음 연락일이 올바르지 않습니다." }, { status: 400 });
        }
    }
    if (!content || typeof content !== "string" || !content.trim()) {
        return NextResponse.json({ success: false, error: "내용을 입력해주세요." }, { status: 400 });
    }
    if (kind !== undefined && kind !== null && !(MEMO_KINDS as readonly string[]).includes(kind)) {
        return NextResponse.json({ success: false, error: "잘못된 댓글 종류입니다." }, { status: 400 });
    }

    const access = await requireRecordAccess(user, recordId, "read");
    if (!access.ok) {
        return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const [memo] = await db
        .select({ id: memos.id, createdBy: memos.createdBy, nextContactAt: memos.nextContactAt })
        .from(memos)
        .where(and(eq(memos.id, memoIdNum), eq(memos.recordId, recordId)));
    if (!memo) {
        return NextResponse.json({ success: false, error: "메모를 찾을 수 없습니다." }, { status: 404 });
    }
    if (!canEditMemo(memo, user)) {
        return NextResponse.json({ success: false, error: "본인이 쓴 메모만 수정할 수 있습니다." }, { status: 403 });
    }

    const updated = await db.transaction(async (tx) => {
        const [row] = await tx
            .update(memos)
            .set({
                content: content.trim(),
                ...(kind !== undefined ? { kind } : {}),
                ...(nextContactAt !== undefined ? { nextContactAt } : {}),
            })
            .where(eq(memos.id, memoIdNum))
            .returning();
        // 리드의 "다음연락일" 칸도 맞춘다 (중요 탭 기준) — 새로 정하면 그 날로, 지우면 이 댓글 날짜였을 때만 비운다
        if (nextContactAt) {
            await tx
                .update(records)
                .set({ data: sql`COALESCE(${records.data}, '{}'::jsonb) || ${JSON.stringify({ nextContactAt: nextContactAt.toISOString() })}::jsonb`, updatedAt: new Date() })
                .where(eq(records.id, recordId));
        } else if (nextContactAt === null && memo.nextContactAt) {
            await tx
                .update(records)
                .set({ data: sql`${records.data} - 'nextContactAt'`, updatedAt: new Date() })
                .where(and(eq(records.id, recordId), sql`(${records.data}->>'nextContactAt')::timestamptz = ${memo.nextContactAt.toISOString()}::timestamptz`));
        }
        return row;
    });

    return NextResponse.json({ success: true, data: updated });
}
