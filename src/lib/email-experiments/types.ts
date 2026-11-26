export type ExperimentState =
    | "draft"
    | "evaluated"
    | "running"
    | "enrollment_closed"
    | "observing"
    | "decision_ready"
    | "closed"
    | "paused"
    | "data_check"
    | "insufficient_sample"
    | "invalidated";
export type ExperimentArm = "A" | "B";
export type ReplyIntent = "interested" | "neutral" | "rejected" | "unknown";
export interface ExperimentConfig {
    /** 없는 기존 실험은 배정 당시의 회사 단위 집계를 유지한다. */
    analysisUnit?: "recipient";
    /**
     * prompt: 규칙 수정 화면의 'AB 테스트'로 만든 실험 — A·B 집단이 각자의 AI 지시사항으로 메일을 쓴다.
     * 작성 지침·지식 버전을 쓰지 않으므로 policyAId·policyBId·knowledgeVersionId는 0이다.
     * 없으면(policy) 작성 지침 버전을 비교하는 기존 실험(자동 준비가 만든 것 포함)이다.
     */
    kind?: "policy" | "prompt" | "model";
    promptA?: string;
    promptB?: string;
    /** model: AI 모델 A/B — 지시사항은 규칙 그대로, A는 시작 때 규칙 모델, B는 후보 모델로 쓴다 */
    modelA?: string;
    modelB?: string;
    /** 이긴 안을 가르는 기준 (prompt 실험) */
    metric?: "reply" | "click" | "open";
    /** B 지시사항을 적용할 곳 (prompt 실험). 없으면 all — B가 A를 대신한다 */
    scope?: "subject" | "opening" | "all";
    subject: string;
    axis: "opening" | "question" | "tone" | "length";
    hypothesis: string;
    policyAId: number;
    policyBId: number;
    knowledgeVersionId: number;
    primaryMetric: "positive_reply_14d_itt";
    allocation: 0.5;
    alpha: 0.05;
    power: 0.8;
    baselineRate: number;
    minimumDetectableEffect: number;
    plannedPerArm: number;
    minimumPracticalDifference: number;
    minEnrollmentDays: 14;
    maxEnrollmentDays: 42;
    observationDays: 14;
    meetingDays: 30;
    replySource: "connected" | "manual";
    manualCollectionOwnerId: string | null;
    guardrails: {
        rejectionRate: number;
        unsubscribeRate: number;
        generationFailureRate: number;
        baselineNote: string;
    };
    ruleSnapshot: Record<string, unknown>;
    ruleFingerprint: string;
}
export interface Experiment {
    id: number;
    org_id: string;
    workspace_id: number;
    rule_id: number;
    name: string;
    state: ExperimentState;
    config: ExperimentConfig;
    started_at: Date | null;
    enrollment_closed_at: Date | null;
    closed_at: Date | null;
    pending_mode: "continue" | "hold";
    paused_from: ExperimentState | null;
    invalidation_reason: string | null;
}
export interface Assignment {
    id: number;
    experiment_id: number;
    org_id: string;
    workspace_id: number;
    normalized_email: string;
    customer_key: string;
    arm: ExperimentArm;
    cohort: "primary" | "exploratory";
    company_key: string | null;
    record_id: number;
    initial_scheduled_at: Date;
    planned_sender_id: number | null;
    actual_sender_id: number | null;
    stratum: string;
    planned_sender_email: string | null;
    actual_sender_email: string | null;
    assigned_at: Date;
    send_log_id: number | null;
    actual_sent_at: Date | null;
    generation_job_id: number | null;
}
export interface ExperimentObservation {
    assignmentId: number;
    arm: ExperimentArm;
    cohort: Assignment["cohort"];
    scheduledAt: Date;
    sentAt: Date | null;
    generated: boolean;
    generationFailed: boolean;
    unsubscribed: boolean;
    contaminated: boolean;
    replies: { eventAt: Date; intent: ReplyIntent }[];
    meetings: Date[];
}
export interface ArmSummary {
    assigned: number;
    matured: number;
    generated: number;
    generationFailures: number;
    sent: number;
    humanReplies: number;
    positive: number;
    unknown: number;
    rejected: number;
    unsubscribed: number;
    contaminated: number;
    humanReplyEvents: number;
    unclassifiedReplies: number;
    actualSendMatured: number;
    actualSendPositive: number;
    meetings30d: number;
    meetingMatured: number;
    positiveRate: number | null;
    classificationCoverage: number | null;
    actualSendPositiveRate: number | null;
}
