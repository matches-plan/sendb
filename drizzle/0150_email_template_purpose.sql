-- 이메일 템플릿 용도: cold(콜드메일 — 리드젠 영업) / crm(CRM관리 > 이메일 — 가입·광고 동의 고객 관계관리)
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "purpose" varchar(20) DEFAULT 'crm' NOT NULL;
--> statement-breakpoint
-- 리드젠 사업(오피오·설비지원몰·Work to Hire·백오랩) 템플릿은 콜드메일로. 디하 관련 메일은 관계관리에 남긴다
UPDATE "email_templates" SET "purpose" = 'cold'
WHERE "name" ~ '오피오|설비지원몰|Work to Hire|WTH-|백오랩' AND "name" !~ '디하';
--> statement-breakpoint
-- 콜드메일은 광고성 메일이라 수신거부 링크를 켠다
UPDATE "email_templates" SET "use_unsubscribe" = 1 WHERE "purpose" = 'cold' AND "use_unsubscribe" = 0;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_templates_org_purpose" ON "email_templates" ("org_id", "purpose");
--> statement-breakpoint
-- 콜드메일 고정 본문(템플릿) 규칙을 AI 자동발송 규칙으로 옮긴다.
-- source_template_link_id: 옮겨 온 원래 템플릿 규칙. AI 규칙을 켜면 원래 규칙은 꺼진다
-- needs_review: 보내던 문구를 프롬프트에 그대로 넣어 둔 규칙 — 사람이 프롬프트를 고치면 0
ALTER TABLE "email_auto_personalized_links" ADD COLUMN IF NOT EXISTS "source_template_link_id" integer;
--> statement-breakpoint
ALTER TABLE "email_auto_personalized_links" ADD COLUMN IF NOT EXISTS "needs_review" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION pg_temp.sf_html_to_text(h text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT trim(regexp_replace(
        replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
            regexp_replace(
                regexp_replace(
                    regexp_replace(
                        regexp_replace(coalesce(h, ''), '<(style|script)[^>]*>.*?</(style|script)>', '', 'gi'),
                    '<br\s*/?>', E'\n', 'gi'),
                '</(p|div|li|tr|h[1-6]|table)\s*>', E'\n', 'gi'),
            '<[^>]+>', '', 'g'),
        '&nbsp;', ' '), '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''), '&rarr;', '→'), '&middot;', '·'), '&hellip;', '…'), '&ndash;', '–'), '&mdash;', '—'), '&amp;', '&'),
    E'\n[ \t]*\n([ \t]*\n)+', E'\n\n', 'g'))
$$;
--> statement-breakpoint
-- 템플릿 변수(##companyName## 등)를 규칙이 연결한 레코드 칸 이름으로 바꾼다 — AI 프롬프트도 ##칸이름##으로 채운다
CREATE OR REPLACE FUNCTION pg_temp.sf_map_vars(t text, vm jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE k text; v text;
BEGIN
    FOR k, v IN SELECT key, value FROM jsonb_each_text(coalesce(vm, '{}'::jsonb)) LOOP
        IF k ~ '^##[^#[:space:]]+##$' AND v <> '' THEN t := replace(t, k, '##' || v || '##'); END IF;
    END LOOP;
    RETURN t;
END
$$;
--> statement-breakpoint
INSERT INTO "email_auto_personalized_links" (
    "org_id", "name", "partition_id", "recipient_field", "company_field", "prompt", "format",
    "trigger_type", "trigger_condition", "auto_research", "use_signature_persona", "use_unsubscribe",
    "followup_config", "sender_profile_id", "sender_profile_ids", "prevent_duplicate",
    "is_active", "is_draft", "needs_review", "source_template_link_id", "created_at", "updated_at"
)
SELECT
    t."org_id", l."name", l."partition_id", l."recipient_field",
    coalesce(l."variable_mappings" ->> '##companyName##', ''),
    pg_temp.sf_map_vars(t."subject" || E'\n\n' || pg_temp.sf_html_to_text(t."html_body"), coalesce(l."variable_mappings", '{}'::jsonb)),
    CASE WHEN t."name" ~ '텍스트' THEN 'plain' WHEN t."html_body" ~* '<table|<img' THEN 'designed' ELSE 'plain' END,
    CASE WHEN l."trigger_type" = 'on_update' THEN 'on_update' ELSE 'on_create' END,
    l."trigger_condition", 0, 0, 1,
    (
        SELECT jsonb_agg(
            jsonb_build_object('delayDays', step -> 'delayDays')
            || CASE WHEN ct.id IS NOT NULL THEN jsonb_build_object('onClicked', jsonb_build_object('prompt',
                pg_temp.sf_map_vars(ct."subject" || E'\n\n' || pg_temp.sf_html_to_text(ct."html_body"), coalesce(l."variable_mappings", '{}'::jsonb)))) ELSE '{}'::jsonb END
            || CASE WHEN nt.id IS NOT NULL THEN jsonb_build_object('onNotClicked', jsonb_build_object('prompt',
                pg_temp.sf_map_vars(nt."subject" || E'\n\n' || pg_temp.sf_html_to_text(nt."html_body"), coalesce(l."variable_mappings", '{}'::jsonb)))) ELSE '{}'::jsonb END
            ORDER BY ord)
        FROM jsonb_array_elements(CASE jsonb_typeof(l."followup_config") WHEN 'array' THEN l."followup_config" ELSE jsonb_build_array(l."followup_config") END)
            WITH ORDINALITY AS f(step, ord)
        LEFT JOIN "email_templates" ct ON ct."id" = (step -> 'onClicked' ->> 'templateId')::int
        LEFT JOIN "email_templates" nt ON nt."id" = (step -> 'onNotClicked' ->> 'templateId')::int
        WHERE l."followup_config" IS NOT NULL
    ),
    l."sender_profile_id", l."sender_profile_ids", l."prevent_duplicate",
    0, 0, 1, l."id", now(), now()
FROM "email_template_links" l
JOIN "email_templates" t ON t."id" = l."email_template_id"
WHERE t."purpose" = 'cold'
  AND NOT EXISTS (SELECT 1 FROM "email_auto_personalized_links" a WHERE a."source_template_link_id" = l."id");
