/**
 * 발송 경고 알림 → 발송 이력 거르기 (DB). 알림 한 줄의 사건을 읽어 healthFocusOf로 풀고,
 * 이름·지금 보류/멈춤 여부·기간 안 갈래별 메일 수를 채운다. 발송 이력 API도 같은 거르기 조건(healthLogConditions)을 쓴다.
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { HEALTH_CATEGORY_SQL } from "@/lib/sender-health-rules";
import { HEALTH_CATS, defaultCats, healthFocusOf, type HealthCat, type HealthFocusItem, type HealthFocusScope } from "@/lib/sender-health-focus";

type Row = Record<string, unknown>;

async function q<T = Row>(query: SQL): Promise<T[]> {
    return (await db.execute(query)) as unknown as T[];
}

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const toDate = (v: unknown): Date => (v instanceof Date ? v : new Date(String(v)));

/** 별칭 없는 email_send_logs의 건강 갈래 (HEALTH_CATEGORY_SQL은 별칭 l을 쓴다) */
export const SEND_LOG_HEALTH_CATEGORY_SQL = HEALTH_CATEGORY_SQL.replace(/\bl\./g, "email_send_logs.");

/** 발송 이력 거르기 — 명단·발신 프로필(0 = 프로필 없음)·발신 도메인·기간·갈래. 테이블 이름 email_send_logs 그대로 쓴다 */
export function healthLogConditions(x: {
    partitionIds?: number[];
    senderProfileId?: number | null;
    senderDomain?: string | null;
    sentFrom?: Date | null;
    sentTo?: Date | null;
    cats?: HealthCat[];
}): SQL[] {
    const out: SQL[] = [];
    if (x.partitionIds && x.partitionIds.length > 0) {
        out.push(sql`email_send_logs.partition_id IN (${sql.join(x.partitionIds.map((id) => sql`${id}`), sql`, `)})`);
    }
    if (x.senderProfileId !== undefined && x.senderProfileId !== null) {
        out.push(x.senderProfileId === 0 ? sql`email_send_logs.sender_profile_id IS NULL` : sql`email_send_logs.sender_profile_id = ${x.senderProfileId}`);
    }
    if (x.senderDomain) {
        out.push(sql`lower(split_part(COALESCE(email_send_logs.sender_email, ''), '@', 2)) = ${x.senderDomain.toLowerCase()}`);
    }
    if (x.sentFrom) out.push(sql`email_send_logs.sent_at >= ${x.sentFrom.toISOString()}::timestamptz`);
    if (x.sentTo) out.push(sql`email_send_logs.sent_at <= ${x.sentTo.toISOString()}::timestamptz`);
    if (x.cats && x.cats.length > 0) {
        out.push(sql`(${sql.raw(SEND_LOG_HEALTH_CATEGORY_SQL)}) IN (${sql.join(x.cats.map((c) => sql`${c}`), sql`, `)})`);
    }
    return out;
}

function scopeConditions(scope: HealthFocusScope): SQL[] {
    return healthLogConditions({
        partitionIds: scope.partitionIds,
        senderProfileId: scope.senderProfileId,
        senderDomain: scope.senderDomain,
        sentFrom: new Date(scope.from),
        sentTo: new Date(scope.to),
    });
}

export interface HealthFocusView {
    alertId: number;
    createdAt: string;
    workspaceId: number | null;
    items: HealthFocusItem[];
}

const MAX_ITEMS = 10;

/** 사건 줄 → 화면 설명·거르기 (이름·지금 보류/멈춤·기간 안 갈래별 메일 수까지) */
async function focusItemsOf(orgId: string, events: Row[], workspaceId: number | null = null): Promise<HealthFocusItem[]> {
    // 사업부를 고른 발송 이력은 그 사업부 명단 메일만 보이므로 수도 그렇게 센다
    const wsCond = workspaceId
        ? sql` AND email_send_logs.partition_id IN (SELECT id FROM partitions WHERE workspace_id = ${workspaceId}::int)`
        : sql``;
    // 이름·상태를 한 번에 읽는다
    const partitionIds = new Set<number>();
    const senderIds = new Set<number>();
    const holdIds = new Set<number>();
    const cellIds = (v: unknown) =>
        Array.isArray(v) ? v.map((c) => (c && typeof c === "object" ? num((c as Row).p) : num(c))).filter((x) => x > 0) : [];
    for (const e of events) {
        const m = (e.metrics ?? {}) as Row;
        const id = e.entity_id === null ? null : num(e.entity_id);
        if (e.entity_type === "partition" && id) (e.kind === "release" ? holdIds : partitionIds).add(id);
        if (e.entity_type === "sender" && id) senderIds.add(id);
        for (const p of [...cellIds(m.highCells), ...cellIds(m.outlierCells), ...cellIds(m.partitions)]) partitionIds.add(p);
    }
    const holds = holdIds.size
        ? await q<Row>(sql`SELECT id, partition_id FROM email_partition_holds WHERE org_id = ${orgId}::uuid AND id IN (${sql.join([...holdIds].map((x) => sql`${x}`), sql`, `)})`)
        : [];
    const holdPartition = new Map(holds.map((h) => [num(h.id), num(h.partition_id)]));
    for (const p of holdPartition.values()) partitionIds.add(p);

    const pIds = [...partitionIds];
    const sIds = [...senderIds];
    const [parts, active, senders] = await Promise.all([
        pIds.length
            ? q<Row>(sql`
                  SELECT p.id, p.name, w.name AS ws_name FROM partitions p
                  JOIN workspaces w ON w.id = p.workspace_id
                  WHERE w.org_id = ${orgId}::uuid AND p.id IN (${sql.join(pIds.map((x) => sql`${x}`), sql`, `)})
              `)
            : Promise.resolve([] as Row[]),
        pIds.length
            ? q<Row>(sql`
                  SELECT DISTINCT partition_id FROM email_partition_holds
                  WHERE org_id = ${orgId}::uuid AND released_at IS NULL AND partition_id IN (${sql.join(pIds.map((x) => sql`${x}`), sql`, `)})
              `)
            : Promise.resolve([] as Row[]),
        sIds.length
            ? q<Row>(sql`
                  SELECT id, from_email, is_paused, paused_source FROM email_sender_profiles
                  WHERE org_id = ${orgId}::uuid AND id IN (${sql.join(sIds.map((x) => sql`${x}`), sql`, `)})
              `)
            : Promise.resolve([] as Row[]),
    ]);
    const partName = new Map(parts.map((p) => [num(p.id), { name: String(p.name ?? ""), workspaceName: p.ws_name ? String(p.ws_name) : null }]));
    const held = new Set(active.map((r) => num(r.partition_id)));
    const senderOf = new Map(senders.map((s) => [num(s.id), s]));

    const look = {
        partition: (id: number) => partName.get(id) ?? null,
        sender: (id: number) => (senderOf.get(id)?.from_email ? String(senderOf.get(id)!.from_email) : null),
        holdPartition: (id: number) => holdPartition.get(id) ?? null,
        isHeld: (id: number) => held.has(id),
        isAutoPaused: (id: number) => {
            const s = senderOf.get(id);
            return !!s && s.is_paused === true && s.paused_source === "auto";
        },
    };

    const items = events.map((e) =>
        healthFocusOf(
            {
                id: num(e.id),
                kind: String(e.kind),
                entityType: String(e.entity_type),
                entityId: e.entity_id === null ? null : num(e.entity_id),
                entityKey: e.entity_key ? String(e.entity_key) : null,
                workspaceId: e.workspace_id === null ? null : num(e.workspace_id),
                action: String(e.action ?? "none"),
                actionNote: e.action_note ? String(e.action_note) : null,
                evalWindow: e.eval_window ? String(e.eval_window) : null,
                metrics: (e.metrics ?? null) as Record<string, unknown> | null,
                summary: String(e.summary ?? ""),
                createdAt: toDate(e.created_at),
            },
            look
        )
    );

    // 갈래별 메일 수 (사건마다 한 번, 조직·기간 색인을 탄다)
    await Promise.all(
        items.map(async (it) => {
            const rows = await q<Row>(sql`
                SELECT (${sql.raw(SEND_LOG_HEALTH_CATEGORY_SQL)}) AS cat, count(*)::int AS n
                FROM email_send_logs
                WHERE email_send_logs.org_id = ${orgId}::uuid AND ${sql.join(scopeConditions(it.scope), sql` AND `)}${wsCond}
                GROUP BY 1
            `);
            for (const r of rows) {
                const c = String(r.cat) as HealthCat;
                if (HEALTH_CATS.includes(c)) it.counts[c] = num(r.n);
            }
        })
    );
    return items;
}

/** 알림 한 줄(조직 것만) → 사건별 설명·거르기. 사업부를 주면 메일 수는 그 사업부 것만. 없으면 null */
export async function loadHealthFocus(orgId: string, alertId: number, workspaceId: number | null = null): Promise<HealthFocusView | null> {
    const [alert] = await q<Row>(sql`
        SELECT id, event_ids, workspace_id, created_at FROM email_health_alerts
        WHERE id = ${alertId}::int AND org_id = ${orgId}::uuid
    `);
    if (!alert) return null;
    const eventIds = (Array.isArray(alert.event_ids) ? alert.event_ids : []).map(num).filter((x) => x > 0).slice(0, MAX_ITEMS);
    const events = eventIds.length
        ? await q<Row>(sql`
              SELECT id, kind, entity_type, entity_id, entity_key, workspace_id, action, action_note, eval_window, metrics, summary, created_at
              FROM email_health_events
              WHERE org_id = ${orgId}::uuid AND id IN (${sql.join(eventIds.map((id) => sql`${id}`), sql`, `)})
              ORDER BY id
          `)
        : [];
    const items = await focusItemsOf(orgId, events, workspaceId);

    return {
        alertId: num(alert.id),
        createdAt: toDate(alert.created_at).toISOString(),
        workspaceId: alert.workspace_id === null ? null : num(alert.workspace_id),
        items,
    };
}

/** 발송 이력 위 "확인할 문제" 카드 한 장 — 누르면 ?health=<alertId>&hev=<eventId> 로 그 사건의 메일을 거른다 */
export interface HealthProblem {
    alertId: number;
    eventId: number;
    kind: string;
    /** 지금도 보류 중인 명단·자동 멈춤인 발신 주소 — 해결 완료 대신 발송 다시 시작으로 끝낸다 */
    active: boolean;
    /** 조직 공통 문제 (연동·인증·상한·사업부 없는 사건) — 모든 사업부 화면에 보인다 */
    common: boolean;
    headline: string;
    detail: string;
    outcome: string | null;
    todo: string;
    devIssue: boolean;
    createdAt: string;
    /** 처음 거르는 갈래의 메일 수 (눌렀을 때 보이는 메일 — 사업부를 골랐으면 그 사업부 것만) */
    mailCount: number;
}

const PROBLEM_LIMIT = 20;
/** 확인할 문제로 보이는 사건 갈래 */
const PROBLEM_KINDS = ["danger", "danger_with", "auth_burst", "cap", "sync"] as const;
/** 사업부가 있어도 조직 공통으로 보는 갈래 */
const COMMON_KINDS_SQL = sql.raw(`('auth_burst', 'cap', 'sync')`);
const PROBLEM_KINDS_SQL = sql.raw(`(${PROBLEM_KINDS.map((k) => `'${k}'`).join(", ")})`);

/** 사건 e가 지금도 보류 중인 명단·자동 멈춤인 주소의 위험인가 */
const ACTIVE_SQL = sql`(
    (e.kind = 'danger' AND e.entity_type = 'partition' AND EXISTS (
        SELECT 1 FROM email_partition_holds h
        WHERE h.org_id = e.org_id AND h.partition_id = e.entity_id AND h.released_at IS NULL))
    OR (e.kind = 'danger' AND e.entity_type = 'sender' AND EXISTS (
        SELECT 1 FROM email_sender_profiles sp
        WHERE sp.org_id = e.org_id AND sp.id = e.entity_id AND sp.is_paused = true AND sp.paused_source = 'auto'))
)`;

/**
 * 사건 e가 끝났나 (지금 보류·멈춤 중이 아닐 때만 본다):
 * - 손으로 해결 완료 (resolved_at)
 * - NHN 결과 확인: 뒤에 회복 사건이 있다
 * - 명단 위험: 보류했던 사건이 지금 풀렸다, 또는 사건 뒤에 그 명단 보류를 풀었다
 * - 주소 위험: 자동 멈춤했던 사건이 지금 풀렸다, 또는 사건 뒤에 그 주소 멈춤을 풀었다
 * 그 밖(인증 실패 폭주·상한·알림만 위험·위험 명단을 주로 보낸 주소)은 해결 완료를 누르거나 기간(days)이 지나 다시 안 생기면 사라진다
 */
const SETTLED_SQL = sql`(
    e.resolved_at IS NOT NULL
    OR (e.kind = 'sync' AND EXISTS (
        SELECT 1 FROM email_health_events r
        WHERE r.org_id = e.org_id AND r.kind = 'sync' AND r.id > e.id
          AND COALESCE(r.metrics->>'cause', '') IN ('recovered', 'never_recovered')))
    OR (e.kind = 'danger' AND e.entity_type = 'partition' AND (e.action = 'hold' OR EXISTS (
        SELECT 1 FROM email_partition_holds h
        WHERE h.org_id = e.org_id AND h.partition_id = e.entity_id AND h.released_at > e.created_at)))
    OR (e.kind = 'danger' AND e.entity_type = 'sender' AND (e.action = 'pause' OR EXISTS (
        SELECT 1 FROM email_health_events r
        WHERE r.org_id = e.org_id AND r.kind = 'release' AND r.entity_type = 'sender'
          AND r.entity_id IS NOT DISTINCT FROM e.entity_id AND r.created_at > e.created_at)))
)`;

/**
 * 확인할 문제 — 최근 days일 발송 경고 사건(명단·발신 주소 위험, 인증 실패 폭주, 자동 멈춤 상한, NHN 결과 확인 장애)과
 * 기간이 지났어도 지금 보류 중인 명단·자동 멈춤인 주소의 사건. 하루 요약·풀림·회복 글과 끝난 사건(SETTLED_SQL)은 뺀다.
 * 같은 대상은 마지막 사건 하나만 — 마지막 사건이 끝났으면 그 대상은 안 보인다.
 * 사업부(workspaceId)를 주면 그 사업부 알림에 든 사건 + 조직 공통 사건(연동·인증·상한·어느 사업부에도 속하지 않는 사건).
 * 지금 진행 중인 것 먼저, 그다음 최근 순.
 */
export async function listHealthProblems(orgId: string, opts: { workspaceId: number | null; days: number }): Promise<HealthProblem[]> {
    const ws = opts.workspaceId;
    const rows = await q<Row>(sql`
        WITH ev AS (
            SELECT e.*,
                   COALESCE(
                       (SELECT array_agg(DISTINCT a.workspace_id) FROM email_health_alerts a
                        WHERE a.org_id = e.org_id AND a.workspace_id IS NOT NULL AND e.id = ANY(a.event_ids)),
                       CASE WHEN e.workspace_id IS NOT NULL THEN ARRAY[e.workspace_id] END
                   ) AS ws_ids,
                   ${ACTIVE_SQL} AS active,
                   ${SETTLED_SQL} AS settled
            FROM email_health_events e
            WHERE e.org_id = ${orgId}::uuid
              AND e.kind IN ${PROBLEM_KINDS_SQL}
              AND NOT (e.kind = 'sync' AND COALESCE(e.metrics->>'cause', '') IN ('recovered', 'never_recovered'))
        ),
        scoped AS (
            SELECT *, (kind IN ${COMMON_KINDS_SQL} OR ws_ids IS NULL) AS common FROM ev
        ),
        latest AS (
            SELECT DISTINCT ON (kind, entity_type, COALESCE(entity_id, -1), COALESCE(entity_key, '')) *
            FROM scoped
            WHERE (active OR created_at >= now() - make_interval(days => ${opts.days}::int))
              AND (${ws}::int IS NULL OR common OR ${ws}::int = ANY(ws_ids))
            ORDER BY kind, entity_type, COALESCE(entity_id, -1), COALESCE(entity_key, ''), id DESC
        )
        SELECT l.id, l.kind, l.entity_type, l.entity_id, l.entity_key, l.workspace_id, l.action, l.action_note,
               l.eval_window, l.metrics, l.summary, l.created_at, l.active, l.common,
               (SELECT a.id FROM email_health_alerts a
                WHERE a.org_id = l.org_id AND l.id = ANY(a.event_ids)
                ORDER BY (a.workspace_id IS NOT DISTINCT FROM ${ws}::int) DESC, (a.target = 'ops') DESC, a.id DESC
                LIMIT 1) AS alert_id
        FROM latest l
        WHERE l.active OR NOT l.settled
        ORDER BY l.active DESC, l.created_at DESC, l.id DESC
        LIMIT ${PROBLEM_LIMIT}
    `);
    const linked = rows.filter((r) => r.alert_id !== null);
    const items = await focusItemsOf(orgId, linked, ws);
    return items.map((it, i) => {
        const r = linked[i];
        return {
            alertId: num(r.alert_id),
            eventId: it.eventId,
            kind: String(r.kind),
            active: r.active === true,
            common: r.common === true,
            headline: it.headline,
            detail: it.detail,
            outcome: it.outcome,
            todo: it.todo,
            devIssue: it.devIssue,
            createdAt: it.createdAt,
            mailCount: defaultCats(it).reduce((sum, c) => sum + (it.counts[c] ?? 0), 0),
        };
    });
}

export type ResolveHealthProblemResult = "ok" | "not_found" | "active";

/**
 * 확인할 문제 손으로 해결 완료 (조직 구성원 누구나). 지금 보류·멈춤 중이면 발송 다시 시작으로 끝내야 해서 막는다.
 * 같은 대상에 새 사건이 생기면(다시 나빠짐) 그 사건은 다시 보인다. 이미 끝낸 사건은 그대로 ok
 */
export async function resolveHealthProblem(orgId: string, eventId: number, userId: string): Promise<ResolveHealthProblemResult> {
    const [row] = await q<Row>(sql`
        SELECT e.id, ${ACTIVE_SQL} AS active FROM email_health_events e
        WHERE e.org_id = ${orgId}::uuid AND e.id = ${eventId}::int AND e.kind IN ${PROBLEM_KINDS_SQL}
    `);
    if (!row) return "not_found";
    if (row.active === true) return "active";
    await db.execute(sql`
        UPDATE email_health_events SET resolved_at = now(), resolved_by = ${userId}::uuid
        WHERE org_id = ${orgId}::uuid AND id = ${eventId}::int AND resolved_at IS NULL
    `);
    return "ok";
}
