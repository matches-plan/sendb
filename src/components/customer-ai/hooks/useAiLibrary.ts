import useSWR from "swr";
import { supportRequest } from "../api";
import type { AiDoc, AiRule } from "../types";

export const aiRulesUrl = (workspaceId: number) => `/api/customer-ai/rules?workspaceId=${workspaceId}`;
export const aiDocsUrl = (workspaceId: number) => `/api/customer-ai/docs?workspaceId=${workspaceId}`;
/** 사업의 AI 규칙 목록 */
export const useAiRules = (workspaceId: number) => useSWR<AiRule[]>(aiRulesUrl(workspaceId), supportRequest);
/** 사업의 상담 지식 문서·FAQ 목록 (최근 수정 순) */
export const useAiDocs = (workspaceId: number) => useSWR<AiDoc[]>(aiDocsUrl(workspaceId), supportRequest);
