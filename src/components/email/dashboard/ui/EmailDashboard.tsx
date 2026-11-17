"use client";

import SendHealthBanner from "../../send-health/ui/SendHealthBanner";
import SendHealthCard from "../../send-health/ui/SendHealthCard";
import SendQueueOverviewCard from "../../sender-profiles/ui/SendQueueOverviewCard";

/** 콜드메일 발송 상태 — 발송 건강·대기열. 잠재리드는 리드젠 > 잠재리드, 통계는 리드젠통계에서 본다 */
export default function EmailDashboard() {
    return <div className="space-y-6">
        <SendHealthBanner />
        <SendQueueOverviewCard />
        <SendHealthCard />
    </div>;
}
