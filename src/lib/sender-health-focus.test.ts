import { test } from "node:test";
import assert from "node:assert/strict";
import { TODO, defaultCats, healthFocusOf, healthLogParams, parseHealthCats, pct, type HealthEventInput, type HealthFocusLookup } from "./sender-health-focus";

const at = new Date("2026-11-10T08:00:00Z");
const look = (over: Partial<HealthFocusLookup> = {}): HealthFocusLookup => ({
    partition: (id) => (id === 5 ? { name: "문의 명단", workspaceName: "워크투하이어" } : null),
    sender: (id) => (id === 9 ? "sales@example.com" : null),
    holdPartition: (id) => (id === 77 ? 5 : null),
    isHeld: () => false,
    isAutoPaused: () => false,
    ...over,
});
const ev = (over: Partial<HealthEventInput>): HealthEventInput => ({
    id: 1,
    kind: "danger",
    entityType: "partition",
    entityId: 5,
    entityKey: null,
    workspaceId: 23,
    action: "none",
    actionNote: null,
    evalWindow: "7d",
    metrics: {},
    summary: "",
    createdAt: at,
    ...over,
});

test("명단 실패율 — 보류 중이면 정리 뒤 다시 시작, 7일 창·명단·반송 갈래", () => {
    const it = healthFocusOf(ev({ action: "hold", metrics: { final: 400, failed: 48, rateBp: 1200 } }), look({ isHeld: () => true }));
    assert.equal(it.cause, "partition");
    assert.equal(it.headline, "워크투하이어 · 문의 명단");
    assert.equal(it.detail, "최근 7일 실패율 12% (400통 중 48통 · 기준 5%)");
    assert.equal(it.outcome, "발송 보류");
    assert.equal(it.todo, TODO.partitionHeld);
    assert.equal(it.heldPartitionId, 5);
    assert.deepEqual(it.scope.partitionIds, [5]);
    assert.equal(it.scope.to, at.toISOString());
    assert.equal(new Date(it.scope.to).getTime() - new Date(it.scope.from).getTime(), 7 * 86400000);
    assert.deepEqual(it.primaryCats, ["failed", "dsn_only"]);
});

test("명단 — 이미 풀렸으면 다시 시작 없이 정리만, 30일 창·풀린 뒤부터", () => {
    const floorAt = new Date(at.getTime() - 3 * 86400000).toISOString();
    const it = healthFocusOf(ev({ action: "hold", evalWindow: "30d", metrics: { rateBp: 650, floorAt } }), look());
    assert.equal(it.todo, TODO.partition);
    assert.equal(it.heldPartitionId, null);
    assert.equal(it.scope.from, floorAt);
    assert.match(it.detail, /^최근 30일 실패율 6.5%/);
});

test("발신 주소 — 칸 명단만, 자동 멈춤이면 풀 수 있는 프로필", () => {
    const it = healthFocusOf(
        ev({ entityType: "sender", entityId: 9, entityKey: null, action: "pause", metrics: { rateBp: 750, dangerBy: "multi", highCells: [{ p: 5 }, { p: 6 }] } }),
        look({ isAutoPaused: (id) => id === 9 })
    );
    assert.equal(it.cause, "sender");
    assert.equal(it.headline, "sales@example.com");
    assert.equal(it.outcome, "자동 멈춤");
    assert.equal(it.todo, TODO.sender);
    assert.equal(it.pausedProfileId, 9);
    assert.equal(it.scope.senderProfileId, 9);
    assert.deepEqual(it.scope.partitionIds, [5, 6]);
});

test("주된 발신 주소 · 발신 인증 폭주 · 상한 · NHN 연동은 할 일이 정해져 있다", () => {
    const w = healthFocusOf(ev({ kind: "danger_with", entityType: "sender", entityId: 9, metrics: { partitions: [5, 6, 7] } }), look());
    assert.equal(w.cause, "sender_primary");
    assert.deepEqual(w.scope.partitionIds, [5, 6, 7]);
    assert.equal(w.todo, TODO.sender);

    const a = healthFocusOf(ev({ kind: "auth_burst", entityType: "domain", entityId: null, entityKey: "Example.com", metrics: { senderSide1h: 14 } }), look());
    assert.equal(a.cause, "auth_burst");
    assert.equal(a.scope.senderDomain, "example.com");
    assert.equal(new Date(a.scope.to).getTime() - new Date(a.scope.from).getTime(), 3600000);
    assert.deepEqual(a.primaryCats, ["sender_side"]);
    assert.ok(a.devIssue);
    assert.equal(a.todo, TODO.system);

    const c = healthFocusOf(ev({ kind: "cap", entityType: "org", entityId: null, actionNote: "cap", metrics: { items: ["a@x", "b@x"] } }), look());
    assert.equal(c.cause, "cap");
    assert.equal(c.detail, "멈추지 못한 주소 2개");
    assert.ok(c.devIssue);

    const lastOkAt = new Date(at.getTime() - 2 * 3600000).toISOString();
    const s = healthFocusOf(ev({ kind: "sync", entityType: "org", entityId: null, metrics: { cause: "stale", at: at.toISOString(), lastOkAt } }), look());
    assert.equal(s.cause, "sync_problem");
    assert.equal(s.scope.from, lastOkAt);
    assert.deepEqual(s.primaryCats, ["unknown"]);
    assert.equal(s.todo, TODO.system);

    const ok = healthFocusOf(ev({ kind: "sync", entityType: "org", entityId: null, metrics: { cause: "recovered", at: at.toISOString() } }), look());
    assert.equal(ok.cause, "sync_ok");
    assert.equal(ok.todo, TODO.none);
    assert.equal(ok.devIssue, false);
});

test("풀림 — 보류 id로 명단을 찾는다", () => {
    const r = healthFocusOf(ev({ kind: "release", entityType: "partition", entityId: 77, action: "release" }), look());
    assert.equal(r.cause, "release");
    assert.equal(r.headline, "워크투하이어 · 문의 명단");
    assert.deepEqual(r.scope.partitionIds, [5]);
    assert.equal(r.todo, TODO.none);
});

test("처음 갈래 — 사건 갈래에 메일이 없으면 같이 볼 갈래로", () => {
    assert.deepEqual(defaultCats({ primaryCats: ["failed", "dsn_only"], relatedCats: ["send_reject"], counts: { failed: 3 } }), ["failed"]);
    assert.deepEqual(defaultCats({ primaryCats: ["failed"], relatedCats: ["send_reject", "unknown"], counts: { unknown: 2, send_reject: 0 } }), ["unknown"]);
    assert.deepEqual(defaultCats({ primaryCats: ["failed"], relatedCats: ["unknown"], counts: {} }), ["failed"]);
});

test("거르기 값 · 갈래 풀기 · 퍼센트", () => {
    const p = healthLogParams({ partitionIds: [5, 6], senderProfileId: 0, senderDomain: null, from: "a", to: "b" }, ["failed", "dsn_only"]);
    assert.deepEqual(p, { healthCat: "failed,dsn_only", sentFrom: "a", sentTo: "b", partitionIds: "5,6", senderProfileId: "0" });
    assert.deepEqual(parseHealthCats("unknown,evil,failed"), ["failed", "unknown"]);
    assert.equal(pct(500), "5%");
    assert.equal(pct(1234), "12.3%");
    assert.equal(pct(null), "—");
});
