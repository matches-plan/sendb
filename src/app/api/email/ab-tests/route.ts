import { NextRequest } from "next/server";
import { z } from "zod";
import { copyAdminApi } from "@/lib/ai-copy/api";
import { advanceExperimentLifecycles } from "@/lib/email-experiments/actions";
import { armMetrics } from "@/lib/email-experiments/prompt-tests";
import { normalizeScope } from "@/lib/email-experiments/prompt-scope";
import { promptTestResult, promptTestVerdict } from "@/lib/email-experiments/prompt-decision";
import type { Experiment } from "@/lib/email-experiments/types";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

/**
 * AB테스트 결과 목록 — 사람이 켠 AB 테스트와 자동 준비가 연 실험. 집단별 첫 메일 성과를 붙인다.
 * ruleId: 한 규칙만 (규칙 수정 화면), from·to(KST 날짜): 그 기간에 진행된 것만 (리드젠통계)
 */
export const GET = (req: NextRequest) =>
    copyAdminApi(req, async (conn, user) => {
        const params = req.nextUrl.searchParams;
        const workspaceId = z.coerce.number().int().nonnegative().parse(params.get("workspaceId") ?? 0);
        const ruleId = z.coerce.number().int().nonnegative().parse(params.get("ruleId") ?? 0);
        const from = day.parse(params.get("from") || null);
        const to = day.parse(params.get("to") || null);
        await advanceExperimentLifecycles(conn, new Date(), user.orgId);
        const rows = await conn<(Experiment & {
            rule_name: string | null; rule_partition_id: number | null; workspace_name: string; adopted_policy_id: number | null;
            last_action: string | null; last_detail: { result?: unknown; applied?: boolean } | null;
        })[]>`
            SELECT e.*, l.name AS rule_name, l.partition_id AS rule_partition_id, w.name AS workspace_name, ev.action AS last_action, ev.detail AS last_detail
            FROM email_copy_experiments e
            JOIN workspaces w ON w.id = e.workspace_id
            LEFT JOIN email_auto_personalized_links l ON l.id = e.rule_id AND l.org_id = e.org_id
            LEFT JOIN LATERAL (
                SELECT action, detail FROM email_copy_experiment_events v
                WHERE v.experiment_id = e.id AND v.action IN ('ab_test_decided', 'applied_a', 'applied_b', 'ab_test_stopped', 'ab_test_off',
                    'ab_test_changed', 'ab_test_prompt_changed', 'replaced_by_ab_test', 'close', 'adopted_b')
                ORDER BY v.id DESC LIMIT 1
            ) ev ON true
            WHERE e.org_id = ${user.orgId} AND (${workspaceId} = 0 OR e.workspace_id = ${workspaceId})
              AND (${ruleId} = 0 OR e.rule_id = ${ruleId})
              AND e.state NOT IN ('draft', 'evaluated')
              AND (${to}::date IS NULL OR e.started_at IS NULL OR e.started_at < (${to}::date + 1)::timestamp AT TIME ZONE 'Asia/Seoul')
              AND (${from}::date IS NULL OR COALESCE(e.closed_at, e.enrollment_closed_at) IS NULL
                   OR e.state NOT IN ('closed', 'invalidated')
                   OR COALESCE(e.closed_at, e.enrollment_closed_at) >= ${from}::date::timestamp AT TIME ZONE 'Asia/Seoul')
            ORDER BY (e.state = 'closed' OR e.state = 'invalidated'), e.id DESC LIMIT 100`;
        const metrics = await armMetrics(conn, user.orgId, rows.map((r) => r.id));
        return rows.map((e) => {
            const kind = e.config.kind === "prompt" ? "prompt" as const : "policy" as const;
            const arms = metrics.get(e.id)!;
            const metric = e.config.metric ?? "reply";
            const result = promptTestResult({ kind, state: e.state, lastAction: e.last_action, lastDetail: e.last_detail, adopted: e.adopted_policy_id != null });
            return {
                id: e.id,
                name: e.name,
                ruleId: e.rule_id,
                ruleName: e.rule_name,
                /** 규칙 수정 화면 주소에 필요 (?partitionId=). 규칙이 지워졌으면 null */
                rulePartitionId: e.rule_partition_id,
                workspaceName: e.workspace_name,
                kind,
                dihaRound: e.config.dihaMaterial?.round,
                state: e.state,
                startedAt: e.started_at,
                closedAt: e.closed_at ?? e.enrollment_closed_at,
                metric,
                scope: e.config.kind === "prompt" ? normalizeScope(e.config.scope) : null,
                plannedPerArm: e.config.plannedPerArm,
                promptA: e.config.promptA ?? null,
                promptB: e.config.promptB ?? null,
                arms,
                /** 집계중·A 승·B 승·차이 없음·중단 등 */
                result,
                /** 자동 판정으로 B안이 규칙에 들어갔는지 */
                applied: e.last_action === "ab_test_decided" ? e.last_detail?.applied === true : null,
                /** 지금 숫자로 본 95% 기준 우세 안 — 없으면 아직 확실한 차이 없음 */
                significantLeader: e.config.dihaMaterial ? null : promptTestVerdict(arms, metric).winner,
                minEnrollmentDays: e.config.minEnrollmentDays ?? 14,
                maxEnrollmentDays: e.config.maxEnrollmentDays ?? 42,
                observationDays: e.config.observationDays ?? 14,
            };
        });
    }, { allowMembers: true });
