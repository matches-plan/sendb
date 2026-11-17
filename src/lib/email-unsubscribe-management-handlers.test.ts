import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createUnsubscribeManagementHandlers } from "./email-unsubscribe-management-handlers";
import { parseUnsubscribeTarget } from "./email-unsubscribe-management-rules";

function fixture(role: string | null = "member") {
    const calls: Array<{ operation: string; orgId: string; input?: unknown }> = [];
    const handlers = createUnsubscribeManagementHandlers({
        authenticate: () => role ? { orgId: "org-current", role } : null,
        workspaceInOrg: async (_orgId, workspaceId) => workspaceId === 4,
        list: async (orgId, options) => { calls.push({ operation: "list", orgId, input: options }); return { items: [], totalCount: 0 }; },
        register: async (orgId, input) => { calls.push({ operation: "register", orgId, input }); },
        remove: async (orgId, workspaceId, id) => { calls.push({ operation: "remove", orgId, input: { workspaceId, id } }); return id === 7 ? "person@example.com" : null; },
    });
    return { ...handlers, calls };
}

function request(body?: unknown, query = "", headers?: Record<string, string>, method?: string) {
    const url = `http://localhost/api/email/unsubscribes${query}`;
    if (method) return new NextRequest(url, { method, headers });
    return new NextRequest(url, body === undefined ? { headers } : { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}

test("unauthenticated list, writes and removal cannot reach data", async () => {
    const f = fixture(null);
    for (const response of [await f.GET(request(undefined, "?workspaceId=4")), await f.POST(request({ email: "person@example.com", workspaceId: 4 })), await f.DELETE(request(undefined, "?workspaceId=4", undefined, "DELETE"), "7")]) assert.equal(response.status, 401);
    assert.deepEqual(f.calls, []);
});

test("members can list one workspace of the authenticated organization; query orgId is ignored", async () => {
    const f = fixture();
    const response = await f.GET(request(undefined, "?orgId=org-other&workspaceId=4&page=2&pageSize=10"));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.data.canManage, false);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(f.calls[0], { operation: "list", orgId: "org-current", input: { workspaceId: 4, page: 2, pageSize: 10, q: "" } });
});

test("list requires a workspace of this organization", async () => {
    const f = fixture();
    assert.equal((await f.GET(request())).status, 400);
    assert.equal((await f.GET(request(undefined, "?workspaceId=abc"))).status, 400);
    assert.equal((await f.GET(request(undefined, "?workspaceId=5"))).status, 404);
    assert.deepEqual(f.calls, []);
});

test("member and unknown roles cannot register or remove; admin/owner normalize exact addresses into the workspace", async () => {
    for (const role of ["member", "unknown"]) {
        const f = fixture(role);
        assert.equal((await f.POST(request({ email: "person@example.com", workspaceId: 4 }))).status, 403);
        assert.equal((await f.DELETE(request(undefined, "?workspaceId=4", undefined, "DELETE"), "7")).status, 403);
        assert.deepEqual(f.calls, []);
    }
    for (const role of ["admin", "owner"]) {
        const f = fixture(role);
        assert.equal((await f.POST(request({ email: "  Person@Example.com  ", workspaceId: 4, reason: " Requested by customer " }))).status, 200);
        assert.deepEqual(f.calls, [{ operation: "register", orgId: "org-current", input: { email: "person@example.com", workspaceId: 4, reason: "Requested by customer" } }]);
    }
});

test("manual registration rejects domains, injected organization, foreign workspace and malformed JSON", async () => {
    const f = fixture("admin");
    for (const body of [{ email: "example.com", workspaceId: 4 }, { email: "*@example.com", workspaceId: 4 }, { email: "person@example.com", workspaceId: 4, orgId: "other" }, { email: "person@example.com" }, { email: "person@example.com", workspaceId: "4" }, { email: "person@example.com", workspaceId: 4, reason: "x".repeat(1001) }]) {
        assert.equal((await f.POST(request(body))).status, 400);
    }
    assert.equal((await f.POST(request({ email: "person@example.com", workspaceId: 5 }))).status, 404);
    assert.equal((await f.POST(new NextRequest("http://localhost/api/email/unsubscribes", { method: "POST", body: "{" }))).status, 400);
    assert.deepEqual(f.calls, []);
});

test("removal is scoped to the workspace and reports missing rows", async () => {
    const f = fixture("admin");
    assert.equal((await f.DELETE(request(undefined, "?workspaceId=4", undefined, "DELETE"), "7")).status, 200);
    assert.deepEqual(f.calls[0], { operation: "remove", orgId: "org-current", input: { workspaceId: 4, id: 7 } });
    assert.equal((await f.DELETE(request(undefined, "?workspaceId=4", undefined, "DELETE"), "8")).status, 404);
    assert.equal((await f.DELETE(request(undefined, "?workspaceId=5", undefined, "DELETE"), "7")).status, 404);
    for (const [query, id] of [["", "7"], ["?workspaceId=4", "x"], ["?workspaceId=4", "0"], ["?workspaceId=4", "-1"]]) {
        assert.equal((await f.DELETE(request(undefined, query, undefined, "DELETE"), id)).status, 400);
    }
    assert.equal(f.calls.length, 2);
});

test("org switch mismatches stop stale list, mutation and removal requests", async () => {
    const f = fixture("admin");
    const headers = { "x-sendb-org-id": "org-previous" };
    assert.equal((await f.GET(request(undefined, "?workspaceId=4", headers))).status, 409);
    assert.equal((await f.POST(request({ email: "person@example.com", workspaceId: 4 }, "", headers))).status, 409);
    assert.equal((await f.DELETE(request(undefined, "?workspaceId=4", headers, "DELETE"), "7")).status, 409);
    assert.deepEqual(f.calls, []);
});

test("pagination rejects invalid or excessive limits instead of reaching DB", async () => {
    const f = fixture();
    for (const query of ["?page=0", "?page=-1", "?page=Infinity", "?page=1.5", "?pageSize=101", "?pageSize=0", "?page=1000001", `?q=${"a".repeat(201)}`]) {
        assert.equal((await f.GET(request(undefined, `${query}&workspaceId=4`))).status, 400);
    }
    assert.deepEqual(f.calls, []);
});

test("domain parser does not infer parent or neighboring domains", () => {
    assert.deepEqual(parseUnsubscribeTarget("@Mail.Example.com"), { kind: "domain", query: "mail.example.com" });
    assert.deepEqual(parseUnsubscribeTarget("notexample.com"), { kind: "domain", query: "notexample.com" });
    assert.equal(parseUnsubscribeTarget("example.com.evil/"), null);
});
