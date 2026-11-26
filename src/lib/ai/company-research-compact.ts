import { createImportFileTransport } from "@/lib/customer-import-files/transport";
import { webhookUrl } from "@/lib/customer-platform/webhook-rules";
import { companyResearchMode } from "./company-research-mode";
import type { CompanyResearchInput, CompanyResearchResult } from "./search";

/** 회사 조사만 전환한다. 제품 검색·필드 보강과 작성 모델의 설정은 별개다. */
export function isCompactCompanyResearch(): boolean {
    return companyResearchMode() === "compact";
}

const fields = {
    industry: ["업종", "산업군", "산업분야", "industry", "companyindustry"],
    description: ["회사소개", "기업소개", "업체소개", "회사설명", "companydescription", "companysummary", "description"],
    services: ["주요서비스", "주요제품", "주요사업", "사업내용", "services", "companyservices", "products"],
    employees: ["직원수", "임직원수", "employees", "employeecount"],
    website: ["홈페이지", "홈페이지주소", "홈페이지url", "회사홈페이지", "웹사이트", "회사웹사이트", "공식사이트", "공식웹사이트", "website", "homepage", "companywebsite", "companyurl", "siteurl"],
};

function plain(value: string, limit: number): string {
    return value.replace(/<[^>]*>/g, " ").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function readField(context: Record<string, unknown>, aliases: string[], limit: number): string {
    for (const [key, value] of Object.entries(context)) {
        if (key.startsWith("_") || !aliases.includes(key.replace(/[\s_-]/g, "").toLowerCase())) continue;
        if (typeof value !== "string" && typeof value !== "number") continue;
        const text = plain(String(value), limit);
        if (text && !/^(정보\s*없음|없음|미상|unknown|n\/a|-)$/i.test(text)) return text;
    }
    return "";
}

function homepageUrl(raw: string): string {
    if (!raw) return "";
    try {
        // 명시된 홈페이지 필드만 사용한다. 회사명·이메일에서 도메인을 추측하지 않는다.
        const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
        if (url.protocol === "http:") url.protocol = "https:";
        url.hash = "";
        return webhookUrl(url.href);
    } catch {
        return "";
    }
}

function decodeEntities(text: string): string {
    const named: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
    return text.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (match, entity: string) => {
        if (!entity.startsWith("#")) return named[entity.toLowerCase()] ?? match;
        const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
        return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "";
    });
}

/** 회사 홈페이지가 직접 제공한 소개문만 추출한다. 본문을 모델에 보내거나 요약하지 않는다. */
export function extractHomepageIntro(html: string): { title: string; description: string } {
    const clean = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
    const title = plain(decodeEntities(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(clean)?.[1] ?? ""), 150);
    const descriptions = new Map<string, string>();
    for (const match of clean.matchAll(/<meta\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi)) {
        const attrs: Record<string, string> = {};
        for (const attr of match[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
            attrs[attr[1].toLowerCase()] = attr[2] ?? attr[3] ?? attr[4] ?? "";
        }
        const name = (attrs.name || attrs.property || "").toLowerCase();
        if (!["description", "og:description", "twitter:description"].includes(name)) continue;
        const text = plain(decodeEntities(attrs.content ?? ""), 400);
        if (text) descriptions.set(name, text);
    }
    return { title, description: descriptions.get("description") || descriptions.get("og:description") || descriptions.get("twitter:description") || "" };
}

// 기존 다운로드 경로의 공개 DNS 검사·접속 IP 고정·이동 재검사·스트림 용량 제한을 재사용한다.
const fetchHomepage = createImportFileTransport({ timeoutMs: 5000, maxBytes: 512_000 });

export function hasCompactCompanyFacts(research: Pick<CompanyResearchResult, "industry" | "description" | "services">): boolean {
    return !!(research.industry || research.description || research.services);
}

/** CRM에 적힌 회사 칸(업종·소개·서비스·직원 수·홈페이지)만 읽는다. 담당자 이름·연락처 칸은 읽지 않는다. */
export function readStoredCompanyFacts(additionalContext: CompanyResearchInput["additionalContext"]) {
    const context = additionalContext && typeof additionalContext === "object" && !Array.isArray(additionalContext) ? additionalContext : {};
    return {
        industry: readField(context, fields.industry, 80),
        description: readField(context, fields.description, 400),
        services: readField(context, fields.services, 240),
        employees: readField(context, fields.employees, 40),
        website: homepageUrl(readField(context, fields.website, 300)),
    };
}

export async function generateCompactCompanyResearch(
    input: CompanyResearchInput,
    fetchPage: (url: string) => Promise<Buffer> = fetchHomepage,
): Promise<CompanyResearchResult> {
    const result: CompanyResearchResult = {
        companyName: plain(input.companyName, 200),
        ...readStoredCompanyFacts(input.additionalContext),
        sources: [],
        method: "compact",
        usage: { promptTokens: 0, completionTokens: 0, searchRequests: 0 },
    };
    // 저장된 정보만으로 충분하면 외부 통신도 생략한다.
    if (hasCompactCompanyFacts(result) || !result.website) return result;
    try {
        const bytes = await fetchPage(result.website);
        if (bytes.length > 512_000) return result;
        const html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        if (!/<(?:!doctype\s+html|html|head|meta)\b/i.test(html)) return result;
        const intro = extractHomepageIntro(html);
        if (intro.description) {
            result.description = intro.description;
            result.sources = [{ url: result.website, title: intro.title || input.companyName }];
        }
    } catch {
        // 사이트 차단·시간 초과·주소 오류는 빈 정보로 남긴다. 유료 검색/AI로 폴백하지 않는다.
    }
    return result;
}
