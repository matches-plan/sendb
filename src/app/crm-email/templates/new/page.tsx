"use client";

import { useRef } from "react";
import WorkspaceLayout from "@/components/layouts/WorkspaceLayout";
import EmailTemplateEditor from "@/components/email/EmailTemplateEditor";
import { useEmailTemplates } from "@/hooks/useEmailTemplates";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useEmailSection } from "@/components/email/hooks/useEmailSection";

export default function NewTemplatePage() {
    const router = useRouter();
    const { base, purpose } = useEmailSection();
    const { createTemplate, updateTemplate } = useEmailTemplates();
    const templateIdRef = useRef<number | null>(null);

    const handleSave = async (data: {
        name: string;
        subject: string;
        htmlBody: string;
        templateType?: string;
        status?: "draft" | "published";
    }) => {
        if (templateIdRef.current) {
            const result = await updateTemplate(templateIdRef.current, data);
            if (result.success && data.status === "published") {
                toast.success("템플릿이 발행되었습니다.");
                router.push(`${base}?tab=templates`);
            }
            return result;
        } else {
            const result = await createTemplate({ ...data, purpose });
            if (result.success) {
                templateIdRef.current = result.data.id;
                if (data.status === "published") {
                    toast.success("템플릿이 생성되었습니다.");
                    router.push(`${base}?tab=templates`);
                }
            }
            return result;
        }
    };

    const handleCancel = () => router.push(`${base}?tab=templates`);

    return (
        <WorkspaceLayout>
            <EmailTemplateEditor
                template={null}
                defaultUseUnsubscribe={purpose === "cold"}
                onSave={handleSave}
                onCancel={handleCancel}
            />
        </WorkspaceLayout>
    );
}
