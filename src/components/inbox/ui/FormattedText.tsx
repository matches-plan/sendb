import { Fragment, type ReactNode } from "react";
import { parseBlocks, type Inline } from "@/lib/rich-text/format";
import { mentionPattern } from "@/components/inbox-collaboration/utils/mentions";

/** 글 조각 안의 "@이름"을 배지로 감싼다 */
function withMentions(text: string, names: string[]): ReactNode {
    if (!names.length) return text;
    const parts: ReactNode[] = [];
    let rest = text;
    for (;;) {
        let best: { index: number; length: number } | null = null;
        for (const name of names) {
            const m = mentionPattern(name).exec(rest);
            if (!m) continue;
            const index = m.index + m[1].length;
            if (!best || index < best.index) best = { index, length: name.length + 1 };
        }
        if (!best) break;
        parts.push(rest.slice(0, best.index));
        parts.push(<span key={parts.length} className="mention-chip">{rest.slice(best.index, best.index + best.length)}</span>);
        rest = rest.slice(best.index + best.length);
    }
    parts.push(rest);
    return parts;
}

function inline(nodes: Inline[], names: string[] = []): ReactNode[] {
    return nodes.map((n, i) => {
        if (n.t === "text") return <Fragment key={i}>{withMentions(n.v, names)}</Fragment>;
        if (n.t === "code")
            return (
                <code key={i} className="rounded bg-black/10 px-1 py-px text-[0.9em]">
                    {n.v}
                </code>
            );
        if (n.t === "link")
            return (
                <a key={i} href={n.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                    {inline(n.c, names)}
                </a>
            );
        return n.t === "b" ? <strong key={i}>{inline(n.c, names)}</strong> : <em key={i}>{inline(n.c, names)}</em>;
    });
}

/** 상담 메시지 본문을 서식(굵게·기울임·코드·링크·목록)대로 보여준다. 줄바꿈은 그대로 */
export function FormattedText({ text, mentions = [], headings = false }: { text: string; /** 배지로 보일 멘션 이름 */ mentions?: string[]; /** # 제목도 읽기 (상담 지식 문서) */ headings?: boolean }) {
    return parseBlocks(text, { headings }).map((b, i) =>
        b.t === "h" ? (
            <span key={i} className={b.level === 1 ? "mt-3 block text-xl font-bold" : b.level === 2 ? "mt-3 block text-lg font-semibold" : "mt-2 block font-semibold"}>
                {inline(b.c, mentions)}
            </span>
        ) :
        b.t === "ul" ? (
            <ul key={i} className="list-disc pl-5">
                {b.items.map((item, j) => (
                    <li key={j}>{inline(item, mentions)}</li>
                ))}
            </ul>
        ) : (
            <span key={i} className="block min-h-[1lh]">
                {inline(b.c, mentions)}
            </span>
        ),
    );
}
