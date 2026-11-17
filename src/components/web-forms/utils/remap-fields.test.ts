import test from "node:test";
import assert from "node:assert/strict";
import { findBasicFields } from "@/lib/leads/basic-fields";
import { autoLinkBasic, basicQuestions, remapToPartition } from "./remap-fields";
import type { FormFieldItem } from "../FormBuilder";

const f = (key: string, label: string, fieldType = "text", isSystem = false) => ({ key, label, fieldType, isSystem });
const q = (label: string, linkedFieldKey = "", fieldType = "text"): FormFieldItem => ({
    tempId: label, label, description: "", placeholder: "", fieldType, linkedFieldKey, isRequired: false, options: [],
});

// 실제 리드 타입 모양 (KSFC: name/contact, 디하: username + name, 설비지원몰: 담당자 name)
const KSFC = [f("status", "상태", "select"), f("companyname", "회사명"), f("name", "담당자명"), f("contact", "연락처", "phone"), f("email", "이메일", "email"), f("memo", "문의 내용", "textarea"), f("registeredAt", "등록일", "datetime", true)];
const OFFIO = [f("nextContactAt", "다음연락일", "datetime"), f("companyName", "회사명"), f("name", "이름/직함"), f("phone", "연락처", "phone"), f("email", "이메일", "email"), f("note", "요청사항", "textarea")];

test("기본 칸 찾기 — key → 라벨 → 종류, 시스템·담당자 선택 칸 제외", () => {
    const b = findBasicFields(KSFC);
    assert.deepEqual([b.name?.key, b.email?.key, b.phone?.key], ["name", "email", "contact"]);
    const byLabel = findBasicFields([f("x1", "성함"), f("x2", "메일", "email"), f("x3", "휴대폰")]);
    assert.deepEqual([byLabel.name?.key, byLabel.email?.key, byLabel.phone?.key], ["x1", "x2", "x3"]);
    const none = findBasicFields([f("name", "담당자", "user_select"), f("registeredAt", "등록일", "datetime", true)]);
    assert.deepEqual([none.name, none.email, none.phone], [null, null, null]);
});

test("파티션 변경 — 같은 key 유지, 같은 라벨·기본 칸 역할로 다시 잇고 못 찾은 것은 알려준다", () => {
    const questions = [q("성함", "name"), q("연락처", "contact", "phone"), q("이메일", "email", "email"), q("문의", "memo", "textarea"), q("공장 위치", "factoryCity"), q("메모만")];
    const r = remapToPartition(questions, [{ field: "status", value: "신규" }, { field: "factoryCity", value: "경남" }], [...KSFC, f("factoryCity", "공장 소재지")], OFFIO);
    assert.deepEqual(r.fields.map((x) => x.linkedFieldKey), ["name", "phone", "email", "", "", ""]);
    assert.deepEqual(r.unlinked, ["문의", "공장 위치", "메모만"]);
    assert.deepEqual(r.relinked.map((x) => `${x.label}:${x.from}->${x.to}`), ["성함:담당자명->이름/직함", "연락처:연락처->연락처"]);
    assert.deepEqual(r.defaultValues, []);
    assert.deepEqual(r.droppedDefaults, ["상태", "공장 소재지"]);
});

test("같은 라벨이면 key가 달라도 잇는다, 같은 칸에 두 질문을 잇지 않는다", () => {
    const r = remapToPartition([q("문의", "memo"), q("문의2", "memo")], [], KSFC, [f("inquiry", "문의 내용", "textarea")]);
    assert.deepEqual(r.fields.map((x) => x.linkedFieldKey), ["inquiry", ""]);
});

test("새 폼 기본 질문·AI 질문은 이름·이메일·연락처 칸에 자동 연결", () => {
    assert.deepEqual(basicQuestions(KSFC).map((x) => [x.label, x.linkedFieldKey]), [["이름", "name"], ["이메일", "email"], ["연락처", "contact"]]);
    const linked = autoLinkBasic([q("이름"), q("메일 주소", "", "email"), q("전화번호", "", "phone"), q("회사")], OFFIO);
    assert.deepEqual(linked.map((x) => x.linkedFieldKey), ["name", "email", "phone", ""]);
});
