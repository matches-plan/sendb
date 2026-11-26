import {
    AI_MODELS,
    COMPANY_RESEARCH_MODEL_ID,
    findModel,
    resolveModel,
    SEARCH_MODEL_ID,
    type AiModelOption,
    type AiProvider,
    type AiRoute,
} from "./models";
import { companyResearchMode } from "./company-research-mode";
import { openRouterExtraBody, type Env } from "./chat-api";

export interface AiClient {
    provider: AiProvider;
    apiKey: string;
    /** 저장값(내부 id). 사용 기록·단가표는 이 값으로 남는다 */
    model: string;
    /** 없으면 direct */
    route?: AiRoute;
    /** 공급자에게 보내는 모델 이름. 없으면 model */
    apiModel?: string;
    /** 요청 본문에 더할 값(OpenRouter 공급자 선호·생각 끄기 등) */
    extraBody?: Record<string, unknown>;
    timeoutMs?: number;
    /** 검색을 바깥 검색 API에 맡긴다. 이때 provider/model은 검색 결과를 정리하는 모델이다. */
    search?: { provider: "serper"; apiKey: string };
}

const DIRECT_KEYS: Record<AiProvider, string> = {
    claude: "ANTHROPIC_API_KEY",
    gemini: "GEMINI_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    qwen: "QWEN_API_KEY",
};

export type RouteResult = { ok: true; client: AiClient } | { ok: false; missing: string[]; chinaBlocked: boolean };

/**
 * 모델의 경로를 우선순위대로 보고 키가 있는 첫 경로로 연결을 만든다.
 * 직접 연결이 중국 서버(DeepSeek)면 AI_ALLOW_CHINA_ENDPOINTS=1일 때만 쓴다 — 메일 작성에는 받는 사람 정보가 들어간다.
 */
export function resolveRoute(option: AiModelOption, env: Env = process.env): RouteResult {
    const missing: string[] = [];
    let chinaBlocked = false;
    for (const route of option.routes ?? ["direct"]) {
        if (route === "direct") {
            if (option.direct?.region === "cn" && env.AI_ALLOW_CHINA_ENDPOINTS !== "1") {
                chinaBlocked = true;
                continue;
            }
            const envKey = DIRECT_KEYS[option.provider];
            const apiKey = env[envKey];
            if (apiKey) return { ok: true, client: { provider: option.provider, apiKey, model: option.id, route, apiModel: option.direct?.apiModel ?? option.id } };
            missing.push(envKey);
        } else if (option.openrouter) {
            const apiKey = env.OPENROUTER_API_KEY;
            if (apiKey)
                return {
                    ok: true,
                    client: {
                        provider: option.provider,
                        apiKey,
                        model: option.id,
                        route,
                        apiModel: option.openrouter.slug,
                        extraBody: openRouterExtraBody(option.provider, option.openrouter.body, env),
                        timeoutMs: 60_000,
                    },
                };
            missing.push("OPENROUTER_API_KEY");
        }
    }
    return { ok: false, missing, chinaBlocked };
}

// 선택한 모델(model)에 맞는 경로·키로 클라이언트를 구성한다.
// 지원하지 않거나 미지정 시 기본 모델로 폴백. 쓸 수 있는 경로의 키가 없으면 null.
export function getAiClient(model?: string): AiClient | null {
    const result = resolveRoute(resolveModel(model));
    return result.ok ? result.client : null;
}

// 웹검색 그라운딩이 필요한 생성(제품/회사 리서치)용. SEARCH_MODEL_ID로 고정.
export function getSearchAiClient(): AiClient | null {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    return { provider: "claude", apiKey, model: SEARCH_MODEL_ID };
}

// 회사 조사용. serper 방식은 Serper가 구글 검색을, Qwen3.7-Flash가 결과 정리를 맡는다 (Qwen 직접 → OpenRouter, 둘 다 없으면 Haiku 5.5).
// search 방식은 예전 Claude 웹검색. 필요한 키가 없으면 null — 다른 유료 검색으로 바꾸지 않는다.
export function getCompanyResearchClient(): AiClient | null {
    const mode = companyResearchMode();
    if (mode === "search") return getSearchAiClient();
    const searchKey = process.env.SERPER_API_KEY;
    if (mode !== "serper" || !searchKey) return null;
    const search = { provider: "serper" as const, apiKey: searchKey };
    const qwen = resolveRoute(resolveModel(COMPANY_RESEARCH_MODEL_ID));
    if (qwen.ok) return { ...qwen.client, search };
    const claude = getSearchAiClient();
    return claude && { ...claude, search };
}

/** 모델 선택 화면용 가용성. 키 값은 넣지 않고 필요한 환경변수 이름만 알려 준다 */
export function listModelAvailability(env: Env = process.env) {
    return AI_MODELS.map((m) => {
        const result = resolveRoute(m, env);
        return {
            id: m.id,
            label: m.label,
            provider: m.provider,
            lab: !!m.lab,
            available: result.ok,
            route: result.ok ? (result.client.route ?? "direct") : null,
            missing: result.ok ? [] : result.missing,
            chinaBlocked: !result.ok && result.chinaBlocked,
            listPriceUsd: m.listPriceUsd ?? null,
        };
    });
}

/** 저장하려는 모델을 지금 쓸 수 없으면 그 이유, 쓸 수 있으면 null */
export function modelUnavailableReason(model: string, env: Env = process.env): string | null {
    const option = findModel(model);
    if (!option || option.retired) return "지원하지 않는 AI 모델입니다.";
    const result = resolveRoute(option, env);
    if (result.ok) return null;
    if (result.missing.length) return `${option.label}은(는) 아직 연결되지 않았습니다 (필요한 키: ${result.missing.join(", ")}).`;
    return `${option.label} 직접 연결은 중국 서버라 고객 정보가 담긴 메일 작성에 쓰지 않습니다.`;
}
