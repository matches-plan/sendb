-- 발송 이력 위 "확인할 문제" 카드를 손으로 끝낸 때·사람 (자동으로 풀리지 않는 인증 실패 폭주·상한·알림만 위험 등)
ALTER TABLE "email_health_events" ADD COLUMN IF NOT EXISTS "resolved_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "email_health_events" ADD COLUMN IF NOT EXISTS "resolved_by" uuid;
