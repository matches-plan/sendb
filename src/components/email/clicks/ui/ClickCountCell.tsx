"use client";

import { Bot, MousePointerClick } from "lucide-react";
import type { ClickCellSource, ClickCellTone } from "../types";
import { clickCellView } from "../utils/clickCell";

/** 클릭 수는 배지 없이 글자로 — 사람 클릭은 진하게, 봇 의심은 옅게 */
const TONE: Record<ClickCellTone, string> = {
    human: "text-foreground",
    humanAction: "font-semibold text-blue-600 dark:text-blue-400",
    bot: "text-muted-foreground/70",
    botAction: "text-muted-foreground/70",
};

export function ClickCountCell({ log }: { log: ClickCellSource }) {
    const view = clickCellView(log);
    if (view.kind === "empty") return null;
    if (view.kind === "dash") return <span className="text-xs text-muted-foreground">-</span>;
    return (
        <span className={`inline-flex items-center gap-1 text-sm [&_svg]:size-3.5 ${TONE[view.tone]}`} title={view.title}>
            {view.botIcon && <Bot />}
            {view.actionIcon && <MousePointerClick className="text-blue-600 dark:text-blue-400" />}
            {view.text}
        </span>
    );
}
