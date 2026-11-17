import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getActiveUserFromNextRequest } from "@/lib/auth";

// GET ?kind=records|web-forms: 레코드 파티션·웹 폼이 있는 사업부와 내용 수 — 그 화면 탭에 기본으로 보이는 사업부 (0건이면 탭 삭제 가능)
export async function GET(req: NextRequest) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    const kind = req.nextUrl.searchParams.get("kind");
    if (kind !== "records" && kind !== "web-forms") return NextResponse.json({ success: false, error: "잘못된 화면입니다." }, { status: 400 });
    try {
        // 사업부별 내용 수 — 레코드: 콜드 파티션의 레코드 수(빈 파티션만 있으면 0), 웹 폼: 폼 수
        const rows = Array.from(
            await db.execute<{ id: number; count: number }>(
                kind === "records"
                    ? sql`SELECT w.id, count(r.id)::int AS count FROM workspaces w
                          JOIN partitions p ON p.workspace_id = w.id AND p.category = 'cold'
                          LEFT JOIN records r ON r.partition_id = p.id
                          WHERE w.org_id = ${user.orgId} AND w.hidden_at IS NULL GROUP BY w.id`
                    : sql`SELECT w.id, count(f.id)::int AS count FROM workspaces w
                          JOIN web_forms f ON f.workspace_id = w.id
                          WHERE w.org_id = ${user.orgId} AND w.hidden_at IS NULL GROUP BY w.id`,
            ),
        );
        return NextResponse.json({ success: true, data: rows.map((r) => ({ id: r.id, count: r.count })) });
    } catch (error) {
        console.error("Workspaces with content error:", error);
        return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
    }
}
