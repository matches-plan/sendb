import test from "node:test";
import assert from "node:assert/strict";
import { normalizeScope, scopedPrompt } from "./prompt-scope";

test("전체: B 지시사항이 A를 대신한다", () => {
    assert.equal(scopedPrompt("A 지시", "B 지시", "all"), "B 지시");
    assert.equal(scopedPrompt("A 지시", "B 지시", undefined), "B 지시");
});

test("제목만: A 지시사항 뒤에 제목에만 적용하는 B 지시를 붙인다", () => {
    const out = scopedPrompt("  A 지시  ", "질문형 제목", "subject");
    assert.ok(out.startsWith("A 지시\n\n[제목 지시"));
    assert.match(out, /본문은 위 지시사항 그대로/);
    assert.ok(out.endsWith("<<<\n질문형 제목\n>>>"));
});

test("첫 문장: 첫 문장에만 적용", () => {
    const out = scopedPrompt("A", "B", "opening");
    assert.match(out, /\[첫 문장 지시/);
    assert.ok(out.startsWith("A\n\n"));
});

test("모르는 값은 전체", () => {
    assert.equal(normalizeScope("x"), "all");
    assert.equal(normalizeScope("subject"), "subject");
});
