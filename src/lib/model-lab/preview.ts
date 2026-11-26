import { and, eq } from "drizzle-orm";
import { db, emailAutoPersonalizedLinks, records } from "@/lib/db";
import { generateEmail, checkTokenQuota, updateTokenUsage, logAiUsage } from "@/lib/ai";
import { resolveRoute } from "@/lib/ai/client";
import { AI_MODELS, type AiModelOption, type AiRoute } from "@/lib/ai/models";
import { getEmailConfig } from "@/lib/nhn-email";
import { resolveSignature } from "@/lib/email-sender-resolver";
import { resolveWorkspaceId } from "@/lib/email-unsubscribe";
import { loadDraftContext } from "@/lib/auto-personalized-draft";

// 모델 실험실 미리보기: 같은 규칙·같은 레코드로 여러 모델이 쓴 메일을 나란히 본다. 보내지 않는다.

export const MAX_PREVIEW_MODELS = 6;
const PREVIEW_TIMEOUT_MS = 90_000;

export interface PreviewResult {
    model: string;
    label: string;
    route: AiRoute | null;
    subject?: string;
    htmlBody?: string;
    promptTokens?: number;
    completionTokens?: number;
    latencyMs?: number;
    /** 정가로 낸 추정 비용 (USD) */
    estCostUsd?: number | null;
    error?: string;
}

/** 정가(100만 토큰당) × 토큰 수 */
export function estimateUsd(option: Pick<AiModelOption, "listPriceUsd">, usage: { promptTokens: number; completionTokens: number }) {
    if (!option.listPriceUsd) return null;
    return (usage.promptTokens * option.listPriceUsd.input + usage.completionTokens * option.listPriceUsd.output) / 1_000_000;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
        promise,
        new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("시간 초과")), ms);
        }),
    ]).finally(() => clearTimeout(timer));
}

export type PreviewOutcome = { ok: true; company: string; results: PreviewResult[] } | { ok: false; status: number; error: string };

export async function runModelLabPreview(input: {
    orgId: string;
    userId: string;
    ruleId: number;
    recordId?: number;
    models: string[];
}): Promise<PreviewOutcome> {
    const ids = [...new Set(input.models)];
    if (!ids.length || ids.length > MAX_PREVIEW_MODELS)
        return { ok: false, status: 400, error: `모델을 1~${MAX_PREVIEW_MODELS}개 골라 주세요.` };
    const options = ids.map((id) => AI_MODELS.find((m) => m.id === id));
    if (options.some((m) => !m)) return { ok: false, status: 400, error: "지원하지 않는 AI 모델이 있습니다." };

    const [link] = await db
        .select()
        .from(emailAutoPersonalizedLinks)
        .where(and(eq(emailAutoPersonalizedLinks.id, input.ruleId), eq(emailAutoPersonalizedLinks.orgId, input.orgId)))
        .limit(1);
    if (!link) return { ok: false, status: 404, error: "규칙을 찾을 수 없습니다." };

    // 레코드 데이터 (레코드 id > 더미) — 테스트 발송과 같다
    let recordData: Record<string, unknown> = {};
    if (input.recordId) {
        const [record] = await db
            .select()
            .from(records)
            .where(and(eq(records.id, input.recordId), eq(records.orgId, input.orgId)))
            .limit(1);
        if (!record) return { ok: false, status: 404, error: "레코드를 찾을 수 없습니다." };
        recordData = { ...((record.data ?? {}) as Record<string, unknown>) };
    }
    if (!recordData[link.recipientField]) recordData[link.recipientField] = "preview@example.com";
    if (!recordData[link.companyField]) recordData[link.companyField] = "테스트 회사";

    if (!(await checkTokenQuota(input.orgId)).allowed)
        return { ok: false, status: 429, error: "이번 달 AI 사용량을 초과했습니다." };

    const signatureJson = await resolveSignature(input.orgId, {
        requestedId: link.signatureId ?? undefined,
        config: await getEmailConfig(input.orgId),
        workspaceId: await resolveWorkspaceId(link.partitionId),
    });
    // 회사 조사는 한 번만 — 모든 모델이 같은 입력을 받는다
    const draft = await loadDraftContext({
        orgId: input.orgId,
        userId: input.userId,
        link,
        recordData,
        signatureJson,
        researchPurpose: "model_lab_company_research",
        logLabel: "ModelLab",
    });

    const results = await Promise.all(
        options.map(async (option): Promise<PreviewResult> => {
            const model = option!;
            const base = { model: model.id, label: model.label };
            const route = resolveRoute(model);
            if (!route.ok) {
                const error = route.missing.length ? `연결 필요 (${route.missing.join(", ")})` : "중국 서버 직접 연결은 쓰지 않습니다";
                return { ...base, route: null, error };
            }
            const started = Date.now();
            try {
                const email = await withTimeout(
                    generateEmail(route.client, {
                        prompt: draft.prompt,
                        product: draft.product,
                        recordData: draft.recordData,
                        tone: link.tone || undefined,
                        ctaUrl: link.ctaUrl || draft.product?.url || undefined,
                        format: (link.format as "plain" | "designed") || "plain",
                        senderPersona: draft.senderPersona,
                    }),
                    PREVIEW_TIMEOUT_MS,
                );
                const latencyMs = Date.now() - started;
                const tokens = email.usage.promptTokens + email.usage.completionTokens;
                await updateTokenUsage(input.orgId, tokens);
                await logAiUsage({
                    orgId: input.orgId,
                    userId: input.userId,
                    provider: route.client.provider,
                    model: route.client.model,
                    promptTokens: email.usage.promptTokens,
                    completionTokens: email.usage.completionTokens,
                    purpose: "model_lab_preview",
                });
                return {
                    ...base,
                    route: route.client.route ?? "direct",
                    subject: email.subject,
                    htmlBody: email.htmlBody,
                    promptTokens: email.usage.promptTokens,
                    completionTokens: email.usage.completionTokens,
                    latencyMs,
                    estCostUsd: estimateUsd(model, email.usage),
                };
            } catch (error) {
                // 공급자 원문 오류는 서버 로그에만 남긴다
                console.error(`[ModelLab] ${model.id} preview error:`, error);
                return { ...base, route: route.client.route ?? "direct", latencyMs: Date.now() - started, error: "작성 실패" };
            }
        }),
    );
    return { ok: true, company: String(draft.recordData[link.companyField] ?? ""), results };
}
