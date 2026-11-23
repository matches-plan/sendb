import assert from "node:assert/strict";
import test from "node:test";
import type { Notification } from "../types";
import { newCustomerReplies } from "./reply-alerts";

const first: Notification = {
    id: "one", type: "customer", createdAt: "2026-11-23T01:00:00.000Z", readAt: null,
    conversationId: "thread", channelId: 1, messageId: null, name: "방문자", preview: "첫 문의", status: "open",
};
const reply = { ...first, id: "two", preview: "추가 문의", createdAt: "2026-11-23T01:01:00.000Z" };
const page = (rows: Notification[], hasMore = false) => ({ rows, hasMore, unread: rows.length });

test("첫 접속 때 기존 문의가 팝업으로 다시 뜨지 않는다", () => {
    assert.deepEqual(newCustomerReplies(undefined, [first]), []);
    assert.deepEqual(newCustomerReplies(page([]), [first]), [first]);
});

test("안 읽은 개수가 그대로여도 후속 답장을 알리고 재조회 때는 반복하지 않는다", () => {
    const next = [reply, { ...first, readAt: reply.createdAt }];
    assert.deepEqual(newCustomerReplies(page([first]), next), [reply]);
    assert.deepEqual(newCustomerReplies(page(next), next), []);
});

test("같은 시각의 새 답장도 구분하고 내부 멘션과 이미 읽은 메시지는 제외한다", () => {
    const sameTime = { ...reply, id: "three" };
    const mentioned = { ...reply, id: "mention", type: "mentioned" };
    const alreadyRead = { ...reply, id: "four", readAt: reply.createdAt };
    assert.deepEqual(newCustomerReplies(page([reply]), [sameTime, mentioned, alreadyRead, reply]), [sameTime]);
});

test("늦게 저장된 답장도 알리되 이미 페이지 밖에 있던 과거 알림은 다시 띄우지 않는다", () => {
    assert.deepEqual(newCustomerReplies(page([reply]), [reply, first]), [first]);
    assert.deepEqual(newCustomerReplies(page([reply], true), [reply, first]), []);
});
