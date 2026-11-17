import test from "node:test";
import assert from "node:assert/strict";
import { contactSource, groupContacts } from "./contact-columns";

test("유입경로는 utm을 먼저, 없으면 들어온 사이트, 상담창 연락처는 상담창으로 보인다", () => {
    assert.equal(contactSource({ utmSource: "google", utmMedium: "cpc", utmCampaign: "brand" }), "google / cpc · brand");
    assert.equal(contactSource({ referrer: "https://www.naver.com/search?q=1" }), "naver.com");
    assert.equal(contactSource({ source: "messenger" }), "상담창");
    assert.equal(contactSource({}), "");
});

const row = (id: string, company: string, name: string, createdAt: string) => ({ id, version: 1, name, email: "", phone: "", company, attributes: {}, createdAt });

test("같은 기업명은 한 묶음, 기업명이 없으면 한 명씩, 고른 칸 순서로 정렬하고 빈 값은 맨 뒤", () => {
    const rows = [
        row("1", "디하", "나", "2026-11-01"),
        row("2", "", "가", "2026-11-03"),
        row("3", "디하", "다", "2026-11-05"),
        row("4", "백오피스", "라", "2026-11-02"),
    ];
    const byNew = groupContacts(rows, { key: "createdAt", dir: "desc" });
    assert.deepEqual(byNew.map((g) => g.rows.map((r) => r.id)), [["3", "1"], ["2"], ["4"]]);
    const byCompany = groupContacts(rows, { key: "company", dir: "asc" });
    assert.deepEqual(byCompany.map((g) => g.company), ["디하", "백오피스", ""]);
    const byName = groupContacts(rows, { key: "name", dir: "asc" });
    assert.deepEqual(byName.map((g) => g.rows[0].id), ["2", "1", "4"]);
    assert.equal(groupContacts(rows, { key: "name", dir: "asc" }, "백오").length, 1);
});

test("(주)·띄어쓰기만 다른 기업명은 같은 묶음, 유입경로로도 찾는다", () => {
    const rows = [row("1", "(주)조이웍스", "가", "2026-11-01"), row("2", "조이 웍스", "나", "2026-11-02"), { ...row("3", "", "다", "2026-11-03"), attributes: { utmSource: "google" } }];
    assert.deepEqual(groupContacts(rows, { key: "createdAt", dir: "desc" }).map((g) => g.rows.length), [1, 2]);
    assert.deepEqual(groupContacts(rows, { key: "createdAt", dir: "desc" }, "google").map((g) => g.rows[0].id), ["3"]);
});
