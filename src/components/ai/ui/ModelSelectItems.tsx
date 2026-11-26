"use client";

import { SelectItem } from "@/components/ui/select";
import { AI_MODELS } from "@/lib/ai/models";
import { useAiModels } from "../hooks/useAiModels";

/** 작성 모델 선택 목록. 키가 연결되지 않은 모델은 고를 수 없다 — 지금 저장된 값은 그대로 보여 준다(UX-244와 같은 규칙) */
export function ModelSelectItems({ current, exclude }: { current?: string; exclude?: string }) {
    const models = useAiModels();
    return (
        <>
            {AI_MODELS.filter((m) => m.id !== exclude).map((m) => {
                const blocked = m.id !== current && models?.find((a) => a.id === m.id)?.available === false;
                return (
                    <SelectItem key={m.id} value={m.id} disabled={blocked}>
                        {m.label}
                        {blocked ? " · 연결 필요" : ""}
                    </SelectItem>
                );
            })}
        </>
    );
}
