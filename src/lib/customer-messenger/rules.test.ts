import test from "node:test";
import assert from "node:assert/strict";
import {
    contactInput,
    messengerSettingsSchema,
    notificationDecision,
    messengerLinks,
    fillNoticeText,
    noticeLink,
} from "./rules";
import { noticeMailBody } from "./notice-text";
test("이메일 알림 선택에는 유효한 주소가 필요하고 연락처는 현재 문의용이다", () => {
    assert.equal(
        contactInput.safeParse({ action: "contact", notifyEmail: true })
            .success,
        false,
    );
    assert.equal(
        contactInput.safeParse({
            action: "contact",
            phone: "010-1234-5678",
            email: "qa@example.test",
        }).success,
        true,
    );
    assert.equal(
        contactInput.safeParse({ action: "contact", contactId: "untrusted" })
            .success,
        false,
    );
    assert.equal(
        messengerSettingsSchema.safeParse({
            links: [{ label: "열기", url: "javascript:alert(1)" }],
        }).success,
        false,
    );
});
test("읽은 답변·과거 기록·연락처 없음·후속 답변에는 알림을 보내지 않는다", () => {
    const base = {
        enabled: true,
        consent: true,
        read: false,
        superseded: false,
        historyOnly: false,
        medium: "web",
    };
    assert.equal(notificationDecision(base), "send");
    for (const patch of [
        { read: true },
        { consent: false },
        { historyOnly: true },
        { superseded: true },
        { medium: "email" },
        { enabled: false },
    ])
        assert.notEqual(notificationDecision({ ...base, ...patch }), "send");
});
test("전화 문의 번호와 프로필 이미지는 형식을 확인한다", () => {
    assert.equal(messengerSettingsSchema.safeParse({ phone: "02-1234-5678" }).success, true);
    assert.equal(messengerSettingsSchema.safeParse({ phone: "전화주세요" }).success, false);
    assert.equal(messengerSettingsSchema.safeParse({ profileImageUrl: "http://a.com/x.png" }).success, false);
    assert.equal(messengerSettingsSchema.parse({}).phoneEnabled, false);
});
test("예전 도입 상담 링크는 카드 하나로 읽고, 잘못된 주소는 버린다", () => {
    assert.deepEqual(messengerLinks(messengerSettingsSchema.parse({ consultationUrl: "https://a.com/c" })), [
        { label: "1:1 도입 상담 신청하기", url: "https://a.com/c" },
    ]);
    assert.deepEqual(messengerLinks(messengerSettingsSchema.parse({ consultationUrl: "javascript:alert(1)" })), []);
});
test("답변 알림 문구는 변수를 바꾸고, 링크는 열쇠로 지난 상담을 연다", () => {
    assert.equal(
        fillNoticeText("[##상담창이름##] ##고객명##님 ##답변시간##", { customerName: "김디하", channelName: "디하", replyTime: "11월 17일 오후 3:20" }),
        "[디하] 김디하님 11월 17일 오후 3:20",
    );
    assert.equal(noticeLink("https://sendb.kr", "abc", "f".repeat(64)), `https://sendb.kr/chat/abc?resume=${"f".repeat(64)}`);
    const body = noticeMailBody("<b>안녕</b>\n줄", "https://a.com/?sendb_chat=open", "#635BFF");
    assert.match(body, /&lt;b&gt;안녕&lt;\/b&gt;<br>줄/);
    assert.match(body, /답변 확인하기/);
});
