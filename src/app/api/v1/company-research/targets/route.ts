import { NextRequest, NextResponse } from "next/server";
import { getApiTokenFromNextRequest, resolveApiToken, checkTokenAccess } from "@/lib/auth";
import { MAX_TARGETS, listResearchTargets } from "@/lib/ai/company-research-import";

// GET /api/v1/company-research/targets?partitionId=55&limit=100
// 예약 등록 대기 명단에서 곧 등록될 회사 중 아직 조사하지 않은 회사명(등록 순서). 그 파티션의 읽기 권한 토큰만 쓴다.
export async function GET(req: NextRequest) {
    const tokenStr = getApiTokenFromNextRequest(req);
    const token = tokenStr ? await resolveApiToken(tokenStr) : null;
    if (!token) {
        return NextResponse.json({ success: false, error: "API 토큰이 없거나 올바르지 않습니다." }, { status: 401 });
    }

    const partitionId = Number(req.nextUrl.searchParams.get("partitionId"));
    if (!Number.isSafeInteger(partitionId) || partitionId <= 0) {
        return NextResponse.json({ success: false, error: "partitionId가 필요합니다." }, { status: 400 });
    }
    const requested = Number(req.nextUrl.searchParams.get("limit") ?? 100);
    const limit = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, MAX_TARGETS) : 100;
    if (!(await checkTokenAccess(token, partitionId, "read"))) {
        return NextResponse.json({ success: false, error: "이 파티션에 대한 권한이 없습니다." }, { status: 403 });
    }

    try {
        const data = await listResearchTargets(token.orgId, partitionId, limit);
        return NextResponse.json({ success: true, data: { partitionId, ...data } });
    } catch (error) {
        console.error("company research targets error:", error);
        return NextResponse.json({ success: false, error: "조사 대상 조회에 실패했습니다." }, { status: 500 });
    }
}
