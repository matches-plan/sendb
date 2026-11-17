import { kstDateFilter } from "@/lib/tracker/date-range";
import { isExactEmailSearch } from "@/lib/send-log-search";
import { openSignalsForSendLogs, EMPTY_OPEN_SIGNAL } from "@/lib/email-open-signals";
import { clickSignalsForSendLogs, EMPTY_CLICK_SIGNAL } from "@/lib/email-click-signals";
import { NextRequest, NextResponse } from "next/server";
import { db, emailSendLogs, emailSenderProfiles, partitions } from "@/lib/db";
import { eq, and, desc, sql, gte, lte, or, ilike, isNull } from "drizzle-orm";
import { getActiveUserFromNextRequest } from "@/lib/auth";
import { repliesForSendLogs } from "@/lib/email-reply-list";
import { pgErrorOf } from "@/lib/email-reply-rules";
import { healthLogConditions } from "@/lib/sender-health-focus-db";
import { parseHealthCats } from "@/lib/sender-health-focus";

export async function GET(req: NextRequest) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) {
        return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }

    try {
        const searchParams = req.nextUrl.searchParams;
        const page = Number(searchParams.get("page")) || 1;
        const pageSize = Math.min(Number(searchParams.get("pageSize")) || 50, 100);
        const offset = (page - 1) * pageSize;

        const conditions = [eq(emailSendLogs.orgId, user.orgId)];

        const search = searchParams.get("search");
        if (search && isExactEmailSearch(search)) {
            conditions.push(sql`lower(${emailSendLogs.recipientEmail}) = lower(${search.trim()})`);
        } else if (search) {
            conditions.push(
                or(
                    ilike(emailSendLogs.recipientEmail, `%${search}%`),
                    ilike(emailSendLogs.subject, `%${search}%`),
                )!
            );
        }
        const status = searchParams.get("status");
        if (status) {
            conditions.push(eq(emailSendLogs.status, status));
        }
        // 첫 메일만 (후속 메일은 그 줄을 펼쳐서 본다). 후속 방식으로 거를 때는 후속 줄도 그대로 보인다
        const triggerParam = searchParams.get("triggerType");
        if (searchParams.get("roots") === "1" && !(triggerParam && /followup/.test(triggerParam))) {
            conditions.push(isNull(emailSendLogs.parentLogId));
        }
        // 사업부별: 보낸 파티션이 그 사업부에 있는 줄만
        const workspaceId = Number(searchParams.get("workspaceId"));
        if (workspaceId > 0) {
            conditions.push(sql`${emailSendLogs.partitionId} IN (SELECT ${partitions.id} FROM ${partitions} WHERE ${partitions.workspaceId} = ${workspaceId})`);
        }
        const partitionId = searchParams.get("partitionId");
        if (partitionId) {
            conditions.push(eq(emailSendLogs.partitionId, Number(partitionId)));
        }
        const templateLinkId = searchParams.get("templateLinkId");
        if (templateLinkId) {
            conditions.push(eq(emailSendLogs.templateLinkId, Number(templateLinkId)));
        }
        const autoPersonalizedLinkId = searchParams.get("autoPersonalizedLinkId");
        if (autoPersonalizedLinkId) {
            conditions.push(eq(emailSendLogs.autoPersonalizedLinkId, Number(autoPersonalizedLinkId)));
        }
        const triggerType = searchParams.get("triggerType");
        if (triggerType) {
            conditions.push(eq(emailSendLogs.triggerType, triggerType));
        }
        // 날짜는 KST 하루 경계로 자른다 — 서버 시간대와 무관(통계 대시보드와 같은 날짜 계약)
        const dates = kstDateFilter(searchParams.get("startDate"), searchParams.get("endDate"));
        if (!dates.ok) {
            return NextResponse.json({ success: false, error: dates.error }, { status: 400 });
        }
        if (dates.fromIso) conditions.push(gte(emailSendLogs.sentAt, new Date(dates.fromIso)));
        if (dates.toIso) conditions.push(lte(emailSendLogs.sentAt, new Date(dates.toIso)));
        // 발송 경고 알림에서 온 거르기 — 명단 여럿·발신 프로필(0 = 프로필 없음)·발신 도메인·정확한 기간·건강 갈래(반송·발신 인증 실패 등)
        const partitionIds = (searchParams.get("partitionIds") ?? "")
            .split(",")
            .map(Number)
            .filter((n) => Number.isSafeInteger(n) && n > 0)
            .slice(0, 50);
        const senderProfileRaw = searchParams.get("senderProfileId");
        const senderProfileId = senderProfileRaw !== null && /^\d+$/.test(senderProfileRaw) ? Number(senderProfileRaw) : null;
        const senderDomain = (searchParams.get("senderDomain") ?? "").trim().slice(0, 200) || null;
        const isoParam = (name: string) => {
            const v = searchParams.get(name);
            if (!v) return null;
            const d = new Date(v);
            return Number.isFinite(d.getTime()) ? d : null;
        };
        conditions.push(
            ...healthLogConditions({
                partitionIds,
                senderProfileId,
                senderDomain,
                sentFrom: isoParam("sentFrom"),
                sentTo: isoParam("sentTo"),
                cats: parseHealthCats(searchParams.get("healthCat")),
            })
        );
        const isClicked = searchParams.get("isClicked");
        if (isClicked === "1") {
            conditions.push(sql`EXISTS (SELECT 1 FROM email_click_logs ecl WHERE ecl.send_log_id = email_send_logs.id AND ecl.is_bot = false)`);
        } else if (isClicked === "0") {
            conditions.push(sql`NOT EXISTS (SELECT 1 FROM email_click_logs ecl WHERE ecl.send_log_id = email_send_logs.id AND ecl.is_bot = false)`);
            conditions.push(eq(emailSendLogs.status, "sent"));
        }
        // "후속 있음": 이 메일 뒤로 후속이 나갔거나 기다리는 줄만
        if (searchParams.get("hasFollowup") === "1") {
            // IN (UNION)이 줄마다 EXISTS 두 번보다 훨씬 빠르다 (로컬 덤프 6초 → 0.1초)
            conditions.push(sql`${emailSendLogs.id} IN (
                SELECT parent_log_id FROM email_send_logs WHERE parent_log_id IS NOT NULL AND org_id = ${user.orgId}
                UNION SELECT parent_log_id FROM email_followup_queue WHERE status IN ('pending', 'processing', 'held') AND org_id = ${user.orgId})`);
        }
        // "회신 있음" 거르개 (DESIGN-RPL 11절) — 사람 회신이 이어진 발송
        if (searchParams.get("hasReply") === "1") {
            conditions.push(
                sql`EXISTS (SELECT 1 FROM email_replies er WHERE er.send_log_id = email_send_logs.id AND er.org_id = email_send_logs.org_id AND er.kind = 'human')`
            );
        }

        const [countResult] = await db
            .select({ count: sql<number>`count(*)` })
            .from(emailSendLogs)
            .where(and(...conditions));

        // 보낸 주소: 줄마다 senderEmail(보낼 때 실제로 쓴 주소, email_send_logs.sender_email — 0073부터 저장, 옛 로그는 null)과
        // senderProfile(sender_profile_id로 붙인 이 조직 발신 프로필의 **지금** 값)을 함께 준다 (DESIGN-2 4절 ②, DESIGN-3 4-1).
        // 화면은 senderEmail을 먼저 쓴다 — 프로필 주소를 나중에 바꿔도 이력의 보낸 주소는 그대로다 (R7).
        // 다른 조직 프로필은 붙지 않게 조직을 조인 조건에 둔다. 지워진 프로필이면 null
        const rows = await db
            .select({
                log: emailSendLogs,
                senderName: emailSenderProfiles.name,
                senderFromEmail: emailSenderProfiles.fromEmail,
            })
            .from(emailSendLogs)
            .leftJoin(
                emailSenderProfiles,
                and(
                    eq(emailSenderProfiles.id, emailSendLogs.senderProfileId),
                    eq(emailSenderProfiles.orgId, user.orgId)
                )
            )
            .where(and(...conditions))
            .orderBy(desc(emailSendLogs.sentAt))
            .limit(pageSize)
            .offset(offset);
        const logs = rows.map((r) => ({
            ...r.log,
            senderProfile:
                r.log.senderProfileId !== null && r.senderFromEmail !== null
                    ? { id: r.log.senderProfileId, name: r.senderName ?? "", fromEmail: r.senderFromEmail }
                    : null,
        }));

        const logIds = logs.map((log) => log.id);
        const [signals, openSignals] = await Promise.all([
            clickSignalsForSendLogs(user.orgId, logIds),
            openSignalsForSendLogs(user.orgId, logIds),
        ]);

        // 회신 붙이기 (클릭 수와 같은 방식, 사람 회신 먼저) — 표가 없으면(마이그레이션 전) 회신 없이
        let replies = new Map<number, { id: number; kind: string; receivedAt: Date }>();
        try {
            replies = await repliesForSendLogs(user.orgId, logIds);
        } catch (e) {
            if (pgErrorOf(e)?.code !== "42P01") throw e;
        }

        const followups = await followupSummaries(user.orgId, logIds);

        const logsWithClicks = logs.map(log => ({
            ...log,
            ...(signals.get(log.id) ?? EMPTY_CLICK_SIGNAL),
            ...(openSignals.get(log.id) ?? EMPTY_OPEN_SIGNAL),
            reply: replies.get(log.id) ?? null,
            followupCount: followups.get(log.id)?.sent ?? 0,
            followupPending: followups.get(log.id)?.pending ?? 0,
        }));

        return NextResponse.json({
            success: true,
            data: logsWithClicks,
            totalCount: Number(countResult.count),
        });
    } catch (error) {
        console.error("Email logs fetch error:", error);
        return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
    }
}

/** 줄마다 이어서 나간 후속 메일 수와 아직 기다리는 후속 수 — 후속의 후속(parent_log_id 사슬)까지 센다 */
async function followupSummaries(orgId: string, logIds: number[]) {
    const out = new Map<number, { sent: number; pending: number }>();
    if (logIds.length === 0) return out;
    const ids = sql.join(logIds.map((id) => sql`${id}`), sql`, `);
    const rows = await db.execute<{ root_id: number; sent: number; pending: number }>(sql`
        WITH RECURSIVE chain AS (
            SELECT id AS root_id, id FROM email_send_logs WHERE id IN (${ids})
            UNION ALL
            SELECT c.root_id, l.id FROM email_send_logs l JOIN chain c ON l.parent_log_id = c.id
            WHERE l.org_id = ${orgId}
        )
        SELECT c.root_id,
            (count(*) FILTER (WHERE c.id <> c.root_id))::int AS sent,
            (SELECT count(*)::int FROM email_followup_queue q
                WHERE q.org_id = ${orgId} AND q.status IN ('pending', 'processing', 'held')
                AND q.parent_log_id IN (SELECT id FROM chain c2 WHERE c2.root_id = c.root_id)) AS pending
        FROM chain c GROUP BY c.root_id
    `);
    for (const r of rows as unknown as Array<{ root_id: number; sent: number; pending: number }>) {
        out.set(Number(r.root_id), { sent: Number(r.sent), pending: Number(r.pending) });
    }
    return out;
}
