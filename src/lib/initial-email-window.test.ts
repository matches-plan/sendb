import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { isInitialEmailMorning, nextInitialEmailMorning } from "./initial-email-window";
import { installFakeDb, isolateEnv } from "./auth-fake-db.test-helper";
import { openPglite } from "./db/pglite-harness.test-helper";
import * as schema from "./db/schema";

const orgId = "00000000-0000-4000-8000-000000000008";
const kst = (text: string) => new Date(text + "+09:00");

test("한국시간 월~금 09:00 이상 12:00 미만이며, 닫히면 다음 평일 09:00으로 미룬다", () => {
    for (const [input, open, next] of [
        ["2026-11-25T08:59:59.999", false, "2026-11-25T09:00"],
        ["2026-11-25T09:00", true, "2026-11-25T09:00"],
        ["2026-11-25T11:59:59.999", true, "2026-11-25T11:59:59.999"],
        ["2026-11-25T12:00", false, "2026-11-26T09:00"],
        ["2026-11-27T12:00", false, "2026-11-30T09:00"],
        ["2026-11-28T10:00", false, "2026-11-30T09:00"],
        ["2026-11-29T08:00", false, "2026-11-30T09:00"],
    ] as const) {
        assert.equal(isInitialEmailMorning(kst(input)), open, input);
        assert.equal(+nextInitialEmailMorning(kst(input)), +kst(next), input);
    }
});

test("설치 시 지정한 사업·명단·등록 규칙만 켜고 재실행해도 운영자의 이후 선택을 보존한다", async t => {
    const pg = new PGlite();
    t.after(() => pg.close());
    await pg.exec(`CREATE TABLE workspaces(id int PRIMARY KEY, org_id int);
        CREATE TABLE partitions(id int PRIMARY KEY,workspace_id int);
        CREATE TABLE email_auto_personalized_links(id int PRIMARY KEY,org_id int,partition_id int,trigger_type text);
        INSERT INTO workspaces VALUES(8,1),(9,2);
        INSERT INTO partitions VALUES(77,8),(78,9);
        INSERT INTO email_auto_personalized_links VALUES(61,1,77,'on_create'),(62,1,77,'on_create'),(63,2,78,'on_create');`);
    const migration = await readFile("drizzle/0161_initial_email_weekday_morning.sql", "utf8");
    const active = async () => (await pg.query<{ id: number }>("SELECT id FROM email_auto_personalized_links WHERE weekday_morning_only ORDER BY id")).rows;
    for (const change of ["org_id=2", "partition_id=78", "trigger_type='on_update'"]) {
        await pg.exec("BEGIN");
        await pg.exec("UPDATE email_auto_personalized_links SET " + change + " WHERE id=61");
        await pg.exec(migration);
        assert.deepEqual(await active(), []);
        await pg.exec("ROLLBACK");
    }
    await pg.exec(migration);
    assert.deepEqual(await active(), [{ id: 61 }]);
    await pg.exec("UPDATE email_auto_personalized_links SET weekday_morning_only=false WHERE id=61");
    await pg.exec(migration);
    await pg.exec("INSERT INTO email_auto_personalized_links(id,org_id,partition_id,trigger_type) VALUES(64,1,77,'on_create')");
    assert.deepEqual(await active(), []);
});

test("오후 등록은 발송 대기열에 남고, 정오를 넘긴 전송은 취소한 뒤 월요일에 한 번만 접수한다", async t => {
    isolateEnv(t);
    t.mock.timers.enable({ apis: ["Date"], now: +kst("2026-11-26T13:00") });
    const { db, queryClient } = await import("./db");
    const { processAutoPersonalizedEmail } = await import("./auto-personalized-email");
    const { toProcessedRow, planQueueRow } = await import("./email-send-queue-rules");
    const { enqueueDeferredSend } = await import("./email-send-queue");
    const { deferredUntil } = await import("./auto-personalized-email-outcome");
    const statuses: string[] = [];
    const rule = { id: 61, orgId, partitionId: 77, triggerType: "on_create" as const, weekdayMorningOnly: true,
        recipientField: "email", companyField: "company", preventDuplicate: 1, autoResearch: 0 };
    let reachNoon = false;
    let jobLog: number | null = null;
    const { calls } = installFakeDb(t, db, c => {
        if (c.table === "email_auto_personalized_links") return [rule];
        if (c.table === "partitions") return [{ workspaceId: 8 }];
        if (c.table === "workspaces") return [{ id: 8, orgId }];
        if (c.table === "email_configs") return [{ fromEmail: "sender@example.test", appKey: "test", secretKey: "test", isActive: 1 }];
        if (c.table === "email_unsubscribes" && reachNoon && statuses.at(-1) === "pending") {
            // 업체 요청 직전의 비동기 수신거부 조회 도중 정오로 넘어간다.
            t.mock.timers.setTime(+kst("2026-11-27T12:00"));
            reachNoon = false;
        }
        if (c.table === "email_send_logs") {
            if (c.op === "insert") { statuses.push("pending"); return [{ id: statuses.length }]; }
            if (c.op === "update") {
                statuses[Number(c.params.find(p => typeof p === "number")) - 1] = (c.set as {status: string}).status;
                return [{ id: statuses.length }];
            }
            if (c.op === "select" && statuses.some(s => c.params.includes("unknown") ? s === "pending" : s === "sent")) return [{ id: statuses.length }];
        }
        if (c.op === "update" && c.table === "ai_copy_generation_jobs") { jobLog = null; return [{ assignmentId: 17 }]; }
        return [];
    });
    const job = { id: 3, state: "ready", org_id: orgId, output: { subject: "가상 제목", htmlBody: "<p>가상 본문</p>" } };
    const connect = Object.assign(async (strings: TemplateStringsArray, ...params: unknown[]) => {
        const sql = strings.join("?");
        if (sql.includes("AS present")) return [{ present: false }];
        if (sql.includes("WITH RECURSIVE chain") || sql.startsWith("SELECT * FROM ai_copy_generation_jobs")) return [job];
        if (sql.includes("SELECT j.state,j.send_log_id")) return [{ ...job, send_log_id: jobLog, blocked: false, experiment_hold: false }];
        if (sql.includes("AS blocked")) return [{ blocked: false }];
        if (sql.startsWith("SELECT id FROM email_send_logs")) return [{ id: params[0] }];
        if (sql.startsWith("UPDATE ai_copy_generation_jobs SET send_log_id=")) jobLog = Number(params[0]);
        return [];
    }, { release() {} });
    const sqlConnections = t.mock.method(queryClient, "reserve", async () => connect as never);
    const provider = t.mock.method(globalThis, "fetch", async () => Response.json({
        header: { isSuccessful: true, resultCode: 0 }, body: { data: { requestId: "local", results: [{ resultCode: 0 }] } },
    }));
    const record: schema.DbRecord = { id: 50, orgId, workspaceId: 8, partitionId: 77, integratedCode: null, distributionOrder: null,
        data: { email: "recipient@example.test" }, registeredAt: new Date(), createdAt: new Date(), updatedAt: new Date() };
    const run = (queueId?: number, purpose: "bulk" | "inbound" = "inbound") => processAutoPersonalizedEmail({
        record, partitionId: 77, orgId, triggerType: "on_create", queueId, purpose,
    });

    const first = deferredUntil(await run());
    assert.deepEqual(first, { reason: "rule_window", retryAt: kst("2026-11-27T09:00") });
    assert.equal(sqlConnections.mock.callCount(), 0);
    assert.equal(provider.mock.callCount(), 0);
    await enqueueDeferredSend({ recordId: record.id, partitionId: 77, orgId, triggerType: "on_create", ...first! });
    assert(calls.some(c => c.sql.includes("INSERT INTO email_send_queue") && c.params.includes(first!.retryAt.toISOString())));
    assert.deepEqual(deferredUntil(await run(2, "bulk")), first);
    assert(calls.some(c => c.table === "email_prepared_sends" && c.op === "update" && c.params.includes("ready") && c.params.includes(first!.retryAt.toISOString())
        && (c.set as { status: string }).status === "cancelled" && !Object.hasOwn(c.set as object, "payload")));

    t.mock.timers.setTime(+kst("2026-11-27T11:59:59"));
    reachNoon = true;
    const late = toProcessedRow(await run(1));
    assert.deepEqual(late.deferral, { reason: "rule_window", retryAt: kst("2026-11-30T09:00") });
    const plan = planQueueRow({ outcome: late.outcome, deferral: late.deferral!, attempts: 1, failedLinkIds: [], exhaustedLinkIds: [] });
    assert.equal(plan.status, "pending");
    assert.equal(plan.attempts, 0);
    assert.equal(provider.mock.callCount(), 0);
    assert.deepEqual(statuses, ["cancelled"]);
    assert.equal(jobLog, null);
    assert(calls.some(c => c.op === "update" && c.table === "email_copy_assignments" && c.sql.includes("is null")));

    t.mock.timers.setTime(+kst("2026-11-30T09:01"));
    assert.equal((await run(1)).outcomes[0].kind, "sent");
    assert.equal((await run(1)).outcomes[0].kind, "skipped");
    assert.deepEqual(statuses, ["cancelled", "sent"]);
    assert.equal(jobLog, 2);
    assert.equal(provider.mock.callCount(), 1);
});

test("대량 예약은 기존 오후 자리와 본문을 읽어 같은 주소의 오전 자리로 옮기고 다른 규칙의 오후 자리는 허용한다", async t => {
    isolateEnv(t);
    const { reservePreparedSend } = await import("./email-prepared-sends");
    const pg = await openPglite([schema.emailSenderProfiles, schema.emailSenderDailyPlans, schema.emailSenderDailyUsage, schema.emailPreparedSends]);
    t.after(() => pg.close());
    await pg.exec(`CREATE UNIQUE INDEX plans_day ON email_sender_daily_plans(sender_profile_id,usage_date);
        CREATE UNIQUE INDEX queue_link ON email_prepared_sends(queue_id,link_id);`);
    const database = drizzle(pg);
    await database.insert(schema.emailSenderProfiles).values({ id: 37, orgId, name: "가상", fromName: "가상", fromEmail: "sender@example.test", dailyLimit: 24, sendWindowStart: 9, sendWindowEnd: 18 });
    const input = { orgId, queueId: 1, linkId: 61, ids: [37], config: null, sourceHash: "same" };
    const reserve = (queueId: number, linkId: number, time: string, morning: boolean) => reservePreparedSend({
        ...input, queueId, linkId, now: kst("2026-11-27T" + time), weekdayMorningOnly: morning,
    }, database as unknown as Parameters<typeof reservePreparedSend>[1]);
    const payload = { recipientEmail: "local@example.test", subject: "가상", body: "검사", unsubscribeToken: null };
    await database.insert(schema.emailSenderDailyPlans).values({ senderProfileId: 37, usageDate: "2026-11-27", startAt: kst("2026-11-27T09:00") });
    await database.insert(schema.emailPreparedSends).values({
        orgId, queueId: 1, linkId: 61, sourceHash: "same", senderProfileId: 37, usageDate: "2026-11-27",
        ordinal: 18, scheduledAt: kst("2026-11-27T15:00"), payload, status: "ready",
    });
    const moved = await reserve(1, 61, "09:00", true);
    assert(moved.kind === "reserved");
    assert(isInitialEmailMorning(moved.row.scheduledAt));
    assert.deepEqual(moved.row.payload, payload);
    const late = await reserve(2, 61, "11:59", true);
    assert(late.kind === "deferred");
    assert.deepEqual(late.retryAt, kst("2026-11-30T09:00"));
    const other = await reserve(3, 62, "13:00", false);
    assert(other.kind === "reserved" && !isInitialEmailMorning(other.row.scheduledAt));
});

test("정오에 미전송한 A·B 모두 기존 배정과 문구를 보존하고 이미 접수된 로그는 보호한다", async t => {
    isolateEnv(t);
    const { deferUnsubmittedInitialLog } = await import("./email-prepared-sends");
    const pg = new PGlite();
    t.after(() => pg.close());
    await pg.exec(`CREATE TABLE email_send_logs(id int PRIMARY KEY,org_id uuid,status text,result_message text);
        CREATE TABLE ai_copy_generation_jobs(id int PRIMARY KEY,org_id uuid,send_log_id int,assignment_id int,updated_at timestamptz);
        CREATE TABLE email_copy_assignments(id int PRIMARY KEY,org_id uuid,arm text,send_log_id int,actual_sender_id int,actual_sender_email text,actual_sent_at timestamptz);
        CREATE TABLE email_prepared_sends(id int PRIMARY KEY,log_id int,status text,payload text,updated_at timestamptz);`);
    for (const [id, arm, accepted] of [[1,"A",false],[2,"B",false],[3,"A",true]] as const) {
        await pg.query("INSERT INTO email_send_logs VALUES($1,$2,$3,NULL)", [id,orgId,accepted ? "sent" : "pending"]);
        await pg.query("INSERT INTO ai_copy_generation_jobs VALUES($1,$2,$1,$1,NULL)", [id,orgId]);
        await pg.query("INSERT INTO email_copy_assignments VALUES($1,$2,$3,$1,37,'sender@example.test',$4)", [id,orgId,arm,accepted ? new Date().toISOString() : null]);
        await pg.query("INSERT INTO email_prepared_sends VALUES($1,$1,$2,$3,NULL)", [id,accepted ? "sent" : "sending",arm]);
    }
    const database = drizzle(pg) as unknown as Parameters<typeof deferUnsubmittedInitialLog>[1];
    const undo = (id: number) => deferUnsubmittedInitialLog({ orgId, logId: id, jobId: id, preparedId: id }, database);
    await undo(1);
    await undo(2);
    await assert.rejects(undo(3));
    const rows = await pg.query(`SELECT l.status,a.arm,j.assignment_id,j.send_log_id AS job_log,a.send_log_id AS assignment_log,
        a.actual_sender_id,a.actual_sender_email,a.actual_sent_at IS NOT NULL AS accepted,p.log_id AS prepared_log,p.status AS prepared,p.payload
        FROM email_send_logs l JOIN ai_copy_generation_jobs j ON j.id=l.id JOIN email_copy_assignments a ON a.id=j.assignment_id
        JOIN email_prepared_sends p ON p.id=l.id ORDER BY l.id`);
    for (const [i, arm] of ["A","B"].entries()) assert.deepEqual(rows.rows[i], {
        status: "cancelled", arm, assignment_id: i + 1, job_log: null, assignment_log: null, actual_sender_id: null,
        actual_sender_email: null, accepted: false, prepared_log: null, prepared: "cancelled", payload: arm,
    });
    assert.deepEqual(rows.rows[2], { status: "sent", arm: "A", assignment_id: 3, job_log: 3, assignment_log: 3, actual_sender_id: 37,
        actual_sender_email: "sender@example.test", accepted: true, prepared_log: 3, prepared: "sent", payload: "A" });
});
