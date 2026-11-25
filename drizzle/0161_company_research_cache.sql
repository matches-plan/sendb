-- 회사 조사 보관함: 미리 조사해 가져온 결과(예: Gemini로 대기 명단을 미리 조사).
-- 같은 조직에서 회사명(normalizeCompanyName 키)이 같으면 자동 메일이 웹검색 대신 이 결과를 쓴다.
CREATE TABLE IF NOT EXISTS "company_research_cache" (
    "id" serial PRIMARY KEY NOT NULL,
    "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
    "name_key" varchar(300) NOT NULL,
    "research" jsonb NOT NULL,
    "source" varchar(30) DEFAULT 'import' NOT NULL,
    "researched_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "company_research_cache_org_name_key" ON "company_research_cache" ("org_id", "name_key");
