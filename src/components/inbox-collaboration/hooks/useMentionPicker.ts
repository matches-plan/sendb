import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { readEditorTrigger, type EditorTrigger } from "@/components/inbox-composer/utils/trigger";
import type { MentionPerson } from "../types";

/**
 * 내부 메모에서 @를 치면 팀원을 골라 태그한다.
 * 위/아래로 고르고 Enter·Tab으로 넣고 Esc로 닫는다. 넣으면 "@검색어"가 "@이름 "으로 바뀌고, 그 글이 곧 멘션이 된다.
 */
export function useMentionPicker({
    editor,
    enabled,
    candidates,
}: {
    editor: Editor | null;
    enabled: boolean;
    candidates: MentionPerson[];
}) {
    const [trigger, setTrigger] = useState<EditorTrigger | null>(null);
    const [active, setActive] = useState(0);
    const [closedAt, setClosedAt] = useState<number | null>(null);
    useEffect(() => {
        if (!editor) return;
        const update = () => setTrigger(editor.isFocused || editor.view.hasFocus() ? readEditorTrigger(editor, "@") : null);
        editor.on("transaction", update);
        editor.on("blur", update);
        return () => {
            editor.off("transaction", update);
            editor.off("blur", update);
        };
    }, [editor]);
    const query = trigger?.query.toLowerCase() ?? "";
    const items = candidates.filter((m) => m.name.toLowerCase().includes(query));
    const open = enabled && !!trigger && trigger.from !== closedAt;
    const index = Math.min(active, Math.max(items.length - 1, 0));

    function pick(i = index) {
        const person = items[i];
        if (!editor || !trigger || !person) return;
        editor.chain().focus().deleteRange({ from: trigger.from, to: trigger.to }).insertContent(`@${person.name} `).run();
        setActive(0);
    }
    /** 팀원 목록이 열려 있을 때 키를 가로채면 true */
    function onKeyDown(e: KeyboardEvent) {
        if (!open || e.isComposing) return false;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            const n = items.length || 1;
            setActive((index + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
            return true;
        }
        if ((e.key === "Enter" || e.key === "Tab") && items.length && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
            pick();
            return true;
        }
        if (e.key === "Escape") {
            setClosedAt(trigger!.from);
            return true;
        }
        return false;
    }
    return { open, items, active: index, setActive, pick, onKeyDown };
}
