import type { AiClient } from "./client";
import type { AiProvider } from "./models";

// OpenAI 호환 채팅 API(DeepSeek·Qwen 직접 연결, OpenRouter)의 주소·머리글·기본 요청 값.
// 키 값은 여기서 다루지 않는다 — 연결(client.apiKey)로 받아 머리글에만 넣는다.

/** 환경변수 모음 (시험에서는 일부만 넘긴다) */
export type Env = Record<string, string | undefined>;

export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

const DIRECT: Partial<Record<AiProvider, { url: string; body?: Record<string, unknown>; timeoutMs?: number }>> = {
    deepseek: { url: "https://api.deepseek.com/chat/completions" },
    // 키는 지역마다 따로라 싱가포르(International)에서 만든 키만 이 주소로 된다.
    // 생각이 기본으로 켜져 있어 끈다 — 짧은 JSON에는 필요 없고 출력 토큰만 는다. 늦으면 넘어가게 1분에 끊는다.
    qwen: {
        url: "https://ap-southeast-1.maas.qwencloudapi.com/compatible-mode/v1/chat/completions",
        body: { enable_thinking: false },
        timeoutMs: 60_000,
    },
};

/** Claude·Gemini 직접 연결이 아니면 OpenAI 호환 형식으로 보낸다 */
export function isChatApiClient(client: AiClient): boolean {
    return client.route === "openrouter" || !!DIRECT[client.provider];
}

export function chatApiRequest(client: AiClient) {
    const openrouter = client.route === "openrouter";
    const direct = openrouter ? undefined : DIRECT[client.provider];
    const url = openrouter ? OPENROUTER_CHAT_URL : direct?.url;
    if (!url) throw new Error("지원하지 않는 AI 공급자입니다.");
    return {
        url,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${client.apiKey}`,
            // OpenRouter가 사용량 화면에서 앱을 구분하는 값(선택)
            ...(openrouter ? { "HTTP-Referer": "https://sendb.kr", "X-OpenRouter-Title": "Sendb" } : {}),
        },
        model: client.apiModel ?? client.model,
        body: { ...direct?.body, ...client.extraBody },
        timeoutMs: client.timeoutMs ?? direct?.timeoutMs,
    };
}

/**
 * OpenRouter 요청에 더할 값. 기본은 사용자 정보를 모으지 않는 공급자만 쓰고(data_collection: deny),
 * DeepSeek은 중국 서버인 DeepSeek 자체 공급자를 뺀다(공개 모델이라 다른 호스트가 돌린다 — 공급자 이름은 모델 화면의 복사 버튼 값).
 * JSON 모드(response_format)를 지원하는 공급자로는 OpenRouter가 알아서 보낸다. require_parameters는 켜지 않는다 —
 * 요청의 모든 값을 지원하는 곳만 남겨 아무 곳도 안 남을 수 있다. 사용량(cost 포함)은 항상 응답에 온다.
 * OPENROUTER_PROVIDER_PREFS(JSON)를 넣으면 기본 공급자 선호를 그 값으로 바꾼다.
 */
export function openRouterExtraBody(provider: AiProvider, modelBody: Record<string, unknown> | undefined, env: Env) {
    let prefs: Record<string, unknown> = {
        data_collection: "deny",
        ...(provider === "deepseek" ? { ignore: ["deepseek"] } : {}),
    };
    const custom = env.OPENROUTER_PROVIDER_PREFS?.trim();
    if (custom) {
        try {
            const parsed = JSON.parse(custom);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) prefs = parsed;
        } catch {
            console.error("[AI] OPENROUTER_PROVIDER_PREFS가 JSON이 아니라 기본 공급자 선호를 씁니다.");
        }
    }
    return { provider: prefs, ...modelBody };
}
