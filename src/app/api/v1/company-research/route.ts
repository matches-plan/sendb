import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getApiTokenFromNextRequest, resolveApiToken, checkTokenAccess } from "@/lib/auth";
import {
    MAX_IMPORT_ITEMS,
    parseResearchItems,
    saveImportedCompanyResearch,
} from "@/lib/ai/company-research-import";

const bodySchema = z.object({
    partitionId: z.number().int().positive(),
    items: z.array(z.unknown()).min(1).max(MAX_IMPORT_ITEMS),
});

// POST /api/v1/company-research — 미리 조사한 회사 정보를 조직의 회사 조사 보관함에 넣는다.
// 그 파티션의 레코드 수정 권한이 있는 토큰만 쓸 수 있다. 같은 회사명이면 자동 메일이 웹검색 대신 이 결과를 쓴다.
export async function POST(req: NextRequest) {
    const tokenStr = getApiTokenFromNextRequest(req);
    const token = tokenStr ? await resolveApiToken(tokenStr) : null;
    if (!token) {
        return NextResponse.json({ success: false, error: "API 토큰이 없거나 올바르지 않습니다." }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json(
            { success: false, error: `partitionId와 items(1~${MAX_IMPORT_ITEMS}건)가 필요합니다.` },
            { status: 400 }
        );
    }
    if (!(await checkTokenAccess(token, parsed.data.partitionId, "update"))) {
        return NextResponse.json({ success: false, error: "이 파티션에 대한 권한이 없습니다." }, { status: 403 });
    }

    const { valid, skipped } = parseResearchItems(parsed.data.items, new Date());
    try {
        const saved = await saveImportedCompanyResearch(token.orgId, valid);
        return NextResponse.json({ success: true, data: { saved, skipped } });
    } catch (error) {
        console.error("company research import error:", error);
        return NextResponse.json({ success: false, error: "회사 조사 저장에 실패했습니다." }, { status: 500 });
    }
}
