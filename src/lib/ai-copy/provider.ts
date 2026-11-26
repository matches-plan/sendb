import Anthropic from "@anthropic-ai/sdk";
import { getAiClient } from "../ai/client";
import { chatApiRequest } from "../ai/chat-api";
import { claudeSampling } from "../ai/models";
import type { PolicySnapshot } from "./types";

export interface CopyProviderResponse {
    content: string;
    promptTokens: number | null;
    completionTokens: number | null;
    truncated: boolean;
}
export class CopyProviderError extends Error {
    constructor(
        readonly code: string,
        readonly retryable: boolean,
    ) {
        super(code);
    }
}
const tokenCount = (value: unknown): number | null =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;

/** 한 호출은 한 과금 시도다. SDK·공급자 내부 재시도를 끄고 작업 계층에서 재시도한다. */
export async function callCopyProvider(
    policy: Pick<PolicySnapshot, "provider" | "model" | "parameters">,
    prompt: { system: string; user: string },
    signal: AbortSignal,
): Promise<CopyProviderResponse> {
    const client = getAiClient(policy.model);
    if (!client || client.model !== policy.model || client.provider !== policy.provider)
        throw new CopyProviderError("provider_not_configured", false);
    if (client.provider === "claude") {
        try {
            const api = new Anthropic({ apiKey: client.apiKey, maxRetries: 0, timeout: 45_000 });
            const message = await api.messages.create(
                {
                    model: policy.model,
                    max_tokens: policy.parameters.maxOutputTokens,
                    // Haiku 5.5는 temperature를 받지 않고(400) 생각을 꺼야 maxOutputTokens 안에 답이 들어간다.
                    ...claudeSampling(policy.model, policy.parameters.temperature),
                    system: prompt.system,
                    messages: [{ role: "user", content: prompt.user }],
                },
                { signal },
            );
            // Opus·Sonnet 5.5의 안전 분류기가 거절하면 200으로 refusal이 온다 — 같은 요청을 다시 보내도 같다.
            if (message.stop_reason === "refusal") throw new CopyProviderError("provider_refusal", false);
            return {
                content: message.content
                    .filter((b) => b.type === "text")
                    .map((b) => b.text)
                    .join(""),
                promptTokens: tokenCount(message.usage.input_tokens),
                completionTokens: tokenCount(message.usage.output_tokens),
                truncated: message.stop_reason === "max_tokens",
            };
        } catch (error) {
            if (signal.aborted || error instanceof CopyProviderError) throw error;
            const status = error instanceof Anthropic.APIError ? error.status : undefined;
            throw new CopyProviderError(
                status ? `provider_http_${status}` : "provider_network",
                !status || status === 429 || status >= 500,
            );
        }
    }
    const gemini = client.provider === "gemini";
    // DeepSeek·Qwen 직접과 OpenRouter는 OpenAI 호환 형식. 전송 모델 이름은 연결의 apiModel(예: deepseek-flash, OpenRouter slug)
    const chat = gemini ? null : chatApiRequest(client);
    const response = await fetch(
        chat
            ? chat.url
            : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(policy.model)}:generateContent`,
        {
            method: "POST",
            signal,
            headers: chat ? chat.headers : { "Content-Type": "application/json", "x-goog-api-key": client.apiKey },
            body: JSON.stringify(
                chat
                    ? {
                          model: chat.model,
                          max_tokens: policy.parameters.maxOutputTokens,
                          temperature: policy.parameters.temperature,
                          messages: [
                              { role: "system", content: prompt.system },
                              { role: "user", content: prompt.user },
                          ],
                          response_format: { type: "json_object" },
                          ...chat.body,
                      }
                    : {
                          system_instruction: { parts: [{ text: prompt.system }] },
                          contents: [{ role: "user", parts: [{ text: prompt.user }] }],
                          generationConfig: {
                              maxOutputTokens: policy.parameters.maxOutputTokens,
                              temperature: policy.parameters.temperature,
                              responseMimeType: "application/json",
                          },
                      },
            ),
        },
    ).catch((error) => {
        if (signal.aborted) throw error;
        throw new CopyProviderError("provider_network", true);
    });
    if (!response.ok)
        throw new CopyProviderError(
            `provider_http_${response.status}`,
            response.status === 429 || response.status >= 500,
        );
    const data = await response.json();
    if (gemini)
        return {
            content: (data.candidates?.[0]?.content?.parts ?? [])
                .map((p: { text?: string }) => p.text ?? "")
                .join(""),
            promptTokens: tokenCount(data.usageMetadata?.promptTokenCount),
            // 생각 토큰(thoughtsTokenCount)도 출력 요금이다 — 3.8 Flash는 생각을 끌 수 없다
            completionTokens: tokenCount(
                typeof data.usageMetadata?.candidatesTokenCount === "number"
                    ? data.usageMetadata.candidatesTokenCount + (data.usageMetadata.thoughtsTokenCount ?? 0)
                    : undefined,
            ),
            truncated: data.candidates?.[0]?.finishReason === "MAX_TOKENS",
        };
    return {
        content: data.choices?.[0]?.message?.content ?? "",
        promptTokens: tokenCount(data.usage?.prompt_tokens),
        completionTokens: tokenCount(data.usage?.completion_tokens),
        truncated: data.choices?.[0]?.finish_reason === "length",
    };
}
