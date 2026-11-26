import { companyResearchMode } from "@/lib/ai/company-research-mode";
import { COMPANY_RESEARCH_MODEL_ID, findModel } from "@/lib/ai/models";
import type { CopyConnection } from "@/lib/ai-copy/types";

// 회사 조사(Serper 검색 + Qwen 정리) 관찰. Qwen을 30일 써 보고 계속 쓸지 정하는 자료다.
// 정리 호출·토큰은 ai_usage_logs, 간단 조사로 대신한 건은 같은 표의 company_research_fallback(토큰 0) 행,
// Serper로 새로 쌓인 회사는 company_research_cache(source='serper')에서 센다. 검색 횟수 자체는 Serper 대시보드에서 본다.

export const RESEARCH_PURPOSES = ["auto_company_research", "test_company_research", "company_research", "model_lab_company_research"];
export const FALLBACK_PURPOSE = "company_research_fallback";

interface UsageRow {
    day: string;
    provider: string;
    purpose: string;
    calls: number;
    prompt_tokens: number;
    completion_tokens: number;
}

export async function loadResearchStats(conn: CopyConnection, input: { orgId: string; days: number }, env: Record<string, string | undefined> = process.env) {
    const { orgId, days } = input;
    const [usage, cache, added] = await Promise.all([
        conn<UsageRow[]>`
            SELECT to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS day, provider, purpose,
                count(*)::int AS calls,
                coalesce(sum(prompt_tokens), 0)::float8 AS prompt_tokens,
                coalesce(sum(completion_tokens), 0)::float8 AS completion_tokens
            FROM ai_usage_logs
            WHERE org_id = ${orgId} AND created_at >= now() - make_interval(days => ${days}::int)
                AND purpose = ANY(${[...RESEARCH_PURPOSES, FALLBACK_PURPOSE]})
            GROUP BY 1, 2, 3`,
        conn<{ source: string; count: number }[]>`
            SELECT source, count(*)::int AS count FROM company_research_cache WHERE org_id = ${orgId} GROUP BY source`,
        conn<{ day: string; count: number }[]>`
            SELECT to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS day, count(*)::int AS count
            FROM company_research_cache
            WHERE org_id = ${orgId} AND source = 'serper' AND created_at >= now() - make_interval(days => ${days}::int)
            GROUP BY 1`,
    ]);
    const price = findModel(COMPANY_RESEARCH_MODEL_ID)?.listPriceUsd;
    const byDay = new Map<string, { day: string; qwenCalls: number; claudeCalls: number; promptTokens: number; completionTokens: number; estCostUsd: number; serperNew: number; fallbacks: number }>();
    const dayOf = (day: string) => {
        if (!byDay.has(day)) byDay.set(day, { day, qwenCalls: 0, claudeCalls: 0, promptTokens: 0, completionTokens: 0, estCostUsd: 0, serperNew: 0, fallbacks: 0 });
        return byDay.get(day)!;
    };
    for (const row of usage) {
        const d = dayOf(row.day);
        if (row.purpose === FALLBACK_PURPOSE) {
            d.fallbacks += row.calls;
            continue;
        }
        if (row.provider === "qwen") {
            d.qwenCalls += row.calls;
            if (price) d.estCostUsd += (row.prompt_tokens * price.input + row.completion_tokens * price.output) / 1_000_000;
        } else if (row.provider === "claude") d.claudeCalls += row.calls;
        d.promptTokens += row.prompt_tokens;
        d.completionTokens += row.completion_tokens;
    }
    for (const row of added) dayOf(row.day).serperNew += row.count;
    const counts = Object.fromEntries(cache.map((c) => [c.source, c.count]));
    let mode: string;
    try {
        mode = companyResearchMode(env);
    } catch {
        mode = "invalid";
    }
    return {
        mode,
        // 값은 내려주지 않고 어떤 모델이 정리하는지만 알려 준다
        summarizer: mode !== "serper" ? null : env.QWEN_API_KEY || env.OPENROUTER_API_KEY ? "qwen" : env.ANTHROPIC_API_KEY ? "claude" : null,
        serperConnected: !!env.SERPER_API_KEY,
        days: [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day)),
        cache: { import: counts.import ?? 0, serper: counts.serper ?? 0, total: cache.reduce((sum, c) => sum + c.count, 0) },
    };
}
