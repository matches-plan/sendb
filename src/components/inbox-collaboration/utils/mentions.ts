/** 글 안의 "@이름"(뒤가 띄어쓰기·문장부호·끝)으로 멘션한 팀원을 찾는다 */
export function mentionedPeople<T extends { name: string }>(text: string, people: T[]) {
    return people.filter((p) => mentionPattern(p.name).test(text));
}
export function mentionPattern(name: string, flags = "") {
    return new RegExp(`(^|[^\\p{L}\\p{N}_])@${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`, "u" + flags);
}
