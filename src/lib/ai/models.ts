// 선택 가능한 AI 모델 정의 (검색 미사용 텍스트 생성용)
// 검색 기반 생성(제품/회사 리서치)은 SEARCH_MODEL_ID로 고정이라 이 목록을 쓰지 않는다.
//
// 모델 교체: 아래 id/label과 DEFAULT_MODEL_ID·SEARCH_MODEL_ID 문자열만 바꾸면 된다.
// 기존 값(gemini-3.5-flash-lite 등)은 운영 DB의 링크에 저장돼 있으므로 목록에서 제거하지 말 것 — 안 쓰면 retired로 숨긴다.
// claude-haiku-4-5도 승인된 작성 버전·상담 AI 설정이 고정해 쓰고 있어 남겨 둔다.
// 정가는 2026-11-26/27 공식 요금표 기준(100만 토큰당 USD). 실험실의 추정 비용에만 쓰고, 실제 비용은 작성 단가표(가격 설정)가 정한다.

/** 모델을 만든 회사. OpenRouter로 보내도 바뀌지 않는다(사용 기록·단가표의 provider) */
export type AiProvider = "gemini" | "deepseek" | "claude" | "qwen";
/** direct = 회사 API에 직접, openrouter = OpenRouter 경유 */
export type AiRoute = "direct" | "openrouter";

export interface AiModelOption {
    /** 저장값(규칙·작성 버전·사용 기록). 바꾸지 말 것 */
    id: string;
    label: string;
    provider: AiProvider;
    /** Haiku 5.5부터: 생각(thinking)이 기본으로 켜지고, temperature 같은 샘플링 값을 보내면 400이다. */
    adaptiveThinking?: boolean;
    /** 5.5 세대 Claude의 생각: 없으면 끔(Haiku 5.5), between_tools(Sonnet 5.5 — disabled는 400), always(Opus 5.5 — 끌 수 없음) */
    claudeThinking?: "between_tools" | "always";
    /** 생각 토큰이 답 길이 한도를 같이 쓰는 모델 — 한도를 넉넉히 준다 */
    thinks?: boolean;
    /** 직접 연결의 모델 이름(없으면 id). cn이면 고객 정보가 중국 서버로 가므로 AI_ALLOW_CHINA_ENDPOINTS=1일 때만 쓴다 */
    direct?: { apiModel?: string; region?: "cn" };
    /** OpenRouter 모델 이름과 그 모델에만 붙일 요청 값 */
    openrouter?: { slug: string; body?: Record<string, unknown> };
    /** 앞에서부터 키가 있는 경로를 쓴다. 없으면 direct만 */
    routes?: AiRoute[];
    /** 100만 토큰당 정가(USD) */
    listPriceUsd?: { input: number; output: number };
    /** 목록에서 숨기되 저장값은 계속 해석한다 */
    retired?: boolean;
    /** 모델 실험실에서 새로 시험하는 모델 */
    lab?: boolean;
}

export const AI_MODEL_CATALOG: AiModelOption[] = [
    { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", provider: "claude", adaptiveThinking: true, listPriceUsd: { input: 0.1, output: 0.5 } },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", provider: "claude", listPriceUsd: { input: 1, output: 5 } },
    { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite", provider: "gemini", listPriceUsd: { input: 0.3, output: 2.5 } },
    // DeepSeek이 예전 이름을 받아 V4.1 Flash로 임시 연결한다. 이 값을 저장한 규칙은 예전처럼 직접 연결로 보낸다.
    { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", provider: "deepseek", retired: true, listPriceUsd: { input: 0.3, output: 1.2 } },
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", provider: "claude", adaptiveThinking: true, claudeThinking: "between_tools", lab: true, listPriceUsd: { input: 2, output: 10 } },
    { id: "claude-opus-5-5", label: "Claude Opus 5.5", provider: "claude", adaptiveThinking: true, claudeThinking: "always", lab: true, listPriceUsd: { input: 4, output: 20 } },
    // 생각이 기본 medium이고 끌 수 없다(가장 낮은 값 low)
    { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", provider: "gemini", thinks: true, lab: true, listPriceUsd: { input: 0.75, output: 3.75 } },
    // 10/17판. 생각을 켜 둔다(기본 high) — 한국어 순위표 점수가 생각을 켠 상태 기준이다. 평일 10~13시·15~19시(KST) 밖은 반값
    {
        id: "deepseek-v4-1-flash",
        label: "DeepSeek V4.1 Flash",
        provider: "deepseek",
        thinks: true,
        lab: true,
        direct: { apiModel: "deepseek-flash", region: "cn" },
        openrouter: { slug: "deepseek/deepseek-v4.1-flash-20261017" },
        routes: ["openrouter", "direct"],
        listPriceUsd: { input: 0.3, output: 1.2 },
    },
    // 회사 조사 정리와 같은 id(COMPANY_RESEARCH_MODEL_ID). 생각은 끈다 — 직접 연결은 enable_thinking:false(chat-api.ts), OpenRouter는 effort none
    {
        id: "qwen3.7-flash",
        label: "Qwen3.7 Flash",
        provider: "qwen",
        lab: true,
        openrouter: { slug: "qwen/qwen3.7-flash", body: { reasoning: { effort: "none" } } },
        routes: ["direct", "openrouter"],
        listPriceUsd: { input: 0.03, output: 0.13 },
    },
];

/** 고를 수 있는 작성 모델 (숨긴 예전 모델 제외) */
export const AI_MODELS: AiModelOption[] = AI_MODEL_CATALOG.filter((m) => !m.retired);

export const DEFAULT_MODEL_ID = "claude-haiku-5-5";

// 검색 기반 생성에 강제되는 모델
export const SEARCH_MODEL_ID = "claude-haiku-5-5";

// Serper 검색 결과를 회사 정보로 정리하는 모델 (싱가포르 요금: 100만 토큰당 입력 $0.03 / 출력 $0.13)
export const COMPANY_RESEARCH_MODEL_ID = "qwen3.7-flash";

export function findModel(model?: string | null): AiModelOption | undefined {
    return AI_MODEL_CATALOG.find((m) => m.id === model);
}

export function resolveModel(model?: string): AiModelOption {
    return findModel(model) ?? AI_MODEL_CATALOG.find((m) => m.id === DEFAULT_MODEL_ID)!;
}

/** 작성 한 번의 답 길이 한도. 생각하는 모델은 생각 토큰이 같은 한도를 쓰므로 두 배 */
export function outputTokenLimit(model: AiModelOption): number {
    return model.adaptiveThinking || model.thinks ? 8192 : 4096;
}

// Sonnet 5.5는 disabled를 400으로 거절하고, 생각을 끄려면 between_tools를 보낸다. SDK 0.122 타입에 아직 없는 값이라 타입만 맞춘다.
const BETWEEN_TOOLS = { type: "between_tools" } as unknown as { type: "disabled" };

/**
 * 도구 없는 단발 Claude 호출의 생각·샘플링 설정.
 * 생각이 기본으로 켜지는 모델(Haiku 5.5)은 생각 토큰이 max_tokens를 같이 써서 짧은 응답이 잘리므로 4.5처럼 끄고,
 * temperature는 보내지 않는다(기본값이 아니면 400). Sonnet 5.5는 between_tools로 끄고, Opus 5.5는 끌 수 없어 아무것도 보내지 않는다.
 * 그 밖의 모델은 받은 temperature를 그대로 보낸다.
 */
export function claudeSampling(model: string, temperature?: number) {
    const option = findModel(model);
    if (option?.adaptiveThinking) {
        if (option.claudeThinking === "always") return {};
        return { thinking: option.claudeThinking === "between_tools" ? BETWEEN_TOOLS : { type: "disabled" as const } };
    }
    return temperature === undefined ? {} : { temperature };
}
