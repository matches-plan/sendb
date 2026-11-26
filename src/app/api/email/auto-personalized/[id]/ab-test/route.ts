import { NextRequest } from "next/server";
import { z } from "zod";
import { copyAdminApi } from "@/lib/ai-copy/api";
import { syncPromptTest } from "@/lib/email-experiments/prompt-tests";

const idFrom = async (context: { params: Promise<{ id: string }> }) =>
    z.coerce.number().int().positive().parse((await context.params).id);

/**
 * 규칙 저장 뒤 AB 테스트 맞추기 — 지시사항(A안)이나 모델 A/B의 규칙 모델이 바뀌었으면 진행 중 테스트를 중단하고, start가 있으면 새 테스트를 시작한다.
 * kind: prompt = 지시사항 비교(promptB), model = AI 모델 비교(modelB, 지시사항은 규칙 그대로).
 * 예전 화면이 보내던 enabled·axis는 무시한다.
 */
export const PUT = (req: NextRequest, context: { params: Promise<{ id: string }> }) =>
    copyAdminApi(req, async (conn, user) => {
        const id = await idFrom(context);
        const body = z.object({
            start: z.object({
                kind: z.enum(["prompt", "model"]).default("prompt"),
                promptB: z.string().max(20000).optional(),
                modelB: z.string().max(100).optional(),
                metric: z.enum(["reply", "click", "open"]).default("reply"),
                scope: z.enum(["subject", "opening", "all"]).default("all"),
                name: z.string().max(100).nullish(),
            }).nullish(),
        }).parse(await req.json());
        return syncPromptTest(conn, { orgId: user.orgId, userId: user.userId, ruleId: id, start: body.start ?? null, now: new Date() });
    }, { allowMembers: true });
