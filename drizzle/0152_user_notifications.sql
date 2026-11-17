-- 콜드메일 알림 담당자 — 리드젠 설정 › 알림 담당자에서 사업부마다 켠 직원. 발송 경고를 화면 알림(종)으로 받는다
CREATE TABLE IF NOT EXISTS "email_health_recipients" (
    "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
    "workspace_id" integer NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY ("workspace_id", "user_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_health_recipients_org" ON "email_health_recipients" ("org_id");
--> statement-breakpoint
-- 화면 알림 (머리 종). dedupe_key로 같은 알림을 두 번 넣지 않는다
CREATE TABLE IF NOT EXISTS "user_notifications" (
    "id" serial PRIMARY KEY,
    "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "kind" varchar(30) NOT NULL,
    "workspace_id" integer,
    "title" text NOT NULL,
    "body" text,
    "link" text,
    "dedupe_key" varchar(120) NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_notifications_user_dedupe" ON "user_notifications" ("user_id", "dedupe_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_notifications_user_read_created" ON "user_notifications" ("user_id", "read_at", "created_at" DESC);
