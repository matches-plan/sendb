import { NextRequest, NextResponse } from "next/server";
import { db, emailSignatures } from "@/lib/db";
import { workspaceInOrg } from "@/lib/workspace-in-org";
import { and, eq, isNull, or } from "drizzle-orm";
import { getActiveUserFromNextRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) {
        return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }

    try {
        // ?workspaceId= 가 있으면 그 사업부 서명과 공통 서명(사업부 없음)만
        const workspaceId = Number(req.nextUrl.searchParams.get("workspaceId")) || null;
        const signatures = await db
            .select()
            .from(emailSignatures)
            .where(and(
                eq(emailSignatures.orgId, user.orgId),
                workspaceId ? or(eq(emailSignatures.workspaceId, workspaceId), isNull(emailSignatures.workspaceId)) : undefined,
            ))
            .orderBy(emailSignatures.createdAt);

        return NextResponse.json({ success: true, data: signatures });
    } catch (error) {
        console.error("Signatures fetch error:", error);
        return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) {
        return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }

    try {
        const { name, signature, workspaceId: rawWorkspaceId } = await req.json();
        if (!name || !signature) {
            return NextResponse.json({ success: false, error: "이름과 서명 내용은 필수입니다." }, { status: 400 });
        }
        const workspaceId = rawWorkspaceId == null ? null : Number(rawWorkspaceId);
        if (workspaceId !== null && !(await workspaceInOrg(user.orgId, workspaceId))) {
            return NextResponse.json({ success: false, error: "사업부를 찾을 수 없습니다." }, { status: 404 });
        }

        // 기본 서명은 사업부마다 하나 + 공통에 하나. 쓰일 기본 서명이 아직 없으면(사업부 서명은 공통 기본도 없을 때) 새 서명이 기본이 된다
        const existing = await db
            .select({ id: emailSignatures.id })
            .from(emailSignatures)
            .where(and(
                eq(emailSignatures.orgId, user.orgId),
                eq(emailSignatures.isDefault, true),
                workspaceId === null ? isNull(emailSignatures.workspaceId) : or(eq(emailSignatures.workspaceId, workspaceId), isNull(emailSignatures.workspaceId)),
            ))
            .limit(1);

        const isDefault = existing.length === 0;

        const [created] = await db
            .insert(emailSignatures)
            .values({
                orgId: user.orgId,
                workspaceId,
                name: name.trim(),
                signature: typeof signature === "string" ? signature : JSON.stringify(signature),
                isDefault,
            })
            .returning();

        return NextResponse.json({ success: true, data: created }, { status: 201 });
    } catch (error) {
        console.error("Signature create error:", error);
        return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
    }
}
