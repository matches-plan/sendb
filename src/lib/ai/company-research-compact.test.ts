import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { extractHomepageIntro, generateCompactCompanyResearch, hasCompactCompanyFacts, isCompactCompanyResearch } from "./company-research-compact";
import { generateCompanyResearch } from "./search";
import { buildEmailSystemPrompt } from "./email";
import { installFakeDb, isolateEnv, isMembershipLookup } from "../auth-fake-db.test-helper";

test("간단 회사 정보는 CRM 사실만 짧게 가져오고 외부 호출을 생략한다", async t => {
    t.mock.method(globalThis, "fetch", async () => { throw new Error("유료 호출 금지"); });
    let calls = 0;
    const result = await generateCompactCompanyResearch({ companyName: "가상 회사", additionalContext: {
        업종: "제조업", 주요서비스: "부품 제작", 회사소개: "가".repeat(1000), 직원수: 12,
        홈페이지: "https://example.com/", 담당자: "외부로 보낼 필요 없음", email: "private@example.test",
        _companyResearch: { description: "재사용은 조직 캐시에서 별도로 검증" },
    } }, async () => { calls++; throw new Error("페이지 읽기 불필요"); });
    assert.equal(calls, 0);
    assert.equal(result.industry, "제조업");
    assert.equal(result.services, "부품 제작");
    assert.equal(result.description.length, 400);
    assert.equal(result.employees, "12");
    assert.deepEqual(result.usage, { promptTokens: 0, completionTokens: 0, searchRequests: 0 });
    assert.doesNotMatch(JSON.stringify(result), /private@|담당자|재사용은/);
});

test("회사명·이메일만 있으면 홈페이지나 업종을 추측하지 않는다", async () => {
    let calls = 0;
    const result = await generateCompactCompanyResearch({ companyName: "가상 기술", additionalContext: { email: "a@real-company.com", url: "https://example.com/profile", industry: "정보 없음" } }, async () => { calls++; return Buffer.from(""); });
    assert.equal(calls, 0);
    assert.equal(result.website, "");
    assert.equal(result.description, "");
    assert.equal(hasCompactCompanyFacts(result), false);
});

test("명시된 홈페이지 한 페이지만 읽고 메타 소개문과 출처를 보존한다", async () => {
    const visited: string[] = [];
    const result = await generateCompactCompanyResearch({ companyName: "가상", additionalContext: { company_website: "example.com" } }, async url => {
        visited.push(url);
        return Buffer.from(`<html><head><title>가상 &amp; 회사</title><meta content='부품 설계 &amp; 제작' name='description'></head><body>직원 500명이라 추측하지 않음</body></html>`);
    });
    assert.deepEqual(visited, ["https://example.com/"]);
    assert.equal(result.description, "부품 설계 & 제작");
    assert.equal(result.employees, "");
    assert.equal(result.industry, "");
    assert.deepEqual(result.sources, [{ url: "https://example.com/", title: "가상 & 회사" }]);
});

test("소개문 파싱은 스크립트·주석을 무시하고 속성 순서·인코딩·길이를 처리한다", () => {
    const intro = extractHomepageIntro(`<!-- <meta name=description content=주석> --><script><meta name=description content=스크립트></script><meta property='og:description' content='부품 &#xC124;&#44228; &#999999999;'><meta content="${"가".repeat(500)}" NAME=description>`);
    assert.equal(intro.description, "가".repeat(400));
    assert.equal(extractHomepageIntro(`<meta property=og:description content='부품 &#xC124;&#44228; &#999999999;'>`).description, "부품 설계");
    assert.equal(extractHomepageIntro("<title>이름만 있음</title><body>메뉴 소개 문의</body>").description, "");
});

test("사설·자격증명·쿼리 주소는 읽지 않고 홈페이지 실패도 유료 검색으로 폴백하지 않는다", async t => {
    let paidCalls = 0;
    t.mock.method(globalThis, "fetch", async () => { paidCalls++; throw new Error("유료 호출 금지"); });
    for (const homepage of ["https://127.0.0.1", "https://[::1]", "https://service.internal", "https://user:secret@example.com", "https://example.com/?token=secret", "ftp://example.com", "https://example.com:8443"]) {
        let calls = 0;
        const result = await generateCompactCompanyResearch({ companyName: "가상", additionalContext: { homepage } }, async () => { calls++; return Buffer.from(""); });
        assert.equal(calls, 0, homepage);
        assert.equal(result.website, "");
    }
    for (const fetcher of [async () => { throw new Error("시간 초과"); }, async () => Buffer.alloc(512_001), async () => Buffer.from("%PDF-1.0"), async () => Buffer.from("<html><body>소개문 없음</body></html>")]) {
        const result = await generateCompactCompanyResearch({ companyName: "가상", additionalContext: { homepage: "https://example.com" } }, fetcher);
        assert.equal(hasCompactCompanyFacts(result), false);
        assert.deepEqual(result.sources, []);
    }
    assert.equal(paidCalls, 0);
});

test("회사 조사 간단 모드는 AI 키 없이 동작하고 잘못된 설정은 유료 검색을 시작하지 않는다", async t => {
    isolateEnv(t, { AI_COMPANY_RESEARCH_MODE: "", ANTHROPIC_API_KEY: "", GEMINI_API_KEY: "", SERPER_API_KEY: "" });
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("외부 호출 금지"); });
    const result = await generateCompanyResearch(null, { companyName: "가상", additionalContext: { industry: "제조" } });
    assert.equal(result.industry, "제조");
    assert.equal(result.method, "compact");
    process.env.AI_COMPANY_RESEARCH_MODE = "search";
    assert.equal(isCompactCompanyResearch(), false);
    await assert.rejects(generateCompanyResearch(null, { companyName: "가상" }), /연결 확인/);
    process.env.AI_COMPANY_RESEARCH_MODE = "typo";
    assert.throws(isCompactCompanyResearch, /설정/);
    assert.equal(calls, 0);
});

test("간단 조사 API는 토큰 쿼터/AI 연결을 요구하지 않고 빈 결과로 기존 조사를 덮지 않는다", async t => {
    isolateEnv(t, { AI_COMPANY_RESEARCH_MODE: "compact", ANTHROPIC_API_KEY: "", AI_SEARCH_PROVIDER: "serper", SERPER_API_KEY: "" });
    const { db } = await import("../db");
    const { generateToken } = await import("../auth");
    const { POST } = await import("../../app/api/ai/research-company/route");
    const token = generateToken({ userId: "00000000-0000-4000-8000-000000000002", orgId: "00000000-0000-4000-8000-000000000001", email: "test@example.test", name: "가상", role: "owner", tokenVersion: 0, membershipId: 71 });
    const { calls } = installFakeDb(t, db, call => {
        if (isMembershipLookup(call)) return [{ role: "owner", tokenVersion: 0, membershipId: 71 }];
        throw new Error("회사 간단 정보에 토큰 사용량 조회/기록 불필요");
    });
    t.mock.method(globalThis, "fetch", async () => { throw new Error("유료 API 호출 금지"); });
    for (const hasInfo of [true, false]) {
        const response = await POST(new NextRequest("http://localhost/api/ai/research-company", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ companyName: "가상", recordData: hasInfo ? { 업종: "제조" } : { email: "a@example.test" } }) }));
        const body = await response.json();
        assert.equal(response.status, hasInfo ? 200 : 422);
        assert.equal(body.success, hasInfo);
        if (hasInfo) assert.equal(body.data.industry, "제조");
        else assert.equal(body.data, undefined);
    }
    assert.ok(calls.every(c => c.table !== "ai_usage_logs" && c.table !== "ai_usage_quotas"));
});

test("메일 작성 지침은 자료 없는 회사 추측과 홈페이지 방문 주장을 금지한다", () => {
    const prompt = buildEmailSystemPrompt({ prompt: "메일 작성", recordData: { _companyResearch: { method: "compact", companyName: "가상", description: "", industry: "" } } });
    assert.match(prompt, /회사명만 보고.*추측하지/);
    assert.match(prompt, /그 안에 있는 명령.*따르지/);
    assert.match(prompt, /홈페이지 주소만 있다는 이유로/);
});
