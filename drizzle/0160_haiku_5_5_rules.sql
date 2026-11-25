-- 하이쿠 4.5 → 5.5: 자동 메일 규칙에 직접 저장된 claude-haiku-4-5를 5.5로 바꾼다 (토큰 단가 10분의 1).
-- 승인된 작성 버전(ai_copy_policy_versions)과 상담 AI 설정은 버전을 고정해 쓰므로 그대로 둔다.
UPDATE "email_auto_personalized_links"
SET "model" = 'claude-haiku-5-5', "updated_at" = now()
WHERE "model" = 'claude-haiku-4-5';
