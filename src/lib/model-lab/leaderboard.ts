import { findModel } from "@/lib/ai/models";
import { wilsonInterval } from "@/lib/email-experiments/rules";
import type { CopyConnection } from "@/lib/ai-copy/types";

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
interface ModelRow extends Counts {
    model: string;
    rules: number;
    avg_latency_ms: number | null;
    prompt_tokens: number;
    completion_tokens: number;
    cost_krw: number | null;
    cost_known: boolean | null;
}
interface RuleRow extends Counts {
    model: string;
    rule_id: number;
    rule_name: string | null;
    partition_id: number | null;
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

export async function loadLeaderboard(
    conn: CopyConnection,
    input: { orgId: string; days: number; workspaceId: number; ruleId: number; metric: LeaderboardMetric },
) {
    const { orgId, days, workspaceId, ruleId } = input;
    // 작성 작업은 발송보다 먼저 만들어지므로 며칠 더 넓게 본다(ai_copy_jobs_scope_idx를 탄다)
    const from = conn`
        FROM email_send_logs l
        JOIN ai_copy_generation_jobs j ON j.send_log_id = l.id AND j.org_id = l.org_id
            AND j.created_at >= now() - make_interval(days => ${days + 3}::int)
        LEFT JOIN partitions p ON p.id = l.partition_id`;
    const where = conn`
        WHERE l.org_id = ${orgId} AND l.parent_log_id IS NULL AND l.auto_personalized_link_id IS NOT NULL
            AND l.sent_at >= now() - make_interval(days => ${days}::int)
            AND (${workspaceId}::int = 0 OR p.workspace_id = ${workspaceId})
            AND (${ruleId}::int = 0 OR l.auto_personalized_link_id = ${ruleId})`;
    const counts = conn`
        count(*) FILTER (WHERE l.status = 'sent')::int AS sent,
        count(*) FILTER (WHERE l.status = 'sent' AND l.open_tracked)::int AS open_tracked,
        count(*) FILTER (WHERE l.status = 'sent' AND l.open_tracked AND EXISTS (SELECT 1 FROM email_open_logs o WHERE o.send_log_id = l.id AND o.is_machine = false))::int AS opened,
        count(*) FILTER (WHERE l.status = 'sent' AND EXISTS (SELECT 1 FROM email_click_logs c WHERE c.send_log_id = l.id AND c.is_bot = false))::int AS clicked,
        count(*) FILTER (WHERE l.status = 'sent' AND EXISTS (SELECT 1 FROM email_replies r WHERE r.send_log_id = l.id AND r.org_id = l.org_id AND r.kind = 'human'))::int AS replied`;
    const [models, rules] = await Promise.all([
        conn<ModelRow[]>`
            SELECT j.policy_snapshot->>'model' AS model,
                count(DISTINCT l.auto_personalized_link_id)::int AS rules,
                ${counts},
                avg(t.duration_ms)::int AS avg_latency_ms,
                coalesce(sum(t.prompt_tokens), 0)::float8 AS prompt_tokens,
                coalesce(sum(t.completion_tokens), 0)::float8 AS completion_tokens,
                sum(t.cost_krw)::float8 AS cost_krw,
                bool_and(t.cost_krw IS NOT NULL) AS cost_known
            ${from}
            LEFT JOIN LATERAL (
                SELECT a.duration_ms, a.prompt_tokens, a.completion_tokens, a.cost_krw
                FROM ai_copy_generation_attempts a
                WHERE a.job_id = j.id AND a.result = 'valid'
                ORDER BY a.attempt_number DESC LIMIT 1
            ) t ON true
            ${where}
            GROUP BY 1`,
        conn<RuleRow[]>`
            SELECT j.policy_snapshot->>'model' AS model, l.auto_personalized_link_id AS rule_id,
                max(rl.name) AS rule_name, max(rl.partition_id) AS partition_id,
                ${counts}
            ${from}
            LEFT JOIN email_auto_personalized_links rl ON rl.id = l.auto_personalized_link_id
            ${where}
            GROUP BY 1, 2
            ORDER BY sent DESC
            LIMIT 200`,
    ]);
    const label = (id: string) => findModel(id)?.label ?? id;
    return {
        days,
        caveat: LEADERBOARD_CAVEAT,
        minSample: MIN_SAMPLE,
        rows: rankRows(
            models.map((m) => ({
                model: m.model,
                label: label(m.model),
                rules: m.rules,
                ...summarize(m),
                avgLatencyMs: m.avg_latency_ms,
                promptTokens: m.prompt_tokens,
                completionTokens: m.completion_tokens,
                // 작성 단가표에 이 모델 단가가 없으면 비용을 모른다
                costKrw: m.cost_known ? m.cost_krw : null,
            })),
            input.metric,
        ),
        byRule: rules.map((r) => ({
            model: r.model,
            label: label(r.model),
            ruleId: r.rule_id,
            ruleName: r.rule_name,
            partitionId: r.partition_id,
            ...summarize(r),
        })),
    };
}
