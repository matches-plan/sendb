-- 상담창 연락처 → 고객 연락처 연결, 광고 수신 동의(이메일·문자/알림톡 따로, 기본 없음), 답변 알림의 발송 수단(이메일·알림톡)과 받는 곳,
-- 알림 링크로 다른 기기에서 지난 상담을 여는 접속 열쇠
ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "email_marketing_consent" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "sms_marketing_consent" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "customer_reply_contacts" ADD COLUMN IF NOT EXISTS "crm_contact_id" uuid REFERENCES "crm_contacts"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "customer_reply_notifications" ADD COLUMN IF NOT EXISTS "medium" varchar(10) NOT NULL DEFAULT 'email';
--> statement-breakpoint
ALTER TABLE "customer_reply_notifications" ADD COLUMN IF NOT EXISTS "recipient" varchar(254) NOT NULL DEFAULT '';
--> statement-breakpoint
DROP INDEX IF EXISTS "customer_reply_notice_once";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_reply_notice_once" ON "customer_reply_notifications" ("message_id","medium");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbox_visitor_access" (
    "token_hash" varchar(64) PRIMARY KEY,
    "conversation_id" uuid NOT NULL REFERENCES "inbox_conversations"("id") ON DELETE CASCADE,
    "expires_at" timestamp(3) with time zone NOT NULL,
    "created_at" timestamp(3) with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inbox_visitor_access_conversation" ON "inbox_visitor_access" ("conversation_id");
