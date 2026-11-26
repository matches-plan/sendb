import test from "node:test";
import assert from "node:assert/strict";
import { isolateEnv } from "../auth-fake-db.test-helper";
import { AI_MODELS, AI_MODEL_CATALOG, claudeSampling, outputTokenLimit, resolveModel } from "./models";
import { listModelAvailability, modelUnavailableReason, resolveRoute } from "./client";
import { callGeminiJson } from "./gemini";
import { callCopyProvider, CopyProviderError } from "../ai-copy/provider";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const deepseek = resolveModel("deepseek-v4-1-flash");
const qwen = resolveModel("qwen3.7-flash");

test("모델 목록: 예전 DeepSeek V4 Flash는 숨기고 저장값은 그대로 해석한다, 기본 모델이 맨 앞", () => {
    assert.equal(AI_MODELS[0].id, "claude-haiku-5-5");
    assert.equal(AI_MODELS.some((m) => m.id === "deepseek-v4-flash"), false);
    assert.ok(AI_MODEL_CATALOG.some((m) => m.id === "deepseek-v4-flash"));
    assert.equal(resolveModel("deepseek-v4-flash").id, "deepseek-v4-flash");
    for (const id of ["claude-sonnet-5-5", "claude-opus-5-5", "gemini-3.8-flash", "deepseek-v4-1-flash", "qwen3.7-flash"])
        assert.ok(AI_MODELS.find((m) => m.id === id)?.lab, id);
});

test("Claude 5.5 생각 설정: Haiku는 끄고, Sonnet은 between_tools, Opus는 보내지 않는다 — 모두 temperature 없음", () => {
    assert.deepEqual(claudeSampling("claude-haiku-5-5", 0.3), { thinking: { type: "disabled" } });
    assert.deepEqual(claudeSampling("claude-sonnet-5-5", 0.3), { thinking: { type: "between_tools" } });
    assert.deepEqual(claudeSampling("claude-opus-5-5", 0.3), {});
    assert.deepEqual(claudeSampling("claude-haiku-4-5", 0.3), { temperature: 0.3 });
    assert.equal(outputTokenLimit(resolveModel("claude-haiku-4-5")), 4096);
    assert.equal(outputTokenLimit(resolveModel("claude-opus-5-5")), 8192);
    assert.equal(outputTokenLimit(deepseek), 8192);
    assert.equal(outputTokenLimit(qwen), 4096);
});

test("경로: DeepSeek은 OpenRouter 먼저, 직접 연결(중국 서버)은 허용해야만 쓴다", () => {
    assert.deepEqual(resolveRoute(deepseek, {}), { ok: false, missing: ["OPENROUTER_API_KEY"], chinaBlocked: true });
    assert.deepEqual(resolveRoute(deepseek, { DEEPSEEK_API_KEY: "ds" }), { ok: false, missing: ["OPENROUTER_API_KEY"], chinaBlocked: true });
    const direct = resolveRoute(deepseek, { DEEPSEEK_API_KEY: "ds", AI_ALLOW_CHINA_ENDPOINTS: "1" });
    assert.ok(direct.ok);
    assert.equal(direct.client.route, "direct");
    assert.equal(direct.client.apiModel, "deepseek-flash");

    const viaRouter = resolveRoute(deepseek, { OPENROUTER_API_KEY: "or", DEEPSEEK_API_KEY: "ds", AI_ALLOW_CHINA_ENDPOINTS: "1" });
    assert.ok(viaRouter.ok);
    assert.equal(viaRouter.client.route, "openrouter");
    assert.equal(viaRouter.client.apiModel, "deepseek/deepseek-v4.1-flash-20261017");
    assert.equal(viaRouter.client.model, "deepseek-v4-1-flash");
    assert.deepEqual(viaRouter.client.extraBody, { provider: { data_collection: "deny", ignore: ["deepseek"] } });

    // 예전 저장값은 예전처럼 직접 연결 — 동작을 바꾸지 않는다
    const legacy = resolveRoute(resolveModel("deepseek-v4-flash"), { DEEPSEEK_API_KEY: "ds" });
    assert.ok(legacy.ok);
    assert.equal(legacy.client.apiModel, "deepseek-v4-flash");
});

test("경로: Qwen은 싱가포르 직접 먼저, 없으면 OpenRouter(생각 끔). 공급자 선호는 환경변수로 바꾼다", (t) => {
    const direct = resolveRoute(qwen, { QWEN_API_KEY: "q", OPENROUTER_API_KEY: "or" });
    assert.ok(direct.ok);
    assert.equal(direct.client.route, "direct");
    const viaRouter = resolveRoute(qwen, { OPENROUTER_API_KEY: "or", OPENROUTER_PROVIDER_PREFS: '{"only":["alibaba"]}' });
    assert.ok(viaRouter.ok);
    assert.deepEqual(viaRouter.client.extraBody, { provider: { only: ["alibaba"] }, reasoning: { effort: "none" } });
    t.mock.method(console, "error", () => {});
    const broken = resolveRoute(qwen, { OPENROUTER_API_KEY: "or", OPENROUTER_PROVIDER_PREFS: "{oops" });
    assert.ok(broken.ok);
    assert.deepEqual((broken.client.extraBody as { provider: unknown }).provider, { data_collection: "deny" });
});

test("가용성 목록과 저장 가드는 키 값을 드러내지 않고 필요한 키 이름만 알려 준다", () => {
    const env = { ANTHROPIC_API_KEY: "sk-ant-secret-value" };
    const list = listModelAvailability(env);
    assert.doesNotMatch(JSON.stringify(list), /secret-value/);
    assert.equal(list.find((m) => m.id === "claude-opus-5-5")?.available, true);
    assert.deepEqual(list.find((m) => m.id === "deepseek-v4-1-flash"), {
        id: "deepseek-v4-1-flash", label: "DeepSeek V4.1 Flash", provider: "deepseek", lab: true,
        available: false, route: null, missing: ["OPENROUTER_API_KEY"], chinaBlocked: true, listPriceUsd: { input: 0.3, output: 1.2 },
    });
    assert.equal(modelUnavailableReason("claude-haiku-5-5", env), null);
    assert.match(modelUnavailableReason("qwen3.7-flash", env) ?? "", /QWEN_API_KEY, OPENROUTER_API_KEY/);
    assert.match(modelUnavailableReason("deepseek-v4-flash", env) ?? "", /지원하지 않는/);
    assert.match(modelUnavailableReason("gpt-9", env) ?? "", /지원하지 않는/);
});

function captureFetch(t: test.TestContext, reply: () => Response) {
    const calls: Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }> = [];
    t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
        const headers = init?.headers instanceof Headers ? Object.fromEntries(init.headers) : ((init?.headers ?? {}) as Record<string, string>);
        calls.push({ url: String(url), headers, body: JSON.parse(String(init?.body)) });
        return reply();
    });
    return calls;
}
const chatReply = () => Response.json({ choices: [{ message: { content: '{"subject":"안내","htmlBody":"<p>본문</p>"}' }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } });

test("OpenRouter 요청: 슬러그·공급자 선호·사용량 포함·JSON 모드, 키는 Authorization 머리글에만", async (t) => {
    const route = resolveRoute(deepseek, { OPENROUTER_API_KEY: "or-key" });
    assert.ok(route.ok);
    const calls = captureFetch(t, chatReply);
    await callGeminiJson(route.client, "JSON으로 답하세요", "질문");
    assert.equal(calls[0].url, OPENROUTER_URL);
    assert.equal(calls[0].headers.Authorization, "Bearer or-key");
    assert.equal(calls[0].headers["HTTP-Referer"], "https://sendb.kr");
    assert.equal(calls[0].body.model, "deepseek/deepseek-v4.1-flash-20261017");
    assert.deepEqual(calls[0].body.response_format, { type: "json_object" });
    assert.deepEqual((calls[0].body.provider as { ignore: string[] }).ignore, ["deepseek"]);
    assert.doesNotMatch(JSON.stringify(calls[0].body), /or-key/);
});

test("작성 버전 호출: OpenRouter DeepSeek은 슬러그와 넉넉한 답 길이로, 저장 모델 id는 그대로", async (t) => {
    isolateEnv(t, { OPENROUTER_API_KEY: "or-key", DEEPSEEK_API_KEY: "", AI_ALLOW_CHINA_ENDPOINTS: "" });
    const calls = captureFetch(t, chatReply);
    const out = await callCopyProvider(
        { provider: "deepseek", model: "deepseek-v4-1-flash", parameters: { maxOutputTokens: 8192, temperature: 1 } },
        { system: "JSON으로 답하세요", user: "질문" },
        new AbortController().signal,
    );
    assert.equal(out.promptTokens, 10);
    assert.equal(calls[0].url, OPENROUTER_URL);
    assert.equal(calls[0].body.model, "deepseek/deepseek-v4.1-flash-20261017");
    assert.equal(calls[0].body.max_tokens, 8192);
    assert.deepEqual(calls[0].body.provider, { data_collection: "deny", ignore: ["deepseek"] });
});

const anthropicReply = (stop = "end_turn") => () =>
    Response.json({ id: "msg_fake", type: "message", role: "assistant", content: [{ type: "text", text: '{"subject":"안내","htmlBody":"<p>본문</p>"}' }], model: "claude-opus-5-5", stop_reason: stop, stop_sequence: null, usage: { input_tokens: 12, output_tokens: 8 } });

test("작성 버전 호출: Sonnet 5.5는 between_tools, Opus 5.5는 생각 설정 없이 — 둘 다 temperature를 보내지 않는다", async (t) => {
    isolateEnv(t, { ANTHROPIC_API_KEY: "fake-anthropic" });
    const calls = captureFetch(t, anthropicReply());
    const prompt = { system: "가상", user: "가상" };
    const signal = new AbortController().signal;
    await callCopyProvider({ provider: "claude", model: "claude-sonnet-5-5", parameters: { maxOutputTokens: 8192, temperature: 1 } }, prompt, signal);
    await callCopyProvider({ provider: "claude", model: "claude-opus-5-5", parameters: { maxOutputTokens: 8192, temperature: 1 } }, prompt, signal);
    assert.deepEqual(calls[0].body.thinking, { type: "between_tools" });
    assert.equal("temperature" in calls[0].body, false);
    assert.equal("thinking" in calls[1].body, false);
    assert.equal("temperature" in calls[1].body, false);
});

test("작성 버전 호출: 안전 분류기 거절(refusal)은 다시 시도하지 않는 실패로 돌려준다", async (t) => {
    isolateEnv(t, { ANTHROPIC_API_KEY: "fake-anthropic" });
    captureFetch(t, anthropicReply("refusal"));
    await assert.rejects(
        callCopyProvider({ provider: "claude", model: "claude-opus-5-5", parameters: { maxOutputTokens: 8192, temperature: 1 } }, { system: "가상", user: "가상" }, new AbortController().signal),
        (error: unknown) => error instanceof CopyProviderError && error.code === "provider_refusal" && !error.retryable,
    );
});
