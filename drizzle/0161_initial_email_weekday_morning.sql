ALTER TABLE email_auto_personalized_links ADD COLUMN IF NOT EXISTS weekday_morning_only boolean;
--> statement-breakpoint
UPDATE email_auto_personalized_links l SET weekday_morning_only = true
FROM partitions p JOIN workspaces w ON w.id = p.workspace_id
WHERE l.id = 61 AND l.partition_id = p.id AND p.id = 77 AND w.id = 8 AND w.org_id = l.org_id
  AND l.trigger_type = 'on_create' AND l.weekday_morning_only IS NULL;
--> statement-breakpoint
UPDATE email_auto_personalized_links SET weekday_morning_only = false WHERE weekday_morning_only IS NULL;
--> statement-breakpoint
ALTER TABLE email_auto_personalized_links
    ALTER COLUMN weekday_morning_only SET DEFAULT false,
    ALTER COLUMN weekday_morning_only SET NOT NULL;
