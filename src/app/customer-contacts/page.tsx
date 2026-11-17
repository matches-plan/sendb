"use client";
import { Suspense } from "react";
import WorkspaceLayout from "@/components/layouts/WorkspaceLayout";
import { ContactList } from "@/components/customer-contacts/ui/ContactList";
export default function CustomerContactsPage() {
    return (
        <WorkspaceLayout>
            <Suspense>
                <ContactList />
            </Suspense>
        </WorkspaceLayout>
    );
}
