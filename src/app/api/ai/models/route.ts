import { NextRequest, NextResponse } from "next/server";
import { getActiveUserFromNextRequest } from "@/lib/auth";
import { listModelAvailability } from "@/lib/ai";

// GET /api/ai/models — 작성 모델별로 지금 쓸 수 있는지(키 연결)와 필요한 키 이름. 키 값은 내려주지 않는다.
export async function GET(req: NextRequest) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) {
        return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }
    return NextResponse.json({ success: true, data: listModelAvailability() });
}
