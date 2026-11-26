// 모델 A/B — 지시사항은 규칙 그대로, A는 시작 때 규칙 모델, B는 후보 모델로 수신자를 나눈다.
// 실제 DB 없이 원시 SQL 연결을 흉내 낸다(automation-retry.test.ts와 같은 방식).
import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { isolateEnv } from "../auth-fake-db.test-helper";
import type { CopyConnection } from "../ai-copy/types";
import type { Experiment } from "./types";
import { promptTestResult } from "./prompt-decision";

type Row = Record<string, unknown>;
const ORG = "00000000-0000-4000-8000-000000000001";
const USER = "00000000-0000-4000-8000-000000000002";

async function load(t: TestContext, env: Record<string, string> = {}) {
    isolateEnv(t, { ANTHROPIC_API_KEY: "fake-claude", QWEN_API_KEY: "fake-qwen", OPENROUTER_API_KEY: "", DEEPSEEK_API_KEY: "", ...env });
    return { ...(await import("./prompt-tests")), ...(await import("./repository")) };
}

function fakeConn(handle: (sql: string, values: unknown[]) => Row[] | undefined) {
    const log: Array<{ sql: string; values: unknown[] }> = [];
    const conn = Object.assign(
        async (strings: TemplateStringsArray, ...values: unknown[]) => {
            const sql = strings.join("?");
            log.push({ sql, values });
            return handle(sql, values) ?? [];
        },
        { release() {} },
    );
    return { conn: conn as unknown as CopyConnection, log };
}

/** 규칙(모델 미지정 = Haiku 5.5)과 진행 중 실험을 돌려주는 연결 */
function ruleConn(opts: { active?: Row; bound?: boolean; ruleModel?: string | null } = {}) {
    return fakeConn((sql) => {
        if (sql.includes("FROM email_auto_personalized_links l JOIN partitions p ON p.id = l.partition_id"))
            return [{ workspace_id: 3, prompt: "기존 지시사항", name: "규칙", model: opts.ruleModel ?? null }];
        if (sql.includes("FROM email_copy_experiments") && sql.includes("FOR UPDATE")) return opts.active ? [opts.active] : [];
        if (sql.includes("FROM ai_copy_bindings")) return opts.bound ? [{ "?column?": 1 }] : [];
        if (sql.includes("SELECT l.*,x.url AS product_url")) return [{ id: 9, partition_id: 1, prompt: "기존 지시사항", asset_urls: [] }];
        if (sql.includes("count(*)::int AS sent")) return [{ sent: 0, hit: 0 }];
        if (sql.includes("INSERT INTO email_copy_experiments")) return [{ id: 55 }];
        return undefined;
    });
}

const start = (modelB: string) => ({ kind: "model" as const, modelB, metric: "open" as const });

test("모델 A/B 시작: A는 지금 규칙 모델(미지정이면 기본 Haiku 5.5), B는 고른 모델, 지시사항은 규칙 그대로", async (t) => {
    const { syncPromptTest } = await load(t);
    const { conn, log } = ruleConn();
    const result = await syncPromptTest(conn, { orgId: ORG, userId: USER, ruleId: 9, start: start("qwen3.7-flash"), now: new Date() });
    assert.deepEqual(result, { experimentId: 55, stopped: null });
    const insert = log.find((c) => c.sql.includes("INSERT INTO email_copy_experiments"))!;
    const config = JSON.parse(insert.values.find((v) => typeof v === "string" && v.startsWith("{")) as string);
    assert.equal(config.kind, "model");
    assert.equal(config.modelA, "claude-haiku-5-5");
    assert.equal(config.modelB, "qwen3.7-flash");
    assert.equal(config.promptA, "기존 지시사항");
    assert.equal(config.promptB, undefined);
    assert.equal(config.scope, "all");
    assert.equal(config.metric, "open");
});

test("모델 A/B 시작 거절: 같은 모델·연결 안 된 모델·승인된 작성 버전에 묶인 규칙", async (t) => {
    const { syncPromptTest } = await load(t);
    await assert.rejects(syncPromptTest(ruleConn().conn, { orgId: ORG, userId: USER, ruleId: 9, start: start("claude-haiku-5-5"), now: new Date() }), /같습니다/);
    await assert.rejects(syncPromptTest(ruleConn().conn, { orgId: ORG, userId: USER, ruleId: 9, start: start("deepseek-v4-1-flash"), now: new Date() }), /OPENROUTER_API_KEY/);
    await assert.rejects(syncPromptTest(ruleConn().conn, { orgId: ORG, userId: USER, ruleId: 9, start: start("gpt-9"), now: new Date() }), /모델을 골라/);
    await assert.rejects(syncPromptTest(ruleConn({ bound: true }).conn, { orgId: ORG, userId: USER, ruleId: 9, start: start("qwen3.7-flash"), now: new Date() }), /작성 버전/);
});

test("진행 중 모델 A/B는 규칙 모델(A안)을 바꿔 저장하면 중단된다", async (t) => {
    const { syncPromptTest } = await load(t);
    const active = { id: 41, state: "running", config: { kind: "model", modelA: "claude-haiku-4-5", modelB: "qwen3.7-flash" } };
    const { conn, log } = ruleConn({ active, ruleModel: "claude-haiku-5-5" });
    const result = await syncPromptTest(conn, { orgId: ORG, userId: USER, ruleId: 9, start: null, now: new Date() });
    assert.deepEqual(result, { experimentId: null, stopped: 41 });
    assert.ok(log.some((c) => c.sql.includes("UPDATE email_copy_experiments SET state='closed'")));
    assert.ok(log.some((c) => c.values.includes("ab_test_model_changed")));

    // 같은 모델이면 그대로 둔다
    const same = ruleConn({ active, ruleModel: "claude-haiku-4-5" });
    assert.deepEqual(await syncPromptTest(same.conn, { orgId: ORG, userId: USER, ruleId: 9, start: null, now: new Date() }), { experimentId: 41, stopped: null });
});

test("집단별 모델: 모델 A/B만 모델을 주고, 지시사항 실험에는 없다", async (t) => {
    const { armModelOf } = await load(t);
    const model = { config: { kind: "model", modelA: "claude-haiku-5-5", modelB: "qwen3.7-flash" } } as unknown as Experiment;
    const prompt = { config: { kind: "prompt", promptA: "a", promptB: "b" } } as unknown as Experiment;
    assert.equal(armModelOf(model, "A"), "claude-haiku-5-5");
    assert.equal(armModelOf(model, "B"), "qwen3.7-flash");
    assert.equal(armModelOf(prompt, "B"), undefined);
});

test("모델 A/B 결과 표시는 지시사항 AB 테스트와 같은 규칙", () => {
    assert.equal(promptTestResult({ kind: "model", state: "closed", lastAction: "ab_test_decided", lastDetail: { result: "B" }, adopted: false }), "B");
    assert.equal(promptTestResult({ kind: "model", state: "closed", lastAction: "applied_a", lastDetail: null, adopted: false }), "applied_A");
    assert.equal(promptTestResult({ kind: "model", state: "running", lastAction: null, lastDetail: null, adopted: false }), "running");
});
