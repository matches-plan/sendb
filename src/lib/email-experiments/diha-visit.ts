import type { CopyConnection } from "../ai-copy/types";
import { copyTransaction } from "../ai-copy/generation";
import { fingerprint } from "../ai-copy/rules";
import { normalizeEmail } from "../deep-visitor-alert-rules";
import { journeyCustomerKey } from "../customer-journey-priority";
import { chooseBalancedArm, DAY_MS } from "./rules";
import { dihaMail } from "./diha-material";
import type { Experiment } from "./types";

interface Visit {
    orgId: string; workspaceId: number; recordId: number; logId: number; sessionId: number;
    email: string; company: unknown; visitedAt: Date; now: Date; due: Date;
}

export function visitDeadline(visitedAt: Date, now: Date, due: Date) {
    const deadline = new Date(visitedAt.getTime() + DAY_MS);
    return visitedAt <= now && now < deadline && due >= now && due < deadline ? deadline : null;
}

export async function otherDihaContact(conn: CopyConnection, org: string, email: string, root: number, ownLog: number | null) {
    const [row] = await conn<{ present: boolean }[]>`SELECT EXISTS (
        SELECT 1 FROM email_send_logs l JOIN partitions p ON p.id=l.partition_id AND p.workspace_id=8
        JOIN email_send_logs original ON original.id=${root} AND original.org_id=l.org_id
        WHERE l.org_id=${org} AND lower(btrim(l.recipient_email))=${normalizeEmail(email)}
          AND l.id<>original.id AND l.id<>COALESCE(${ownLog}::int,-1) AND l.sent_at>=original.sent_at
          AND l.status IN ('pending','unknown','uncertain','sent','delivered')
        UNION ALL SELECT 1 FROM email_followup_queue q JOIN email_send_logs l ON l.id=q.parent_log_id AND l.org_id=q.org_id
        JOIN partitions p ON p.id=l.partition_id AND p.workspace_id=8
        WHERE q.org_id=${org} AND lower(btrim(l.recipient_email))=${normalizeEmail(email)} AND q.source_type<>'visit_ack'
          AND q.status IN ('held','processing','pending','uncertain')
        UNION ALL SELECT 1 FROM email_automation_queue q JOIN email_template_links t ON t.id=q.template_link_id AND t.org_id=q.org_id
        JOIN records r ON r.id=q.record_id AND r.org_id=q.org_id AND r.workspace_id=8
        WHERE q.org_id=${org} AND q.kind='repeat' AND q.status IN ('held','pending')
          AND lower(btrim(r.data->>t.recipient_field))=${normalizeEmail(email)}
    ) AS present`;
    return row.present;
}

/** 실제 세션을 확인한 이후에만 호출한다. 대조군 배정에는 발송 대기 항목이 없다. */
export async function captureDihaVisit(conn: CopyConnection, v: Visit): Promise<boolean> {
    if (v.workspaceId !== 8) return false;
    const [match] = await conn<{ id: number }[]>`SELECT e.id FROM email_copy_experiments e
        JOIN email_send_logs l ON l.org_id=e.org_id AND l.auto_personalized_link_id=e.rule_id
        WHERE e.org_id=${v.orgId} AND e.workspace_id=8 AND e.rule_id=61 AND e.state='running'
          AND e.config->'dihaMaterial'->>'round'='DH05' AND l.id=${v.logId} AND l.record_id=${v.recordId}
          AND l.partition_id=77 AND l.parent_log_id IS NULL AND l.sent_at>=e.started_at AND l.status='sent'
          AND lower(btrim(l.recipient_email))=${normalizeEmail(v.email)} LIMIT 1`;
    if (!match) return false;
    const deadline = visitDeadline(v.visitedAt, v.now, v.due);
    const company = typeof v.company === "string" ? v.company.trim().normalize("NFC").toLowerCase() : "";
    if (!deadline || !company) return false;
    return copyTransaction(conn, async () => {
        // 같은 사업의 규칙 저장 및 기존 실험 배정과 잠금 순서를 맞춘다.
        await conn`SELECT pg_advisory_xact_lock(1760824303,hashtext(${v.orgId}))`;
        const [e] = await conn<Experiment[]>`SELECT * FROM email_copy_experiments WHERE id=${match.id} AND org_id=${v.orgId} FOR UPDATE`;
        if (!e || e.state !== "running" || e.config.dihaMaterial?.round !== "DH05") return false;
        const elapsed = v.now.getTime() - new Date(e.started_at!).getTime();
        if (elapsed >= e.config.maxEnrollmentDays * DAY_MS) return false;
        const email = normalizeEmail(v.email), key = journeyCustomerKey(email), companyKey = fingerprint([v.orgId, 8, company]);
        const [existing] = await conn`SELECT experiment_assignment_id FROM email_visit_acknowledgements
            WHERE org_id=${v.orgId} AND workspace_id=8 AND customer_key=${key} AND status<>'ignored' LIMIT 1`;
        const [assigned] = await conn`SELECT id FROM email_copy_assignments WHERE org_id=${v.orgId} AND experiment_id=${e.id}
            AND (normalized_email=${email} OR company_key=${companyKey}) LIMIT 1`;
        if (existing) return existing.experiment_assignment_id != null;
        if (assigned || await otherDihaContact(conn, v.orgId, email, v.logId, null)) return false;
        const [overlap] = await conn`SELECT a.id FROM email_copy_assignments a JOIN email_copy_experiments active ON active.id=a.experiment_id
            WHERE a.org_id=${v.orgId} AND a.normalized_email=${email} AND active.id<>${e.id}
              AND active.state IN ('running','paused','enrollment_closed','observing','decision_ready','data_check','insufficient_sample') LIMIT 1`;
        if (overlap) return false;
        const [replied] = await conn`SELECT id FROM email_replies WHERE org_id=${v.orgId} AND workspace_id=8 AND kind='human'
            AND (contact_email=${email} OR matched_recipient=${email}) LIMIT 1`;
        if (replied) return false;
        const [counts] = await conn<{ a: number; b: number }[]>`SELECT count(*) FILTER(WHERE arm='A')::int AS a,
            count(*) FILTER(WHERE arm='B')::int AS b FROM email_copy_assignments WHERE experiment_id=${e.id} AND cohort='primary'`;
        if (elapsed >= e.config.minEnrollmentDays * DAY_MS && counts.a >= e.config.plannedPerArm && counts.b >= e.config.plannedPerArm) return false;
        const arm = chooseBalancedArm({ experimentId: e.id, customerKey: key, stratum: "visit", countA: counts.a, countB: counts.b });
        const iso = v.now.toISOString();
        const [a] = await conn<{ id: number }[]>`INSERT INTO email_copy_assignments
            (experiment_id,org_id,workspace_id,normalized_email,customer_key,arm,cohort,company_key,record_id,initial_scheduled_at,stratum,tier,assigned_at)
            VALUES (${e.id},${v.orgId},8,${email},${key},${arm},'primary',${companyKey},${v.recordId},${iso},'visit','visit',${iso}) RETURNING id`;
        const b = arm === "B";
        const [ack] = await conn<{ id: number }[]>`INSERT INTO email_visit_acknowledgements
            (org_id,workspace_id,customer_key,source_log_id,record_id,session_id,status,reason,body,scheduled_at,observed_at,experiment_assignment_id,experiment_send_before)
            VALUES(${v.orgId},8,${key},${v.logId},${v.recordId},${v.sessionId},${b ? "pending" : "cancelled"},${b ? null : "실험 대조군"},
                   ${b ? dihaMail(e.config.dihaMaterial, "B", "visit").htmlBody : null},${v.due.toISOString()},${iso},${a.id},${deadline.toISOString()})
            ON CONFLICT (org_id,workspace_id,customer_key) DO UPDATE SET source_log_id=EXCLUDED.source_log_id,record_id=EXCLUDED.record_id,
               session_id=EXCLUDED.session_id,status=EXCLUDED.status,reason=EXCLUDED.reason,body=EXCLUDED.body,scheduled_at=EXCLUDED.scheduled_at,
               observed_at=EXCLUDED.observed_at,experiment_assignment_id=EXCLUDED.experiment_assignment_id,experiment_send_before=EXCLUDED.experiment_send_before,updated_at=${iso}
            WHERE email_visit_acknowledgements.status='ignored' RETURNING id`;
        if (!ack) throw new Error("방문 예약이 변경되어 실험 배정을 취소했습니다.");
        if (b) {
            const [queue] = await conn<{ id: number }[]>`INSERT INTO email_followup_queue(parent_log_id,source_type,source_id,org_id,step_index,check_at,status,created_at)
                VALUES(${v.logId},'visit_ack',${ack.id},${v.orgId},-1,${v.due.toISOString()},'pending',${iso}) RETURNING id`;
            await conn`UPDATE email_visit_acknowledgements SET queue_id=${queue.id} WHERE id=${ack.id} AND org_id=${v.orgId}`;
        }
        return true;
    });
}
