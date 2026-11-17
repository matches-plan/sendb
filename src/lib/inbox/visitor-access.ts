import { createHash, randomBytes } from "node:crypto";
import { eq, or, sql } from "drizzle-orm";
import { inboxConversations, inboxVisitorAccess } from "@/lib/db";
import type { DbExec } from "@/lib/db/tx";

export const visitorTokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * 비회원 상담 열쇠 조건 — 처음 상담을 연 브라우저의 열쇠, 또는 답변 알림 링크로 받은 열쇠(기한 안).
 * 알림 링크로 다른 기기에서 열어도 원래 브라우저의 상담은 그대로 이어진다.
 */
export function visitorTokenMatch(token: string) {
    const h = visitorTokenHash(token);
    return or(
        eq(inboxConversations.tokenHash, h),
        sql`${inboxConversations.id} IN (SELECT ${inboxVisitorAccess.conversationId} FROM ${inboxVisitorAccess} WHERE ${inboxVisitorAccess.tokenHash} = ${h} AND ${inboxVisitorAccess.expiresAt} > now())`,
    )!;
}

/** 답변 알림에 넣을 접속 열쇠를 만든다 (30일) */
export async function issueVisitorAccess(exec: DbExec, conversationId: string, now = new Date()) {
    const token = randomBytes(32).toString("hex");
    await exec.insert(inboxVisitorAccess).values({
        tokenHash: visitorTokenHash(token),
        conversationId,
        expiresAt: new Date(now.getTime() + 30 * 86_400_000),
    });
    return token;
}
