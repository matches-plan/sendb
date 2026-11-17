import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { createUnsubscribeManagementRepository } from "./email-unsubscribe-management-repository";
import { EMAIL_TRIM_CHARS } from "./deep-visitor-alert-rules";

test("real SQL lists one workspace plus workspace-less rows, isolates organizations and matches exact domains", async () => {
    const pg = new PGlite();
    try {
        await pg.exec(`CREATE TABLE email_unsubscribes (id serial PRIMARY KEY, org_id uuid NOT NULL, workspace_id integer, email text NOT NULL, source text NOT NULL DEFAULT 'link', reason text, unsubscribed_at timestamptz NOT NULL DEFAULT now());`);
        const org = "00000000-0000-4000-8000-000000000001", other = "00000000-0000-4000-8000-000000000002";
        const rows = [
            [org, 1, `${EMAIL_TRIM_CHARS}Person@EXAMPLE.COM${EMAIL_TRIM_CHARS}`, "link"],
            [org, 2, "person@example.com", "one_click"],
            [org, null, "admin@example.com", "manual"],
            [org, 1, "a@sub.example.com", "link"],
            [org, 1, "a@notexample.com", "link"],
            [org, 2, "b@example.com", "link"],
            [other, null, "private@example.com", "link"],
            [other, 1, "private2@example.com", "link"],
        ];
        for (const row of rows) await pg.query("INSERT INTO email_unsubscribes(org_id,workspace_id,email,source) VALUES ($1,$2,$3,$4)", row);
        const repository = createUnsubscribeManagementRepository(drizzle(pg) as unknown as Parameters<typeof createUnsubscribeManagementRepository>[0]);
        const list = await repository.list(org, { workspaceId: 1, page: 1, pageSize: 2, q: "" });
        assert.equal(list.totalCount, 4);
        assert.equal(list.items.length, 2);
        const all = await repository.list(org, { workspaceId: 1, page: 1, pageSize: 20, q: "" });
        assert.deepEqual(new Set(all.items.map((item) => item.email)), new Set(["person@example.com", "admin@example.com", "a@sub.example.com", "a@notexample.com"]));
        assert.ok(all.items.every((item) => item.workspaceId === 1 || item.workspaceId === null));
        const domain = await repository.list(org, { workspaceId: 1, page: 1, pageSize: 20, q: "example.com" });
        assert.deepEqual(new Set(domain.items.map((item) => item.email)), new Set(["person@example.com", "admin@example.com"]));
        const second = await repository.list(org, { workspaceId: 2, page: 1, pageSize: 20, q: "example.com" });
        assert.equal(second.totalCount, 3);
        const literalSearch = await repository.list(org, { workspaceId: 1, page: 1, pageSize: 20, q: "%" });
        assert.equal(literalSearch.totalCount, 0);
    } finally {
        await pg.close();
    }
});
