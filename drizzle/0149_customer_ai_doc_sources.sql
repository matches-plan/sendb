-- 상담 지식 FAQ의 추가 질문(같은 뜻의 다른 표현, 최대 10개)과 문서 출처(웹사이트·파일·직접 입력)
ALTER TABLE "customer_ai_docs" ADD COLUMN IF NOT EXISTS "questions" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "customer_ai_docs" ADD COLUMN IF NOT EXISTS "source" varchar(16) NOT NULL DEFAULT 'manual';
--> statement-breakpoint
ALTER TABLE "customer_ai_docs" ADD COLUMN IF NOT EXISTS "source_ref" text;
