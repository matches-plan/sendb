import { NextRequest, NextResponse } from "next/server";
import { getActiveUserFromNextRequest } from "@/lib/auth";
import { getCompanyResearchClient, generateCompanyResearch, isCompactCompanyResearch, hasCompactCompanyFacts, checkTokenQuota, updateTokenUsage, logAiUsage } from "@/lib/ai";
import { rememberCompanyResearch } from "@/lib/ai/company-research-cache";

export async function POST(req: NextRequest) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) {
        return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }

    const compact = isCompactCompanyResearch();
    const client = compact ? null : getCompanyResearchClient();
    if (!compact && !client) {
        return NextResponse.json({ success: false, error: "AI 서비스를 사용할 수 없습니다." }, { status: 503 });
    }

    if (!compact && !(await checkTokenQuota(user.orgId)).allowed) {
        return NextResponse.json({
            success: false,
            error: "이번 달 AI 사용량을 초과했습니다. 플랜 업그레이드를 고려해주세요.",
        }, { status: 429 });
    }

    const { companyName, recordData } = await req.json();
    if (!companyName || typeof companyName !== "string" || !companyName.trim()) {
        return NextResponse.json({ success: false, error: "회사명을 입력해주세요." }, { status: 400 });
    }

    try {
        const result = await generateCompanyResearch(client, {
            companyName: companyName.trim(),
            additionalContext: recordData as Record<string, unknown> | undefined,
        });

        const totalTokens = result.usage.promptTokens + result.usage.completionTokens;
        if (client && totalTokens > 0) {
            await updateTokenUsage(user.orgId, totalTokens);
            await logAiUsage({
                orgId: user.orgId,
                userId: user.userId,
                provider: client.provider,
                model: client.model,
                ...result.usage,
                purpose: "company_research",
            });
        }
        // 간단 조사로 끝났는데 쓸 정보가 없으면 기존 조사를 빈 정보로 덮지 않게 실패로 돌려준다.
        if (result.method === "compact" && !hasCompactCompanyFacts(result)) {
            const error = compact
                ? "저장된 회사 정보나 홈페이지 소개문이 없습니다. 업종·서비스 또는 홈페이지 주소를 입력해주세요."
                : "검색으로 회사 정보를 찾지 못했습니다. 회사명을 확인하거나 업종·서비스·홈페이지 주소를 입력해주세요.";
            return NextResponse.json({ success: false, error }, { status: 422 });
        }
        // 재조사 결과로 보관함을 새로 고친다 — 자동 메일이 같은 회사에 이 결과를 쓴다.
        await rememberCompanyResearch(user.orgId, companyName.trim(), result);

        return NextResponse.json({
            success: true,
            data: {
                companyName: result.companyName,
                industry: result.industry,
                description: result.description,
                services: result.services,
                employees: result.employees,
                website: result.website,
                sources: result.sources,
                ...(result.method ? { method: result.method } : {}),
            },
        });
    } catch (error) {
        console.error("AI company research error:", error);
        const cause = error instanceof Error ? error.message : "";
        const connectionIssue = /\b(?:401|403)\b|credit|api.?key|auth|billing/i.test(cause);
        const message = connectionIssue
            ? "조직 AI 연결 확인이 필요합니다. 관리자에게 인증·이용 한도를 확인해주세요."
            : "회사 정보를 조회하지 못했습니다. 잠시 후 다시 시도해주세요.";
        return NextResponse.json({ success: false, error: message }, { status: 503 });
    }
}
