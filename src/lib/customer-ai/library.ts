import { createHash } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, customerAiRules, customerAiDocs } from "@/lib/db";
import type { DbExec } from "@/lib/db/tx";
import { requireCustomerAccess, type CustomerActor } from "@/lib/customer-access/access";
import { InboxError } from "@/lib/inbox/errors";
import type { AiSource } from "./rules";
import { faqQuestionLimit } from "./worker-policy";

/* 상담 AI 규칙·상담 지식(문서·FAQ) 저장과 AI가 읽는 형태로 바꾸기 */

export const ruleInput = z
    .object({
        title: z.string().trim().min(1, "규칙 제목을 입력해주세요.").max(100),
        body: z.string().trim().min(1, "규칙 내용을 입력해주세요.").max(2000, "규칙 내용은 2,000자까지 쓸 수 있어요."),
        enabled: z.boolean().optional(),
    })
    .strict();
const docInput = (workspaceId: number) => z
    .object({
        kind: z.enum(["article", "faq"]),
        title: z.string().trim().min(1, "제목을 입력해주세요.").max(200),
        body: z.string().trim().min(1, "내용을 입력해주세요.").max(30000, "내용은 30,000자까지 쓸 수 있어요."),
        published: z.boolean().optional(),
        questions: z.array(z.string().trim().min(1).max(200)).max(faqQuestionLimit(workspaceId), `추가 질문은 ${faqQuestionLimit(workspaceId)}개까지예요.`).optional(),
        source: z.enum(["website", "file", "manual"]).optional(),
        sourceRef: z.string().trim().max(2000).nullable().optional(),
    })
    .strict();

export async function listRules(actor: CustomerActor, workspaceId: number, exec: DbExec = db) {
    await requireCustomerAccess(actor, workspaceId, "read", exec);
    return exec
        .select()
        .from(customerAiRules)
        .where(and(eq(customerAiRules.orgId, actor.orgId), eq(customerAiRules.workspaceId, workspaceId)))
        .orderBy(asc(customerAiRules.id));
}
export async function createRule(actor: CustomerActor, workspaceId: number, raw: unknown, exec: DbExec = db) {
    await requireCustomerAccess(actor, workspaceId, "manage", exec);
    const input = ruleInput.parse(raw);
    const [row] = await exec
        .insert(customerAiRules)
        .values({ ...input, orgId: actor.orgId, workspaceId, createdBy: actor.userId, updatedBy: actor.userId })
        .returning();
    return row;
}
export async function updateRule(actor: CustomerActor, id: number, raw: unknown, exec: DbExec = db) {
    const row = await ownedRule(actor, id, exec);
    await requireCustomerAccess(actor, row.workspaceId, "manage", exec);
    const input = ruleInput.partial().parse(raw);
    const [saved] = await exec
        .update(customerAiRules)
        .set({ ...input, updatedBy: actor.userId, updatedAt: new Date() })
        .where(eq(customerAiRules.id, id))
        .returning();
    return saved;
}
export async function deleteRule(actor: CustomerActor, id: number, exec: DbExec = db) {
    const row = await ownedRule(actor, id, exec);
    await requireCustomerAccess(actor, row.workspaceId, "manage", exec);
    await exec.delete(customerAiRules).where(eq(customerAiRules.id, id));
    return { id };
}
async function ownedRule(actor: CustomerActor, id: number, exec: DbExec) {
    const [row] = await exec
        .select()
        .from(customerAiRules)
        .where(and(eq(customerAiRules.id, id), eq(customerAiRules.orgId, actor.orgId)));
    if (!row) throw new InboxError("규칙을 찾을 수 없습니다.", 404);
    return row;
}

export async function listDocs(actor: CustomerActor, workspaceId: number, exec: DbExec = db) {
    await requireCustomerAccess(actor, workspaceId, "read", exec);
    return exec
        .select()
        .from(customerAiDocs)
        .where(and(eq(customerAiDocs.orgId, actor.orgId), eq(customerAiDocs.workspaceId, workspaceId)))
        .orderBy(desc(customerAiDocs.updatedAt), desc(customerAiDocs.id));
}
export async function createDoc(actor: CustomerActor, workspaceId: number, raw: unknown, exec: DbExec = db) {
    await requireCustomerAccess(actor, workspaceId, "manage", exec);
    const input = docInput(workspaceId).parse(raw);
    const [row] = await exec
        .insert(customerAiDocs)
        .values({ ...input, orgId: actor.orgId, workspaceId, createdBy: actor.userId, updatedBy: actor.userId })
        .returning();
    return row;
}
export async function updateDoc(actor: CustomerActor, id: number, raw: unknown, exec: DbExec = db) {
    const row = await ownedDoc(actor, id, exec);
    await requireCustomerAccess(actor, row.workspaceId, "manage", exec);
    const input = docInput(row.workspaceId).omit({ kind: true }).partial().parse(raw);
    const [saved] = await exec
        .update(customerAiDocs)
        .set({ ...input, updatedBy: actor.userId, updatedAt: new Date() })
        .where(eq(customerAiDocs.id, id))
        .returning();
    return saved;
}
export async function deleteDoc(actor: CustomerActor, id: number, exec: DbExec = db) {
    const row = await ownedDoc(actor, id, exec);
    await requireCustomerAccess(actor, row.workspaceId, "manage", exec);
    await exec.delete(customerAiDocs).where(eq(customerAiDocs.id, id));
    return { id };
}
async function ownedDoc(actor: CustomerActor, id: number, exec: DbExec) {
    const [row] = await exec
        .select()
        .from(customerAiDocs)
        .where(and(eq(customerAiDocs.id, id), eq(customerAiDocs.orgId, actor.orgId)));
    if (!row) throw new InboxError("문서를 찾을 수 없습니다.", 404);
    return row;
}

/** AI 지침: 켜진 규칙을 "## 제목\n내용"으로 잇는다. 규칙이 없으면 null(설정의 기본 지침을 쓴다) */
export async function ruleInstructions(orgId: string, workspaceId: number, exec: DbExec = db) {
    const rows = await exec
        .select({ title: customerAiRules.title, body: customerAiRules.body })
        .from(customerAiRules)
        .where(and(eq(customerAiRules.orgId, orgId), eq(customerAiRules.workspaceId, workspaceId), eq(customerAiRules.enabled, true)))
        .orderBy(asc(customerAiRules.id));
    return rows.length ? rows.map((r) => `## ${r.title}\n${r.body}`).join("\n\n") : null;
}

/** 공개한 문서·FAQ를 AI 답변 근거 조각으로 나눈다. 문서는 빈 줄 기준 문단(최대 800자), FAQ는 질문+답 하나 */
export function docSources(docs: { id: number; kind: string; title: string; body: string; questions?: string[]; updatedAt: Date }[]): AiSource[] {
    const pieces = docs.flatMap((d) => {
        if (d.kind === "faq")
            return [{ id: `doc:${d.id}:0`, text: [`Q. ${d.title}`, ...(d.questions ?? []).map((q) => `Q. ${q}`), `A. ${d.body}`].join("\n"), at: d.updatedAt }];
        // 빈 줄로 나눈 문단을 800자 안쪽으로 묶는다. 긴 문단은 줄 단위로 끊는다
        const chunks: string[] = [];
        const add = (piece: string, sep: string) => {
            const last = chunks.at(-1);
            if (last !== undefined && last.length + piece.length < 800) chunks[chunks.length - 1] = `${last}${sep}${piece}`;
            else chunks.push(piece.slice(0, 2000));
        };
        for (const para of d.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)) {
            if (para.length < 800) add(para, "\n\n");
            else para.split("\n").filter((l) => l.trim()).forEach((line, i) => add(line, i ? "\n" : "\n\n"));
        }
        return chunks.map((text, i) => ({ id: `doc:${d.id}:${i}`, text: `[${d.title}]\n${text}`, at: d.updatedAt }));
    });
    const fingerprint = createHash("sha256").update(JSON.stringify(pieces.map((p) => [p.id, p.text]))).digest("hex");
    return pieces.map((p) => ({ id: p.id, text: p.text, sourceUrl: "", checkedAt: p.at.toISOString(), knowledgeVersionId: 0, fingerprint }));
}
export async function publishedDocs(orgId: string, workspaceId: number, exec: DbExec = db, lock = false) {
    const query = exec
        .select({ id: customerAiDocs.id, kind: customerAiDocs.kind, title: customerAiDocs.title, body: customerAiDocs.body, questions: customerAiDocs.questions, updatedAt: customerAiDocs.updatedAt })
        .from(customerAiDocs)
        .where(and(eq(customerAiDocs.orgId, orgId), eq(customerAiDocs.workspaceId, workspaceId), eq(customerAiDocs.published, true)))
        .orderBy(asc(customerAiDocs.id));
    return lock ? query.for("share") : query;
}

/** 웹사이트 주소나 파일 글을 받아 AI로 정리한 문서 초안을 돌려준다 (저장하지 않음) */
export const importInput = z.discriminatedUnion("source", [
    z.object({ source: z.literal("website"), url: z.string().trim().min(1, "웹사이트 주소를 입력해주세요.").max(2000) }),
    z.object({ source: z.literal("file"), fileName: z.string().trim().max(300), text: z.string().trim().min(1, "파일에서 글을 찾지 못했어요.").max(200000) }),
]);
export async function importDoc(actor: CustomerActor, workspaceId: number, raw: unknown, exec: DbExec = db) {
    await requireCustomerAccess(actor, workspaceId, "manage", exec);
    const input = importInput.parse(raw);
    const { getSupportSettings } = await import("./catalog");
    const { model } = await getSupportSettings(actor.orgId, workspaceId, exec);
    const { fetchPageText, tidyKnowledge } = await import("./import");
    if (input.source === "website") {
        const page = await fetchPageText(input.url);
        if (!page.text) throw new InboxError("페이지에서 글을 찾지 못했어요.");
        return { title: page.title, body: await tidyKnowledge(page.text, model), source: "website" as const, sourceRef: page.url };
    }
    return { title: input.fileName.replace(/\.[^.]+$/, ""), body: await tidyKnowledge(input.text, model), source: "file" as const, sourceRef: input.fileName };
}
