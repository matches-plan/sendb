import { test } from "node:test";
import assert from "node:assert/strict";
import { batchAlertText, releaseText, syncAlertText } from "@/lib/sender-health-rules";
import { sendHealthNotificationLink, sendHealthNotificationText } from "./send-health-text";

test("회차 묶음 — 주소 멈춤이 있으면 '발송 자동 멈춤', 첫 사건 요약과 나머지 건수", () => {
    const message = batchAlertText({
        orgName: "디하나",
        baseUrl: "https://app.example",
        blocks: [
            "[발송 위험 · 주소 멈춤] sales@example.com\n명단 2개에서 함께 실패율 5% 이상: A 7% · B 6%\n조치: 이 주소를 멈췄습니다.",
            "[발송 위험 · 명단] 워크투하이어 › 3월 명단\n최근 결과가 나온 300통 중 실패 20통 (6.7%)",
        ],
    });
    const t = sendHealthNotificationText({ batchKey: "run:1", message, workspaceName: "워크투하이어" });
    assert.ok(t);
    assert.equal(t.title, "워크투하이어 발송 자동 멈춤");
    assert.match(t.body, /^sales@example\.com — 명단 2개에서/);
    assert.match(t.body, /외 1건$/);
    assert.doesNotMatch(t.body, /자세히/);
});

test("회차 묶음 — 보류만 있으면 '명단 발송 보류', 운영(사업 이름 없음)", () => {
    const message = batchAlertText({ orgName: "디하나", baseUrl: "", blocks: ["[발송 위험 · 명단 보류] 오피오 › 명단\n실패 많음"] });
    const t = sendHealthNotificationText({ batchKey: "run:2", message, workspaceName: null });
    assert.equal(t?.title, "명단 발송 보류");
    assert.equal(t?.body, "오피오 › 명단 — 실패 많음");
});

test("본문은 160자 안으로 자른다", () => {
    const message = batchAlertText({ orgName: "o", baseUrl: "", blocks: [`[발송 위험 · 명단] ${"가".repeat(300)}`] });
    const t = sendHealthNotificationText({ batchKey: "run:3", message, workspaceName: null });
    assert.ok(t && [...t.body].length <= 160);
});

test("매일 보고는 알림으로 만들지 않는다", () => {
    assert.equal(sendHealthNotificationText({ batchKey: "report:2026-11-17", message: "x", workspaceName: null }), null);
});

test("NHN 결과 확인·풀림", () => {
    const sync = syncAlertText({ cause: "auth", orgName: "디하나", lastOkAt: null, lastError: null, baseUrl: "https://a" });
    const s = sendHealthNotificationText({ batchKey: "sync:auth:live:1", message: sync, workspaceName: null });
    assert.equal(s?.title, "NHN 결과 확인 문제");
    assert.doesNotMatch(s!.body, /디하나|자세히/);
    const rel = releaseText({ kind: "hold", name: "3월 명단", actorName: "주희", note: null, orgName: "디하나", workspaceName: "오피오", baseUrl: "https://a" });
    const r = sendHealthNotificationText({ batchKey: "release:hold:1", message: rel, workspaceName: "오피오" });
    assert.equal(r?.title, "오피오 발송 다시 시작");
    assert.match(r!.body, /보류를 풀었습니다/);
});

test("링크는 이 알림으로 거른 발송 이력 — 사업 알림은 그 사업 탭", () => {
    assert.equal(sendHealthNotificationLink({ alertId: 42, workspaceId: 23 }), "/email?tab=logs&ws=23&health=42");
    assert.equal(sendHealthNotificationLink({ alertId: 7, workspaceId: null }), "/email?tab=logs&health=7");
});
