"use client";

import WorkspaceLayout from "@/components/layouts/WorkspaceLayout";
import { LeadgenProspectsPage } from "@/components/leadgen/ui/LeadgenProspectsPage";

export default function LeadgenProspectsRoute() {
    return (
        <WorkspaceLayout>
            <LeadgenProspectsPage />
        </WorkspaceLayout>
    );
}
