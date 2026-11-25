/**
 * AB 테스트(prompt 실험) 자동 판정 — 의존성 없는 계산만 둔다 (서버 판정·목록 화면·테스트가 함께 쓴다).
 * 기존 실험과 같은 95% 신뢰구간(Newcombe·Wilson, alpha 0.05)으로 B−A 차이를 본다.
 * 구간이 0을 넘으면 B 승, 0 아래면 A 승, 0을 걸치면 차이 없음.
 */
import { differenceInterval } from "./rules";

export type PromptTestMetric = "reply" | "click" | "open";
/**
 * running: 집계 중, A·B: 자동 판정 승, none: 차이 없음, insufficient: 42일 안에 필요한 발송을 못 채움(판정 안 함·A안 유지),
 * applied_A·applied_B: 사람이 고른 안, stopped: 중단, ended: 자동 준비 실험 종료
 */
export type PromptTestResult = "running" | "A" | "B" | "none" | "review" | "insufficient" | "applied_A" | "applied_B" | "stopped" | "ended";

export interface ArmCounts {
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
}

export const metricHits = (m: ArmCounts, metric: PromptTestMetric) =>
    metric === "click" ? m.clicked : metric === "open" ? m.opened : m.replied;

/** 지금 숫자로 본 판정 — 아직 판정 시점이 아니어도 '유의미한 차이인지' 안내에 쓴다 */
export function promptTestVerdict(arms: { A: ArmCounts; B: ArmCounts }, metric: PromptTestMetric) {
    const effect = differenceInterval(metricHits(arms.A, metric), arms.A.sent, metricHits(arms.B, metric), arms.B.sent);
    const winner: "A" | "B" | null = !effect ? null : effect.low > 0 ? "B" : effect.high < 0 ? "A" : null;
    return { winner, effect };
}

/** 이벤트 기록(마지막 종료 사유)과 상태로 목록에 보일 결과를 정한다 */
export function promptTestResult(input: {
    kind: "prompt" | "policy";
    state: string;
    lastAction: string | null;
    lastDetail: { result?: unknown; from?: unknown } | null;
    adopted: boolean;
}): PromptTestResult {
    if (input.state === "invalidated") return "stopped";
    if (input.state !== "closed") return "running";
    if (input.kind === "policy") return input.adopted ? "applied_B" : "ended";
    if (input.lastAction === "ab_test_decided") {
        const r = input.lastDetail?.result;
        if (r === "A" || r === "B" || r === "insufficient" || r === "review") return r;
        // 예전 판정은 표본 부족도 'none'으로 남겼다 — 모집이 표본 부족으로 끝났으면 표본 부족으로 본다
        return input.lastDetail?.from === "insufficient_sample" ? "insufficient" : "none";
    }
    if (input.lastAction === "applied_a") return "applied_A";
    if (input.lastAction === "applied_b") return "applied_B";
    return "stopped";
}
