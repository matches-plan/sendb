import { NextRequest, NextResponse } from "next/server";
import { db, emailTemplateLinks, emailTemplates, partitions, workspaces } from "@/lib/db";
import { eq, and, type SQL } from "drizzle-orm";
import { getActiveUserFromNextRequest } from "@/lib/auth";
import { resolveRuleSenderPool } from "@/lib/email-sender-resolver";
import { checkLinkTemplatesOwned } from "@/lib/email-template-ownership";

export async function GET(req: NextRequest) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) {
        return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }

    try {
        const partitionIdParam = req.nextUrl.searchParams.get("partitionId");
        const partitionId = partitionIdParam ? Number(partitionIdParam) : null;
        // 규칙은 본 템플릿의 용도(콜드메일/CRM 이메일)를 따른다
        const purposeParam = req.nextUrl.searchParams.get("purpose");
        const purposeCondition: SQL | undefined = purposeParam === "cold" || purposeParam === "crm"
            ? eq(emailTemplates.purpose, purposeParam) : undefined;

        if (partitionId) {
            // 특정 파티션
            const [partition] = await db
                .select()
                .from(partitions)
                .innerJoin(workspaces, eq(workspaces.id, partitions.workspaceId))
                .where(and(eq(partitions.id, partitionId), eq(workspaces.orgId, user.orgId)))
                .limit(1);

            if (!partition) {
                return NextResponse.json({ success: false, error: "파티션을 찾을 수 없습니다." }, { status: 404 });
            }

            const rows = await db
                .select({ link: emailTemplateLinks })
                .from(emailTemplateLinks)
                .innerJoin(emailTemplates, eq(emailTemplates.id, emailTemplateLinks.emailTemplateId))
                .where(and(eq(emailTemplateLinks.partitionId, partitionId), purposeCondition));

            return NextResponse.json({ success: true, data: rows.map((r) => r.link) });
        }

        // 전체 조회
        const rows = await db
            .select({
                link: emailTemplateLinks,
                partitionName: partitions.name,
            })
            .from(emailTemplateLinks)
            .innerJoin(partitions, eq(partitions.id, emailTemplateLinks.partitionId))
            .innerJoin(workspaces, eq(workspaces.id, partitions.workspaceId))
            .innerJoin(emailTemplates, eq(emailTemplates.id, emailTemplateLinks.emailTemplateId))
            .where(and(eq(workspaces.orgId, user.orgId), purposeCondition));

        const links = rows.map((r) => ({ ...r.link, partitionName: r.partitionName }));

        return NextResponse.json({ success: true, data: links });
    } catch (error) {
        console.error("Email template links fetch error:", error);
        return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) {
        return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }

    try {
        const {
            partitionId,
            name,
            emailTemplateId,
            recipientField,
            variableMappings,
            triggerType = "manual",
            triggerCondition,
            repeatConfig,
            followupConfig,
            preventDuplicate = 0,
            senderProfileId,
            senderProfileIds,
        } = await req.json();

        if (!partitionId || !name || !emailTemplateId || !recipientField) {
            return NextResponse.json({
                success: false,
                error: "partitionId, name, emailTemplateId, recipientField는 필수입니다.",
            }, { status: 400 });
        }

        // 소유권 확인
        const [partition] = await db
            .select()
            .from(partitions)
            .innerJoin(workspaces, eq(workspaces.id, partitions.workspaceId))
            .where(and(eq(partitions.id, partitionId), eq(workspaces.orgId, user.orgId)))
            .limit(1);

        if (!partition) {
            return NextResponse.json({ success: false, error: "파티션을 찾을 수 없습니다." }, { status: 404 });
        }

        // 첫 메일·후속 템플릿이 이 조직 것인지 — 남의 템플릿 id를 넣은 규칙으로 그 내용을 받아 보지 못하게
        const templates = await checkLinkTemplatesOwned(user.orgId, { emailTemplateId, followupConfig });
        if (!templates.ok) {
            return NextResponse.json({ success: false, error: templates.error }, { status: 400 });
        }

        const senderPool = await resolveRuleSenderPool(user.orgId, { senderProfileId, senderProfileIds });
        if (!senderPool.ok) {
            return NextResponse.json({ success: false, error: senderPool.error }, { status: 400 });
        }

        const [created] = await db
            .insert(emailTemplateLinks)
            .values({
                partitionId,
                name,
                emailTemplateId,
                recipientField,
                variableMappings: variableMappings || null,
                triggerType,
                triggerCondition: triggerCondition || null,
                repeatConfig: repeatConfig || null,
                // 수동 발송은 후속 큐를 만들지 않는다 — 나가지 않을 후속 설정을 저장하지 않는다 (UX-229)
                followupConfig: triggerType === "manual" ? null : followupConfig || null,
                preventDuplicate: preventDuplicate ? 1 : 0,
                createdBy: user.userId,
                ...senderPool.value,
            })
            .returning();

        return NextResponse.json({ success: true, data: created }, { status: 201 });
    } catch (error) {
        console.error("Email template link create error:", error);
        return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
    }
}
