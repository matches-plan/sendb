import test from "node:test";
import assert from "node:assert/strict";
import { followupMacroName, HANDOFF_WAITING_MESSAGE } from "./handoff-followup-rules";
import { faqQuestionLimit, handoffFollowupEnabled } from "./worker-policy";

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

test("백오피스랩 전용 활성화와 즉시 안내 문구를 유지한다", () => {
    assert.equal(handoffFollowupEnabled("9", 9), true);
    assert.equal(handoffFollowupEnabled("9", 8), false);
    assert.equal(handoffFollowupEnabled(undefined, 9), false);
    assert.equal(HANDOFF_WAITING_MESSAGE, "잠시만 기다려 주시면 답변 드리겠습니다:)");
});

test("같은 뜻의 말투와 구두점을 매크로 질문에 연결한다", () => {
    const accounting = {
        kind: "faq",
        title: "경리 업무만 맡길 수 있나요?",
        questions: ["경리 총무는 어떤 서비스인가요?", "경리 업무만 진행 가능한가요?"],
    };
    assert.equal(followupMacroName("테스트) 경리·총무는 무슨 서비스예요?", [accounting]), "경리단독");
    assert.equal(followupMacroName("경리 업무만 진행 가능할까요?", [accounting]), "경리단독");
    assert.equal(followupMacroName("경리 업무만 진행하면 자동 결제되나요?", [accounting]), undefined);
    assert.equal(followupMacroName("경리 업무만 진행 가능할까요?", [accounting, accounting]), undefined);
});

test("서비스별 업무 범위 질문은 공개 FAQ의 승인된 매크로로 연결한다", () => {
    const cases = [
        ["경리·총무 서비스", "경리 업무만 맡길 수 있나요?", "경리단독"],
        ["비서 서비스는 무슨 서비스예요?", "비서 라이트는 얼마이고 어떤 업무를 하나요?", "비서라이트"],
        ["사업비 관리는 뭐하는 서비스예요?", "정부지원사업에 선정됐는데 사업비 정산도 맡길 수 있나요?", "사업비정산"],
        ["채용 인사 지원은 어떤 서비스인가요?", "채용 공고나 입·퇴사 자료 정리도 지원하나요?", "채용인사"],
        ["온라인 고객응대는 무슨 서비스예요?", "온라인 고객 문의 응대도 맡길 수 있나요?", "온라인고객응대"],
        ["맞춤 경영지원은 어떤 서비스인가요?", "경리·총무와 비서, 사업비 관리를 함께 맡길 수 있나요?", "맞춤경영지원"],
    ];
    const docs = cases.map(([, title]) => ({ kind: "faq", title }));
    for (const [question, , macro] of cases) assert.equal(followupMacroName(question, docs), macro);
    assert.equal(followupMacroName("사업비 관리는 뭐하는 서비스예요?", []), undefined);
    assert.equal(followupMacroName("사업비 관리는 무조건 승인되나요?", docs), undefined);
});

test("전체요금 매크로가 FAQ의 추가 질문 자리를 쓰지 않고 기존과 새 가격 문의에 답한다", () => {
    const pricing = { kind: "faq", title: "비용은 얼마인가요?" };
    for (const question of [
        "가격이 얼마인가요?",
        "서비스 이용 비용 알려주세요",
        "요금이 궁금합니다",
        "비용이 어떻게 되나요?",
        "가격이 어떻게 되나요 ?",
    ]) {
        assert.equal(followupMacroName(question, [pricing]), "전체요금");
    }
    assert.equal(followupMacroName("가격이 얼마인가요?", []), undefined);
    assert.equal(followupMacroName("가격이 얼마인가요?", [pricing, {
        kind: "faq", title: "비서 라이트는 얼마이고 어떤 업무를 하나요?", questions: ["가격이 얼마인가요?"],
    }]), undefined);
});

test("백오피스랩 FAQ는 10개를 넘겨도 앞뒤 유사 질문이 같은 매크로에 연결된다", () => {
    const title = "비서 라이트는 얼마이고 어떤 업무를 하나요?";
    const questions = Array.from({ length: faqQuestionLimit(9) }, (_, index) => `비서 업무 범위 문의 ${index + 1}`);
    assert.equal(questions.length, 30);
    assert.equal(faqQuestionLimit(8), 10);
    for (const question of questions) {
        assert.equal(followupMacroName(question, [{ kind: "faq", title, questions }]), "비서라이트");
    }
});

test("총무 단독 문의는 경리 단독 FAQ 대신 총무 매크로에 연결된다", () => {
    const docs = [
        { kind: "faq", title: "경리 업무만 맡길 수 있나요?" },
        { kind: "faq", title: "총무 업무만 할 수 있나요?", questions: ["총무만 따로 맡길 수 있나요?"] },
    ];
    assert.equal(followupMacroName("총무 업무만 할 수 있나요?", docs), "총무단독");
    assert.equal(followupMacroName("총무만 따로 맡길 수 있나요?", docs), "총무단독");
    assert.equal(followupMacroName("경리 업무만 맡길 수 있나요?", docs), "경리단독");
});
