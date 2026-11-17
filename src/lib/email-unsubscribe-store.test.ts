import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { createEmailUnsubscribeStore, unsubscribedRecipientsQuery } from "./email-unsubscribe-store";

const org = "00000000-0000-4000-8000-000000000001";

async function open() {
    const pg = new PGlite();
    await pg.exec(`
        CREATE TABLE workspaces (id integer PRIMARY KEY, org_id uuid NOT NULL);
        CREATE TABLE partitions (id integer PRIMARY KEY, workspace_id integer);
        CREATE TABLE email_send_logs (id serial PRIMARY KEY, org_id uuid NOT NULL, partition_id integer, recipient_email text NOT NULL, record_id integer, unsubscribe_token text);
        CREATE TABLE email_unsubscribes (id serial PRIMARY KEY, org_id uuid NOT NULL, workspace_id integer, email varchar(200) NOT NULL,
            send_log_id integer, record_id integer, source varchar(20) NOT NULL DEFAULT 'link', reason text, unsubscribed_at timestamptz NOT NULL DEFAULT now());
        CREATE UNIQUE INDEX email_unsubscribes_workspace_email_idx ON email_unsubscribes (workspace_id, lower(email));
    `);
    await pg.query("INSERT INTO workspaces VALUES (1, $1), (2, $1)", [org]);
    await pg.query("INSERT INTO partitions VALUES (10, 1), (20, 2)");
    const database = drizzle(pg) as unknown as Parameters<typeof createEmailUnsubscribeStore>[0];
    return { pg, store: createEmailUnsubscribeStore(database) };
}

test("an unsubscribe blocks only its own 사업부; workspace-less rows block every 사업부", async () => {
    const { pg, store } = await open();
    try {
        await store.recordUnsubscribe({ orgId: org, workspaceId: 1, email: "Lead@Example.com", source: "manual" });
        assert.equal(await store.isUnsubscribed(1, "lead@example.com"), true);
        assert.equal(await store.isUnsubscribed(2, "lead@example.com"), false);
        assert.equal(await store.isWorkspaceUnsubscribed(org, 2, " LEAD@example.com "), false);
        // 사업부를 모르는 발송은 어느 사업부의 거부든 막는다
        assert.equal(await store.isOrganizationUnsubscribed(org, "lead@example.com"), true);

        // 다른 사업부에서도 거부하면 줄이 따로 생긴다 (같은 사업부 반복은 하나)
        await store.recordUnsubscribe({ orgId: org, workspaceId: 2, email: "lead@example.com", source: "manual" });
        await store.recordUnsubscribe({ orgId: org, workspaceId: 2, email: "lead@example.com", source: "manual" });
        assert.equal((await pg.query("SELECT 1 FROM email_unsubscribes")).rows.length, 2);

        await pg.query("INSERT INTO email_unsubscribes (org_id, workspace_id, email) VALUES ($1, NULL, 'legacy@example.com')", [org]);
        assert.equal(await store.isUnsubscribed(1, "legacy@example.com"), true);
        assert.equal(await store.isUnsubscribed(2, "legacy@example.com"), true);
        // 예전 전체 줄이 있으면 사업부 줄을 더 쓰지 않는다
        await store.recordUnsubscribe({ orgId: org, workspaceId: 1, email: "legacy@example.com" });
        assert.equal((await pg.query("SELECT 1 FROM email_unsubscribes WHERE email = 'legacy@example.com'")).rows.length, 1);

        const batch = await pg.query<{ ordinal: number }>(...toQuery(unsubscribedRecipientsQuery(org, 2, ["x@example.com", "legacy@example.com", "lead@example.com"])));
        assert.deepEqual(batch.rows.map((r) => r.ordinal).sort(), [1, 2]);
        await pg.query("DELETE FROM email_unsubscribes WHERE workspace_id = 2");
        const scoped = await pg.query<{ ordinal: number }>(...toQuery(unsubscribedRecipientsQuery(org, 2, ["lead@example.com"])));
        assert.deepEqual(scoped.rows, []);
    } finally {
        await pg.close();
    }
});

test("the unsubscribe link records the 사업부 of the mail and removal is scoped to that 사업부 list", async () => {
    const { pg, store } = await open();
    try {
        await pg.query("INSERT INTO email_send_logs (org_id, partition_id, recipient_email, unsubscribe_token) VALUES ($1, 20, 'lead@example.com', 'tok')", [org]);
        const target = await store.resolveUnsubscribeTarget("tok");
        assert.equal(target?.workspaceId, 2);
        assert.equal(target?.alreadyUnsubscribed, false);
        await store.recordUnsubscribe({ orgId: org, workspaceId: target!.workspaceId, email: target!.email, sendLogId: target!.sendLogId, source: "link" });
        assert.equal((await store.resolveUnsubscribeTarget("tok"))?.alreadyUnsubscribed, true);
        assert.equal(await store.attachUnsubscribeReason("tok", "too many"), true);
        assert.equal(await store.isUnsubscribed(1, "lead@example.com"), false);

        const [{ id }] = (await pg.query<{ id: number }>("SELECT id FROM email_unsubscribes")).rows;
        assert.equal(await store.removeUnsubscribe(org, 1, id), null);
        assert.equal(await store.removeUnsubscribe("00000000-0000-4000-8000-000000000002", 2, id), null);
        assert.equal(await store.removeUnsubscribe(org, 2, id), "lead@example.com");
        assert.equal(await store.isUnsubscribed(2, "lead@example.com"), false);
    } finally {
        await pg.close();
    }
});

function toQuery(query: SQL): [string, unknown[]] {
    const { sql, params } = new PgDialect().sqlToQuery(query);
    return [sql, params];
}
