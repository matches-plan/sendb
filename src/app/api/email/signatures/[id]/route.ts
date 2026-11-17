import { NextRequest, NextResponse } from "next/server";
import { db, emailSignatures } from "@/lib/db";
import { eq, and, ne, isNull } from "drizzle-orm";
import { getActiveUserFromNextRequest } from "@/lib/auth";
import { workspaceInOrg } from "@/lib/workspace-in-org";

/** 기본 서명 범위 — 사업부마다 하나, 공통(null)에 하나 */
function inScope(orgId: string, workspaceId: number | null) {
    return and(
        eq(emailSignatures.orgId, orgId),
        workspaceId === null ? isNull(emailSignatures.workspaceId) : eq(emailSignatures.workspaceId, workspaceId),
    );
}

/** 범위에 기본 서명이 없게 됐으면 그 범위에서 가장 먼저 만든 서명을 기본으로 */
async function promoteFirstInScope(orgId: string, workspaceId: number | null) {
    const [first] = await db
        .select({ id: emailSignatures.id })
        .from(emailSignatures)
        .where(inScope(orgId, workspaceId))
        .orderBy(emailSignatures.createdAt)
        .limit(1);
    if (first) {
        await db.update(emailSignatures).set({ isDefault: true, updatedAt: new Date() }).where(eq(emailSignatures.id, first.id));
    }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) {
        return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }

    try {
        const { id } = await params;
        const sigId = parseInt(id);
        const { name, signature, isDefault, workspaceId: rawWorkspaceId } = await req.json();
        // workspaceId: 숫자면 그 사업부로, null이면 공통으로, 없으면 그대로
        const workspaceId = rawWorkspaceId === undefined ? undefined : rawWorkspaceId === null ? null : Number(rawWorkspaceId);
        if (typeof workspaceId === "number" && !(await workspaceInOrg(user.orgId, workspaceId))) {
            return NextResponse.json({ success: false, error: "사업부를 찾을 수 없습니다." }, { status: 404 });
        }

        const [existing] = await db
            .select()
            .from(emailSignatures)
            .where(and(
                eq(emailSignatures.id, sigId),
                eq(emailSignatures.orgId, user.orgId)
            ));

        if (!existing) {
            return NextResponse.json({ success: false, error: "서명을 찾을 수 없습니다." }, { status: 404 });
        }

        // 기본 서명은 범위(사업부 또는 공통)마다 하나
        const nextScope = workspaceId === undefined ? existing.workspaceId : workspaceId;
        const scopeChanged = nextScope !== existing.workspaceId;
        let nextDefault: boolean | undefined = isDefault === undefined ? undefined : Boolean(isDefault);
        if (nextDefault === undefined && scopeChanged && existing.isDefault) {
            // 기본 서명을 다른 범위로 옮기면, 그 범위에 기본이 없을 때만 기본으로 남는다
            const [other] = await db
                .select({ id: emailSignatures.id })
                .from(emailSignatures)
                .where(and(inScope(user.orgId, nextScope), eq(emailSignatures.isDefault, true)))
                .limit(1);
            nextDefault = !other;
        }

        if (nextDefault) {
            await db
                .update(emailSignatures)
                .set({ isDefault: false, updatedAt: new Date() })
                .where(and(inScope(user.orgId, nextScope), ne(emailSignatures.id, sigId)));
        }

        const sigValue = signature !== undefined
            ? (typeof signature === "string" ? signature : JSON.stringify(signature))
            : undefined;

        const [updated] = await db
            .update(emailSignatures)
            .set({
                ...(name !== undefined && { name: name.trim() }),
                ...(sigValue !== undefined && { signature: sigValue }),
                ...(nextDefault !== undefined && { isDefault: nextDefault }),
                ...(workspaceId !== undefined && { workspaceId }),
                updatedAt: new Date(),
            })
            .where(eq(emailSignatures.id, sigId))
            .returning();

        // 옮겨 간 기본 서명 자리는 원래 범위에서 채운다
        if (scopeChanged && existing.isDefault) await promoteFirstInScope(user.orgId, existing.workspaceId);

        return NextResponse.json({ success: true, data: updated });
    } catch (error) {
        console.error("Signature update error:", error);
        return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) {
        return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }

    try {
        const { id } = await params;
        const sigId = parseInt(id);

        const [existing] = await db
            .select()
            .from(emailSignatures)
            .where(and(
                eq(emailSignatures.id, sigId),
                eq(emailSignatures.orgId, user.orgId)
            ));

        if (!existing) {
            return NextResponse.json({ success: false, error: "서명을 찾을 수 없습니다." }, { status: 404 });
        }

        await db.delete(emailSignatures).where(eq(emailSignatures.id, sigId));

        // 삭제한 게 기본이었으면 같은 범위(사업부 또는 공통)에서 가장 먼저 만든 서명을 기본으로
        if (existing.isDefault) await promoteFirstInScope(user.orgId, existing.workspaceId);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Signature delete error:", error);
        return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
    }
}
