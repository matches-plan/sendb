import { db, emailAutoPersonalizedLinks, products } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getCompanyResearchClient, generateCompanyResearch, isCompactCompanyResearch, updateTokenUsage, logAiUsage } from "@/lib/ai";
import { findCachedCompanyResearch, rememberCompanyResearch } from "@/lib/ai/company-research-cache";
import { substitutePromptVariables } from "@/lib/email-utils";

type Link = typeof emailAutoPersonalizedLinks.$inferSelect;
type Product = typeof products.$inferSelect;

export interface DraftContext {
    recordData: Record<string, unknown>;
    product: Product | null;
    senderPersona: { name: string; title?: string; company?: string } | null;
    prompt: string;
}

/**
 * 규칙·레코드로 AI 메일 작성 입력(회사 조사·제품·발신자 페르소나·지시사항)을 만든다.
 * 테스트 발송과 모델 실험실 미리보기가 같은 입력으로 쓴다. recordData에는 회사 조사가 붙는다.
 */
export async function loadDraftContext(input: {
    orgId: string;
    userId: string;
    link: Link;
    recordData: Record<string, unknown>;
    signatureJson: string | null | undefined;
    /** 회사 조사 사용 기록의 용도 */
    researchPurpose: string;
    /** 이 이름으로 오류를 서버 로그에 남긴다 */
    logLabel: string;
}): Promise<DraftContext> {
    const { orgId, userId, link, recordData, signatureJson } = input;

    // 회사 조사 (autoResearch ON && 레코드에 _companyResearch 없으면)
    if (link.autoResearch === 1 && !recordData._companyResearch) {
        const companyName = recordData[link.companyField] as string;
        const compact = isCompactCompanyResearch();
        const searchClient = compact ? null : getCompanyResearchClient();
        if ((compact || searchClient) && companyName && typeof companyName === "string" && companyName.trim()) {
            try {
                // 자동 메일처럼 보관함·지난 조사를 먼저 쓴다 — 같은 회사를 시험할 때마다 검색하지 않는다.
                const cached = await findCachedCompanyResearch(orgId, companyName);
                if (cached) {
                    recordData._companyResearch = { ...cached, researchedAt: new Date().toISOString() };
                } else {
                    const research = await generateCompanyResearch(searchClient, { companyName, additionalContext: recordData });
                    recordData._companyResearch = {
                        ...research,
                        sources: research.sources,
                        researchedAt: new Date().toISOString(),
                    };
                    await rememberCompanyResearch(orgId, companyName, research);
                    const researchTokens = research.usage.promptTokens + research.usage.completionTokens;
                    if (searchClient && researchTokens > 0) {
                        await updateTokenUsage(orgId, researchTokens);
                        await logAiUsage({
                            orgId,
                            userId,
                            provider: searchClient.provider,
                            model: searchClient.model,
                            ...research.usage,
                            purpose: input.researchPurpose,
                        });
                    }
                }
            } catch (err) {
                console.error(`[${input.logLabel}] Company research error:`, err);
            }
        }
    }

    // 제품 조회
    let product = null;
    if (link.productId) {
        const [p] = await db.select().from(products).where(eq(products.id, link.productId)).limit(1);
        product = p ?? null;
    }

    // 발신자 페르소나
    let senderPersona: { name: string; title?: string; company?: string } | null = null;
    if (link.useSignaturePersona === 1 && signatureJson) {
        try {
            const sig = JSON.parse(signatureJson);
            if (sig && typeof sig === "object" && sig.name) {
                senderPersona = { name: sig.name, title: sig.title || undefined, company: sig.company || undefined };
            }
        } catch { /* skip */ }
    }

    // 프롬프트의 ##필드명## 변수를 레코드 값으로 치환
    const rawPrompt = link.prompt || "이 회사에 적합한 제품 소개 이메일을 작성해주세요.";
    return { recordData, product, senderPersona, prompt: substitutePromptVariables(rawPrompt, recordData) };
}
