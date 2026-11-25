import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { insertRow, openPglite, pgliteTag } from "../db/pglite-harness.test-helper";
import { aiCopyGenerationAttempts, aiCopyGenerationJobs, aiCopyKnowledgeVersions, aiCopyPolicyVersions } from "../db/ai-copy-schema";
import { generateStoredCopy } from "../ai-copy/generation";
import type { CopyConnection } from "../ai-copy/types";
import { createDihaMaterial, dihaMail } from "./diha-material";
import { enrollForPreparation } from "./repository";

test("기존 첫 메일 준비에서 업무 확인·회사별 중복·다른 사업의 미확정 발송을 거르고 재시도에는 같은 안을 쓴다", async t => {
    const pg = new PGlite();
    t.after(() => pg.close());
    const org = "00000000-0000-4000-8000-000000000008";
    const at = new Date("2026-11-25T03:00:00Z");
    await pg.exec(`
        CREATE TABLE email_copy_experiments(id int primary key,org_id uuid,workspace_id int,rule_id int,state text,started_at timestamptz,config jsonb);
        CREATE TABLE email_copy_assignments(id serial primary key,experiment_id int,org_id uuid,workspace_id int,normalized_email text,customer_key text,
            arm text,cohort text,company_key text,record_id int,initial_scheduled_at timestamptz,planned_sender_id int,planned_sender_email text,
            stratum text,tier text,assigned_at timestamptz,unique(experiment_id,normalized_email),unique(experiment_id,company_key));
        CREATE TABLE partitions(id int primary key,workspace_id int);
        CREATE TABLE email_send_logs(id serial primary key,org_id uuid,partition_id int,recipient_email text,status text,request_id text,nhn_status_code text,delivery_fail_source text);
        INSERT INTO partitions VALUES(77,8),(1,1);
    `);
    const cases = "식품\t가상 식품사\n식품\t가상 농원\n배너\t가상 상점";
    const baseUrl = "https://designer-hire.com/";
    const material = createDihaMaterial("DH02",cases,baseUrl);
    const config = { kind:"prompt", analysisUnit:"recipient", dihaMaterial:material, promptA:"공통",promptB:"공통",
        minEnrollmentDays:14,maxEnrollmentDays:42,plannedPerArm:100 };
    await pg.query("INSERT INTO email_copy_experiments VALUES(4,$1,8,61,'running',$2,$3)",[org,at,config]);
    const conn = pgliteTag(pg) as unknown as CopyConnection;
    const prepare = (id:number, company:string) => enrollForPreparation(conn,{orgId:org,workspaceId:8,ruleId:61,
        recordId:id,email:"qa-" + id + "@example.test",company,plannedAt:at,now:at,senderId:37,internal:false});
    assert.equal((await prepare(1,"업무 미확인")).kind,"none");
    const a = await prepare(2,"가상 식품사"), b = await prepare(3,"가상 농원");
    assert.equal(a.kind,"assigned");
    assert.equal(b.kind,"assigned");
    if (a.kind !== "assigned" || b.kind !== "assigned") throw Error("배정 누락");
    assert.notEqual(a.assignment.arm,b.assignment.arm);
    assert.equal(a.assignment.tier,"food");
    assert.equal((await prepare(4,"가상 식품사")).kind,"none");
    const retry = await prepare(2,"새 이름");
    assert.equal(retry.kind,"assigned");
    if (retry.kind !== "assigned") throw Error("기존 배정 누락");
    assert.equal(retry.assignment.id,a.assignment.id);
    assert.deepEqual(dihaMail(material,retry.assignment.arm,retry.assignment.tier),dihaMail(material,a.assignment.arm,a.assignment.tier));
    await pg.query("INSERT INTO email_send_logs(org_id,partition_id,recipient_email,status) VALUES($1,1,'qa-5@example.test','unknown')",[org]);
    assert.equal((await prepare(5,"가상 상점")).kind,"none");
    await pg.query("UPDATE email_copy_experiments SET config=$1 WHERE id=4",[{...config,dihaMaterial:createDihaMaterial("DH05","",baseUrl)}]);
    assert.equal((await prepare(6,"가상 상점")).kind,"none");
    assert.equal((await pg.query<{n:number}>("SELECT count(*)::int AS n FROM email_copy_assignments")).rows[0].n,2);
});

test("첫 발송 작업이 고정 문구를 그대로 검증해 저장하고 재시도에서도 모델 호출이나 비용이 생기지 않는다", async t => {
    const pg = await openPglite([aiCopyPolicyVersions,aiCopyKnowledgeVersions,aiCopyGenerationJobs,aiCopyGenerationAttempts]);
    t.after(() => pg.close());
    const orgId = "00000000-0000-4000-8000-000000000008";
    const fixed = dihaMail(createDihaMaterial("DH03","","https://designer-hire.com/"),"B","unclassified");
    const at = new Date("2026-11-25T03:00:00Z");
    await insertRow(pg,"ai_copy_generation_jobs",{
        id:1,org_id:orgId,workspace_id:8,purpose:"initial_email",assignment_id:10,idempotency_key:"experiment-assignment:10",eligible_at:at,
        policy_snapshot:{purpose:"initial_email",provider:"claude",model:"테스트",validatorVersion:"copy-v1",forbiddenPhrases:[],maxCharacters:1200},
        context:{fixedSubject:fixed.subject,fixedInitialBody:fixed.htmlBody,allowedUrls:[fixed.url]},
    });
    const conn = pgliteTag(pg) as unknown as CopyConnection;
    const deps = { now:() => at,quota:async () => true,call:async () => { throw Error("고정 문구에서 모델 호출"); } };
    const first = await generateStoredCopy(conn,{id:1,orgId},deps);
    assert.equal(first.subject,fixed.subject);
    assert.equal(first.htmlBody,fixed.htmlBody);
    assert.deepEqual(await generateStoredCopy(conn,{id:1,orgId},deps),first);
    const attempts = await pg.query("SELECT result,usage_known,prompt_tokens,completion_tokens FROM ai_copy_generation_attempts");
    assert.deepEqual(attempts.rows,[{result:"valid",usage_known:true,prompt_tokens:0,completion_tokens:0}]);
});
