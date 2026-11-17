import { and, eq, isNull, or, sql } from "drizzle-orm";
import { crmContacts, inboxConversations, trackerSessions } from "@/lib/db";
import type { DbExec } from "@/lib/db/tx";
import { appendCustomerAudit } from "@/lib/customer-records/audit";
import { enqueuePlatformEvent } from "@/lib/customer-platform/outbox";

const ANONYMOUS = new Set(["", "방문 고객"]);
export const phoneDigits = (phone: string) => phone.replace(/\D/g, "");

const UTM_KEYS = ["utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent"] as const;
const UTM_PARAMS: Record<(typeof UTM_KEYS)[number], string> = {
    utmSource: "utm_source",
    utmMedium: "utm_medium",
    utmCampaign: "utm_campaign",
    utmTerm: "utm_term",
    utmContent: "utm_content",
};

/** 상담의 유입경로 — 트래커 방문(세션)의 utm·referrer, 없으면 상담을 연 페이지 주소의 utm */
export async function conversationSource(tx: DbExec, conversationId: string): Promise<Record<string, string>> {
    const [chat] = await tx
        .select({ pageUrl: inboxConversations.pageUrl, journey: inboxConversations.journeyContext })
        .from(inboxConversations)
        .where(eq(inboxConversations.id, conversationId));
    const out: Record<string, string> = {};
    if (chat?.journey?.sessionId) {
        const [session] = await tx.select().from(trackerSessions).where(eq(trackerSessions.id, chat.journey.sessionId));
        if (session) {
            for (const key of UTM_KEYS) if (session[key]) out[key] = session[key]!;
            if (session.referrer) out.referrer = session.referrer;
        }
    }
    if (!out.utmSource && chat?.pageUrl) {
        try {
            const url = new URL(chat.pageUrl);
            for (const key of UTM_KEYS) {
                const v = url.searchParams.get(UTM_PARAMS[key]);
                if (v) out[key] = v.slice(0, 200);
            }
        } catch {}
    }
    return out;
}

/**
 * 상담창에서 고객이 남긴 연락처를 같은 사업의 고객 연락처에 합친다.
 * 같은 이메일·전화번호가 있으면 빈 칸만 채우고, 없으면 새로 만든다 (출처: 상담창).
 * 상담 답변 알림용으로 받은 연락처라 광고 수신 동의(이메일·문자/알림톡)는 건드리지 않는다 — 새로 만들 때도 false.
 */
export async function mergeReplyContact(
    tx: DbExec,
    channel: { orgId: string; workspaceId: number; id: number },
    conversationId: string,
    input: { name: string; phone: string; email: string },
    now = new Date(),
): Promise<string | null> {
    const email = input.email.trim().toLowerCase();
    const digits = phoneDigits(input.phone);
    if (!email && !digits) return null;
    const match = [
        ...(email ? [sql`lower(${crmContacts.email}) = ${email}`] : []),
        ...(digits ? [sql`regexp_replace(coalesce(${crmContacts.phone},''), '[^0-9]', '', 'g') = ${digits}`] : []),
    ];
    const [found] = await tx
        .select()
        .from(crmContacts)
        .where(
            and(
                eq(crmContacts.orgId, channel.orgId),
                eq(crmContacts.workspaceId, channel.workspaceId),
                isNull(crmContacts.archivedAt),
                or(...match),
            ),
        )
        .orderBy(crmContacts.createdAt)
        .limit(1)
        .for("update");
    const source = await conversationSource(tx, conversationId);
    if (found) {
        // 유입경로는 처음 기록만 남긴다 (이미 있으면 그대로)
        const attributes = found.attributes.utmSource || found.attributes.referrer ? found.attributes : { ...found.attributes, ...source };
        const patch = {
            name: ANONYMOUS.has(found.name.trim()) && input.name.trim() ? input.name.trim() : found.name,
            email: found.email || email || null,
            phone: found.phone || input.phone.trim() || null,
            attributes,
        };
        if (patch.name === found.name && patch.email === found.email && patch.phone === found.phone && attributes === found.attributes) return found.id;
        const [updated] = await tx
            .update(crmContacts)
            .set({ ...patch, version: found.version + 1, updatedAt: now })
            .where(eq(crmContacts.id, found.id))
            .returning();
        await appendCustomerAudit(tx, "contacts", { ...found }, { ...updated }, { source: "system" });
        return found.id;
    }
    const [created] = await tx
        .insert(crmContacts)
        .values({
            orgId: channel.orgId,
            workspaceId: channel.workspaceId,
            externalId: `messenger:${conversationId}`,
            name: input.name.trim() || email || input.phone.trim(),
            email: email || null,
            phone: input.phone.trim() || null,
            emailMarketingConsent: false,
            smsMarketingConsent: false,
            attributes: { source: "messenger", channelId: channel.id, ...source },
        })
        .onConflictDoUpdate({
            target: [crmContacts.workspaceId, crmContacts.externalId],
            set: { email: email || null, phone: input.phone.trim() || null, updatedAt: now },
        })
        .returning();
    await appendCustomerAudit(tx, "contacts", null, { ...created, companyIds: [] }, { source: "system" });
    await enqueuePlatformEvent(tx, {
        orgId: channel.orgId,
        workspaceId: channel.workspaceId,
        key: `contact:${created.id}:created`,
        type: "contact.created",
        data: { contact: created },
        occurredAt: now,
    });
    return created.id;
}
