import test from "node:test";
import assert from "node:assert/strict";
import { applyOrder, mergeOrder } from "./useTabPrefs";

const tabs = (ids: number[]) => ids.map((id) => ({ id }));

test("다른 화면에만 있는 탭은 기본 순서에서 앞에 있던 탭 바로 뒤에 붙는다", () => {
    // 기본(이름순): 매치15, 디하8, 디하파트너즈11, 백오9 / 저장 순서 [9, 15, 8]
    assert.deepEqual(applyOrder(tabs([15, 8, 11, 9]), [9, 15, 8]).map((w) => w.id), [9, 15, 8, 11]);
    assert.deepEqual(applyOrder(tabs([15, 8]), []).map((w) => w.id), [15, 8]);
});

test("한 화면에서 바꾼 순서는 그 화면 탭 자리만 바꾸고 다른 화면 탭은 제자리", () => {
    // 상담 연락처에서 [디하파트너즈, 디하] 저장 → 상담톡(디하파트너즈 없음)에서 [픽셀, 디하]로 바꿈
    assert.deepEqual(mergeOrder([11, 8], [8, 10], [10, 8]), [11, 10, 8]);
    assert.deepEqual(mergeOrder([], [1, 2, 3], [3, 1, 2]), [3, 1, 2]);
});
