import type { MentionPerson } from "../types";
import { mentionedPeople } from "../utils/mentions";

/**
 * 내부 메모의 멘션 대상 — 메모 글에 "@이름"으로 들어간 이 사업 상담 담당자.
 * 글에서 지우면 멘션도 빠진다.
 */
export function useNoteMentions(
    members: MentionPerson[],
    workspaceId: number | undefined,
    noteText: string,
    userId: string,
) {
    const candidates = members.filter(
        (m) => m.id !== userId && workspaceId && m.workspaceIds.includes(workspaceId),
    );
    const ids = mentionedPeople(noteText, candidates).map((m) => m.id).slice(0, 20);
    return { ids, candidates };
}
