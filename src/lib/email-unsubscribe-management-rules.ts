import { z } from "zod";
import type { UnsubscribeTarget } from "@/components/email/unsubscribes/types";
import { normalizeEmail } from "./deep-visitor-alert-rules";

const email = z.string().transform(normalizeEmail).pipe(z.string().max(200).email());
const domain = z.string().max(190).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/);

export function parseUnsubscribeTarget(value: string): UnsubscribeTarget | null {
    const query = normalizeEmail(value);
    if (email.safeParse(query).success) return { query, kind: "email" };
    const candidate = query.replace(/^@/, "");
    return domain.safeParse(candidate).success ? { query: candidate, kind: "domain" } : null;
}

/** 양의 정수 id (사업부·수신거부 줄). 아니면 null */
export function parsePositiveId(value: unknown): number | null {
    const text = typeof value === "number" ? String(value) : value;
    if (typeof text !== "string" || !/^[1-9]\d{0,9}$/.test(text)) return null;
    const id = Number(text);
    return Number.isSafeInteger(id) && id <= 2_147_483_647 ? id : null;
}

export const manualUnsubscribeInput = z.object({
    email,
    workspaceId: z.number().int().positive().max(2_147_483_647),
    reason: z.string().trim().max(1000).optional(),
}).strict();

export function parseUnsubscribePagination(params: URLSearchParams) {
    const pageText = params.get("page") ?? "1";
    const sizeText = params.get("pageSize") ?? "20";
    const q = normalizeEmail(params.get("q"));
    const workspaceId = parsePositiveId(params.get("workspaceId"));
    if (!workspaceId || !/^[1-9]\d*$/.test(pageText) || !/^[1-9]\d*$/.test(sizeText)) return null;
    const page = Number(pageText), pageSize = Number(sizeText);
    if (!Number.isSafeInteger(page) || page > 1_000_000 || pageSize > 100 || q.length > 200) return null;
    return { workspaceId, page, pageSize, q };
}
