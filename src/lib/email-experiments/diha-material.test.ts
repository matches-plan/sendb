import assert from "node:assert/strict";
import test from "node:test";
import { createDihaMaterial, dihaCompanyGroup, dihaMail } from "./diha-material";

const base = "https://designer-hire.com/?utm_source=owned";

test("업무가 확인된 회사만 해당 층에서 일반 사례와 실제 업무별 사례를 비교한다", () => {
    const material = createDihaMaterial("DH02", "식품\t가상식품\nSNS\t가상콘텐츠\n배너\t가상배너", base);
    assert.equal(dihaCompanyGroup(material, "가상식품 "), "food");
    assert.equal(dihaCompanyGroup(material, "미등록 식품업체"), undefined);
    assert.ok(!JSON.stringify(material).includes("가상식품"));
    for (const [tier, category] of [["food", "detail-page"], ["sns", "sns-content"], ["banner", "web-banner"]]) {
        const a = dihaMail(material, "A", tier), b = dihaMail(material, "B", tier);
        assert.equal(new URL(a.url).searchParams.get("type"), null);
        assert.equal(new URL(b.url).searchParams.get("type"), category);
        assert.equal(a.subject, b.subject);
        assert.equal(a.htmlBody.replace(/href="[^"]*"/, ""), b.htmlBody.replace(/href="[^"]*"/, ""));
    }
    assert.throws(() => dihaMail(material, "B", "미확인"));
    assert.throws(() => createDihaMaterial("DH02", "식품\t가상업체\n배너\t가상업체", base));
    assert.throws(() => createDihaMaterial("DH02", "__proto__\t가상업체", base));
});

test("체험 경로는 수신자 본문에서 실제 링크 하나만 다르고 제목 실험은 제목만 다르다", () => {
    const path = createDihaMaterial("DH03", "", base);
    const a = dihaMail(path, "A", ""), b = dihaMail(path, "B", "");
    assert.equal(new URL(a.url).pathname, "/");
    assert.equal(new URL(b.url).pathname, "/signup/");
    assert.equal(a.subject, b.subject);
    assert.equal(a.htmlBody.replace(/href="[^"]*"/, ""), b.htmlBody.replace(/href="[^"]*"/, ""));
    assert.equal((a.htmlBody.match(/<a /g) ?? []).length, 1);
    const title = createDihaMaterial("DH04", "", base);
    const titleA = dihaMail(title, "A", ""), titleB = dihaMail(title, "B", "");
    assert.notEqual(titleA.subject, titleB.subject);
    assert.equal(titleA.htmlBody, titleB.htmlBody);
    assert.equal(titleA.url, titleB.url);
    assert.throws(() => createDihaMaterial("DH03", "", "https://other.example/"));
});
