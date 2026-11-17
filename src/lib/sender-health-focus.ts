/**
 * 발송 경고 알림 → 발송 이력 거르기 (순수). 알림 한 줄(email_health_alerts)에 담긴 사건마다
 * 무엇이 일어났나(머리·숫자·조치), 할 일, 그리고 발송 이력을 어떻게 거를지(명단·발신 주소·발신 도메인·기간·갈래)를 정한다.
 * DB를 모른다 — 이름·보류·멈춤 여부는 부르는 쪽(sender-health-focus-db.ts)이 채운다.
 */

/** 발송 이력에서 거를 수 있는 건강 갈래 (HEALTH_CATEGORY_SQL의 값) */
export type HealthCat = "failed" | "dsn_only" | "sender_side" | "send_reject" | "unknown";

export const HEALTH_CATS: readonly HealthCat[] = ["failed", "dsn_only", "sender_side", "send_reject", "unknown"];

export const HEALTH_CAT_LABELS: Record<HealthCat, string> = {
    failed: "반송",
    dsn_only: "반송 안내",
    sender_side: "발신 인증 실패",
    send_reject: "보낼 때 거절",
    unknown: "결과 미확인",
};

export type HealthFocusCause = "partition" | "sender" | "sender_primary" | "auth_burst" | "cap" | "sync_problem" | "sync_ok" | "release" | "other";

export interface HealthFocusScope {
    /** 비면 명단으로 거르지 않는다 */
    partitionIds: number[];
    /** 0 = 발신 프로필 없이 보낸 기본 주소, null = 거르지 않음 */
    senderProfileId: number | null;
    /** 발신 주소 도메인 (발신 인증 폭주) */
    senderDomain: string | null;
    from: string;
    to: string;
}

export interface HealthFocusItem {
    eventId: number;
    cause: HealthFocusCause;
    headline: string;
    detail: string;
    /** 자동 조치 (발송 보류·자동 멈춤·알림만 …) */
    outcome: string | null;
    todo: string;
    /** 개발팀이 고칠 문제 */
    devIssue: boolean;
    scope: HealthFocusScope;
    /** 처음 고를 갈래 (사건이 센 실패) */
    primaryCats: HealthCat[];
    /** 같이 보면 좋은 갈래 */
    relatedCats: HealthCat[];
    /** 기간·범위 안 갈래별 메일 수 (부르는 쪽이 채운다) */
    counts: Partial<Record<HealthCat, number>>;
    /** 지금 보류 중이라 풀 수 있는 명단 */
    heldPartitionId: number | null;
    /** 지금 자동 멈춤이라 풀 수 있는 발신 프로필 */
    pausedProfileId: number | null;
    createdAt: string;
}

export interface HealthEventInput {
    id: number;
    kind: string;
    entityType: string;
    entityId: number | null;
    entityKey: string | null;
    workspaceId: number | null;
    action: string;
    actionNote: string | null;
    evalWindow: string | null;
    metrics: Record<string, unknown> | null;
    summary: string;
    createdAt: Date;
}

export interface HealthFocusLookup {
    partition: (id: number) => { name: string; workspaceName: string | null } | null;
    sender: (id: number) => string | null;
    /** 보류 id → 명단 id (풀림 사건) */
    holdPartition: (holdId: number) => number | null;
    /** 지금 보류 중인 명단 */
    isHeld: (partitionId: number) => boolean;
    /** 지금 건강 확인이 멈춘 발신 프로필 */
    isAutoPaused: (profileId: number) => boolean;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const TODO = {
    partition: "주소가 틀린 메일이 많아요. 아래 실패 메일의 주소·수집 경로를 확인하고 정리하세요.",
    partitionHeld: "주소가 틀린 메일이 많아요. 아래 실패 메일의 주소·수집 경로를 확인하고 정리한 뒤 다시 시작하세요.",
    sender: "이 발신 주소로 보낸 메일이 많이 실패해요. 발신 설정을 확인하고, 계속되면 개발팀에 알려 주세요.",
    system: "시스템(인증·연동) 문제예요. 개발팀에 알려 주세요.",
    cap: "여러 주소가 한꺼번에 나빠졌어요. 시스템 문제일 수 있으니 개발팀에 알려 주세요.",
    none: "할 일은 없어요.",
    other: "아래 메일을 확인해 주세요.",
} as const;

function n(v: unknown): number | null {
    const x = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
    return Number.isFinite(x) ? x : null;
}

function dateOf(v: unknown): Date | null {
    if (typeof v !== "string" || !v) return null;
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
}

/** 500 → "5%", 1234 → "12.3%" */
export function pct(bp: number | null): string {
    if (bp === null) return "—";
    const v = Math.round(bp / 10) / 10;
    return `${Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)}%`;
}

function outcomeOf(action: string, note: string | null): string | null {
    if (action === "hold") return "발송 보류";
    if (action === "pause") return "자동 멈춤";
    switch (note) {
        case "mode":
        case "opt_out":
        case "no_profile":
            return "알림만";
        case "cap":
        case "cap_auth":
            return "상한이라 멈추지 않음";
        case "already":
            return "이미 멈춰 있음";
        case "default_sender":
            return "기본 주소라 알림만";
        case "sync_stale":
        case "sync_initial":
        case "unconfirmed_high":
            return "자동 조치 미룸";
        default:
            return null;
    }
}

function windowFrom(end: Date, ms: number, floor: Date | null): string {
    const start = new Date(end.getTime() - ms);
    return (floor && floor > start ? floor : start).toISOString();
}

function idsFromCells(v: unknown): number[] {
    if (!Array.isArray(v)) return [];
    return v.map((c) => (c && typeof c === "object" ? n((c as Record<string, unknown>).p) : n(c))).filter((x): x is number => x !== null);
}

function uniq(ids: number[]): number[] {
    return [...new Set(ids)].slice(0, 50);
}

function partitionLabel(id: number, look: HealthFocusLookup): string {
    const p = look.partition(id);
    if (!p) return `명단 ${id}`;
    return p.workspaceName ? `${p.workspaceName} · ${p.name}` : p.name;
}

function senderLabel(ev: HealthEventInput, look: HealthFocusLookup): string {
    if (ev.entityKey) return ev.entityKey;
    if (ev.entityId) return look.sender(ev.entityId) ?? `발신 주소 ${ev.entityId}`;
    return "기본 발신 주소";
}

/** 사건 하나 → 화면 설명과 거르기 (갈래별 수는 비어 있다) */
export function healthFocusOf(ev: HealthEventInput, look: HealthFocusLookup): HealthFocusItem {
    const m = ev.metrics ?? {};
    const end = ev.createdAt;
    const base = {
        eventId: ev.id,
        outcome: outcomeOf(ev.action, ev.actionNote),
        devIssue: false,
        counts: {},
        heldPartitionId: null as number | null,
        pausedProfileId: null as number | null,
        createdAt: end.toISOString(),
    };
    const scope = (s: Partial<HealthFocusScope> & { from: string }): HealthFocusScope => ({
        partitionIds: [],
        senderProfileId: null,
        senderDomain: null,
        to: end.toISOString(),
        ...s,
    });
    const floor = dateOf(m.floorAt);

    // 명단 실패율 (보류)
    if (ev.kind === "danger" && ev.entityType === "partition" && ev.entityId !== null) {
        const pid = ev.entityId;
        const days30 = ev.evalWindow === "30d";
        const held = look.isHeld(pid);
        const failed = n(m.failed) ?? 0;
        const final = n(m.final) ?? 0;
        return {
            ...base,
            cause: "partition",
            headline: partitionLabel(pid, look),
            detail: `${days30 ? "최근 30일" : "최근 7일"} 실패율 ${pct(n(m.rateBp))} (${final.toLocaleString("ko-KR")}통 중 ${failed.toLocaleString("ko-KR")}통 · 기준 5%)`,
            todo: held ? TODO.partitionHeld : TODO.partition,
            scope: scope({ partitionIds: [pid], from: windowFrom(end, days30 ? 30 * DAY_MS : 7 * DAY_MS, floor) }),
            primaryCats: ev.actionNote === "unconfirmed_high" ? ["failed", "dsn_only", "unknown"] : ["failed", "dsn_only"],
            relatedCats: ev.actionNote === "unconfirmed_high" ? ["send_reject"] : ["send_reject", "unknown"],
            heldPartitionId: held ? pid : null,
        };
    }

    // 발신 주소 실패 (명단 여럿에서 함께 높음 · 같은 명단 다른 주소보다 높음)
    if (ev.kind === "danger" && ev.entityType === "sender") {
        const pid = ev.entityId ?? 0;
        const multi = m.dangerBy !== "outlier";
        const cells = uniq(idsFromCells(multi ? m.highCells : m.outlierCells));
        const paused = pid > 0 && look.isAutoPaused(pid);
        return {
            ...base,
            cause: "sender",
            headline: senderLabel(ev, look),
            detail: multi
                ? `최근 7일 실패율 ${pct(n(m.rateBp))} · 명단 ${cells.length}개에서 5% 넘음`
                : `같은 명단의 다른 주소보다 실패가 많음 (명단 ${cells.length}개)`,
            todo: TODO.sender,
            scope: scope({ senderProfileId: pid, partitionIds: cells, from: windowFrom(end, 7 * DAY_MS, floor) }),
            primaryCats: ["failed", "dsn_only"],
            relatedCats: ["sender_side", "send_reject"],
            pausedProfileId: paused ? pid : null,
        };
    }

    // 위험 명단을 주로 보낸 주소
    if (ev.kind === "danger_with") {
        const pid = ev.entityId ?? 0;
        const parts = uniq(idsFromCells(m.partitions));
        return {
            ...base,
            cause: "sender_primary",
            headline: senderLabel(ev, look),
            detail: `위험 명단 ${parts.length}개를 주로 보낸 주소`,
            todo: TODO.sender,
            scope: scope({ senderProfileId: pid, partitionIds: parts, from: windowFrom(end, 7 * DAY_MS, null) }),
            primaryCats: ["failed", "dsn_only"],
            relatedCats: ["sender_side", "send_reject"],
        };
    }

    // 발신 도메인 인증 실패 폭주 (최근 1시간)
    if (ev.kind === "auth_burst") {
        const domain = (ev.entityKey ?? "").toLowerCase();
        return {
            ...base,
            cause: "auth_burst",
            headline: domain || "발신 도메인",
            detail: `최근 1시간 발신 인증 실패 ${(n(m.senderSide1h) ?? 0).toLocaleString("ko-KR")}통`,
            todo: TODO.system,
            devIssue: true,
            scope: scope({ senderDomain: domain || null, from: windowFrom(end, HOUR_MS, null) }),
            primaryCats: ["sender_side"],
            relatedCats: ["failed"],
        };
    }

    // 자동 멈춤 상한
    if (ev.kind === "cap") {
        const items = Array.isArray(m.items) ? m.items.length : 0;
        return {
            ...base,
            cause: "cap",
            headline: "자동 멈춤 상한",
            detail: ev.actionNote === "cap_auth" ? `도메인 ${items}개는 멈추지 못하고 알림만` : `멈추지 못한 주소 ${items}개`,
            outcome: "상한이라 멈추지 않음",
            todo: TODO.cap,
            devIssue: true,
            scope: scope({ from: windowFrom(end, 7 * DAY_MS, null) }),
            primaryCats: ["failed", "sender_side"],
            relatedCats: ["send_reject"],
        };
    }

    // NHN 결과 확인 (연동)
    if (ev.kind === "sync") {
        const cause = String(m.cause ?? "");
        const at = dateOf(m.at) ?? end;
        const ok = cause === "recovered" || cause === "never_recovered";
        const lastOk = dateOf(m.lastOkAt);
        const from = !ok && lastOk && lastOk < at ? lastOk.toISOString() : new Date(at.getTime() - DAY_MS).toISOString();
        const detail = ok
            ? "발송 결과 확인이 다시 정상"
            : cause === "auth"
              ? "NHN 연동 키 오류로 발송 결과를 받지 못함"
              : cause === "never"
                ? "발송 결과 확인 작업이 돌지 않음"
                : "NHN 발송 결과 확인이 멈춤";
        return {
            ...base,
            cause: ok ? "sync_ok" : "sync_problem",
            headline: "NHN 발송 결과",
            detail,
            outcome: ok ? null : "자동 조치 미룸",
            todo: ok ? TODO.none : TODO.system,
            devIssue: !ok,
            scope: scope({ from, to: at.toISOString() }),
            primaryCats: ["unknown"],
            relatedCats: ["send_reject"],
        };
    }

    // 보류·멈춤 풀림
    if (ev.kind === "release") {
        const isHold = ev.entityType === "partition";
        const pid = isHold && ev.entityId !== null ? look.holdPartition(ev.entityId) : null;
        return {
            ...base,
            cause: "release",
            headline: isHold ? (pid !== null ? partitionLabel(pid, look) : "명단") : senderLabel(ev, look),
            detail: isHold ? "보류를 풀고 발송을 다시 시작함" : "자동 멈춤을 풀고 발송을 다시 시작함",
            outcome: null,
            todo: TODO.none,
            scope: scope({
                partitionIds: pid !== null ? [pid] : [],
                senderProfileId: isHold ? null : ev.entityId ?? 0,
                from: windowFrom(end, 7 * DAY_MS, null),
            }),
            primaryCats: ["failed", "dsn_only"],
            relatedCats: ["send_reject"],
        };
    }

    return {
        ...base,
        cause: "other",
        headline: "발송 경고",
        detail: ev.summary.split("\n")[0].slice(0, 120),
        todo: TODO.other,
        scope: scope({ from: windowFrom(end, 7 * DAY_MS, null) }),
        primaryCats: ["failed", "dsn_only"],
        relatedCats: ["sender_side", "send_reject"],
    };
}

/** 처음 고를 갈래: 사건의 갈래 중 메일이 있는 것 → 없으면 같이 볼 갈래 중 있는 것 → 그래도 없으면 사건의 갈래 */
export function defaultCats(item: Pick<HealthFocusItem, "primaryCats" | "relatedCats" | "counts">): HealthCat[] {
    const has = (c: HealthCat) => (item.counts[c] ?? 0) > 0;
    const primary = item.primaryCats.filter(has);
    if (primary.length > 0) return primary;
    const related = item.relatedCats.filter(has);
    return related.length > 0 ? related : [...item.primaryCats];
}

/** 발송 이력 API 거르기 값 */
export function healthLogParams(scope: HealthFocusScope, cats: readonly HealthCat[]): Record<string, string> {
    const out: Record<string, string> = { healthCat: cats.join(","), sentFrom: scope.from, sentTo: scope.to };
    if (scope.partitionIds.length > 0) out.partitionIds = scope.partitionIds.join(",");
    if (scope.senderProfileId !== null) out.senderProfileId = String(scope.senderProfileId);
    if (scope.senderDomain) out.senderDomain = scope.senderDomain;
    return out;
}

/** 발송 이력 API가 받는 healthCat 값 풀기 — 모르는 값은 버린다 */
export function parseHealthCats(raw: string | null): HealthCat[] {
    if (!raw) return [];
    const set = new Set(raw.split(",").map((s) => s.trim()));
    return HEALTH_CATS.filter((c) => set.has(c));
}
