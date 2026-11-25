import { useMemo, useState } from "react";
import { toast } from "sonner";
import { renameAbTest, syncRuleAbTest } from "../api/abTests";
import type { AbTestDraft, AbTestMetric, AbTestScope } from "../types";
import { SCOPE_METRICS } from "../utils/labels";
import { useAbTests } from "./useAbTests";

const EMPTY_DRAFT: Omit<AbTestDraft, "name"> = { promptB: "", metric: "reply", scope: "all" };

/**
 * 규칙 화면의 AB 테스트 목록 — 이 규칙의 AB 테스트(테스트 1, 2…)와 새로 추가할 테스트(draft).
 * 새 테스트는 규칙을 저장할 때 save(ruleId)로 시작한다. 한 규칙에 진행 중인 테스트는 하나뿐이다.
 */
export function useRuleAbTest(ruleId: number | null) {
    const { data, mutate } = useAbTests(ruleId ? { ruleId } : null);
    const tests = useMemo(
        () => (data ?? []).filter((t) => t.kind === "prompt").sort((a, b) => a.id - b.id),
        [data],
    );
    const runningTest = tests.find((t) => t.result === "running") ?? null;
    const [draft, setDraft] = useState<AbTestDraft | null>(null);
    const update = (patch: Partial<AbTestDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
    return {
        tests,
        runningTest,
        draft,
        /** 진행 중이거나 추가 중인 테스트가 있으면 추가할 수 없다 — 한 번에 하나 */
        canAdd: !runningTest && !draft,
        add: () => setDraft({ ...EMPTY_DRAFT, name: `테스트 ${tests.length + 1}` }),
        cancel: () => setDraft(null),
        setName: (name: string) => update({ name }),
        /** 이미 시작한 테스트 이름 바꾸기 */
        rename: async (id: number, name: string) => {
            try {
                await renameAbTest(id, name);
                await mutate();
            } catch (e) {
                toast.error(e instanceof Error ? e.message : "이름을 바꾸지 못했습니다.");
            }
        },
        setPromptB: (promptB: string) => update({ promptB }),
        setDihaRound: (dihaRound: AbTestDraft["dihaRound"]) => update({ dihaRound, verifiedCompanies: "", metric: "click", scope: "all" }),
        setVerifiedCompanies: (verifiedCompanies: string) => update({ verifiedCompanies }),
        setMetric: (metric: AbTestMetric) => update({ metric }),
        /** 테스트 선택을 바꾸면 기준도 그 곳의 기본값으로 (제목만 → 오픈률) */
        setScope: (scope: AbTestScope) => update({ scope, metric: SCOPE_METRICS[scope][0] }),
        /** 추가 중인데 B안이 비었으면 저장 전에 막는다 */
        invalid: !!draft && (draft.dihaRound ? draft.dihaRound === "DH02" && !draft.verifiedCompanies?.trim() : !draft.promptB.trim()),
        /** 규칙 저장 뒤 — 지시사항이 바뀌었으면 진행 중 테스트 중단, 추가한 테스트가 있으면 시작 */
        save: async (id: number) => {
            if (!draft && !runningTest) return { experimentId: null, stopped: null };
            const result = await syncRuleAbTest(id, draft);
            if (result.stopped) toast.info("AI 지시사항이 바뀌어 진행 중이던 AB 테스트를 중단했습니다.");
            setDraft(null);
            await mutate();
            return result;
        },
        reload: () => mutate(),
    };
}
