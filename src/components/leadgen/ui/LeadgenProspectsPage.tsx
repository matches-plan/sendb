"use client";

import { LeadInbox } from "@/components/lead-followup/ui/LeadInbox";

/** 잠재리드 — 콜드메일 링크를 눌러 들어왔지만 아직 신청하지 않은 고객 (신청하면 리드관리로 간다) */
export function LeadgenProspectsPage() {
    return (
        <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-4 px-8 py-4">
                <h1 className="text-2xl font-semibold tracking-tight">잠재리드</h1>
                <LeadInbox />
            </div>
        </div>
    );
}
