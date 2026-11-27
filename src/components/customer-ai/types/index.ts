import type { KnowledgeSnapshot } from "@/lib/ai-copy/types";
export interface SupportSettings {
    version: number;
    mode: "manual" | "draft" | "reply";
    knowledgeVersionId: number | null;
    model: string;
    instructions: string;
    handoffAssigneeId: string | null;
    handoffMessage: string;
    maxJobsPerDay: number;
}
export interface SupportCatalog {
    settings: SupportSettings;
    knowledge: {
        id: number;
        name: string;
        state: string;
        claims: number;
        fingerprint: string;
    }[];
    models: {
        id: string;
        label: string;
        provider: string;
        configured: boolean;
    }[];
    workerEnabled: boolean;
    history: {
        id: string;
        version: number;
        actorName: string;
        createdAt: string;
        snapshot: SupportSettings;
    }[];
}
export interface SupportKnowledge {
    id: number;
    name: string;
    state: string;
    workspaceId: number;
    snapshot: KnowledgeSnapshot;
    fingerprint: string;
    createdAt: string;
    approvedAt: string | null;
}
export interface SupportJob {
    id: string;
    originConversationId: string;
    fromMergedConversation: boolean;
    state: string;
    reason: string | null;
    answer: string | null;
    mode: string;
    sourceMessageId: number;
    createdAt: string;
    settingsVersion: number;
    knowledgeVersionId: number | null;
    citations: { sourceId: string; quote: string; sourceUrl: string }[];
    sources: { id: string; text: string; sourceUrl: string }[];
    sentMessageId: number | null;
}
export interface SupportJobDetail {
    job: SupportJob;
    usable: boolean;
    calls: {
        id: string;
        stage: string;
        state: string;
        model: string;
        promptTokens: number | null;
        completionTokens: number | null;
    }[];
}
export type SupportJobSummary = Pick<
    SupportJob,
    | "id"
    | "originConversationId"
    | "fromMergedConversation"
    | "state"
    | "createdAt"
    | "mode"
    | "sourceMessageId"
    | "settingsVersion"
    | "knowledgeVersionId"
    | "reason"
    | "sentMessageId"
>;
/** 상담 AI 규칙 (상담 설정 › AI 응대 › AI 규칙) */
export interface AiRule {
    id: number;
    title: string;
    body: string;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
}
/** 상담 지식 문서·FAQ (상담 설정 › AI 응대 › 상담 지식) */
export interface AiDoc {
    id: number;
    kind: "article" | "faq";
    title: string;
    body: string;
    published: boolean;
    /** FAQ 추가 질문 */
    questions: string[];
    source: "website" | "file" | "manual";
    sourceRef: string | null;
    createdAt: string;
    updatedAt: string;
}
