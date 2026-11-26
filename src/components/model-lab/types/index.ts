export interface PreviewResult {
    model: string;
    label: string;
    route: "direct" | "openrouter" | null;
    subject?: string;
    htmlBody?: string;
    promptTokens?: number;
    completionTokens?: number;
    latencyMs?: number;
    estCostUsd?: number | null;
    error?: string;
}

export interface RateCell {
    rate: number | null;
    ci: [number, number] | null;
}

export interface LeaderboardRow {
    model: string;
    label: string;
    rules: number;
    sent: number;
    openTracked: number;
    opened: number;
    clicked: number;
    replied: number;
    open: RateCell;
    click: RateCell;
    reply: RateCell;
    sampleOk: boolean;
    avgLatencyMs: number | null;
    promptTokens: number;
    completionTokens: number;
    costKrw: number | null;
}

export interface LeaderboardRuleRow extends Omit<LeaderboardRow, "rules" | "avgLatencyMs" | "promptTokens" | "completionTokens" | "costKrw"> {
    ruleId: number;
    ruleName: string | null;
    partitionId: number | null;
}

export interface Leaderboard {
    days: number;
    caveat: string;
    minSample: number;
    rows: LeaderboardRow[];
    byRule: LeaderboardRuleRow[];
}

export interface ResearchStats {
    mode: string;
    summarizer: "qwen" | "claude" | null;
    serperConnected: boolean;
    days: Array<{ day: string; qwenCalls: number; claudeCalls: number; promptTokens: number; completionTokens: number; estCostUsd: number; serperNew: number; fallbacks: number }>;
    cache: { import: number; serper: number; total: number };
}

export type LeaderboardMetric = "open" | "click" | "reply";
