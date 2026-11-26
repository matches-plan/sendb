import { findModel } from "@/lib/ai/models";
import { wilsonInterval } from "@/lib/email-experiments/rules";
import type { CopyConnection } from "@/lib/ai-copy/types";
import { copyTransaction } from "@/lib/ai-copy/generation";

// 모델별 성과 순위표. 어느 모델이 어느 메일을 썼는지는 작성 작업(ai_copy_generation_jobs)의 정책 스냅샷에 있고,
// 발송 뒤 jobs.send_log_id로 발송 기록과 이어진다. 오픈·클릭·회신 조건은 AB 테스트 집계(armMetrics)와 같다.
// 첫 메일만 본다(후속 메일은 작성 작업을 남기지 않는다).

export const MIN_SAMPLE = 100;
export const LEADERBOARD_CAVEAT = "규칙·시기·받는 사람이 다른 모델끼리의 비교는 참고용입니다. 확실한 비교는 같은 규칙의 모델 A/B로 하세요.";

interface Counts {
    sent: number;
    open_tracked: number;
    opened: number;
    clicked: number;
    replied: number;
}
/** 모델·규칙 한 쌍의 집계 — 모델별 합계는 이것을 더해 만든다(무거운 조인을 한 번만 돈다) */
interface PairRow extends Counts {
    model: string;
    rule_id: number;
    rule_name: string | null;
    partition_id: number | null;
    latency_ms_sum: number;
    latency_count: number;
    prompt_tokens: number;
    completion_tokens: number;
    cost_krw: number | null;
    cost_known: boolean | null;
}

function rate(successes: number, total: number) {
    return { rate: total > 0 ? successes / total : null, ci: wilsonInterval(successes, total) };
}

/** 오픈률 분모는 오픈 추적이 켜진 발송, 클릭·회신 분모는 발송 */
export function summarize(row: Counts) {
    return {
        sent: row.sent,
        openTracked: row.open_tracked,
        opened: row.opened,
        clicked: row.clicked,
        replied: row.replied,
        open: rate(row.opened, row.open_tracked),
        click: rate(row.clicked, row.sent),
        reply: rate(row.replied, row.sent),
        sampleOk: row.sent >= MIN_SAMPLE,
    };
}

export type LeaderboardMetric = "open" | "click" | "reply";

/** 표본이 충분한 행을 먼저, 그 안에서 고른 지표가 높은 순 */
export function rankRows<T extends { sampleOk: boolean } & Record<LeaderboardMetric, { rate: number | null }>>(rows: T[], metric: LeaderboardMetric) {
    return [...rows].sort((a, b) => Number(b.sampleOk) - Number(a.sampleOk) || (b[metric].rate ?? -1) - (a[metric].rate ?? -1));
}

// 발송 수만 건을 훑는 조회라 몇십 초 걸린다 — 조직·기간·필터별로 10분 동안 결과를 재사용하고, 한 번에 1분을 넘기지 않게 끊는다
const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { at: number; pairs: PairRow[] }>();

async function loadPairs(conn: CopyConnection, input: { orgId: string; days: number; workspaceId: number; ruleId: number }) {
    const key = `${input.orgId}:${input.days}:${input.workspaceId}:${input.ruleId}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.pairs;
    const { orgId, days, workspaceId, ruleId } = input;
    const pairs = await copyTransaction(conn, async () => {
        await conn`SET LOCAL statement_timeout = '60s'`;
        return conn<PairRow[]>`
            SELECT j.policy_snapshot->>'model' AS model, l.auto_personalized_link_id AS rule_id,
                max(rl.name) AS rule_name, max(rl.partition_id) AS partition_id,
                count(*) FILTER (WHERE l.status = 'sent')::int AS sent,
                count(*) FILTER (WHERE l.status = 'sent' AND l.open_tracked)::int AS open_tracked,
                count(*) FILTER (WHERE l.status = 'sent' AND l.open_tracked AND EXISTS (SELECT 1 FROM email_open_logs o WHERE o.send_log_id = l.id AND o.is_machine = false))::int AS opened,
                count(*) FILTER (WHERE l.status = 'sent' AND EXISTS (SELECT 1 FROM email_click_logs c WHERE c.send_log_id = l.id AND c.is_bot = false))::int AS clicked,
                count(*) FILTER (WHERE l.status = 'sent' AND EXISTS (SELECT 1 FROM email_replies er WHERE er.send_log_id = l.id AND er.org_id = l.org_id AND er.kind = 'human'))::int AS replied,
                coalesce(sum(t.duration_ms), 0)::float8 AS latency_ms_sum,
                count(t.duration_ms)::int AS latency_count,
                coalesce(sum(t.prompt_tokens), 0)::float8 AS prompt_tokens,
                coalesce(sum(t.completion_tokens), 0)::float8 AS completion_tokens,
                sum(t.cost_krw)::float8 AS cost_krw,
                bool_and(t.cost_krw IS NOT NULL) AS cost_known
            FROM email_send_logs l
            JOIN ai_copy_generation_jobs j ON j.send_log_id = l.id AND j.org_id = l.org_id
                AND j.created_at >= now() - make_interval(days => ${days + 3}::int)
            LEFT JOIN partitions p ON p.id = l.partition_id
            LEFT JOIN email_auto_personalized_links rl ON rl.id = l.auto_personalized_link_id
            LEFT JOIN LATERAL (
                SELECT a.duration_ms, a.prompt_tokens, a.completion_tokens, a.cost_krw
                FROM ai_copy_generation_attempts a
                WHERE a.job_id = j.id AND a.result = 'valid'
                ORDER BY a.attempt_number DESC LIMIT 1
            ) t ON true
            WHERE l.org_id = ${orgId} AND l.parent_log_id IS NULL AND l.auto_personalized_link_id IS NOT NULL
                AND l.sent_at >= now() - make_interval(days => ${days}::int)
                AND (${workspaceId}::int = 0 OR p.workspace_id = ${workspaceId})
                AND (${ruleId}::int = 0 OR l.auto_personalized_link_id = ${ruleId})
            GROUP BY 1, 2`;
    });
    const now = Date.now();
    for (const [k, v] of cache) if (now - v.at >= CACHE_MS) cache.delete(k);
    cache.set(key, { at: now, pairs });
    return pairs;
}

/** 모델·규칙 쌍을 모델별로 더한다 */
export function rollUpByModel(pairs: PairRow[]) {
    const byModel = new Map<string, PairRow & { rules: number }>();
    for (const p of pairs) {
        const m = byModel.get(p.model);
        if (!m) {
            byModel.set(p.model, { ...p, rules: 1 });
            continue;
        }
        m.rules += 1;
        for (const k of ["sent", "open_tracked", "opened", "clicked", "replied", "latency_ms_sum", "latency_count", "prompt_tokens", "completion_tokens"] as const) m[k] += p[k];
        m.cost_krw = m.cost_krw == null || p.cost_krw == null ? null : m.cost_krw + p.cost_krw;
        m.cost_known = !!m.cost_known && !!p.cost_known;
    }
    return [...byModel.values()];
}

export async function loadLeaderboard(
    conn: CopyConnection,
    input: { orgId: string; days: number; workspaceId: number; ruleId: number; metric: LeaderboardMetric },
) {
    const pairs = await loadPairs(conn, input);
    const label = (id: string) => findModel(id)?.label ?? id;
    return {
        days: input.days,
        caveat: LEADERBOARD_CAVEAT,
        minSample: MIN_SAMPLE,
        rows: rankRows(
            rollUpByModel(pairs).map((m) => ({
                model: m.model,
                label: label(m.model),
                rules: m.rules,
                ...summarize(m),
                avgLatencyMs: m.latency_count ? Math.round(m.latency_ms_sum / m.latency_count) : null,
                promptTokens: m.prompt_tokens,
                completionTokens: m.completion_tokens,
                // 작성 단가표에 이 모델 단가가 없으면 비용을 모른다
                costKrw: m.cost_known ? m.cost_krw : null,
            })),
            input.metric,
        ),
        byRule: [...pairs]
            .sort((a, b) => b.sent - a.sent)
            .slice(0, 200)
            .map((r) => ({
                model: r.model,
                label: label(r.model),
                ruleId: r.rule_id,
                ruleName: r.rule_name,
                partitionId: r.partition_id,
                ...summarize(r),
            })),
    };
}
