import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, emailHealthRecipients as recipients, organizationMembers, userNotifications, users, workspaces } from "@/lib/db";
import { workspaceInOrg } from "@/lib/workspace-in-org";
import { sendHealthNotificationLink, sendHealthNotificationText } from "./send-health-text";

const LIST_LIMIT = 30;

// ============================================
// 콜드메일 알림 담당자 (리드젠 설정 › 알림 담당자)
// ============================================

/** 조직의 활성 직원과 이 사업 알림 담당자 여부. 사업이 다른 조직 것이면 null */
export async function listHealthRecipients(orgId: string, workspaceId: number) {
    if (!(await workspaceInOrg(orgId, workspaceId))) return null;
    const [members, on] = await Promise.all([
        db
            .select({ id: users.id, name: users.name, email: users.email })
            .from(organizationMembers)
            .innerJoin(users, eq(users.id, organizationMembers.userId))
            .where(and(eq(organizationMembers.organizationId, orgId), eq(users.isActive, 1)))
            .orderBy(users.name),
        db
            .select({ userId: recipients.userId })
            .from(recipients)
            .where(and(eq(recipients.orgId, orgId), eq(recipients.workspaceId, workspaceId))),
    ]);
    const enabled = new Set(on.map((r) => r.userId));
    return members.map((m) => ({ ...m, enabled: enabled.has(m.id) }));
}

export const recipientInput = z.object({ userId: z.string().uuid(), enabled: z.boolean() });

/** 알림 담당자 켜기·끄기 (관리자만 — 호출부가 확인). 결과: ok | not_found(사업·직원이 이 조직 것이 아님) */
export async function setHealthRecipient(orgId: string, workspaceId: number, input: z.infer<typeof recipientInput>) {
    if (!(await workspaceInOrg(orgId, workspaceId))) return "not_found" as const;
    if (input.enabled) {
        const [member] = await db
            .select({ id: users.id })
            .from(organizationMembers)
            .innerJoin(users, eq(users.id, organizationMembers.userId))
            .where(and(eq(organizationMembers.organizationId, orgId), eq(users.id, input.userId), eq(users.isActive, 1)));
        if (!member) return "not_found" as const;
        await db.insert(recipients).values({ orgId, workspaceId, userId: input.userId }).onConflictDoNothing();
    } else {
        await db
            .delete(recipients)
            .where(and(eq(recipients.orgId, orgId), eq(recipients.workspaceId, workspaceId), eq(recipients.userId, input.userId)));
    }
    return "ok" as const;
}

// ============================================
// 발송 경고 → 화면 알림
// ============================================

/**
 * 발송 경고 한 줄(email_health_alerts에 새로 들어간 줄)을 알림 담당자에게 화면 알림으로 넣는다.
 * 사업 대상이면 그 사업 담당자, 운영(ops)이면 조직의 모든 사업 담당자(한 사람 한 번). 같은 경고 줄은 두 번 넣지 않는다.
 */
export async function createSendHealthNotifications(x: {
    orgId: string;
    alertId: number;
    batchKey: string;
    target: "ops" | number;
    message: string;
}): Promise<number> {
    const workspaceId = x.target === "ops" ? null : x.target;
    const rows = await db
        .selectDistinct({ userId: recipients.userId })
        .from(recipients)
        .innerJoin(users, eq(users.id, recipients.userId))
        .where(and(eq(recipients.orgId, x.orgId), eq(users.isActive, 1), workspaceId === null ? undefined : eq(recipients.workspaceId, workspaceId)));
    if (rows.length === 0) return 0;
    let workspaceName: string | null = null;
    if (workspaceId !== null) {
        const [ws] = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, workspaceId));
        workspaceName = ws?.name ?? null;
    }
    const text = sendHealthNotificationText({ batchKey: x.batchKey, message: x.message, workspaceName });
    if (!text) return 0;
    const inserted = await db
        .insert(userNotifications)
        .values(
            rows.map((r) => ({
                orgId: x.orgId,
                userId: r.userId,
                kind: "send_health",
                workspaceId,
                title: text.title,
                body: text.body,
                link: sendHealthNotificationLink({ alertId: x.alertId, workspaceId }),
                dedupeKey: `health_alert:${x.alertId}`,
            })),
        )
        .onConflictDoNothing()
        .returning({ id: userNotifications.id });
    return inserted.length;
}

// ============================================
// 내 알림 (머리 종)
// ============================================

const mine = (orgId: string, userId: string) => and(eq(userNotifications.orgId, orgId), eq(userNotifications.userId, userId));

/** 최근 알림 30개와 안 읽은 수 */
export async function listMyNotifications(orgId: string, userId: string) {
    const [items, [unread]] = await Promise.all([
        db
            .select({
                id: userNotifications.id,
                kind: userNotifications.kind,
                workspaceId: userNotifications.workspaceId,
                title: userNotifications.title,
                body: userNotifications.body,
                link: userNotifications.link,
                readAt: userNotifications.readAt,
                createdAt: userNotifications.createdAt,
            })
            .from(userNotifications)
            .where(mine(orgId, userId))
            .orderBy(desc(userNotifications.createdAt), desc(userNotifications.id))
            .limit(LIST_LIMIT),
        db.select({ n: count() }).from(userNotifications).where(and(mine(orgId, userId), isNull(userNotifications.readAt))),
    ]);
    return { items, unreadCount: unread?.n ?? 0 };
}

export const markReadInput = z.union([z.object({ all: z.literal(true) }), z.object({ ids: z.array(z.number().int().positive()).min(1).max(100) })]);

/** 읽음 표시 — 고른 알림 또는 모두. 내 알림만 바뀐다 */
export async function markMyNotificationsRead(orgId: string, userId: string, input: z.infer<typeof markReadInput>) {
    const where = and(mine(orgId, userId), isNull(userNotifications.readAt), "ids" in input ? inArray(userNotifications.id, input.ids) : undefined);
    const rows = await db.update(userNotifications).set({ readAt: new Date() }).where(where).returning({ id: userNotifications.id });
    return { updated: rows.length };
}
