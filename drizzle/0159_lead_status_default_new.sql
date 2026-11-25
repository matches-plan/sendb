-- 리드관리: 대응상태가 비어 있는 리드를 「신규」로 (새 리드는 코드에서 「신규」로 들어온다)
UPDATE "records" r
SET "data" = COALESCE(r."data", '{}'::jsonb) || '{"status":"신규"}'::jsonb
FROM "partitions" p
WHERE p."id" = r."partition_id"
  AND p."category" = 'lead'
  AND COALESCE(r."data"->>'status', '') = '';
