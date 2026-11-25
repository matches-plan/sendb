import type { DihaRound } from "@/lib/email-experiments/diha-material";
export type AbTestMetric = "reply" | "click" | "open";
/** B 지시사항을 적용할 곳 — 제목만·첫 문장만·전체 */
export type AbTestScope = "subject" | "opening" | "all";
/** running: 집계중, A·B: 자동 판정 승, none: 차이 없음, insufficient: 표본 부족(판정 안 함·A안 유지), applied_*: 사람이 고른 안, stopped: 중단, ended: 자동 준비 실험 종료 */
export type AbTestResult = "running" | "A" | "B" | "none" | "review" | "insufficient" | "applied_A" | "applied_B" | "stopped" | "ended";

export interface ArmMetrics {
    assigned: number;
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
}

export interface AbTestRow {
    id: number;
    name: string;
    ruleId: number;
    ruleName: string | null;
    /** 규칙 수정 화면 주소용 — 규칙이 지워졌으면 null */
    rulePartitionId?: number | null;
    workspaceName: string;
    /** prompt: 규칙에서 만든 AB 테스트, policy: 자동 준비가 연 실험 */
    kind: "prompt" | "policy";
    dihaRound?: DihaRound;
    state: string;
    startedAt: string | null;
    closedAt: string | null;
    metric: AbTestMetric;
    /** prompt 실험만 */
    scope: AbTestScope | null;
    plannedPerArm: number;
    promptA: string | null;
    promptB: string | null;
    arms: { A: ArmMetrics; B: ArmMetrics };
    result: AbTestResult;
    /** 자동 판정으로 B안이 규칙에 들어갔는지 (자동 판정이 아니면 null) */
    applied: boolean | null;
    /** 지금 숫자로 95% 기준 확실히 앞서는 안 */
    significantLeader: "A" | "B" | null;
    minEnrollmentDays: number;
    maxEnrollmentDays: number;
    observationDays: number;
}

/** 규칙 화면에서 새로 추가하는 테스트 — 규칙을 저장할 때 시작한다 */
export interface AbTestDraft {
    dihaRound?: DihaRound;
    verifiedCompanies?: string;
    /** 화면에 보일 이름 — 기본 '테스트 N' */
    name: string;
    promptB: string;
    metric: AbTestMetric;
    scope: AbTestScope;
}
