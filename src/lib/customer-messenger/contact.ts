import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
    db,
    customerReplyContacts as contacts,
    inboxConversations as chats,
    inboxMessages as messages,
} from "@/lib/db";
import type { DbExec } from "@/lib/db/tx";
import { visitorConversation, publicChannel } from "@/lib/inbox/repository";
import { appendInboxAudit } from "@/lib/inbox/audit";
import { InboxError } from "@/lib/inbox/errors";
import { queueLatestCustomerReply } from "./queue";
import { contactInput, messengerSettingsSchema } from "./rules";
import { mergeReplyContact } from "./crm-merge";
function publicContact(c?: typeof contacts.$inferSelect) {
    return {
        name: c?.name ?? "",
        phone: c?.phone ?? "",
        email: c?.email ?? "",
        consent: !!c?.consentAt,
    };
}
export async function customerReplyContact(
    key: string,
    token: string,
    conversationId: string | undefined,
    raw?: unknown,
    exec: DbExec = db,
    now = new Date(),
) {
    const channel = await publicChannel(key, exec);
    const settings = messengerSettingsSchema.parse(
        channel.messengerSettings ?? {},
    );
    const chat = await visitorConversation(
        key,
        token,
        exec,
        false,
        conversationId,
    );
    if (!chat.id || chat.readOnly)
        throw new InboxError("새 문의를 시작한 뒤 연락처를 남겨주세요.", 409);
    const id = chat.id;
    if (raw === undefined) {
        const [saved] = await exec
            .select()
            .from(contacts)
            .where(eq(contacts.conversationId, id));
        return publicContact(saved);
    }
    const action = z
        .object({
            action: z.enum(["contact", "seen"]),
        })
        .parse(raw).action;
    if (action === "seen") {
        const input = z
            .object({
                action: z.literal("seen"),
                messageId: z.number().int().positive(),
            })
            .strict()
            .parse(raw);
        const [m] = await exec
            .select({ id: messages.id })
            .from(messages)
            .where(
                and(
                    eq(messages.id, input.messageId),
                    eq(messages.conversationId, id),
                ),
            );
        if (m)
            await exec
                .update(contacts)
                .set({
                    readMessageId: sql`greatest(${contacts.readMessageId},${m.id})`,
                })
                .where(eq(contacts.conversationId, id));
        return { seen: !!m };
    }
    if (!settings.contactEnabled)
        throw new InboxError("연락처 수집이 설정되지 않은 상담창입니다.", 409);
    const input = contactInput.parse(raw),
        email = input.email.toLowerCase();
    // 이메일·전화번호를 남기면 그 상담의 답변 알림을 받는다 (안내 문구로 목적을 알리고 인증 단계는 두지 않는다)
    const notify = !!email || !!input.phone;
    return exec.transaction(async (tx) => {
        await tx
            .select({ id: chats.id })
            .from(chats)
            .where(eq(chats.id, id))
            .for("update");
        await visitorConversation(key, token, tx, false, id);
        const [previous] = await tx
            .select()
            .from(contacts)
            .where(eq(contacts.conversationId, id));
        const crmContactId = await mergeReplyContact(
            tx,
            channel,
            id,
            { name: input.name, phone: input.phone, email },
            now,
        );
        const unchanged =
            previous &&
            previous.email === email &&
            previous.phone === input.phone &&
            previous.notifyEmail === !!email;
        const values = {
            name: input.name,
            phone: input.phone,
            email,
            notifyEmail: !!email,
            consentAt: notify ? (unchanged ? previous.consentAt : now) : null,
            crmContactId: crmContactId ?? previous?.crmContactId ?? null,
            updatedAt: now,
        };
        const [saved] = await tx
            .insert(contacts)
            .values({ conversationId: id, ...values })
            .onConflictDoUpdate({
                target: contacts.conversationId,
                set: {
                    ...values,
                    version: unchanged ? previous.version : (previous?.version ?? 0) + 1,
                },
            })
            .returning();
        if (
            !chat.profile.identified &&
            (chat.profile.name !== (input.name || "방문 고객") ||
                chat.profile.email !== (email || null))
        ) {
            const nextName = input.name || "방문 고객";
            await tx
                .update(chats)
                .set({
                    name: nextName,
                    email: email || null,
                    version: sql`${chats.version}+1`,
                })
                .where(eq(chats.id, id));
            await appendInboxAudit(tx, {
                orgId: channel.orgId,
                channelId: channel.id,
                conversationId: id,
                actorId: null,
                actorName: nextName,
                action: "visitor.profile.updated",
                changes: {
                    name: { before: chat.profile.name, after: nextName },
                    email: {
                        before: chat.profile.email,
                        after: email || null,
                    },
                },
            });
        }
        if (saved.consentAt)
            await queueLatestCustomerReply(
                tx,
                { ...chat, id, medium: "web" },
                now,
            );
        return publicContact(saved);
    });
}
