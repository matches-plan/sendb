/**
 * 회사 조사 방식. 제품 검색·필드 보강과 작성 모델의 설정은 별개다.
 * - compact: 저장된 CRM 정보와 홈페이지 소개문만 쓴다 (검색·AI 비용 없음)
 * - serper: Serper로 구글 검색 1회 + Qwen3.7-Flash로 정리 (검색 1,000회 약 $1)
 * - search: Claude 웹검색 (예전 방식, 검색 1,000회 $10 + 검색 결과 토큰)
 * AI_COMPANY_RESEARCH_MODE가 없으면 SERPER_API_KEY가 있을 때 serper, 없으면 compact.
 */
export type CompanyResearchMode = "compact" | "serper" | "search";

export function companyResearchMode(env: Record<string, string | undefined> = process.env): CompanyResearchMode {
    const mode = env.AI_COMPANY_RESEARCH_MODE?.trim() || (env.SERPER_API_KEY ? "serper" : "compact");
    if (mode !== "compact" && mode !== "serper" && mode !== "search") throw new Error("회사 조사 방식 설정을 확인해주세요.");
    return mode;
}
