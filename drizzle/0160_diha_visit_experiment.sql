ALTER TABLE email_visit_acknowledgements
    ADD COLUMN IF NOT EXISTS experiment_assignment_id integer REFERENCES email_copy_assignments(id),
    ADD COLUMN IF NOT EXISTS experiment_send_before timestamptz;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS eva_study_assignment_idx
    ON email_visit_acknowledgements(experiment_assignment_id)
    WHERE experiment_assignment_id IS NOT NULL;
