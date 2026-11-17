import type { Editor } from "@tiptap/react";

/** 커서 바로 앞이 "{기호}검색어"면 그 위치와 검색어를 돌려준다 (줄 처음이나 띄어쓰기 뒤의 기호만) */
export function inputTrigger(text: string, caret: number, symbol: "#" | "@") {
    const m = new RegExp(`(^|\\s)\\${symbol}([^\\s\\${symbol}]*)$`).exec(text.slice(0, caret));
    return m ? { start: caret - m[2].length - 1, query: m[2] } : null;
}

export type EditorTrigger = { query: string; from: number; to: number };
/** 입력창 커서 앞 같은 줄이 "{기호}검색어"로 끝나면 그 범위 (#매크로·@멘션) */
export function readEditorTrigger(editor: Editor, symbol: "#" | "@"): EditorTrigger | null {
    const { selection } = editor.state;
    if (!selection.empty) return null;
    const { $from } = selection;
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
    const hit = inputTrigger(before, before.length, symbol);
    return hit ? { query: hit.query, from: selection.from - (before.length - hit.start), to: selection.from } : null;
}
