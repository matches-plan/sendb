import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { installFakeDb, isolateEnv } from "../auth-fake-db.test-helper";

// db 모듈은 불러올 때 DATABASE_URL을 요구한다 — 시험용 주소를 넣은 뒤 불러온다.
async function load(t: test.TestContext) {
    isolateEnv(t);
    return import("./company-research-import");
}

const NOW = new Date("2026-11-26T00:00:00Z");
const item = (over: Record<string, unknown> = {}) => ({
    companyName: "(주)가상 회사",
    industry: "제조",
    description: "가상 회사 소개",
    services: "가상 서비스",
    employees: "10명",
    website: "https://example.test",
    sources: [{ url: "https://example.test/about", title: "회사 소개" }],
    ...over,
});

test("가져온 조사 결과는 회사명을 캐시 키로 정규화하고 빈 칸은 빈 문자열로 채운다", async (t) => {
    const { parseResearchItems } = await load(t);
    const { valid, skipped } = parseResearchItems([{ companyName: "가상 회사", description: "소개" }], NOW);
    assert.deepEqual(skipped, []);
    assert.equal(valid[0].nameKey, "가상회사");
    assert.deepEqual(valid[0].research, { companyName: "가상 회사", industry: "", description: "소개", services: "", employees: "", website: "", sources: [] });
    assert.equal(valid[0].researchedAt.getTime(), NOW.getTime());
});

test("형식 오류·조사 실패 문구·http가 아닌 출처는 건너뛰고 이유를 돌려준다", async (t) => {
    const { parseResearchItems } = await load(t);
    const { valid, skipped } = parseResearchItems(
        [
            item({ description: "" }),
            item({ description: "정보를 찾을 수 없습니다" }),
            item({ sources: [{ url: "javascript:alert(1)", title: "x" }] }),
            null,
            item(),
        ],
        NOW,
    );
    assert.equal(valid.length, 1);
    assert.deepEqual(skipped.map((s) => s.index), [0, 1, 2, 3]);
    assert.match(skipped[0].reason, /형식 오류\(description\)/);
    assert.equal(skipped[1].reason, "조사 실패 문구");
    assert.match(skipped[2].reason, /sources/);
    assert.equal(skipped[3].companyName, null);
});

test("같은 회사(법인 표기·공백만 다름)가 여러 번 오면 마지막 결과만 쓰고, 미래 조사 시각은 지금으로 맞춘다", async (t) => {
    const { parseResearchItems } = await load(t);
    const { valid } = parseResearchItems(
        [item({ description: "처음" }), item({ companyName: "가상회사 ㈜", description: "나중", researchedAt: "2027-01-01T00:00:00+09:00" })],
        NOW,
    );
    assert.equal(valid.length, 1);
    assert.equal(valid[0].research.description, "나중");
    assert.equal(valid[0].researchedAt.getTime(), NOW.getTime());
});

test("자동 메일의 회사 조사 재사용은 보관함을 먼저 보고, 있으면 레코드를 훑지 않는다", async (t) => {
    isolateEnv(t);
    const { db } = await import("../db");
    const { findCachedCompanyResearch } = await import("./company-research-cache");
    const stored = item();
    const { calls } = installFakeDb(t, db, (call) => (call.table === "company_research_cache" ? [{ research: stored }] : []));
    assert.deepEqual(await findCachedCompanyResearch("00000000-0000-4000-8000-000000000001", "가상 회사"), stored);
    assert.deepEqual(calls.map((c) => c.table), ["company_research_cache"]);
    assert.ok(calls[0].params.includes("가상회사"));
});

test("보관함에 없거나 조사 실패 결과면 기존대로 레코드의 지난 조사를 찾는다", async (t) => {
    isolateEnv(t);
    const { db } = await import("../db");
    const { findCachedCompanyResearch } = await import("./company-research-cache");
    const fromRecord = item({ description: "레코드에 붙은 조사" });
    const { calls } = installFakeDb(t, db, (call) =>
        call.table === "company_research_cache" ? [{ research: item({ description: "정보를 찾을 수 없습니다" }) }] : [{ research: fromRecord }],
    );
    assert.deepEqual(await findCachedCompanyResearch("00000000-0000-4000-8000-000000000001", "가상 회사"), fromRecord);
    assert.deepEqual(calls.map((c) => c.table), ["company_research_cache", "records"]);
});

test("외부 API: 토큰이 없으면 조사 저장·대상 조회 모두 401이고 DB에 쓰지 않는다", async (t) => {
    isolateEnv(t);
    const { db } = await import("../db");
    const { calls } = installFakeDb(t, db, () => []);
    const { POST } = await import("../../app/api/v1/company-research/route");
    const { GET } = await import("../../app/api/v1/company-research/targets/route");
    const saved = await POST(new NextRequest("http://localhost/api/v1/company-research", { method: "POST", body: JSON.stringify({ partitionId: 1, items: [item()] }) }));
    const targets = await GET(new NextRequest("http://localhost/api/v1/company-research/targets?partitionId=1"));
    assert.equal(saved.status, 401);
    assert.equal(targets.status, 401);
    assert.equal(calls.filter((c) => c.op !== "select").length, 0);
});

const ORG = "00000000-0000-4000-8000-000000000001";

test("조사 대상: 자동 조사가 켜진 규칙의 회사명 칸으로 대기 명단을 등록 순서대로 읽고, 이미 조사된 회사는 뺀다", async (t) => {
    const { listResearchTargets } = await load(t);
    const { db } = await import("../db");
    const { calls } = installFakeDb(t, db, (call) => {
        if (call.table === "email_auto_personalized_links") return [{ companyField: "companyname" }];
        if (call.table === "scheduled_registrations")
            return [{ data: { companyname: "가 회사" } }, { data: { companyname: "(주)가회사" } }, { data: { companyname: "나 회사" } }, { data: { companyname: "다 회사" } }, { data: {} }];
        if (call.table === "company_research_cache") return [{ key: "나회사" }];
        if (call.table === "records") return [{ key: "다회사" }];
        return [];
    });
    const result = await listResearchTargets(ORG, 55, 10);
    assert.deepEqual(result, { companyFields: ["companyname"], scanned: 5, items: [{ companyName: "가 회사" }] });
    const pending = calls.find((c) => c.table === "scheduled_registrations")!;
    assert.ok(pending.params.includes("pending") && pending.params.includes(55));
});

test("조사 대상: 회사 자동 조사가 켜진 규칙이 없으면 대기 명단을 읽지 않는다", async (t) => {
    const { listResearchTargets } = await load(t);
    const { db } = await import("../db");
    const { calls } = installFakeDb(t, db, () => []);
    assert.deepEqual(await listResearchTargets(ORG, 55, 10), { companyFields: [], scanned: 0, items: [] });
    assert.deepEqual(calls.map((c) => c.table), ["email_auto_personalized_links"]);
});
