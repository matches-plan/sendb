import { NextRequest } from "next/server";
import { z } from "zod";
import { copyAdminApi, CopyActionError } from "@/lib/ai-copy/api";
import { applyPromptTestArm, renamePromptTest, stopPromptTest } from "@/lib/email-experiments/prompt-tests";
import { adoptExperiment } from "@/lib/email-experiments/actions";
import { changeExperimentState } from "@/lib/email-experiments/repository";
import { connectedReplyAvailable } from "@/lib/email-experiments/runtime";
import type { Experiment } from "@/lib/email-experiments/types";

/** 고른 안 적용 — AB 테스트는 그 지시사항을 규칙에 넣고, 자동 준비 실험은 B 채택(통계 확인) 또는 A 유지로 닫는다 */
export const POST = (req: NextRequest, context: { params: Promise<{ id: string }> }) =>
    copyAdminApi(req, async (conn, user) => {
        const id = z.coerce.number().int().positive().parse((await context.params).id);
        const { arm } = z.object({ arm: z.enum(["A", "B"]) }).parse(await req.json());
        const now = new Date();
        const [experiment] = await conn<Experiment[]>`SELECT * FROM email_copy_experiments WHERE id = ${id} AND org_id = ${user.orgId}`;
        if (!experiment) throw new CopyActionError("AB 테스트를 찾을 수 없습니다.");
        if (experiment.config.kind !== "prompt" && user.role === "member")
            throw new CopyActionError("자동 준비 실험은 관리자만 적용할 수 있습니다.");
        if (experiment.config.kind === "prompt")
            return applyPromptTestArm(conn, { orgId: user.orgId, userId: user.userId, id, arm, now });
        if (arm === "B")
            return adoptExperiment(conn, {
                orgId: user.orgId, userId: user.userId, id, now,
                connectedReplyAvailable: await connectedReplyAvailable(user.orgId, experiment.workspace_id, now),
            });
        return changeExperimentState(conn, {
            orgId: user.orgId, userId: user.userId, id, now, action: "close", pendingMode: "continue",
            reason: "AB테스트 결과에서 A(기존) 유지로 종료",
        });
    }, { allowMembers: true });

/** 진행 중인 AB 테스트 중단 */
export const DELETE = (req: NextRequest, context: { params: Promise<{ id: string }> }) =>
    copyAdminApi(req, async (conn, user) => {
        const id = z.coerce.number().int().positive().parse((await context.params).id);
        return stopPromptTest(conn, { orgId: user.orgId, userId: user.userId, id, now: new Date() });
    }, { allowMembers: true });

/** AB 테스트 이름 바꾸기 */
export const PATCH = (req: NextRequest, context: { params: Promise<{ id: string }> }) =>
    copyAdminApi(req, async (conn, user) => {
        const id = z.coerce.number().int().positive().parse((await context.params).id);
        const { name } = z.object({ name: z.string().trim().min(1, "이름을 입력해 주세요.").max(100) }).parse(await req.json());
        return renamePromptTest(conn, { orgId: user.orgId, userId: user.userId, id, name });
    }, { allowMembers: true });
