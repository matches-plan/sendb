import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const key = new PluginKey("token-highlight");

/**
 * 입력창 안의 정해진 글자(예: "@이주희")를 배지 모양으로 보이게 한다. 글 자체는 바꾸지 않는다.
 * find는 글 한 덩어리에서 [시작, 끝] 범위들을 돌려준다.
 */
export const TokenHighlight = Extension.create<{ find: () => (text: string) => [number, number][]; className: string }>({
    name: "tokenHighlight",
    addOptions() {
        return { find: () => () => [], className: "" };
    },
    addProseMirrorPlugins() {
        const { find, className } = this.options;
        return [
            new Plugin({
                key,
                props: {
                    decorations(state) {
                        const ranges = find();
                        const found: Decoration[] = [];
                        state.doc.descendants((node, pos) => {
                            if (!node.isText || !node.text) return;
                            for (const [from, to] of ranges(node.text))
                                found.push(Decoration.inline(pos + from, pos + to, { class: className }));
                        });
                        return DecorationSet.create(state.doc, found);
                    },
                },
            }),
        ];
    },
});
