/**
 * AB 테스트(prompt 실험)의 '바꿀 곳' — B 지시사항을 메일의 어디에 적용할지.
 * 제목과 본문은 한 번의 AI 호출로 함께 만들어지므로, 제목만·첫 문장만 바꿀 때는
 * A 지시사항을 그대로 두고 그 뒤에 '이 부분에만 적용'이라는 구분된 지시 묶음을 붙인다.
 * 의존성이 없어 서버(발송·이긴 안 적용)와 테스트가 함께 쓴다.
 */
export type PromptTestScope = "subject" | "opening" | "all";
export type PromptTestAxis = "opening" | "question" | "tone" | "length";

const SCOPED_BLOCK: Record<Exclude<PromptTestScope, "all">, { title: string; rule: string }> = {
    subject: {
        title: "제목 지시 — 메일 제목에만 적용",
        rule: "아래 지시는 메일 제목(subject)을 쓸 때만 따르세요. 본문은 위 지시사항 그대로 쓰고, 아래 지시 때문에 본문의 내용·구성·어조·길이를 바꾸지 마세요.",
    },
    opening: {
        title: "첫 문장 지시 — 본문 첫 문장에만 적용",
        rule: "아래 지시는 본문의 첫 문장(인사·도입)을 쓸 때만 따르세요. 제목과 첫 문장 뒤의 본문은 위 지시사항 그대로 쓰고, 아래 지시 때문에 바꾸지 마세요.",
    },
};

export const normalizeScope = (value: unknown): PromptTestScope =>
    value === "subject" || value === "opening" ? value : "all";

/** 이 집단이 실제로 쓰는 지시사항. scope가 all이면 B가 A를 대신하고, 아니면 A 뒤에 B를 그 부분 지시로 붙인다 */
export function scopedPrompt(promptA: string, promptB: string, scope: PromptTestScope | undefined): string {
    const s = normalizeScope(scope);
    if (s === "all") return promptB;
    const block = SCOPED_BLOCK[s];
    return `${promptA.trim()}\n\n[${block.title}]\n${block.rule}\n<<<\n${promptB.trim()}\n>>>`;
}
