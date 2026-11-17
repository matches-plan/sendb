/**
 * 상담 메시지 서식 — 본문은 지금처럼 글자로 저장하고, 아래 몇 가지 표시만 서식으로 읽는다.
 *   **굵게**  *기울임*  `코드`  [보이는 글자](https://주소)  줄 처음 "- " 목록, 그냥 쓴 https 주소는 링크
 * 직원 화면·고객 채팅창은 서식으로 보여주고, 메일·알림처럼 글자만 가는 곳은 toPlainText로 표시를 걷어낸다.
 */
export type Inline =
    | { t: "text"; v: string }
    | { t: "b" | "i"; c: Inline[] }
    | { t: "code"; v: string }
    | { t: "link"; href: string; c: Inline[] };
export type Block = { t: "p"; c: Inline[] } | { t: "ul"; items: Inline[][] } | { t: "h"; level: 1 | 2 | 3; c: Inline[] };
/** 제목(# ~ ###)은 상담 지식 문서처럼 켠 곳에서만 읽는다 — 채팅 글의 "# "는 그냥 글자 */
type BlockOptions = { headings?: boolean };
const HEADING = /^(#{1,3})\s+(.*)$/;

const INLINE =
    /\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)|\*\*(?=\S)(.+?)(?<=\S)\*\*(?!\*)|\*(?=[^\s*])(.+?)(?<=[^\s*])\*|`([^`\n]+)`|(https?:\/\/[^\s<>()]*[^\s<>().,!?'"\]])/g;

export function parseInline(s: string): Inline[] {
    const out: Inline[] = [];
    let last = 0;
    for (const m of s.matchAll(INLINE)) {
        if (m.index > last) out.push({ t: "text", v: s.slice(last, m.index) });
        if (m[1] !== undefined) out.push({ t: "link", href: m[2], c: parseInline(m[1]) });
        else if (m[3] !== undefined) out.push({ t: "b", c: parseInline(m[3]) });
        else if (m[4] !== undefined) out.push({ t: "i", c: parseInline(m[4]) });
        else if (m[5] !== undefined) out.push({ t: "code", v: m[5] });
        else out.push({ t: "link", href: m[6], c: [{ t: "text", v: m[6] }] });
        last = m.index + m[0].length;
    }
    if (last < s.length) out.push({ t: "text", v: s.slice(last) });
    return out;
}

const BULLET = /^[-•]\s/;
export function parseBlocks(md: string, options: BlockOptions = {}): Block[] {
    const blocks: Block[] = [];
    for (const line of md.replace(/\r\n?/g, "\n").split("\n")) {
        const heading = options.headings ? HEADING.exec(line) : null;
        if (heading) blocks.push({ t: "h", level: heading[1].length as 1 | 2 | 3, c: parseInline(heading[2]) });
        else if (BULLET.test(line)) {
            const item = parseInline(line.slice(2));
            const prev = blocks.at(-1);
            if (prev?.t === "ul") prev.items.push(item);
            else blocks.push({ t: "ul", items: [item] });
        } else blocks.push({ t: "p", c: parseInline(line) });
    }
    return blocks;
}

const plainInline = (nodes: Inline[]): string =>
    nodes
        .map((n) => {
            if (n.t === "text" || n.t === "code") return n.v;
            const inner = plainInline(n.c);
            return n.t === "link" && inner !== n.href ? `${inner} (${n.href})` : inner;
        })
        .join("");

/** 서식 표시를 걷어낸 글자 (메일 본문·알림 미리보기용). 링크는 "글자 (주소)" */
export const toPlainText = (md: string) =>
    parseBlocks(md)
        .flatMap((b) => (b.t === "ul" ? b.items.map((i) => `- ${plainInline(i)}`) : [plainInline(b.c)]))
        .join("\n");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const htmlInline = (nodes: Inline[]): string =>
    nodes
        .map((n) =>
            n.t === "text"
                ? esc(n.v)
                : n.t === "code"
                  ? `<code>${esc(n.v)}</code>`
                  : n.t === "link"
                    ? `<a href="${esc(n.href)}">${htmlInline(n.c)}</a>`
                    : `<${n.t === "b" ? "strong" : "em"}>${htmlInline(n.c)}</${n.t === "b" ? "strong" : "em"}>`,
        )
        .join("");

/** 입력창(서식 편집기)에 넣을 HTML */
export const toEditorHtml = (md: string, options: BlockOptions = {}) =>
    parseBlocks(md, options)
        .map((b) =>
            b.t === "p"
                ? `<p>${htmlInline(b.c)}</p>`
                : b.t === "h"
                  ? `<h${b.level}>${htmlInline(b.c)}</h${b.level}>`
                  : `<ul>${b.items.map((i) => `<li><p>${htmlInline(i)}</p></li>`).join("")}</ul>`,
        )
        .join("");
