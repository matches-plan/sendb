import type { AbTestMetric, AbTestResult, AbTestRow, AbTestScope, ArmMetrics } from "../types";

/** 테스트할 곳(제목만·첫 문장·전체) 칸 이름 */
export const SCOPE_FIELD_LABEL = "테스트 선택";

/** AB 테스트 판정 방식 — 규칙 화면·콜드메일통계 AB 테스트 탭의 i 툴팁 */
export const DECISION_TIP = [
    "받는 사람을 반씩 나눠 A안·B안을 보내요.",
    "각 안이 필요한 발송 수(테스트에 표시)를 채우고 14일이 지나면, 회신을 14일 더 기다린 뒤 자동으로 승패를 정해요.",
    "42일 안에 필요한 발송 수를 못 채우면 '표본 부족'으로 끝나고 A안을 그대로 써요.",
    "B안이 확실히 나으면 B안으로 바꾸고, 아니면 A안을 그대로 써요.",
].join(" ");

/** 콜드메일통계 AB 테스트 탭 i 툴팁 — 판정 방식 + 평가 기준 */
export const AB_STATS_TIP = [
    DECISION_TIP,
    "",
    "평가 기준",
    "회신률: 회신 수 ÷ 발송 수",
    "클릭률: 링크 클릭 수 ÷ 발송 수",
    "오픈률: 메일 열람 수 ÷ 발송 수 (자동 열람이 섞여 회신률을 같이 봐요)",
    "필요 발송 수는 그 규칙의 평소 비율로 정해져요. 회신률·클릭률은 안마다 수천 통, 오픈률은 수백 통 정도예요.",
].join("\n");
export const SCOPE_LABELS: Record<AbTestScope, string> = {
    subject: "제목만",
    opening: "첫 문장",
    all: "전체",
};
/** B 지시사항 칸 이름 — 테스트 선택에 맞춘다 */
export const SCOPE_PROMPT_LABELS: Record<AbTestScope, string> = {
    subject: "B안 제목 지시",
    opening: "B안 첫 문장 지시",
    all: "B안 AI 지시사항",
};
export const METRIC_LABELS: Record<AbTestMetric, string> = {
    open: "오픈률",
    reply: "회신률",
    click: "클릭률",
};
/** 테스트 선택마다 고를 수 있는 평가 기준 (첫 값이 기본) */
export const SCOPE_METRICS: Record<AbTestScope, AbTestMetric[]> = {
    subject: ["open", "reply", "click"],
    opening: ["reply", "click"],
    all: ["reply", "click"],
};

export const RESULT_LABELS: Record<AbTestResult, string> = {
    running: "집계중",
    A: "A 승",
    B: "B 승",
    none: "차이 없음",
    review: "사업 성과 확인",
    insufficient: "표본 부족",
    applied_A: "A 적용",
    applied_B: "B 적용",
    stopped: "중단",
    ended: "종료",
};
/** 결과 배지 모양 — 진행 중은 채움, 승은 강조 테두리, 표본 부족은 주황, 나머지는 흐리게 */
export const resultBadgeClass = (result: AbTestResult) =>
    result === "running"
        ? "bg-primary text-primary-foreground border-transparent"
        : result === "A" || result === "B" || result === "applied_A" || result === "applied_B"
          ? "border-primary/40 text-primary"
          : result === "insufficient"
            ? "border-amber-500/40 text-amber-600 dark:text-amber-400"
            : "text-muted-foreground";

export const pct = (n: number, d: number) => (d === 0 ? "—" : `${((n / d) * 100).toFixed(1)}%`);
export const shortDay = (v: string | null) => (v ? new Date(v).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" }) : "");

export const metricCount = (m: ArmMetrics, metric: AbTestMetric) =>
    metric === "click" ? m.clicked : metric === "open" ? m.opened : m.replied;

const metricValue = (m: ArmMetrics, metric: AbTestMetric) => (m.sent === 0 ? null : metricCount(m, metric) / m.sent);

/** 앞서는 안 — 평가 기준 비율이 높은 쪽. 아직 둘 다 보낸 게 없거나 같으면 없음 */
export function leaderOf(test: Pick<AbTestRow, "arms" | "metric">): "A" | "B" | null {
    const a = metricValue(test.arms.A, test.metric), b = metricValue(test.arms.B, test.metric);
    if (a === null || b === null || a === b) return null;
    return a > b ? "A" : "B";
}

/** 끝난 테스트에서 강조할 안 — 판정·적용된 안 */
export const winnerOf = (test: Pick<AbTestRow, "result">): "A" | "B" | null =>
    test.result === "A" || test.result === "applied_A" ? "A" : test.result === "B" || test.result === "applied_B" ? "B" : null;

/** 규칙 화면의 테스트 이름 — 이름을 바꾸지 않은 예전 테스트('AB 테스트 · 규칙명')는 '테스트 N' */
export const abTestDisplayName = (test: Pick<AbTestRow, "name">, index: number) =>
    !test.name || test.name.includes("AB 테스트 · ") ? `테스트 ${index}` : test.name;

/**
 * 판정 규칙 한 줄 — 모집 중: "안마다 필요 발송 1,926통 중 412통 · 14일째 (최대 42일)"
 * 모집이 끝나 회신을 기다리는 중: "발송 마감 · 회신 14일 기다린 뒤 자동 판정"
 */
export function decisionRuleText(test: AbTestRow) {
    if (test.dihaRound) return `안별 배정 A ${test.arms.A.assigned.toLocaleString()}명 · B ${test.arms.B.assigned.toLocaleString()}명 · 실제 방문·가입 ${test.observationDays}일 관찰`;
    if (test.state !== "running" && test.state !== "paused") return `발송 마감 · 회신 ${test.observationDays}일 기다린 뒤 자동 판정`;
    // 모집은 두 안 모두 필요한 수를 채워야 끝난다 — 덜 보낸 쪽 기준
    const progress = Math.min(test.arms.A.assigned, test.arms.B.assigned);
    const days = test.startedAt ? Math.floor((Date.now() - new Date(test.startedAt).getTime()) / 86400000) : 0;
    return `안마다 필요 발송 ${test.plannedPerArm.toLocaleString()}통 중 ${progress.toLocaleString()}통 · ${days}일째 (최대 ${test.maxEnrollmentDays}일)`;
}
