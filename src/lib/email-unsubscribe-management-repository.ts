import { and, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import type { db } from "./db";
import { emailUnsubscribes } from "./db/schema";
import { EMAIL_TRIM_CHARS, normalizeEmail } from "./deep-visitor-alert-rules";
import type { UnsubscribeEntry, UnsubscribeTarget } from "@/components/email/unsubscribes/types";
import { parseUnsubscribeTarget } from "./email-unsubscribe-management-rules";

const fields = {
    id: emailUnsubscribes.id, email: emailUnsubscribes.email,
    workspaceId: emailUnsubscribes.workspaceId,
    source: emailUnsubscribes.source, reason: emailUnsubscribes.reason,
    unsubscribedAt: emailUnsubscribes.unsubscribedAt,
};

function targetCondition(target: UnsubscribeTarget): SQL {
    const normalizedEmail = sql`lower(btrim(${emailUnsubscribes.email}, ${EMAIL_TRIM_CHARS}))`;
    return target.kind === "email"
        ? sql`${normalizedEmail} = ${target.query}`
        : sql`split_part(${normalizedEmail}, '@', 2) = ${target.query}`;
}

export function createUnsubscribeManagementRepository(database: Pick<typeof db, "select">) {
    return {
        /** 그 사업부의 수신거부 + 사업부 없는 줄(모든 사업부를 막는 예전 줄, workspaceId null) */
        async list(orgId: string, { workspaceId, q, page, pageSize }: { workspaceId: number; q: string; page: number; pageSize: number }) {
            const target = parseUnsubscribeTarget(q);
            // position() treats %, _ and other input literally; email/domain searches are exact.
            const search = !q ? undefined : target ? targetCondition(target) : sql`position(${q} in lower(${emailUnsubscribes.email})) > 0`;
            const where = and(
                eq(emailUnsubscribes.orgId, orgId),
                or(isNull(emailUnsubscribes.workspaceId), eq(emailUnsubscribes.workspaceId, workspaceId)),
                search,
            );
            const [rows, counts] = await Promise.all([
                database.select(fields).from(emailUnsubscribes)
                    .where(where).orderBy(desc(emailUnsubscribes.unsubscribedAt), desc(emailUnsubscribes.id))
                    .limit(pageSize).offset((page - 1) * pageSize),
                database.select({ count: sql<number>`count(*)` }).from(emailUnsubscribes).where(where),
            ]);
            const items: UnsubscribeEntry[] = rows.map((row) => ({ ...row, email: normalizeEmail(row.email), unsubscribedAt: row.unsubscribedAt.toISOString() }));
            return { items, totalCount: Number(counts[0]?.count ?? 0) };
        },
    };
}
