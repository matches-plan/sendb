-- 이메일 서명을 사업부(워크스페이스)별로 — 리드젠 설정 › 사업부 › 이메일 서명. null이면 공통 서명(모든 사업부에서 고를 수 있다)
ALTER TABLE "email_signatures" ADD COLUMN IF NOT EXISTS "workspace_id" integer REFERENCES "workspaces"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_signatures_org_workspace" ON "email_signatures" ("org_id", "workspace_id");
--> statement-breakpoint
-- 기존 서명: 그 서명을 쓰는 AI 자동발송 규칙이 모두 한 사업부 명단이면 그 사업부로. 여러 사업부가 쓰거나 아무도 안 쓰면 공통으로 둔다
UPDATE "email_signatures" s
SET "workspace_id" = u."workspace_id"
FROM (
    SELECT l."signature_id", l."org_id", MIN(p."workspace_id") AS "workspace_id"
    FROM "email_auto_personalized_links" l
    JOIN "partitions" p ON p."id" = l."partition_id"
    JOIN "workspaces" w ON w."id" = p."workspace_id" AND w."org_id" = l."org_id"
    WHERE l."signature_id" IS NOT NULL
    GROUP BY l."signature_id", l."org_id"
    HAVING COUNT(DISTINCT p."workspace_id") = 1
) u
WHERE s."id" = u."signature_id" AND s."org_id" = u."org_id" AND s."workspace_id" IS NULL;
