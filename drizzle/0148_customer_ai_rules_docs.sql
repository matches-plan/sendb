-- 상담 AI 규칙(말투·안내 지침을 규칙 여러 개로) — 상담 설정 › AI 응대 › AI 규칙. 켜진 규칙만 AI 지침에 들어간다
CREATE TABLE IF NOT EXISTS "customer_ai_rules" (
    "id" serial PRIMARY KEY,
    "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
    "workspace_id" integer NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "title" varchar(100) NOT NULL,
    "body" text NOT NULL,
    "enabled" boolean NOT NULL DEFAULT true,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_ai_rules_workspace" ON "customer_ai_rules" ("workspace_id");
--> statement-breakpoint
-- 상담 지식 문서(마크다운)·FAQ — 상담 설정 › AI 응대 › 상담 지식. 공개한 것만 AI가 답변 근거로 쓴다
CREATE TABLE IF NOT EXISTS "customer_ai_docs" (
    "id" serial PRIMARY KEY,
    "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
    "workspace_id" integer NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "kind" varchar(16) NOT NULL CHECK ("kind" IN ('article', 'faq')),
    "title" varchar(200) NOT NULL,
    "body" text NOT NULL,
    "published" boolean NOT NULL DEFAULT true,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_ai_docs_workspace" ON "customer_ai_docs" ("workspace_id", "kind");
--> statement-breakpoint
-- 지금 쓰던 말투·안내 지침을 첫 규칙으로 옮긴다
INSERT INTO "customer_ai_rules" ("org_id", "workspace_id", "title", "body")
SELECT s."org_id", s."workspace_id", '[기본] 말투·안내', s."instructions"
FROM "customer_ai_settings" s
WHERE NOT EXISTS (SELECT 1 FROM "customer_ai_rules" r WHERE r."workspace_id" = s."workspace_id");
--> statement-breakpoint
-- 지금 AI가 쓰던 승인 지식(고객 상담용 문장)을 문서 하나로 옮긴다. 메일 AI의 지식 버전은 그대로 둔다
INSERT INTO "customer_ai_docs" ("org_id", "workspace_id", "kind", "title", "body")
SELECT s."org_id", s."workspace_id", 'article', '기존 안내 지식',
    string_agg('- ' || (c->>'text'), E'\n' ORDER BY ord)
FROM "customer_ai_settings" s
JOIN "ai_copy_knowledge_versions" v ON v."id" = s."knowledge_version_id" AND v."state" = 'approved'
CROSS JOIN LATERAL jsonb_array_elements(v."snapshot"->'claims') WITH ORDINALITY AS t(c, ord)
WHERE c->'purposes' @> '["customer_chat"]'::jsonb
  AND NOT EXISTS (SELECT 1 FROM "customer_ai_docs" d WHERE d."workspace_id" = s."workspace_id")
GROUP BY s."org_id", s."workspace_id";
