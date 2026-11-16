"use client";

import { Suspense } from "react";
import CrmEmailPage from "@/components/crm-email/ui/CrmEmailPage";

export default function Page() {
    return (
        <Suspense>
            <CrmEmailPage />
        </Suspense>
    );
}
