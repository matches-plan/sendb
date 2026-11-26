// Barrel re-export — all consumers keep `import { ... } from "@/lib/ai"`

// Types & client
export { getAiClient, getSearchAiClient, getCompanyResearchClient, resolveRoute, listModelAvailability, modelUnavailableReason, type AiClient } from "./client";
export { AI_MODELS, AI_MODEL_CATALOG, DEFAULT_MODEL_ID, SEARCH_MODEL_ID, findModel, resolveModel, type AiModelOption, type AiProvider, type AiRoute } from "./models";

// JSON utilities (internal, but buildEmailSystemPrompt uses extractJson indirectly)
export { extractJson } from "./json-utils";

// Email
export { buildEmailSystemPrompt, generateEmail, type GenerateEmailInput } from "./email";

// Search (product, company research, field enrichment)
export { generateProduct } from "./search";
export { generateCompanyResearch, type CompanyResearchResult } from "./search";
export { isCompactCompanyResearch, hasCompactCompanyFacts } from "./company-research-compact";
export { generateFieldEnrichment } from "./search";

// Web form
export { generateWebForm } from "./form";

// Alimtalk
export { generateAlimtalk } from "./alimtalk";

// Quota & usage
export { checkTokenQuota, updateTokenUsage, getUsageData, logAiUsage } from "./quota";
