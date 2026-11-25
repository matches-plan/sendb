import { NextRequest } from "next/server";
import { z } from "zod";
import { copyAdminApi, CopyActionError } from "@/lib/ai-copy/api";
import { syncPromptTest } from "@/lib/email-experiments/prompt-tests";

const idFrom = async (context: { params: Promise<{ id: string }> }) =>
    z.coerce.number().int().positive().parse((await context.params).id);

/**
 * 규칙 저장 뒤 AB 테스트 맞추기 — 지시사항(A안)이 바뀌었으면 진행 중 테스트를 중단하고, start가 있으면 새 테스트를 시작한다.
 * 예전 화면이 보내던 enabled·axis는 무시한다.
 */
export const PUT = (req: NextRequest, context: { params: Promise<{ id: string }> }) =>
    copyAdminApi(req, async (conn, user) => {
        const id = await idFrom(context);
        const body = z.object({
            start: z.object({
                promptB: z.string().max(20000),
                metric: z.enum(["reply", "click", "open"]).default("reply"),
                scope: z.enum(["subject", "opening", "all"]).default("all"),
                name: z.string().max(100).nullish(),
                dihaRound: z.enum(["DH02", "DH03", "DH04", "DH05"]).optional(),
                verifiedCompanies: z.string().max(100000).optional(),
            }).nullish(),
        }).parse(await req.json());
        if (body.start?.dihaRound && user.role !== "admin" && user.role !== "owner") {
            throw new CopyActionError("고정 소재 실험을 시작하려면 관리자 권한이 필요합니다.");
        }
        return syncPromptTest(conn, { orgId: user.orgId, userId: user.userId, ruleId: id, start: body.start ?? null, now: new Date() });
    }, { allowMembers: true });
