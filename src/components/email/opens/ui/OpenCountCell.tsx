"use client";

import { Bot, MousePointerClick } from "lucide-react";
import type { OpenCellSource, OpenCellTone } from "../types";
import { openCellView } from "../utils/openCell";

/** 오픈 수는 배지 없이 글자로 (클릭 수와 같은 모양) — 사람 오픈은 진하게, 기계 오픈은 옅게 */
const TONE: Record<OpenCellTone, string> = {
    human: "text-foreground",
    byClick: "text-teal-700 dark:text-teal-300",
    machine: "text-muted-foreground/70",
};

export function OpenCountCell({ log }: { log: OpenCellSource }) {
    const view = openCellView(log);
    if (view.kind === "empty") return null;
    if (view.kind === "dash") return <span className="text-xs text-muted-foreground">-</span>;
    return (
        <span className={`inline-flex items-center gap-1 text-sm [&_svg]:size-3.5 ${TONE[view.tone]}`} title={view.title}>
            {view.machineIcon && <Bot />}
            {view.clickIcon && <MousePointerClick />}
            {view.text}
        </span>
    );
}
