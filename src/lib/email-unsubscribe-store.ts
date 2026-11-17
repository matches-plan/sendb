import type { db } from "./db";
import { emailSendLogs, emailUnsubscribes, partitions, workspaces } from "./db/schema";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { EMAIL_TRIM_CHARS, normalizeEmail } from "./deep-visitor-alert-rules";

type UnsubscribeDatabase = Pick<typeof db, "select" | "update" | "delete" | "transaction">;

/** Every row of the organization for this address, regardless of 사업부. */
export function organizationUnsubscribeCondition(orgId: string, email: string) {
    return and(
        eq(emailUnsubscribes.orgId, orgId),
        sql`lower(btrim(${emailUnsubscribes.email}, ${EMAIL_TRIM_CHARS})) = lower(btrim(${email}, ${EMAIL_TRIM_CHARS}))`,
    );
}

/**
 * 수신거부는 사업부별이다: 그 사업부에서 거부한 줄과 사업부가 없는 줄(예전 줄·사업부가 지워진 줄 — 모든 사업부를 막는다)이 막는다.
 * 사업부를 모르는 발송(workspaceId null)은 어느 사업부의 거부든 막는다 — 모르면 보내지 않는 쪽으로.
 */
export function workspaceUnsubscribeCondition(orgId: string, workspaceId: number | null, email: string) {
    return and(
        organizationUnsubscribeCondition(orgId, email),
        workspaceId === null ? undefined : or(isNull(emailUnsubscribes.workspaceId), eq(emailUnsubscribes.workspaceId, workspaceId)),
    );
}

/** Batch preflight returns input ordinals so driver text decoding cannot alter cached lookup keys. */
export function unsubscribedRecipientsQuery(orgId: string, workspaceId: number | null, emails: readonly string[]) {
    if (emails.length === 0) throw new Error("수신거부 조회 대상이 없습니다.");
    const scope = workspaceId === null ? sql`` : sql`AND (u.workspace_id IS NULL OR u.workspace_id = ${workspaceId}::int)`;
    return sql`
        SELECT v.ordinal
        FROM (VALUES ${sql.join(emails.map((email, ordinal) => sql`(${email}::text, ${ordinal}::int)`), sql`, `)}) AS v(email, ordinal)
        WHERE EXISTS (
            SELECT 1 FROM email_unsubscribes u
            WHERE u.org_id = ${orgId}::uuid
              AND lower(btrim(u.email, ${EMAIL_TRIM_CHARS})) = lower(btrim(v.email, ${EMAIL_TRIM_CHARS}))
              ${scope}
        )
    `;
}

/** A dependency-injected store permits real PostgreSQL semantics in isolated PGlite tests. */
export function createEmailUnsubscribeStore(database: UnsubscribeDatabase) {
    /** 이 사업부의 발송을 막는 수신거부가 있는가 (workspaceId null = 사업부를 모름 → 조직 안 어느 거부든) */
    async function isWorkspaceUnsubscribed(
        orgId: string, workspaceId: number | null, email: string, exec: Pick<typeof db, "select"> = database,
    ): Promise<boolean> {
        const [row] = await exec.select({ id: emailUnsubscribes.id }).from(emailUnsubscribes)
            .where(workspaceUnsubscribeCondition(orgId, workspaceId, email)).limit(1);
        return !!row;
    }

    /** 조직 안 어느 사업부에서든 거부했는가 — 사업부가 없는 발송(초대·전자서명 등)에 쓴다 */
    async function isOrganizationUnsubscribed(orgId: string, email: string, exec: Pick<typeof db, "select"> = database): Promise<boolean> {
        return isWorkspaceUnsubscribed(orgId, null, email, exec);
    }

    async function isUnsubscribed(workspaceId: number, email: string): Promise<boolean> {
        const [workspace] = await database.select({ orgId: workspaces.orgId }).from(workspaces)
            .where(eq(workspaces.id, workspaceId)).limit(1);
        // Missing ownership must never silently authorize a send.
        if (!workspace) throw new Error("수신거부 확인을 위한 사업 정보를 찾을 수 없습니다.");
        return isWorkspaceUnsubscribed(workspace.orgId, workspaceId, email);
    }

    /** 사업부 없는 줄(모든 사업부를 막는다)이 있는가 */
    async function hasOrganizationWideRow(orgId: string, email: string, exec: Pick<typeof db, "select"> = database): Promise<boolean> {
        const [row] = await exec.select({ id: emailUnsubscribes.id }).from(emailUnsubscribes)
            .where(and(organizationUnsubscribeCondition(orgId, email), isNull(emailUnsubscribes.workspaceId))).limit(1);
        return !!row;
    }

    async function resolveWorkspaceId(partitionId: number): Promise<number | null> {
        const [row] = await database.select({ workspaceId: partitions.workspaceId }).from(partitions)
            .where(eq(partitions.id, partitionId)).limit(1);
        return row?.workspaceId ?? null;
    }

    async function resolveUnsubscribeTarget(token: string) {
        const [log] = await database.select({
            id: emailSendLogs.id,
            orgId: emailSendLogs.orgId,
            partitionId: emailSendLogs.partitionId,
            recipientEmail: emailSendLogs.recipientEmail,
            recordId: emailSendLogs.recordId,
        }).from(emailSendLogs).where(eq(emailSendLogs.unsubscribeToken, token)).limit(1);
        if (!log) return null;

        // Partition/workspace may have been deleted after this email was sent. Its org still owns the token.
        let workspaceId = log.partitionId ? await resolveWorkspaceId(log.partitionId) : null;
        if (workspaceId !== null) {
            const [workspace] = await database.select({ id: workspaces.id }).from(workspaces)
                .where(and(eq(workspaces.id, workspaceId), eq(workspaces.orgId, log.orgId))).limit(1);
            if (!workspace) workspaceId = null;
        }
        return {
            orgId: log.orgId, workspaceId, email: log.recipientEmail,
            sendLogId: log.id, recordId: log.recordId,
            // 사업부를 모르는 메일의 거부는 사업부 없는 줄(모든 사업부를 막는다)로 쓰므로 그 줄이 있는지 본다
            alreadyUnsubscribed: workspaceId === null
                ? await hasOrganizationWideRow(log.orgId, log.recipientEmail)
                : await isWorkspaceUnsubscribed(log.orgId, workspaceId, log.recipientEmail),
        };
    }

    async function recordUnsubscribe(args: {
        orgId: string;
        workspaceId: number | null;
        email: string;
        sendLogId?: number;
        recordId?: number | null;
        source?: "link" | "one_click" | "manual";
        reason?: string | null;
    }): Promise<void> {
        const email = normalizeEmail(args.email);
        if (!email || !email.includes("@") || email.length > 200) throw new Error("올바른 이메일 주소가 필요합니다.");
        await database.transaction(async (tx) => {
            if (args.workspaceId !== null) {
                const [workspace] = await tx.select({ id: workspaces.id }).from(workspaces)
                    .where(and(eq(workspaces.id, args.workspaceId), eq(workspaces.orgId, args.orgId))).limit(1);
                if (!workspace) throw new Error("수신거부 사업의 계정 정보를 확인할 수 없습니다.");
            }
            // Serialize repeat clicks/manual additions without removing duplicate historical source rows.
            await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${args.orgId}:${args.workspaceId ?? ""}:${email}`}, 0))`);
            // 이 사업부를 이미 막는 줄(같은 사업부 또는 사업부 없음)이 있으면 더 쓰지 않는다
            const existing = args.workspaceId === null
                ? await hasOrganizationWideRow(args.orgId, email, tx)
                : await isWorkspaceUnsubscribed(args.orgId, args.workspaceId, email, tx);
            if (existing) return;
            await tx.insert(emailUnsubscribes).values({
                orgId: args.orgId, workspaceId: args.workspaceId, email,
                sendLogId: args.sendLogId ?? null, recordId: args.recordId ?? null,
                source: args.source ?? "link", reason: args.reason ?? null,
            }).onConflictDoNothing();
        });
    }

    /** 수신거부 해제 — 그 사업부 목록에 보이는 줄(그 사업부 또는 사업부 없음)만 지운다. 지운 주소를 돌려준다 */
    async function removeUnsubscribe(orgId: string, workspaceId: number, id: number): Promise<string | null> {
        const [row] = await database.delete(emailUnsubscribes)
            .where(and(
                eq(emailUnsubscribes.id, id), eq(emailUnsubscribes.orgId, orgId),
                or(isNull(emailUnsubscribes.workspaceId), eq(emailUnsubscribes.workspaceId, workspaceId)),
            ))
            .returning({ email: emailUnsubscribes.email });
        return row ? normalizeEmail(row.email) : null;
    }

    async function attachUnsubscribeReason(token: string, reason: string): Promise<boolean> {
        const target = await resolveUnsubscribeTarget(token);
        if (!target) return false;
        const [row] = await database.select({ id: emailUnsubscribes.id }).from(emailUnsubscribes)
            .where(workspaceUnsubscribeCondition(target.orgId, target.workspaceId, target.email))
            .orderBy(sql`${emailUnsubscribes.workspaceId} IS NULL`, asc(emailUnsubscribes.unsubscribedAt), asc(emailUnsubscribes.id)).limit(1);
        if (!row) return false;
        await database.update(emailUnsubscribes).set({ reason }).where(eq(emailUnsubscribes.id, row.id));
        return true;
    }

    return {
        isWorkspaceUnsubscribed, isOrganizationUnsubscribed, isUnsubscribed, resolveWorkspaceId, resolveUnsubscribeTarget,
        recordUnsubscribe, removeUnsubscribe, attachUnsubscribeReason,
    };
}
