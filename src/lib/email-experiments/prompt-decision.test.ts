import test from "node:test";
import assert from "node:assert/strict";
import { promptTestResult, promptTestVerdict } from "./prompt-decision";

const arm = (sent: number, clicked: number) => ({ sent, opened: 0, clicked, replied: 0 });

test("B가 95% 기준으로 확실히 나으면 B 승", () => {
    assert.equal(promptTestVerdict({ A: arm(1553, 8), B: arm(1553, 26) }, "click").winner, "B");
});

test("A가 확실히 나으면 A 승", () => {
    assert.equal(promptTestVerdict({ A: arm(1553, 26), B: arm(1553, 8) }, "click").winner, "A");
});

test("차이가 작으면 차이 없음", () => {
    assert.equal(promptTestVerdict({ A: arm(1600, 19), B: arm(1600, 21) }, "click").winner, null);
});

test("발송이 없으면 판정하지 않는다", () => {
    assert.equal(promptTestVerdict({ A: arm(0, 0), B: arm(10, 3) }, "click").winner, null);
});

test("결과 배지 — 이벤트 기록으로 정한다", () => {
    const base = { kind: "prompt" as const, adopted: false, lastDetail: null };
    assert.equal(promptTestResult({ ...base, state: "running", lastAction: null }), "running");
    assert.equal(promptTestResult({ ...base, state: "observing", lastAction: null }), "running");
    assert.equal(promptTestResult({ ...base, state: "closed", lastAction: "ab_test_decided", lastDetail: { result: "B" } }), "B");
    assert.equal(promptTestResult({ ...base, state: "closed", lastAction: "ab_test_decided", lastDetail: { result: "none" } }), "none");
    assert.equal(promptTestResult({ ...base, state: "closed", lastAction: "ab_test_decided", lastDetail: { result: "insufficient" } }), "insufficient");
    assert.equal(promptTestResult({ ...base, state: "insufficient_sample", lastAction: null }), "running");
    assert.equal(promptTestResult({ ...base, state: "closed", lastAction: "applied_b" }), "applied_B");
    assert.equal(promptTestResult({ ...base, state: "closed", lastAction: "ab_test_stopped" }), "stopped");
    assert.equal(promptTestResult({ ...base, state: "closed", lastAction: "ab_test_off" }), "stopped");
    assert.equal(promptTestResult({ ...base, state: "invalidated", lastAction: null }), "stopped");
    assert.equal(promptTestResult({ kind: "policy", adopted: true, lastDetail: null, state: "closed", lastAction: "adopted_b" }), "applied_B");
});

test("예전 판정 — 표본 부족으로 끝난 모집은 '차이 없음'이 아니라 표본 부족", () => {
    const base = { kind: "prompt" as const, adopted: false, state: "closed", lastAction: "ab_test_decided" };
    assert.equal(promptTestResult({ ...base, lastDetail: { result: "none", from: "insufficient_sample" } }), "insufficient");
    assert.equal(promptTestResult({ ...base, lastDetail: { result: "none", from: "decision_ready" } }), "none");
});
