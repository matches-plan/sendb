import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { pgliteTag } from "../db/pglite-harness.test-helper";
import type { CopyConnection } from "../ai-copy/types";
import { captureDihaVisit, visitDeadline } from "./diha-visit";
import { registerVisitAck } from "../email-visit-ack";
import { dihaOutcomes } from "./diha-outcomes";
import { createDihaMaterial } from "./diha-material";

const org = "00000000-0000-4000-8000-000000000008";
const now = new Date("2026-11-25T03:00:00Z"), visit = new Date("2026-11-25T02:55:00Z");
const due = new Date("2026-11-25T03:45:00Z");

test("실제 방문부터 24시간이 지난 발송·미래 방문·기한 너머의 예약은 모집하지 않는다", () => {
    assert.equal(visitDeadline(visit, now, due)?.toISOString(), "2026-11-26T02:55:00.000Z");
    assert.equal(visitDeadline(due, now, due), null);
    assert.equal(visitDeadline(visit, now, new Date("2026-11-26T02:55:00Z")), null);
});

test("같은 자격의 방문자는 한 번 배정하고 A는 0통, B는 한 건만 예약하며 가입은 실제 CRM 사건으로 센다", async t => {
    const pg = new PGlite(); t.after(() => pg.close());
    await pg.exec(`
        CREATE TABLE email_copy_experiments(id serial primary key,org_id uuid,workspace_id int,rule_id int,state text,started_at timestamptz,config jsonb);
        CREATE TABLE email_copy_assignments(id serial primary key,experiment_id int,org_id uuid,workspace_id int,normalized_email text,customer_key text,
            arm text,cohort text,company_key text,record_id int,initial_scheduled_at timestamptz,stratum text,tier text,assigned_at timestamptz,actual_sent_at timestamptz,send_log_id int,
            unique(experiment_id,normalized_email),unique(experiment_id,company_key));
        CREATE TABLE email_send_logs(id serial primary key,org_id uuid,auto_personalized_link_id int,record_id int,partition_id int,
            parent_log_id int,sent_at timestamptz,status text,recipient_email text,nhn_status_code text);
        CREATE TABLE email_visit_acknowledgements(id serial primary key,org_id uuid,workspace_id int,customer_key text,source_log_id int,record_id int,session_id int,
            status text,reason text,body text,scheduled_at timestamptz,observed_at timestamptz,updated_at timestamptz,created_at timestamptz,
            queue_id int,send_log_id int,unique(org_id,workspace_id,customer_key));
        CREATE TABLE email_followup_queue(id serial primary key,parent_log_id int,source_type text,source_id int,org_id uuid,step_index int,check_at timestamptz,
            status text,stop_reason text,locked_at timestamptz,processed_at timestamptz,created_at timestamptz,unique(parent_log_id,step_index));
        CREATE TABLE email_replies(id serial primary key,org_id uuid,workspace_id int,kind text,contact_email text,matched_recipient text);
        CREATE TABLE partitions(id int primary key,workspace_id int);
        CREATE TABLE records(id int primary key,workspace_id int,org_id uuid,data jsonb);
        CREATE TABLE email_automation_queue(template_link_id int,org_id uuid,record_id int,kind text,status text);
        CREATE TABLE email_template_links(id int,org_id uuid,recipient_field text);
        CREATE TABLE record_events(record_id int,org_id uuid,type text,occurred_at timestamptz);
        CREATE TABLE email_click_logs(send_log_id int,org_id uuid,click_id text,is_bot boolean,clicked_at timestamptz);
        CREATE TABLE tracker_sessions(id int primary key,click_id text,visitor_id int,site_id int,started_at timestamptz,ended_at timestamptz,duration int,landing_page text);
        CREATE TABLE tracker_sites(id int,workspace_id int,org_id uuid);
        CREATE TABLE tracker_events(session_id int,site_id int,visitor_id int,event_type text,event_name text,page_url text,occurred_at timestamptz);
        CREATE TABLE visitor_record_links(visitor_id int,org_id uuid,record_id int);
        INSERT INTO partitions VALUES(77,8);
    `);
    await pg.exec(await readFile("drizzle/0160_diha_visit_experiment.sql", "utf8"));
    const config = { dihaMaterial: createDihaMaterial("DH05", "", "https://designer-hire.com/"),
        maxEnrollmentDays: 42, minEnrollmentDays: 14, plannedPerArm: 100 };
    await pg.query("INSERT INTO email_copy_experiments VALUES(4,$1,8,61,'running','2026-11-25T00:00:00Z',$2)", [org, config]);
    await pg.query("INSERT INTO tracker_sites VALUES(1,8,$1)", [org]);
    const conn = pgliteTag(pg) as unknown as CopyConnection;
    const data = (n: number) => ({ orgId: org, workspaceId: 8, recordId: n, logId: n, sessionId: n,
        email: 'qa-' + n + '@example.test', company: '가상회사' + n, visitedAt: visit, now, due });
    for (const n of [1,2,3]) {
        await pg.query("INSERT INTO records(id,workspace_id,org_id) VALUES($1,8,$2)", [n,org]);
        await pg.query("INSERT INTO email_send_logs(id,org_id,auto_personalized_link_id,record_id,partition_id,sent_at,status,recipient_email) VALUES($1,$2,61,$1,77,'2026-11-25T01:00:00Z','sent',$3)", [n,org,data(n).email]);
    }
    await pg.query("INSERT INTO email_followup_queue(parent_log_id,source_type,org_id,step_index,status) VALUES(3,'ai',$1,0,'pending')", [org]);
    assert.equal(await captureDihaVisit(conn, data(1)), true);
    assert.equal(await captureDihaVisit(conn, data(1)), true);
    assert.equal(await captureDihaVisit(conn, data(2)), true);
    assert.equal(await captureDihaVisit(conn, data(3)), false);
    const assigned = (await pg.query<{arm:string;record_id:number;queue_id:number|null;body:string|null;status:string}>(`SELECT a.arm,v.record_id,v.queue_id,v.body,v.status
        FROM email_copy_assignments a JOIN email_visit_acknowledgements v ON v.experiment_assignment_id=a.id ORDER BY arm`)).rows;
    assert.deepEqual(assigned.map(a=>a.arm), ["A","B"]);
    assert.equal(assigned[0].queue_id,null);
    assert.equal(assigned[0].status,"cancelled");
    assert.ok(assigned[1].queue_id);
    assert.match(assigned[1].body!,/작업 사례 보기/);
    const queues = (await pg.query("SELECT source_type,status FROM email_followup_queue ORDER BY id")).rows;
    assert.deepEqual(queues,[{source_type:"ai",status:"pending"},{source_type:"visit_ack",status:"pending"}]);
    const control = data(assigned[0].record_id);
    await pg.query("INSERT INTO email_followup_queue(parent_log_id,source_type,org_id,step_index,status) VALUES($1,'ai',$2,1,'pending')",[control.logId,org]);
    await registerVisitAck(conn,{ orgId: org, workspaceId: 8, email: control.email, sourceLogId: control.logId, recordId: control.recordId, sessionId: control.sessionId },now,due,null);
    assert.equal((await pg.query<{status:string}>("SELECT status FROM email_followup_queue WHERE parent_log_id=$1 AND step_index=1",[control.logId])).rows[0].status,"pending");
    await pg.query("INSERT INTO record_events VALUES($1,$2,'signup','2026-11-26T02:00:00Z')", [assigned[0].record_id,org]);
    const report = await dihaOutcomes(conn,org,4,new Date("2026-12-11T03:00:00Z"));
    assert.deepEqual(report.arms.map(r=>[r.arm,r.assigned,r.linked_crm_signups,r.accepted]), [["A",1,1,0],["B",1,0,0]]);
    const bRecord = assigned[1].record_id;
    const bLog = 100 + bRecord;
    await pg.query("INSERT INTO email_send_logs(id,org_id,record_id,partition_id,parent_log_id,sent_at,status,recipient_email,nhn_status_code) VALUES($1,$2,$3,77,$3,'2026-11-25T04:00:00Z','sent',$4,'SST2')",
        [bLog,org,bRecord,data(bRecord).email]);
    await pg.query("UPDATE email_copy_assignments SET send_log_id=$1,actual_sent_at='2026-11-25T04:00:00Z' WHERE arm='B'",[bLog]);
    await pg.query("UPDATE email_visit_acknowledgements SET send_log_id=$1 WHERE record_id=$2",[bLog,bRecord]);
    await pg.query("INSERT INTO email_click_logs VALUES($1,$2,'확인',false,'2026-11-25T04:05:00Z'),($1,$2,'기계',true,'2026-11-25T05:00:00Z')",[bLog,org]);
    await pg.exec(`INSERT INTO tracker_sessions VALUES(10,'확인',10,1,'2026-11-25T04:05:00Z','2026-11-25T04:05:10Z',10,'https://designer-hire.com/signup/'),
           (11,'기계',11,1,'2026-11-25T05:00:00Z','2026-11-25T05:01:00Z',60,'https://designer-hire.com/signup/');
        INSERT INTO tracker_events VALUES(10,1,10,'PAGE_VIEW',null,'https://designer-hire.com/signup/','2026-11-25T04:05:01Z'),
           (11,1,11,'CUSTOM','signup_complete',null,'2026-11-25T05:00:03Z');`);
    const after = await dihaOutcomes(conn,org,4,new Date("2026-12-11T03:00:00Z"));
    const b = after.arms.find(row=>row.arm==="B")!;
    assert.deepEqual([b.delivered,b.verified_site_visits,b.signup_screen_visits,b.tracker_signup_signals,b.linked_crm_signups], [1,1,1,0,0]);
});
