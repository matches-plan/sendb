import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getActiveUserFromNextRequest } from "@/lib/auth";
import { MAX_PREVIEW_MODELS, runModelLabPreview } from "@/lib/model-lab/preview";

const bodySchema = z.object({
    ruleId: z.number().int().positive(),
    recordId: z.number().int().positive().optional(),
    models: z.array(z.string().min(1).max(100)).min(1).max(MAX_PREVIEW_MODELS),
});

// 관리자 전용 — 모델마다 실제 AI 호출(과금)이 일어난다. 메일은 보내지 않는다.
export const maxDuration = 120;

// POST /api/ai/model-lab/preview — 같은 규칙·레코드로 여러 모델이 쓴 메일을 나란히 돌려준다
export async function POST(req: NextRequest) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    if (user.role === "member")
        return NextResponse.json({ success: false, error: "이 기능은 관리자 권한이 필요합니다." }, { status: 403 });

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: "규칙과 모델을 확인해 주세요." }, { status: 400 });

    try {
        const outcome = await runModelLabPreview({ orgId: user.orgId, userId: user.userId, ...parsed.data });
        if (!outcome.ok) return NextResponse.json({ success: false, error: outcome.error }, { status: outcome.status });
        return NextResponse.json({ success: true, data: { company: outcome.company, results: outcome.results } });
    } catch (error) {
        console.error("[ModelLab] preview error:", error);
        return NextResponse.json({ success: false, error: "미리보기를 만들지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
    }
}
