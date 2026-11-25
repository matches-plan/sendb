import { NextRequest, NextResponse } from "next/server";
import { db, webForms, webFormFields } from "@/lib/db";
import { eq, and, count } from "drizzle-orm";
import { getActiveUserFromNextRequest } from "@/lib/auth";
import { requirePartitionAccess } from "@/lib/partition-access";
import { nanoid } from "nanoid";

export async function GET(req: NextRequest) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) {
        return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }

    try {
        const workspaceIdStr = req.nextUrl.searchParams.get("workspaceId");
        const workspaceId = workspaceIdStr ? Number(workspaceIdStr) : undefined;

        const conditions = [eq(webForms.orgId, user.orgId)];
        if (workspaceId) {
            conditions.push(eq(webForms.workspaceId, workspaceId));
        }

        const forms = await db
            .select()
            .from(webForms)
            .where(and(...conditions))
            .orderBy(webForms.createdAt);

        // 각 폼의 필드 수 집계
        const fieldCounts = await db
            .select({ formId: webFormFields.formId, value: count() })
            .from(webFormFields)
            .groupBy(webFormFields.formId);

        const countMap = new Map(fieldCounts.map((fc) => [fc.formId, fc.value]));

        const data = forms.map((f) => ({
            ...f,
            fieldCount: countMap.get(f.id) ?? 0,
        }));

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error("Web forms fetch error:", error);
        return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) {
        return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }

    const { name, workspaceId, partitionId, title, description } = await req.json();
    if (!name || !workspaceId || !partitionId || !title) {
        return NextResponse.json({ success: false, error: "필수 항목이 누락되었습니다." }, { status: 400 });
    }

    try {
        // 제출 리드가 쌓일 파티션이 내 조직의 것이고 생성 권한이 있는지 확인한다. 워크스페이스는 요청값이 아니라 파티션의 것을 쓴다
        const access = await requirePartitionAccess(user, Number(partitionId), "create");
        if (!access.ok) {
            return NextResponse.json({ success: false, error: access.error }, { status: access.status });
        }
        // 제출이 리드관리에 보이도록 — 레코드(콜드메일) 파티션에는 연결하지 않는다 (수정 때와 같은 규칙)
        if (access.partition.category !== "lead") {
            return NextResponse.json({ success: false, error: "웹 폼은 리드관리 파티션으로만 연결할 수 있습니다." }, { status: 400 });
        }

        const slug = nanoid(8);

        const [form] = await db
            .insert(webForms)
            .values({
                orgId: user.orgId,
                workspaceId: access.partition.workspaceId,
                partitionId: access.partition.id,
                name,
                slug,
                title,
                description: description || null,
                createdBy: user.userId,
            })
            .returning();

        return NextResponse.json({ success: true, data: form }, { status: 201 });
    } catch (error) {
        console.error("Web form create error:", error);
        return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
    }
}
