"use client";
import useSWR from "swr";
import { supportRequest, supportWrite } from "../api";
import type { SupportCatalog, SupportSettings } from "../types";
import type { InboxBootstrap } from "@/components/inbox/types";
import { workspaceAbilities } from "@/components/customer-access/utils/abilities";
import { AiModeSettings } from "./AiModeSettings";
import { AiRules } from "./AiRules";
import { AiKnowledge } from "./AiKnowledge";

/** 상담 설정 › AI 응대 — AI 자동 답변 설정 / 톤앤매너 규칙 / 상담 지식. 사업은 위쪽 사업부 탭에서 고른다 */
export function AiSettingsPanel({
    bootstrap,
    workspaceId,
    section,
}: {
    bootstrap: InboxBootstrap;
    workspaceId: number;
    section: "mode" | "rules" | "knowledge";
}) {
    const canManage = workspaceAbilities(bootstrap, workspaceId).manage;
    const catalog = useSWR<SupportCatalog>(section === "mode" ? `/api/customer-ai/settings?workspaceId=${workspaceId}` : null, supportRequest);
    if (section === "rules") return <AiRules workspaceId={workspaceId} canManage={canManage} />;
    if (section === "knowledge") return <AiKnowledge workspaceId={workspaceId} canManage={canManage} />;
    if (catalog.error)
        return (
            <p role="alert" className="text-sm text-red-600">
                {catalog.error.message}
                <button className="ml-2 underline" onClick={() => void catalog.mutate()}>다시 불러오기</button>
            </p>
        );
    if (!catalog.data) return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
    return (
        <AiModeSettings
            key={`${workspaceId}:${catalog.data.settings.version}`}
            catalog={catalog.data}
            members={bootstrap.members.filter((m) => m.workspaceIds.includes(workspaceId))}
            canManage={canManage}
            onSave={async (value) => {
                try {
                    return await supportWrite<SupportSettings>("/api/customer-ai/settings", { workspaceId, ...value });
                } finally {
                    await catalog.mutate();
                }
            }}
        />
    );
}
