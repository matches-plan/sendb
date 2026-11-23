ALTER TABLE "inbox_messages" ADD COLUMN IF NOT EXISTS "recipient_read_at" timestamptz(3);
