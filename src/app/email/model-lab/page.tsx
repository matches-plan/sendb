"use client";

import WorkspaceLayout from "@/components/layouts/WorkspaceLayout";
import { ModelLabPage } from "@/components/model-lab/ui/ModelLabPage";

export default function ModelLabRoute() {
    return (
        <WorkspaceLayout>
            <ModelLabPage />
        </WorkspaceLayout>
    );
}
