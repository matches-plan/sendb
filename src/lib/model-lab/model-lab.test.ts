import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { installFakeDb, isolateEnv, isMembershipLookup } from "../auth-fake-db.test-helper";
import type { CopyConnection } from "../ai-copy/types";
import { MIN_SAMPLE, rankRows, summarize } from "./leaderboard";

const ORG = "00000000-0000-4000-8000-000000000001";

test("미리보기 추정 비용 = 토큰 × 정가(100만 토큰당), 정가가 없으면 모른다", async (t) => {
    isolateEnv(t);
    const { estimateUsd } = await import("./preview");
    assert.equal(estimateUsd({ listPriceUsd: { input: 0.3, output: 1.2 } }, { promptTokens: 6500, completionTokens: 400 }), (6500 * 0.3 + 400 * 1.2) / 1_000_000);
    assert.equal(estimateUsd({}, { promptTokens: 1, completionTokens: 1 }), null);
});

test("순위표: 오픈률 분모는 오픈 추적 발송, 표본이 충분한 모델이 먼저", () => {
    const enough = { sent: MIN_SAMPLE, open_tracked: 50, opened: 10, clicked: 2, replied: 1 };
    const s = summarize(enough);
    assert.equal(s.open.rate, 0.2);
    assert.equal(s.click.rate, 2 / MIN_SAMPLE);
    assert.ok(s.open.ci && s.open.ci[0] < 0.2 && s.open.ci[1] > 0.2);
    assert.equal(s.sampleOk, true);
    const small = { ...summarize({ sent: 10, open_tracked: 10, opened: 9, clicked: 0, replied: 0 }), model: "small" };
    const big = { ...s, model: "big" };
    assert.deepEqual(rankRows([small, big], "open").map((r) => r.model), ["big", "small"]);
    assert.equal(summarize({ sent: 0, open_tracked: 0, opened: 0, clicked: 0, replied: 0 }).open.rate, null);
});

test("순위표: 모델·규칙 쌍을 모델별로 더하고, 단가를 모르는 쌍이 섞이면 비용도 모른다", async (t) => {
    isolateEnv(t);
    const { rollUpByModel } = await import("./leaderboard");
    const pair = (model: string, rule: number, sent: number, cost: number | null) => ({
        model, rule_id: rule, rule_name: null, partition_id: null, sent, open_tracked: sent, opened: 1, clicked: 1, replied: 0,
        latency_ms_sum: 1000 * sent, latency_count: sent, prompt_tokens: 10, completion_tokens: 2, cost_krw: cost, cost_known: cost != null,
    });
    const [haiku, qwen] = rollUpByModel([pair("claude-haiku-5-5", 1, 100, 50), pair("claude-haiku-5-5", 2, 50, null), pair("qwen3.7-flash", 1, 20, 3)]);
    assert.equal(haiku.rules, 2);
    assert.equal(haiku.sent, 150);
    assert.equal(haiku.latency_ms_sum / haiku.latency_count, 1000);
    assert.equal(haiku.cost_known, false);
    assert.equal(haiku.cost_krw, null);
    assert.equal(qwen.cost_krw, 3);
});

function fakeConn(handle: (sql: string) => Record<string, unknown>[] | undefined) {
    return Object.assign(async (strings: TemplateStringsArray) => handle(strings.join("?")) ?? [], { release() {} }) as unknown as CopyConnection;
}

test("회사 조사 관찰: 날짜별 Qwen 호출·추정 비용·새로 쌓인 회사·간단 조사 대체를 모은다 (키 값은 내보내지 않는다)", async (t) => {
    isolateEnv(t);
    const { loadResearchStats } = await import("./research-stats");
    const conn = fakeConn((sql) => {
        if (sql.includes("FROM ai_usage_logs"))
            return [
                { day: "2026-11-27", provider: "qwen", purpose: "auto_company_research", calls: 10, prompt_tokens: 40000, completion_tokens: 6000 },
                { day: "2026-11-27", provider: "serper", purpose: "company_research_fallback", calls: 2, prompt_tokens: 0, completion_tokens: 0 },
            ];
        if (sql.includes("GROUP BY source")) return [{ source: "serper", count: 8 }, { source: "import", count: 3 }];
        if (sql.includes("source = 'serper'")) return [{ day: "2026-11-27", count: 8 }];
        return undefined;
    });
    const stats = await loadResearchStats(conn, { orgId: ORG, days: 30 }, { SERPER_API_KEY: "serper-secret", QWEN_API_KEY: "qwen-secret" });
    assert.equal(stats.mode, "serper");
    assert.equal(stats.summarizer, "qwen");
    assert.deepEqual(stats.cache, { import: 3, serper: 8, total: 11 });
    assert.equal(stats.days[0].qwenCalls, 10);
    assert.equal(stats.days[0].fallbacks, 2);
    assert.equal(stats.days[0].serperNew, 8);
    assert.ok(Math.abs(stats.days[0].estCostUsd - (40000 * 0.03 + 6000 * 0.13) / 1_000_000) < 1e-12);
    assert.doesNotMatch(JSON.stringify(stats), /secret/);
});

test("serper 방식에서 간단 조사로 끝난 조사는 토큰 0인 대체 기록을 남기고 보관함에는 넣지 않는다", async (t: TestContext) => {
    isolateEnv(t, { AI_COMPANY_RESEARCH_MODE: "serper", SERPER_API_KEY: "s" });
    const { db } = await import("../db");
    const { rememberCompanyResearch } = await import("../ai/company-research-cache");
    const { calls } = installFakeDb(t, db, () => []);
    await rememberCompanyResearch(ORG, "가상 회사", { companyName: "가상 회사", industry: "", description: "", services: "", employees: "", website: "", sources: [], usage: { promptTokens: 0, completionTokens: 0 }, method: "compact" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].table, "ai_usage_logs");
    assert.equal((calls[0].values as { purpose: string }).purpose, "company_research_fallback");
});

test("모델 가용성 API: 로그인이 필요하고, 키 값 없이 필요한 키 이름만 내려준다", async (t) => {
    isolateEnv(t, { ANTHROPIC_API_KEY: "sk-ant-secret-value", OPENROUTER_API_KEY: "", QWEN_API_KEY: "", DEEPSEEK_API_KEY: "", GEMINI_API_KEY: "" });
    const { db } = await import("../db");
    const { generateToken } = await import("../auth");
    const { GET } = await import("../../app/api/ai/models/route");
    installFakeDb(t, db, (call) => (isMembershipLookup(call) ? [{ role: "member", tokenVersion: 0, membershipId: 71 }] : []));
    assert.equal((await GET(new NextRequest("http://localhost/api/ai/models"))).status, 401);
    const token = generateToken({ userId: "00000000-0000-4000-8000-000000000002", orgId: ORG, email: "test@example.test", name: "가상", role: "member", tokenVersion: 0, membershipId: 71 });
    const response = await GET(new NextRequest("http://localhost/api/ai/models", { headers: { authorization: `Bearer ${token}` } }));
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.doesNotMatch(text, /secret-value/);
    const body = JSON.parse(text);
    assert.equal(body.data.find((m: { id: string }) => m.id === "claude-sonnet-5-5").available, true);
    assert.deepEqual(body.data.find((m: { id: string }) => m.id === "qwen3.7-flash").missing, ["QWEN_API_KEY", "OPENROUTER_API_KEY"]);
});
