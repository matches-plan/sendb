import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, inboxConversations, inboxMessages } from "@/lib/db";
import type { DbExec } from "@/lib/db/tx";
import type { CustomerActor } from "@/lib/customer-access/access";
import { InboxError } from "./errors";
import { ownedConversation, visitorConversation } from "./repository";

const receiptInput = z.object({
    messageIds: z.array(z.int32().positive()).min(1).max(100),
});

async function recordRead(exec: DbExec, id: string, kind: "customer" | "reply", messageIds: number[]) {
    await exec.update(inboxMessages).set({ recipientReadAt: new Date() }).where(and(
        eq(inboxMessages.conversationId, id),
        eq(inboxMessages.kind, kind),
        inArray(inboxMessages.id, messageIds),
        isNull(inboxMessages.recipientReadAt),
    ));
    return { read: true };
}

export async function readAsStaff(
    actor: CustomerActor,
    id: string, input: unknown, exec: DbExec = db,
) {
    const { messageIds } = receiptInput.parse(input);
    const chat = await ownedConversation(actor, id, exec);
    if (chat.historyOnly || chat.medium !== "web")
        throw new InboxError("웹 상담에서만 읽음을 표시할 수 있습니다.", 409);
    return recordRead(exec, id, "customer", messageIds);
}

export async function readAsCustomer(key: string, token: string, id: string, input: unknown, exec: DbExec = db) {
    const { messageIds } = receiptInput.parse(input);
    return exec.transaction(async (tx) => {
        const chat = await visitorConversation(key, token, tx, false, id);
        // 회원 연결과 읽음이 동시에 일어나도 이전 방문자 세션으로는 기록하지 않는다.
        const [current] = await tx.select({ id: inboxConversations.id }).from(inboxConversations)
            .where(and(
                eq(inboxConversations.id, id),
                eq(inboxConversations.channelId, chat.channelId),
                isNull(inboxConversations.mergedIntoId),
                chat.customer ? eq(inboxConversations.contactId, chat.customer.id) : isNull(inboxConversations.contactId),
            )).for("share");
        if (!current) throw new InboxError("이 상담을 찾을 수 없습니다.", 404);
        return recordRead(tx, id, "reply", messageIds);
    });
}
