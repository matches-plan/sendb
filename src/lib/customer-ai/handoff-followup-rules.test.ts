import test from "node:test";
import assert from "node:assert/strict";
import { followupMacroName, HANDOFF_FOLLOWUP_DELAY, HANDOFF_WAITING_MESSAGE } from "./handoff-followup-rules";
import { handoffFollowupEnabled } from "./worker-policy";

const trial = {
    kind: "faq",
    title: "무료로 체험해 볼 수 있나요?",
    questions: ["무료 체험도 가능한가요?", "무료 체험 진행 방식이 궁금합니다."],
};

test("공개 FAQ 질문 또는 유사 질문이 명확히 일치할 때만 매크로를 고른다", () => {
    assert.equal(followupMacroName(trial.title, [trial]), "무료체험");
    assert.equal(followupMacroName("무료체험 진행 방식이 궁금합니다!", [trial]), "무료체험");
    assert.equal(followupMacroName("무료 체험 뒤 자동 결제되나요?", [trial]), undefined);
    assert.equal(followupMacroName(trial.title, [{ ...trial, kind: "article" }]), undefined);
    assert.equal(followupMacroName(trial.title, [trial, trial]), undefined);
});

test("무료 체험 신청 표현을 공개 FAQ에 연결한다", () => {
    assert.equal(followupMacroName("무료체험 진행하고 싶어요", [trial]), "무료체험");
    assert.equal(followupMacroName("무료 체험 진행하고 싶어요!", [trial]), "무료체험");
    assert.equal(followupMacroName("무료체험 진행하고 싶어요", []), undefined);
    assert.equal(followupMacroName("무료체험 진행하고 싶어요", [
        trial,
        { kind: "faq", title: "다른 질문", questions: ["무료체험 진행하고 싶어요"] },
    ]), undefined);
});

test("백오피스랩 전용 활성화와 5분 후 안내 문구를 유지한다", () => {
    assert.equal(handoffFollowupEnabled("9", 9), true);
    assert.equal(handoffFollowupEnabled("9", 8), false);
    assert.equal(handoffFollowupEnabled(undefined, 9), false);
    assert.equal(HANDOFF_FOLLOWUP_DELAY, 300_000);
    assert.equal(HANDOFF_WAITING_MESSAGE, "잠시만 기다려 주시면 답변 드리겠습니다:)");
});
