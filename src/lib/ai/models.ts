// 선택 가능한 AI 모델 정의 (검색 미사용 텍스트 생성용)
// 검색 기반 생성(제품/회사 리서치)은 SEARCH_MODEL_ID로 고정이라 이 목록을 쓰지 않는다.
//
// 모델 교체: 아래 id/label과 DEFAULT_MODEL_ID·SEARCH_MODEL_ID 문자열만 바꾸면 된다.
// 기존 값(gemini-3.5-flash-lite 등)은 운영 DB의 링크에 저장돼 있으므로 목록에서 제거하지 말 것.
// claude-haiku-4-5도 승인된 작성 버전·상담 AI 설정이 고정해 쓰고 있어 남겨 둔다.

export type AiProvider = "gemini" | "deepseek" | "claude";

export interface AiModelOption {
    id: string;
    label: string;
    provider: AiProvider;
    /** Haiku 5.5부터: 생각(thinking)이 기본으로 켜지고, temperature 같은 샘플링 값을 보내면 400이다. */
    adaptiveThinking?: boolean;
}

export const AI_MODELS: AiModelOption[] = [
    { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", provider: "claude", adaptiveThinking: true },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", provider: "claude" },
    { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite", provider: "gemini" },
    { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", provider: "deepseek" },
];

export const DEFAULT_MODEL_ID = "claude-haiku-5-5";

// 검색 기반 생성에 강제되는 모델
export const SEARCH_MODEL_ID = "claude-haiku-5-5";

export function resolveModel(model?: string): AiModelOption {
    const found = AI_MODELS.find((m) => m.id === model);
    if (found) return found;
    return AI_MODELS.find((m) => m.id === DEFAULT_MODEL_ID)!;
}

/**
 * 도구 없는 단발 Claude 호출의 생각·샘플링 설정.
 * 생각이 기본으로 켜지는 모델(Haiku 5.5)은 생각 토큰이 max_tokens를 같이 써서 짧은 응답이 잘리므로 4.5처럼 끄고,
 * temperature는 보내지 않는다(기본값이 아니면 400). 그 밖의 모델은 받은 temperature를 그대로 보낸다.
 */
export function claudeSampling(model: string, temperature?: number) {
    if (AI_MODELS.find((m) => m.id === model)?.adaptiveThinking) return { thinking: { type: "disabled" as const } };
    return temperature === undefined ? {} : { temperature };
}
