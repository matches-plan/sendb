/**
 * AB 테스트 — 규칙 수정 화면에서 켜는 지시사항 A/B 비교 (prompt 실험).
 * 기존 실험 엔진(email_copy_experiments·assignments·모집/관찰 단계)을 그대로 쓰고,
 * 작성 지침·지식 버전 대신 A·B 지시사항 원문을 실험 조건에 담는다. 조건은 바꿀 수 없으므로(트리거) 바뀌면 새 실험을 만든다.
 */
import type { CopyConnection } from "../ai-copy/types";
import { fingerprint } from "../ai-copy/rules";
import { copyTransaction } from "../ai-copy/generation";
import { CopyActionError } from "../ai-copy/errors";
import { experimentEvent, loadExperimentRule, ruleSnapshotOf } from "./repository";
import { ACTIVE_EXPERIMENT_STATES } from "./rules";
import { plannedSamplePerArm } from "./sample-size";
import type { Experiment, ExperimentConfig } from "./types";
import { normalizeScope, scopedPrompt, type PromptTestScope } from "./prompt-scope";
import { promptTestVerdict, type PromptTestMetric } from "./prompt-decision";
import { AI_MODELS, DEFAULT_MODEL_ID } from "../ai/models";
import { modelUnavailableReason } from "../ai/client";

export type { PromptTestMetric } from "./prompt-decision";

/** 안마다 최소 발송 수 — 계산값이 더 작아도(오픈률처럼 기준값이 높을 때) 이보다 적게 보고는 판정하지 않는다 */
const MIN_PER_ARM = 100;

/** 규칙 화면의 AB 테스트 — 지시사항 비교(prompt)와 AI 모델 비교(model) */
const isAbTest = (experiment: Experiment | undefined) => experiment?.config.kind === "prompt" || experiment?.config.kind === "model";

async function closeExperiment(conn: CopyConnection, experiment: Experiment, actor: { orgId: string; userId: string }, action: string, now: Date) {
    await conn`UPDATE email_copy_experiments SET state='closed',closed_at=${now.toISOString()},pending_mode='continue',
        enrollment_closed_at=COALESCE(enrollment_closed_at,${now.toISOString()}) WHERE id=${experiment.id}`;
    await experimentEvent(conn, { ...actor, experimentId: experiment.id, action, detail: { from: experiment.state } });
}

/** 지난 90일 이 규칙 첫 메일의 회신률·클릭률·오픈률 — 필요한 표본 수를 계산하는 기준. 자료가 적으면 흔한 값으로 */
async function baselineRate(conn: CopyConnection, orgId: string, ruleId: number, metric: PromptTestMetric) {
    const [row] = await conn<{ sent: number; hit: number }[]>`
        SELECT count(*)::int AS sent,
            count(*) FILTER (WHERE ${metric === "click"}
                AND EXISTS (SELECT 1 FROM email_click_logs c WHERE c.send_log_id = l.id AND c.is_bot = false)
                OR ${metric === "reply"}
                AND EXISTS (SELECT 1 FROM email_replies r WHERE r.send_log_id = l.id AND r.org_id = l.org_id AND r.kind = 'human')
                OR ${metric === "open"}
                AND EXISTS (SELECT 1 FROM email_open_logs o WHERE o.send_log_id = l.id AND o.is_machine = false))::int AS hit
        FROM email_send_logs l
        WHERE l.org_id = ${orgId} AND l.auto_personalized_link_id = ${ruleId} AND l.parent_log_id IS NULL
          AND l.status = 'sent' AND l.sent_at >= now() - interval '90 days'`;
    const fallback = metric === "open" ? 0.3 : metric === "click" ? 0.05 : 0.02;
    const rate = row && row.sent >= 200 ? row.hit / row.sent : fallback;
    return Math.min(Math.max(rate, 0.005), 0.5);
}

/**
 * 규칙 저장 뒤 AB 테스트를 맞춘다. 한 규칙에 진행 중인 AB 테스트는 하나다 (수신자를 규칙 단위로 나누기 때문).
 * - 진행 중 테스트의 A안(시작 때 규칙 지시사항)과 지금 규칙 지시사항이 다르면 그 테스트를 중단한다
 * - start가 있으면 새 테스트를 시작한다. 진행 중인 AB 테스트가 남아 있으면 막는다
 * 같은 규칙에 자동 준비가 연 지침 비교 실험이 있으면 AB 테스트를 시작할 때 닫는다 — 한 규칙에 실험은 하나다
 * 비교 기준(axis)은 더 받지 않는다. 예전 실험 config의 axis는 읽기만 한다.
 */
export async function syncPromptTest(
    conn: CopyConnection,
    input: {
        orgId: string; userId: string; ruleId: number;
        start?: { kind?: "prompt" | "model"; promptB?: string; modelB?: string; metric?: PromptTestMetric; scope?: PromptTestScope; name?: string | null } | null;
        now: Date;
    },
) {
    return copyTransaction(conn, async () => {
        await conn`SELECT pg_advisory_xact_lock(1760824303,hashtext(${input.orgId}))`;
        const [ruleRow] = await conn<{ workspace_id: number; prompt: string | null; name: string | null; model: string | null }[]>`
            SELECT p.workspace_id, l.prompt, l.name, l.model FROM email_auto_personalized_links l JOIN partitions p ON p.id = l.partition_id
            WHERE l.id = ${input.ruleId} AND l.org_id = ${input.orgId}`;
        if (!ruleRow) throw new CopyActionError("규칙을 찾을 수 없습니다.");
        const found = await conn<Experiment[]>`SELECT * FROM email_copy_experiments
            WHERE org_id = ${input.orgId} AND workspace_id = ${ruleRow.workspace_id} AND rule_id = ${input.ruleId}
              AND state = ANY(${ACTIVE_EXPERIMENT_STATES}) FOR UPDATE`;
        let active: Experiment | undefined = found[0];
        const actor = { orgId: input.orgId, userId: input.userId };
        const promptA = (ruleRow.prompt ?? "").trim();
        let stopped: number | null = null;
        // A안을 바꿔 저장하면 진행 중 테스트는 더 이상 같은 비교가 아니다
        if (active?.config.kind === "prompt" && (active.config.promptA ?? "").trim() !== promptA) {
            await closeExperiment(conn, active, actor, "ab_test_prompt_changed", input.now);
            stopped = active.id;
            active = undefined;
        }
        // 모델 A/B 중 규칙의 AI 모델(A안)을 바꿔 저장해도 같은 비교가 아니다
        const modelA = ruleRow.model || DEFAULT_MODEL_ID;
        if (active?.config.kind === "model" && active.config.modelA !== modelA) {
            await closeExperiment(conn, active, actor, "ab_test_model_changed", input.now);
            stopped = active.id;
            active = undefined;
        }
        if (!input.start) return { experimentId: isAbTest(active) ? active!.id : null, stopped };
        if (isAbTest(active)) throw new CopyActionError("진행 중인 AB 테스트가 끝난 뒤 추가할 수 있습니다.");
        const kind = input.start.kind === "model" ? "model" : "prompt";
        const promptB = (input.start.promptB ?? "").trim();
        const modelB = (input.start.modelB ?? "").trim();
        const metric: PromptTestMetric = input.start.metric === "click" || input.start.metric === "open" ? input.start.metric : "reply";
        const scope = kind === "model" ? "all" : normalizeScope(input.start.scope);
        if (kind === "prompt") {
            if (!promptA || !promptB) throw new CopyActionError("A안과 B안 AI 지시사항을 모두 입력해 주세요.");
            if (scope === "all" && promptA === promptB) throw new CopyActionError("B안 지시사항이 A안과 같습니다.");
        } else {
            if (!AI_MODELS.some((m) => m.id === modelB)) throw new CopyActionError("비교할 AI 모델을 골라 주세요.");
            if (modelB === modelA) throw new CopyActionError("B안 모델이 지금 규칙의 AI 모델과 같습니다.");
            const unavailable = modelUnavailableReason(modelB);
            if (unavailable) throw new CopyActionError(unavailable);
            // 승인된 작성 버전에 묶인 규칙은 버전의 모델로 쓰므로 규칙 모델을 나눠도 비교가 안 된다
            const [bound] = await conn`SELECT 1 FROM ai_copy_bindings WHERE org_id = ${input.orgId} AND rule_id = ${input.ruleId} AND purpose = 'initial_email' LIMIT 1`;
            if (bound) throw new CopyActionError("이 규칙은 승인된 작성 버전으로 써서 모델 A/B를 할 수 없습니다. 작성 버전에서 모델을 바꿔 비교해 주세요.");
        }
        if (active) await closeExperiment(conn, active, actor, "replaced_by_ab_test", input.now);

        const rule = await loadExperimentRule(conn, input.orgId, ruleRow.workspace_id, input.ruleId);
        const snapshot = ruleSnapshotOf(rule);
        const baseline = await baselineRate(conn, input.orgId, input.ruleId, metric);
        const mde = Math.max(baseline * 0.5, 0.01);
        const config: ExperimentConfig = {
            kind,
            promptA,
            ...(kind === "prompt" ? { promptB } : { modelA, modelB }),
            metric,
            scope,
            analysisUnit: "recipient",
            subject: "",
            // 타입 호환용 고정값 — 화면에서 더 고르지 않는다
            axis: "opening",
            hypothesis: "",
            policyAId: 0,
            policyBId: 0,
            knowledgeVersionId: 0,
            primaryMetric: "positive_reply_14d_itt",
            allocation: 0.5,
            alpha: 0.05,
            power: 0.8,
            baselineRate: baseline,
            minimumDetectableEffect: mde,
            plannedPerArm: Math.max(MIN_PER_ARM, plannedSamplePerArm(baseline, mde)),
            minimumPracticalDifference: 0,
            minEnrollmentDays: 14,
            maxEnrollmentDays: 42,
            observationDays: 14,
            meetingDays: 30,
            replySource: "connected",
            manualCollectionOwnerId: null,
            guardrails: { rejectionRate: 1, unsubscribeRate: 1, generationFailureRate: 1, baselineNote: "" },
            ruleSnapshot: snapshot,
            ruleFingerprint: fingerprint(snapshot),
        };
        const [experiment] = await conn<Experiment[]>`
            INSERT INTO email_copy_experiments(org_id,workspace_id,rule_id,name,config,config_fingerprint,created_by,state,started_at)
            VALUES(${input.orgId},${ruleRow.workspace_id},${input.ruleId},${input.start.name?.trim() || `AB 테스트 · ${ruleRow.name ?? `규칙 ${input.ruleId}`}`},
                ${JSON.stringify(config)}::jsonb,${fingerprint(config)},${input.userId},'running',${input.now.toISOString()}) RETURNING *`;
        await experimentEvent(conn, {
            ...actor, experimentId: experiment.id, action: "ab_test_started",
            detail: { kind, metric, scope, plannedPerArm: config.plannedPerArm, ...(kind === "model" ? { modelA, modelB } : {}) },
        });
        return { experimentId: experiment.id, stopped };
    });
}

/** 진행 중인 AB 테스트 중단 — 이미 배정된 수신자도 이후엔 규칙 지시사항(A안)으로 보낸다 */
export async function stopPromptTest(conn: CopyConnection, input: { orgId: string; userId: string; id: number; now: Date }) {
    return copyTransaction(conn, async () => {
        const [experiment] = await conn<Experiment[]>`SELECT * FROM email_copy_experiments WHERE id = ${input.id} AND org_id = ${input.orgId} FOR UPDATE`;
        if (!experiment || !isAbTest(experiment)) throw new CopyActionError("AB 테스트를 찾을 수 없습니다.");
        if (experiment.state === "closed" || experiment.state === "invalidated") throw new CopyActionError("이미 끝난 AB 테스트입니다.");
        await closeExperiment(conn, experiment, { orgId: input.orgId, userId: input.userId }, "ab_test_stopped", input.now);
        return { stopped: true };
    });
}

/** AB 테스트 이름 바꾸기 — 실험 조건(config)이 아니라서 트리거에 막히지 않는다 */
export async function renamePromptTest(conn: CopyConnection, input: { orgId: string; userId: string; id: number; name: string }) {
    const name = input.name.trim();
    if (!name) throw new CopyActionError("이름을 입력해 주세요.");
    return copyTransaction(conn, async () => {
        const [experiment] = await conn<Experiment[]>`SELECT * FROM email_copy_experiments WHERE id = ${input.id} AND org_id = ${input.orgId} FOR UPDATE`;
        if (!experiment || !isAbTest(experiment)) throw new CopyActionError("AB 테스트를 찾을 수 없습니다.");
        if (experiment.name === name) return { name };
        await conn`UPDATE email_copy_experiments SET name = ${name} WHERE id = ${input.id}`;
        await experimentEvent(conn, { orgId: input.orgId, userId: input.userId, experimentId: input.id, action: "ab_test_renamed", detail: { from: experiment.name, to: name } });
        return { name };
    });
}

/** B안을 이 규칙의 지시사항으로 — 제목만·첫 문장만 바꾼 B는 테스트 때 보낸 그대로(A 지시사항 + 그 부분 지시) */
const winnerPrompt = (experiment: Experiment, arm: "A" | "B") => {
    const { promptA, promptB, scope } = experiment.config;
    return arm === "A" ? promptA : promptB ? scopedPrompt(promptA ?? "", promptB, scope) : promptB;
};

/**
 * 자동 판정 — 모집(안마다 필요한 발송 + 최소 14일, 늦어도 42일)이 끝나고 마지막 배정 뒤 14일 관찰이 지난 AB 테스트를
 * 95% 기준으로 판정해 닫는다. B가 확실히 나으면 B안을 규칙에 넣고, A가 낫거나 차이가 없으면 A(규칙 그대로)를 둔다.
 * 42일 안에 필요한 발송을 못 채운 테스트(insufficient_sample)는 관찰을 기다리지 않고 '표본 부족'으로 바로 닫는다 — 승패를 계산하지 않고 A안을 둔다.
 * advanceExperimentLifecycles 안(같은 트랜잭션)에서 부른다 — 그래서 여기서는 트랜잭션을 따로 열지 않는다.
 */
export async function decidePromptTests(conn: CopyConnection, now: Date, orgId?: string) {
    const ready = await conn<Experiment[]>`SELECT e.* FROM email_copy_experiments e
        WHERE e.config->>'kind' IN ('prompt', 'model')
          AND (${orgId ?? null}::uuid IS NULL OR e.org_id = ${orgId ?? null}::uuid)
          AND e.enrollment_closed_at IS NOT NULL
          AND (e.state = 'insufficient_sample' OR e.state = 'decision_ready'
              AND NOT EXISTS (SELECT 1 FROM email_copy_assignments a WHERE a.experiment_id = e.id AND a.cohort = 'primary'
                  AND a.initial_scheduled_at + make_interval(days => COALESCE((e.config->>'observationDays')::int, 14)) > ${now.toISOString()}::timestamptz))
        FOR UPDATE`;
    if (ready.length === 0) return { decided: 0 };
    let decided = 0;
    for (const experiment of ready) {
        const arms = (await armMetrics(conn, experiment.org_id, [experiment.id])).get(experiment.id)!;
        const metric = experiment.config.metric ?? "reply";
        const insufficient = experiment.state === "insufficient_sample";
        const { winner, effect } = insufficient ? { winner: null, effect: null } : promptTestVerdict(arms, metric);
        let applied = false;
        if (winner === "B" && experiment.config.kind === "model") {
            // B 모델이 확실히 나으면 규칙 모델을 B로. 그 사이 사람이 모델을 바꿨거나 B 연결이 끊겼으면 두지 않는다
            const modelB = experiment.config.modelB ?? "";
            if (!modelUnavailableReason(modelB)) {
                const updated = await conn`UPDATE email_auto_personalized_links SET model = ${modelB}, updated_at = now()
                    WHERE id = ${experiment.rule_id} AND org_id = ${experiment.org_id} AND coalesce(model, ${DEFAULT_MODEL_ID}) = ${experiment.config.modelA ?? DEFAULT_MODEL_ID}
                    RETURNING id`;
                applied = updated.length > 0;
            }
        } else if (winner === "B") {
            const prompt = winnerPrompt(experiment, "B");
            // 테스트 중에 사람이 지시사항을 바꿨다면 덮어쓰지 않는다 (보통은 저장 때 테스트가 먼저 중단된다)
            const updated = await conn`UPDATE email_auto_personalized_links SET prompt = ${prompt ?? null}, needs_review = 0, updated_at = now()
                WHERE id = ${experiment.rule_id} AND org_id = ${experiment.org_id} AND btrim(coalesce(prompt, '')) = ${(experiment.config.promptA ?? "").trim()}
                RETURNING id`;
            applied = updated.length > 0;
        }
        await conn`UPDATE email_copy_experiments SET state='closed',closed_at=${now.toISOString()},pending_mode='continue',
            enrollment_closed_at=COALESCE(enrollment_closed_at,${now.toISOString()}) WHERE id=${experiment.id}`;
        await experimentEvent(conn, {
            orgId: experiment.org_id, experimentId: experiment.id, action: "ab_test_decided",
            detail: {
                result: insufficient ? "insufficient" : winner ?? "none",
                applied, metric, arms, effect, plannedPerArm: experiment.config.plannedPerArm, from: experiment.state,
            },
        });
        decided++;
    }
    return { decided };
}

/** 고른 안(A·B)의 지시사항(모델 A/B면 AI 모델)을 규칙에 넣고 테스트를 닫는다 */
export async function applyPromptTestArm(
    conn: CopyConnection,
    input: { orgId: string; userId: string; id: number; arm: "A" | "B"; now: Date },
) {
    return copyTransaction(conn, async () => {
        const [experiment] = await conn<Experiment[]>`SELECT * FROM email_copy_experiments WHERE id = ${input.id} AND org_id = ${input.orgId} FOR UPDATE`;
        if (!experiment || !isAbTest(experiment)) throw new CopyActionError("AB 테스트를 찾을 수 없습니다.");
        if (experiment.state === "closed" || experiment.state === "invalidated") throw new CopyActionError("이미 끝난 AB 테스트입니다.");
        if (experiment.config.kind === "model") {
            const model = (input.arm === "A" ? experiment.config.modelA : experiment.config.modelB) ?? DEFAULT_MODEL_ID;
            const unavailable = modelUnavailableReason(model);
            if (unavailable) throw new CopyActionError(unavailable);
            await conn`UPDATE email_auto_personalized_links SET model = ${model}, updated_at = now()
                WHERE id = ${experiment.rule_id} AND org_id = ${input.orgId}`;
            await closeExperiment(conn, experiment, { orgId: input.orgId, userId: input.userId }, `applied_${input.arm.toLowerCase()}`, input.now);
            return { applied: input.arm, prompt: null, model };
        }
        const prompt = winnerPrompt(experiment, input.arm);
        await conn`UPDATE email_auto_personalized_links SET prompt = ${prompt ?? null}, needs_review = 0, updated_at = now()
            WHERE id = ${experiment.rule_id} AND org_id = ${input.orgId}`;
        await closeExperiment(conn, experiment, { orgId: input.orgId, userId: input.userId }, `applied_${input.arm.toLowerCase()}`, input.now);
        return { applied: input.arm, prompt: prompt ?? null };
    });
}

export interface ArmMetrics {
    assigned: number;
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
}

/** 실험별·집단별 첫 메일 성과 — 배정된 수신자에게 실제로 나간 메일 기준 */
export async function armMetrics(conn: CopyConnection, orgId: string, experimentIds: number[]) {
    const out = new Map<number, { A: ArmMetrics; B: ArmMetrics }>();
    if (experimentIds.length === 0) return out;
    const rows = await conn<(ArmMetrics & { experiment_id: number; arm: "A" | "B" })[]>`
        SELECT a.experiment_id, a.arm,
            count(*)::int AS assigned,
            count(l.id) FILTER (WHERE l.status = 'sent')::int AS sent,
            count(l.id) FILTER (WHERE l.status = 'sent' AND EXISTS (SELECT 1 FROM email_open_logs o WHERE o.send_log_id = l.id AND o.is_machine = false))::int AS opened,
            count(l.id) FILTER (WHERE l.status = 'sent' AND EXISTS (SELECT 1 FROM email_click_logs c WHERE c.send_log_id = l.id AND c.is_bot = false))::int AS clicked,
            count(l.id) FILTER (WHERE EXISTS (SELECT 1 FROM email_replies r WHERE r.send_log_id = l.id AND r.org_id = l.org_id AND r.kind = 'human'))::int AS replied
        FROM email_copy_assignments a
        LEFT JOIN email_send_logs l ON l.id = a.send_log_id AND l.org_id = a.org_id
        WHERE a.org_id = ${orgId} AND a.experiment_id = ANY(${experimentIds}) AND a.cohort = 'primary'
        GROUP BY a.experiment_id, a.arm`;
    const empty = (): ArmMetrics => ({ assigned: 0, sent: 0, opened: 0, clicked: 0, replied: 0 });
    for (const id of experimentIds) out.set(id, { A: empty(), B: empty() });
    for (const r of rows) {
        out.get(r.experiment_id)![r.arm] = { assigned: r.assigned, sent: r.sent, opened: r.opened, clicked: r.clicked, replied: r.replied };
    }
    return out;
}
