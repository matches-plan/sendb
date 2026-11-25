import test from "node:test";
import assert from "node:assert/strict";
import { isolateEnv } from "../auth-fake-db.test-helper";
import { callClaudeEmail, callClaudeWithSearch } from "./claude";
import { callCopyProvider } from "../ai-copy/provider";

// Haiku 5.5는 temperature 등 기본값이 아닌 샘플링 값을 받으면 400, 생각(thinking)은 기본으로 켜진다.
// 실제 공급자로 나가는 요청 본문을 잡아 5.5와 4.5에 맞는 값이 실리는지 본다.
function captureAnthropic(t: test.TestContext, text: string) {
    const bodies: Record<string, unknown>[] = [];
    t.mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)));
        return Response.json({ id: "msg_fake", type: "message", role: "assistant", content: [{ type: "text", text }], model: "claude-haiku-5-5", stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 12, output_tokens: 8 } });
    });
    return bodies;
}
const mail = JSON.stringify({ subject: "안내", htmlBody: "<p>본문</p>" });

test("Haiku 5.5 메일 작성은 생각을 끄고 temperature 없이 넉넉한 max_tokens로 보낸다", async (t) => {
    const bodies = captureAnthropic(t, mail);
    const result = await callClaudeEmail({ provider: "claude", model: "claude-haiku-5-5", apiKey: "fake" }, "가상", "가상", { strict: true });
    assert.equal(result.subject, "안내");
    assert.equal(bodies[0].model, "claude-haiku-5-5");
    assert.deepEqual(bodies[0].thinking, { type: "disabled" });
    assert.equal("temperature" in bodies[0], false);
    assert.equal(bodies[0].max_tokens, 8192);
});

test("Haiku 4.5 메일 작성은 생각 설정을 보내지 않는다", async (t) => {
    const bodies = captureAnthropic(t, mail);
    await callClaudeEmail({ provider: "claude", model: "claude-haiku-4-5", apiKey: "fake" }, "가상", "가상", { strict: true });
    assert.equal("thinking" in bodies[0], false);
});

test("Haiku 5.5 회사 조사는 기본 생각을 켜 둔 채 웹검색 도구를 보낸다", async (t) => {
    const bodies = captureAnthropic(t, JSON.stringify({ companyName: "가상 회사", description: "소개" }));
    await callClaudeWithSearch({ provider: "claude", model: "claude-haiku-5-5", apiKey: "fake" }, "가상", "가상 회사", /\{[\s\S]*\}/);
    assert.equal("thinking" in bodies[0], false);
    assert.equal("temperature" in bodies[0], false);
    assert.equal((bodies[0].tools as { type: string }[])[0].type, "web_search_20260209");
});

test("작성 버전 호출: 5.5는 temperature를 빼고 생각을 끄며, 4.5는 temperature를 그대로 보낸다", async (t) => {
    isolateEnv(t, { ANTHROPIC_API_KEY: "fake-anthropic" });
    const bodies = captureAnthropic(t, mail);
    const prompt = { system: "가상", user: "가상" };
    const signal = new AbortController().signal;
    await callCopyProvider({ provider: "claude", model: "claude-haiku-5-5", parameters: { maxOutputTokens: 1024, temperature: 0.3 } }, prompt, signal);
    await callCopyProvider({ provider: "claude", model: "claude-haiku-4-5", parameters: { maxOutputTokens: 1024, temperature: 0.3 } }, prompt, signal);
    assert.deepEqual(bodies[0].thinking, { type: "disabled" });
    assert.equal("temperature" in bodies[0], false);
    assert.equal(bodies[0].max_tokens, 1024);
    assert.equal(bodies[1].temperature, 0.3);
    assert.equal("thinking" in bodies[1], false);
});
