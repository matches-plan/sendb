import { sql } from "drizzle-orm";
import {
    pgTable,
    uuid,
    integer,
    varchar,
    text,
    jsonb,
    timestamp,
    date,
    primaryKey,
    uniqueIndex,
    index,
    check,
    type AnyPgColumn,
    serial,
    boolean,
} from "drizzle-orm/pg-core";
import { organizations, workspaces, users, aiUsageLogs } from "./schema";
import { aiCopyKnowledgeVersions } from "./ai-copy-schema";
import { inboxConversations, inboxMessages } from "./inbox-schema";
import type {
    AiSettingsSnapshot,
    AiSource,
    AiContext,
    AiCitation,
} from "../customer-ai/rules";
const time = (name: string) =>
    timestamp(name, { withTimezone: true, precision: 3 });
const scope = () => ({
    orgId: uuid("org_id")
        .notNull()
        .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: integer("workspace_id")
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
});
export const customerAiSettings = pgTable(
    "customer_ai_settings",
    {
        ...scope(),
        workspaceId: integer("workspace_id")
            .primaryKey()
            .references(() => workspaces.id, { onDelete: "cascade" }),
        version: integer("version").notNull().default(1),
        mode: varchar("mode", { length: 16 }).notNull().default("manual"),
        knowledgeVersionId: integer("knowledge_version_id").references(
            () => aiCopyKnowledgeVersions.id,
        ),
        model: varchar("model", { length: 100 }).notNull(),
        instructions: text("instructions").notNull(),
        handoffAssigneeId: uuid("handoff_assignee_id").references(
            () => users.id,
            { onDelete: "set null" },
        ),
        handoffMessage: varchar("handoff_message", { length: 500 }).notNull(),
        maxJobsPerDay: integer("max_jobs_per_day").notNull().default(50),
        changedBy: uuid("changed_by").references(() => users.id, {
            onDelete: "set null",
        }),
        updatedAt: time("updated_at").notNull().defaultNow(),
    },
    (t) => [
        check("customer_ai_mode", sql`${t.mode} IN ('manual','draft','reply')`),
    ],
);
export const customerAiSettingsHistory = pgTable(
    "customer_ai_settings_history",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        ...scope(),
        version: integer("version").notNull(),
        actorName: varchar("actor_name", { length: 100 }).notNull(),
        snapshot: jsonb("snapshot").$type<AiSettingsSnapshot>().notNull(),
        createdAt: time("created_at").notNull().defaultNow(),
    },
);
export const customerAiJobs = pgTable(
    "customer_ai_jobs",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        ...scope(),
        conversationId: uuid("conversation_id")
            .notNull()
            .references(() => inboxConversations.id, { onDelete: "cascade" }),
        clientId: uuid("client_id").notNull(),
        sourceMessageId: integer("source_message_id")
            .notNull()
            .references((): AnyPgColumn => inboxMessages.id, {
                onDelete: "cascade",
            }),
        lastPublicId: integer("last_public_id").notNull(),
        mode: varchar("mode", { length: 16 }).notNull(),
        settingsVersion: integer("settings_version").notNull(),
        settingsSnapshot: jsonb("settings_snapshot")
            .$type<AiSettingsSnapshot>()
            .notNull(),
        knowledgeVersionId: integer("knowledge_version_id").references(
            () => aiCopyKnowledgeVersions.id,
        ),
        knowledgeFingerprint: varchar("knowledge_fingerprint", { length: 64 }),
        sources: jsonb("sources").$type<AiSource[]>().notNull().default([]),
        context: jsonb("context").$type<AiContext>().notNull(),
        state: varchar("state", { length: 20 }).notNull().default("queued"),
        reason: varchar("reason", { length: 300 }),
        answer: text("answer"),
        citations: jsonb("citations")
            .$type<AiCitation[]>()
            .notNull()
            .default([]),
        attempts: integer("attempts").notNull().default(0),
        leaseId: uuid("lease_id"),
        leaseUntil: time("lease_until"),
        eligibleAt: time("eligible_at").notNull().defaultNow(),
        requestedBy: uuid("requested_by").references(() => users.id, {
            onDelete: "set null",
        }),
        sentBy: uuid("sent_by").references(() => users.id, {
            onDelete: "set null",
        }),
        sentMessageId: integer("sent_message_id").references(
            (): AnyPgColumn => inboxMessages.id,
        ),
        createdAt: time("created_at").notNull().defaultNow(),
        updatedAt: time("updated_at").notNull().defaultNow(),
    },
    (t) => [
        uniqueIndex("customer_ai_request").on(t.conversationId, t.clientId),
        index("customer_ai_due").on(t.state, t.eligibleAt, t.leaseUntil),
        index("customer_ai_conversation").on(
            t.conversationId,
            t.createdAt,
            t.id,
        ),
        check(
            "customer_ai_state",
            sql`${t.state} IN ('queued','generating','ready','handed_off','failed','stale','sent','cancelled')`,
        ),
    ],
);
export const customerAiCalls = pgTable(
    "customer_ai_calls",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        jobId: uuid("job_id")
            .notNull()
            .references(() => customerAiJobs.id, { onDelete: "cascade" }),
        leaseId: uuid("lease_id").notNull(),
        stage: varchar("stage", { length: 16 }).notNull(),
        state: varchar("state", { length: 16 }).notNull().default("running"),
        provider: varchar("provider", { length: 30 }).notNull(),
        model: varchar("model", { length: 100 }).notNull(),
        promptTokens: integer("prompt_tokens"),
        completionTokens: integer("completion_tokens"),
        chargedPrompt: integer("charged_prompt").notNull().default(0),
        chargedCompletion: integer("charged_completion").notNull().default(0),
        usageLogId: integer("usage_log_id").references(() => aiUsageLogs.id),
        startedAt: time("started_at").notNull().defaultNow(),
        finishedAt: time("finished_at"),
    },
    (t) => [uniqueIndex("customer_ai_call").on(t.jobId, t.leaseId, t.stage)],
);
export const customerAiDailyUsage = pgTable(
    "customer_ai_daily_usage",
    {
        workspaceId: integer("workspace_id")
            .notNull()
            .references(() => workspaces.id, { onDelete: "cascade" }),
        day: date("day").notNull(),
        jobs: integer("jobs").notNull().default(0),
    },
    (t) => [primaryKey({ columns: [t.workspaceId, t.day] })],
);
/** 상담 AI 규칙 — 켜진 규칙의 제목·내용을 AI 지침으로 쓴다 (상담 설정 › AI 응대 › AI 규칙) */
export const customerAiRules = pgTable(
    "customer_ai_rules",
    {
        id: serial("id").primaryKey(),
        ...scope(),
        title: varchar("title", { length: 100 }).notNull(),
        body: text("body").notNull(),
        enabled: boolean("enabled").notNull().default(true),
        createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
        updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [index("customer_ai_rules_workspace").on(t.workspaceId)],
);
/** 상담 지식 — 마크다운 문서(article)·FAQ. 공개한 것만 AI 답변 근거로 쓴다 (상담 설정 › AI 응대 › 상담 지식) */
export const customerAiDocs = pgTable(
    "customer_ai_docs",
    {
        id: serial("id").primaryKey(),
        ...scope(),
        kind: varchar("kind", { length: 16 }).$type<"article" | "faq">().notNull(),
        title: varchar("title", { length: 200 }).notNull(),
        body: text("body").notNull(),
        published: boolean("published").notNull().default(true),
        /** FAQ 추가 질문 — 같은 뜻의 다른 표현(최대 10개) */
        questions: jsonb("questions").$type<string[]>().notNull().default([]),
        /** 출처: 웹사이트·파일·직접 입력. sourceRef는 웹사이트 주소나 파일 이름 */
        source: varchar("source", { length: 16 }).$type<"website" | "file" | "manual">().notNull().default("manual"),
        sourceRef: text("source_ref"),
        createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
        updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [index("customer_ai_docs_workspace").on(t.workspaceId, t.kind)],
);
