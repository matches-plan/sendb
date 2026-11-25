import type { CopyConnection } from "../ai-copy/types";
import { CopyActionError } from "../ai-copy/errors";

/** 실험을 진행시키거나 승자를 적용하지 않는 조회. 접수·배달·방문·확인된 업무 사건의 분모가 다르다. */
export async function dihaOutcomes(conn: CopyConnection, orgId: string, experimentId: number, asOf: Date) {
    const [e] = await conn`SELECT id FROM email_copy_experiments WHERE id=${experimentId} AND org_id=${orgId}
        AND workspace_id=8 AND rule_id=61`;
    if (!e) throw new CopyActionError("이 사업의 실험을 찾을 수 없습니다.");
    const at = asOf.toISOString();
    const arms = await conn`WITH population AS MATERIALIZED (
        SELECT a.id,a.org_id,a.record_id,a.normalized_email,a.arm,a.tier,a.assigned_at,a.actual_sent_at,
            l.id AS send_log_id,l.nhn_status_code,l.status,
            LEAST(${at}::timestamptz,a.assigned_at + interval '14 days') AS until
        FROM email_copy_assignments a JOIN email_copy_experiments e ON e.id=a.experiment_id AND e.org_id=a.org_id
        LEFT JOIN email_send_logs l ON l.id=a.send_log_id AND l.org_id=a.org_id AND l.partition_id=77
            AND l.record_id=a.record_id AND lower(btrim(l.recipient_email))=a.normalized_email
            AND (CASE WHEN e.config->'dihaMaterial'->>'round'='DH05' THEN EXISTS (
                SELECT 1 FROM email_visit_acknowledgements ack WHERE ack.experiment_assignment_id=a.id
                  AND ack.org_id=a.org_id AND ack.source_log_id=l.parent_log_id AND ack.send_log_id=l.id
            ) ELSE l.parent_log_id IS NULL AND l.auto_personalized_link_id=61 END)
        WHERE a.experiment_id=${experimentId} AND a.org_id=${orgId} AND a.cohort='primary' AND a.assigned_at<=${at}::timestamptz
    ), visits AS MATERIALIZED (
        SELECT DISTINCT p.id,s.id AS session_id,s.site_id,s.visitor_id,s.started_at,p.until
        FROM population p JOIN email_click_logs c ON c.send_log_id=p.send_log_id AND c.org_id=p.org_id AND c.is_bot=false
        JOIN tracker_sessions s ON s.click_id=c.click_id
        JOIN tracker_sites st ON st.id=s.site_id AND st.id=1 AND st.workspace_id=8 AND st.org_id=p.org_id
        WHERE c.clicked_at>=p.actual_sent_at AND c.clicked_at<=p.until AND s.started_at+interval '7 seconds'<=p.until
          AND s.started_at BETWEEN c.clicked_at-interval '30 seconds' AND c.clicked_at+interval '30 minutes'
          AND s.landing_page ~* '^https://(www[.])?designer-hire[.]com([/?#]|$)'
          AND ((s.duration>=7 AND (s.ended_at IS NULL OR s.ended_at>=s.started_at+interval '7 seconds'))
            OR (s.duration IS NULL AND s.ended_at BETWEEN s.started_at+interval '7 seconds' AND p.until))
          AND NOT EXISTS (SELECT 1 FROM tracker_sessions other JOIN email_click_logs oc ON oc.click_id=other.click_id AND oc.org_id=p.org_id
              JOIN email_send_logs ol ON ol.id=oc.send_log_id AND ol.org_id=p.org_id
              WHERE other.visitor_id=s.visitor_id AND other.site_id=s.site_id AND other.started_at<=p.until
                AND lower(btrim(ol.recipient_email))<>p.normalized_email)
          AND NOT EXISTS (SELECT 1 FROM visitor_record_links vl WHERE vl.visitor_id=s.visitor_id AND vl.org_id=p.org_id AND vl.record_id<>p.record_id)
    ), site_flags AS (
        SELECT v.id, bool_or(t.event_type='PAGE_VIEW' AND t.page_url ~* '^https://(www[.])?designer-hire[.]com/signup([/?#]|$)') AS signup_screen,
            bool_or(t.event_type='PAGE_VIEW' AND t.page_url ~* '^https://(www[.])?designer-hire[.]com/portfolio([/?#]|$)') AS portfolio,
            bool_or(t.event_type='CUSTOM' AND t.event_name='signup_complete') AS signup_signal FROM visits v
        LEFT JOIN tracker_events t ON t.session_id=v.session_id AND t.site_id=v.site_id AND t.visitor_id=v.visitor_id
            AND t.occurred_at BETWEEN v.started_at AND v.until
        GROUP BY v.id
    ), flags AS (
        SELECT p.*,s.id IS NOT NULL AS visited,s.signup_screen,s.portfolio,s.signup_signal,
            EXISTS(SELECT 1 FROM record_events re JOIN records r ON r.id=re.record_id AND r.org_id=re.org_id AND r.workspace_id=8
                WHERE re.org_id=p.org_id AND re.record_id=p.record_id AND re.type='signup' AND re.occurred_at BETWEEN p.assigned_at AND p.until) AS crm_signup,
            EXISTS(SELECT 1 FROM record_events re JOIN records r ON r.id=re.record_id AND r.org_id=re.org_id AND r.workspace_id=8
                WHERE re.org_id=p.org_id AND re.record_id=p.record_id AND re.type='consult_complete' AND re.occurred_at BETWEEN p.assigned_at AND p.until) AS crm_consult
        FROM population p LEFT JOIN site_flags s ON s.id=p.id
    ) SELECT arm,tier,count(*)::int AS assigned,
        count(*) FILTER(WHERE assigned_at + interval '14 days'<=${at}::timestamptz)::int AS observed_14d,
        count(actual_sent_at)::int AS accepted, count(*) FILTER(WHERE nhn_status_code='SST2' AND status<>'failed')::int AS delivered,
        count(*) FILTER(WHERE visited)::int AS verified_site_visits, count(*) FILTER(WHERE portfolio)::int AS portfolio_visits,
        count(*) FILTER(WHERE signup_screen)::int AS signup_screen_visits, count(*) FILTER(WHERE signup_signal)::int AS tracker_signup_signals,
        count(*) FILTER(WHERE crm_signup)::int AS linked_crm_signups, count(*) FILTER(WHERE crm_consult)::int AS linked_crm_completed_consults,
        count(*) FILTER(WHERE crm_signup OR crm_consult)::int AS linked_crm_conversions
        FROM flags GROUP BY arm,tier ORDER BY arm,tier`;
    return { experimentId, asOf: at, arms, crmCoverage: "배정된 CRM 레코드와 직접 연결된 가입·상담 완료 사건만 집계합니다." };
}
