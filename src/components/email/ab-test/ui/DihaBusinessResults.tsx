"use client";

import { useState } from "react";
import useSWR from "swr";
import { abTestFetcher } from "../api/abTests";

interface Result {
    arm: "A" | "B"; tier: string; assigned: number; delivered: number; verified_site_visits: number;
    portfolio_visits: number; signup_screen_visits: number; linked_crm_signups: number; linked_crm_completed_consults: number;
}
const tierNames: Record<string, string> = { food: "식품", sns: "SNS", banner: "배너" };

export function DihaBusinessResults({ id }: { id: number }) {
    const [open, setOpen] = useState(false);
    const url = open ? "/api/email/experiments/" + id + "/diha-results" : null;
    const { data, error } = useSWR<{ arms: Result[]; crmCoverage: string }>(url, abTestFetcher);
    return <details className="text-sm" onToggle={event => setOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer text-muted-foreground">실제 방문과 가입</summary>
        {open && (error ? <p role="alert">{error.message}</p> : !data ? <p>집계를 읽고 있습니다.</p> :
            !data.arms.length ? <p>아직 배정된 대상이 없습니다.</p> : <>
                <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-right text-xs tabular-nums">
                        <thead><tr>{["안", "배정", "배달", "실제 방문", "사례", "가입 화면", "가입 완료", "상담 완료"].map(h => <th key={h} className="px-2 py-1">{h}</th>)}</tr></thead>
                        <tbody>{data.arms.map(row => <tr key={row.arm + row.tier} className="border-t border-border/40">
                            {[row.arm + (tierNames[row.tier] ? " · " + tierNames[row.tier] : ""),
                                row.assigned, row.delivered, row.verified_site_visits, row.portfolio_visits,
                                row.signup_screen_visits, row.linked_crm_signups, row.linked_crm_completed_consults
                            ].map((cell, i) => <td key={i} className="px-2 py-1">{cell.toLocaleString()}</td>)}
                        </tr>)}</tbody>
                    </table>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{data.crmCoverage}</p>
            </>)}
    </details>;
}
