"use client";

import { Suspense } from "react";
import WorkspaceLayout from "@/components/layouts/WorkspaceLayout";
import { LeadgenSettingsPage } from "@/components/leadgen/ui/LeadgenSettingsPage";

export default function LeadgenSettingsRoute() {
    return (
        <WorkspaceLayout>
            <Suspense>
                <LeadgenSettingsPage />
            </Suspense>
        </WorkspaceLayout>
    );
}
