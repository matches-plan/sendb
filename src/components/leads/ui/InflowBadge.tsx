import { Globe, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LeadInflow } from "../types";

/** 유입경로 칩 — 콜드메일이면 보낸 파티션 이름을 옆에. onOpenMail을 주면 눌러서 받은 메일을 연다 */
export function InflowBadge({ inflow, onOpenMail }: { inflow?: LeadInflow; onOpenMail?: (logId: number) => void }) {
    if (!inflow) return <span className="text-muted-foreground">-</span>;
    if (inflow.type === "cold_mail") {
        const content = (
            <>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                    <Mail className="h-3 w-3" />
                    콜드메일
                </span>
                <span className={cn("truncate text-xs text-muted-foreground", onOpenMail && "underline-offset-2 hover:underline")} title={inflow.partitionName}>
                    {inflow.partitionName}
                </span>
            </>
        );
        return onOpenMail && inflow.logId ? (
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onOpenMail(inflow.logId);
                }}
                className="flex min-w-0 flex-wrap items-center gap-1 text-left hover:opacity-80"
            >
                {content}
            </button>
        ) : (
            <div className="flex min-w-0 flex-wrap items-center gap-1">{content}</div>
        );
    }
    if (inflow.type === "homepage") {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-800">
                <Globe className="h-3 w-3" />
                홈페이지
            </span>
        );
    }
    return (
        <span className="inline-flex max-w-full items-center truncate rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
            {inflow.label}
        </span>
    );
}
