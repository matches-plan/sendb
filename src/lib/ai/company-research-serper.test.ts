import test from "node:test";
import assert from "node:assert/strict";
import { getAiClient, getCompanyResearchClient } from "./client";
import { companyResearchMode } from "./company-research-mode";
import { isCompactCompanyResearch } from "./company-research-compact";
import { callGeminiJson } from "./gemini";
import { generateCompanyResearch, type CompanyResearchResult } from "./search";
import { installFakeDb, isolateEnv } from "../auth-fake-db.test-helper";

const SERPER_URL = "https://google.serper.dev/search";
const QWEN_URL = "https://ap-southeast-1.maas.qwencloudapi.com/compatible-mode/v1/chat/completions";
const qwen = { provider: "qwen" as const, apiKey: "fake-qwen", model: "qwen3.7-flash", route: "direct" as const, apiModel: "qwen3.7-flash", search: { provider: "serper" as const, apiKey: "fake-serper" } };
const ORG = "00000000-0000-4000-8000-000000000001";

const found = { companyName: "가상 연구사", industry: "제조", description: "부품을 설계하고 만드는 회사", services: "부품 설계, 시제품 제작", employees: "약 30명", website: "https://example.com" };
const organic = [
    { link: "https://example.com", title: "가상 연구사", snippet: "가상 연구사는 부품을 설계합니다." },
    { link: "javascript:alert(1)", title: "위험", snippet: "쓰면 안 되는 결과" },
    { link: "https://news.example.com/a", title: "가상 연구사 소식", snippet: "시제품 제작 확대" },
];
const qwenReply = (content: unknown, status = 200) =>
    Response.json(status === 200 ? { choices: [{ message: { content: JSON.stringify(content) }, finish_reason: "stop" }], usage: { prompt_tokens: 900, completion_tokens: 120 } } : { error: { message: "synthetic" } }, { status });

test("회사 조사 방식: Serper 키가 있으면 serper, 명시한 방식이 우선이고 작성 모델 연결은 그대로다", (t) => {
    isolateEnv(t, { AI_COMPANY_RESEARCH_MODE: "", SERPER_API_KEY: "", QWEN_API_KEY: "", OPENROUTER_API_KEY: "", ANTHROPIC_API_KEY: "fake-claude" });
    assert.equal(companyResearchMode(), "compact");
    assert.equal(getCompanyResearchClient(), null);

    process.env.SERPER_API_KEY = "fake-serper";
    process.env.QWEN_API_KEY = "fake-qwen";
    assert.equal(isCompactCompanyResearch(), false);
    assert.deepEqual(getCompanyResearchClient(), qwen);

    // Qwen 키가 없으면 검색은 Serper, 정리는 Haiku 5.5
    delete process.env.QWEN_API_KEY;
    assert.deepEqual(getCompanyResearchClient(), { provider: "claude", apiKey: "fake-claude", model: "claude-haiku-5-5", search: qwen.search });

    process.env.AI_COMPANY_RESEARCH_MODE = "compact";
    assert.equal(isCompactCompanyResearch(), true);
    process.env.AI_COMPANY_RESEARCH_MODE = "search";
    assert.deepEqual(getCompanyResearchClient(), { provider: "claude", apiKey: "fake-claude", model: "claude-haiku-5-5" });
    // serper를 명시했는데 키가 없으면 다른 유료 검색(Claude)으로 바꾸지 않는다
    process.env.AI_COMPANY_RESEARCH_MODE = "serper";
    process.env.SERPER_API_KEY = "";
    assert.equal(getCompanyResearchClient(), null);

    assert.equal(getAiClient()?.model, "claude-haiku-5-5");
    assert.equal(getAiClient()?.search, undefined);
});

test("Serper로 회사명만 검색하고 Qwen이 생각 없이 JSON으로 정리한다 — 담당자 이름·연락처는 보내지 않는다", async (t) => {
    isolateEnv(t, { AI_COMPANY_RESEARCH_MODE: "serper" });
    const requests: Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }> = [];
    t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ url: String(url), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) });
        return String(url) === SERPER_URL ? Response.json({ organic }) : qwenReply(found);
    });
    const result = await generateCompanyResearch(qwen, {
        companyName: "가상 연구사",
        additionalContext: { 업종: "제조", 담당자: "홍길동", email: "private@example.test", phone: "010-1234-5678" },
    });

    assert.deepEqual(requests.map((r) => r.url), [SERPER_URL, QWEN_URL]);
    const [search, summary] = requests;
    assert.equal(search.headers["X-API-KEY"], "fake-serper");
    assert.deepEqual(search.body, { q: "가상 연구사 회사", gl: "kr", hl: "ko", num: 10 });
    assert.equal(summary.headers.Authorization, "Bearer fake-qwen");
    assert.equal(summary.body.model, "qwen3.7-flash");
    assert.equal(summary.body.enable_thinking, false);
    assert.deepEqual(summary.body.response_format, { type: "json_object" });
    const prompt = JSON.stringify(summary.body.messages);
    assert.match(prompt, /JSON/);
    assert.match(prompt, /업종: 제조/);
    assert.match(prompt, /가상 연구사는 부품을 설계합니다/);
    assert.doesNotMatch(prompt + search.body.q, /홍길동|private@example|010-1234/);

    assert.equal(result.method, "serper");
    assert.equal(result.description, found.description);
    assert.equal(result.employees, "약 30명");
    assert.deepEqual(result.sources, [{ url: "https://example.com", title: "가상 연구사" }, { url: "https://news.example.com/a", title: "가상 연구사 소식" }]);
    assert.deepEqual(result.usage, { promptTokens: 900, completionTokens: 120 });
});

test("Serper·Qwen이 실패하거나 회사를 확인하지 못하면 오류 대신 간단 조사로 대신한다", async (t) => {
    isolateEnv(t, { AI_COMPANY_RESEARCH_MODE: "serper" });
    t.mock.method(console, "error", () => {});
    const notFound = { companyName: "가상 연구사", industry: "정보 없음", description: "정보 없음", services: "정보 없음", employees: "정보 없음", website: "정보 없음" };
    const scenarios: Array<[string, (url: string) => Response, number]> = [
        ["Serper 크레딧 소진", () => Response.json({ message: "Not enough credits" }, { status: 400 }), 1],
        ["검색 결과 없음", () => Response.json({ organic: [] }), 1],
        ["Qwen 키 오류", (url) => (url === SERPER_URL ? Response.json({ organic }) : qwenReply(null, 401)), 2],
        ["회사 확인 못 함", (url) => (url === SERPER_URL ? Response.json({ organic }) : qwenReply(notFound)), 2],
    ];
    for (const [name, respond, expectedCalls] of scenarios) {
        let calls = 0;
        t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL) => { calls++; return respond(String(url)); });
        const result = await generateCompanyResearch(qwen, { companyName: "가상 연구사", additionalContext: { 업종: "제조" } });
        assert.equal(calls, expectedCalls, name);
        assert.equal(result.method, "compact", name);
        assert.equal(result.industry, "제조", name);
        // 회사를 확인하지 못한 경우도 Qwen이 쓴 토큰은 사용량에 남긴다
        assert.equal(result.usage.promptTokens, name === "회사 확인 못 함" ? 900 : 0, name);
    }
});

test("새로 조사한 회사만 레코드에 적힌 이름으로 보관함에 쌓고, 저장 실패는 메일을 막지 않는다", async (t) => {
    isolateEnv(t, { AI_COMPANY_RESEARCH_MODE: "compact" });
    const { db } = await import("../db");
    const { rememberCompanyResearch } = await import("./company-research-cache");
    const research: CompanyResearchResult = { ...found, sources: [{ url: "https://example.com", title: "가상 연구사" }], usage: { promptTokens: 900, completionTokens: 120 }, method: "serper" };
    let fail = false;
    const { calls } = installFakeDb(t, db, () => (fail ? new Error("synthetic db down") : []));

    await rememberCompanyResearch(ORG, "(주)가상 연구사", research);
    await rememberCompanyResearch(ORG, "가상 연구사", { ...research, method: "compact" });
    await rememberCompanyResearch(ORG, "가상 연구사", { ...research, method: undefined });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].op, "insert");
    assert.equal(calls[0].table, "company_research_cache");
    const [row] = calls[0].values as Array<Record<string, unknown>>;
    assert.equal(row.orgId, ORG);
    assert.equal(row.nameKey, "가상연구사");
    assert.equal(row.source, "serper");
    assert.equal((row.research as Record<string, unknown>).usage, undefined);
    assert.equal((row.research as Record<string, unknown>).description, found.description);

    fail = true;
    t.mock.method(console, "error", () => {});
    await rememberCompanyResearch(ORG, "가상 연구사", research);
});

test("DeepSeek 작성 호출은 그대로다 — 생각 끄기·시간 제한은 Qwen에만 붙는다", async (t) => {
    const bodies: Array<{ url: string; body: Record<string, unknown>; signal?: AbortSignal | null }> = [];
    t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
        bodies.push({ url: String(url), body: JSON.parse(String(init?.body)), signal: init?.signal });
        return qwenReply({ subject: "제목", htmlBody: "본문" });
    });
    await callGeminiJson({ provider: "deepseek", apiKey: "fake-deepseek", model: "deepseek-v4-flash" }, "JSON으로 답하세요", "질문");
    await callGeminiJson(qwen, "JSON으로 답하세요", "질문");
    assert.equal(bodies[0].url, "https://api.deepseek.com/chat/completions");
    assert.equal(bodies[0].body.enable_thinking, undefined);
    assert.equal(bodies[0].signal, undefined);
    assert.equal(bodies[1].url, QWEN_URL);
    assert.equal(bodies[1].body.enable_thinking, false);
    assert.ok(bodies[1].signal);
});
