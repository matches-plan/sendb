import { NextRequest, NextResponse } from "next/server";
import { db, emailAutoPersonalizedLinks, emailTemplateLinks, partitions, workspaces, products } from "@/lib/db";
import { eq, and, sql } from "drizzle-orm";
import { getActiveUserFromNextRequest } from "@/lib/auth";
import { resolveRuleSenderPool } from "@/lib/email-sender-resolver";

export async function GET(req: NextRequest) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) {
        return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }

    try {
        const partitionIdParam = req.nextUrl.searchParams.get("partitionId");
        const partitionId = partitionIdParam ? Number(partitionIdParam) : null;

        const selectFields = {
            id: emailAutoPersonalizedLinks.id,
            orgId: emailAutoPersonalizedLinks.orgId,
            name: emailAutoPersonalizedLinks.name,
            partitionId: emailAutoPersonalizedLinks.partitionId,
            productId: emailAutoPersonalizedLinks.productId,
            productName: products.name,
            recipientField: emailAutoPersonalizedLinks.recipientField,
            companyField: emailAutoPersonalizedLinks.companyField,
            ctaUrl: emailAutoPersonalizedLinks.ctaUrl,
            prompt: emailAutoPersonalizedLinks.prompt,
            tone: emailAutoPersonalizedLinks.tone,
            model: emailAutoPersonalizedLinks.model,
            format: emailAutoPersonalizedLinks.format,
            triggerType: emailAutoPersonalizedLinks.triggerType,
            triggerCondition: emailAutoPersonalizedLinks.triggerCondition,
            autoResearch: emailAutoPersonalizedLinks.autoResearch,
            useSignaturePersona: emailAutoPersonalizedLinks.useSignaturePersona,
            useUnsubscribe: emailAutoPersonalizedLinks.useUnsubscribe,
            followupConfig: emailAutoPersonalizedLinks.followupConfig,
            senderProfileId: emailAutoPersonalizedLinks.senderProfileId,
            senderProfileIds: emailAutoPersonalizedLinks.senderProfileIds,
            signatureId: emailAutoPersonalizedLinks.signatureId,
            assetIds: emailAutoPersonalizedLinks.assetIds,
            preventDuplicate: emailAutoPersonalizedLinks.preventDuplicate,
            weekdayMorningOnly: emailAutoPersonalizedLinks.weekdayMorningOnly,
            isActive: emailAutoPersonalizedLinks.isActive,
            isDraft: emailAutoPersonalizedLinks.isDraft,
            needsReview: emailAutoPersonalizedLinks.needsReview,
            // 진행 중인 AB 테스트(사람이 켠 지시사항 비교 또는 자동 준비 실험)가 있는가 — 목록의 'AB 테스트' 표시
            abTestActive: sql<boolean>`EXISTS (SELECT 1 FROM email_copy_experiments e WHERE e.rule_id = ${emailAutoPersonalizedLinks.id}
                AND e.org_id = ${emailAutoPersonalizedLinks.orgId}
                AND e.state IN ('running','paused','enrollment_closed','observing','decision_ready','data_check','insufficient_sample'))`,
            // 옮겨 오기 전 고정 본문 규칙이 아직 켜져 있으면 그 규칙으로 계속 나간다
            sourceTemplateActive: sql<number | null>`(SELECT ${emailTemplateLinks.isActive} FROM ${emailTemplateLinks} WHERE ${emailTemplateLinks.id} = ${emailAutoPersonalizedLinks.sourceTemplateLinkId})`,
            createdAt: emailAutoPersonalizedLinks.createdAt,
            updatedAt: emailAutoPersonalizedLinks.updatedAt,
        };

        if (partitionId) {
            const [partition] = await db
                .select()
                .from(partitions)
                .innerJoin(workspaces, eq(workspaces.id, partitions.workspaceId))
                .where(and(eq(partitions.id, partitionId), eq(workspaces.orgId, user.orgId)))
                .limit(1);

            if (!partition) {
                return NextResponse.json({ success: false, error: "파티션을 찾을 수 없습니다." }, { status: 404 });
            }

            const links = await db
                .select(selectFields)
                .from(emailAutoPersonalizedLinks)
                .leftJoin(products, eq(products.id, emailAutoPersonalizedLinks.productId))
                .where(eq(emailAutoPersonalizedLinks.partitionId, partitionId));

            return NextResponse.json({ success: true, data: links });
        }

        // 전체 조회
        const links = await db
            .select({ ...selectFields, partitionName: partitions.name })
            .from(emailAutoPersonalizedLinks)
            .leftJoin(products, eq(products.id, emailAutoPersonalizedLinks.productId))
            .innerJoin(partitions, eq(partitions.id, emailAutoPersonalizedLinks.partitionId))
            .innerJoin(workspaces, eq(workspaces.id, partitions.workspaceId))
            .where(eq(workspaces.orgId, user.orgId));

        return NextResponse.json({ success: true, data: links });
    } catch (error) {
        console.error("Auto personalized links fetch error:", error);
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
            name,
            partitionId,
            productId,
            recipientField,
            companyField,
            ctaUrl,
            prompt,
            tone,
            model,
            format = "plain",
            triggerType = "on_create",
            triggerCondition,
            autoResearch = 1,
            useSignaturePersona = 0,
            useUnsubscribe = 0,
            followupConfig,
            isActive,
            isDraft,
            preventDuplicate = 0,
            weekdayMorningOnly = false,
            senderProfileId,
            senderProfileIds,
            signatureId,
            assetIds,
        } = await req.json();

        const isDraftFlag = isDraft ? 1 : 0;
        if (typeof weekdayMorningOnly !== "boolean") {
            return NextResponse.json({ success: false, error: "오전 발송 설정을 확인해 주세요." }, { status: 400 });
        }

        if (!partitionId) {
            return NextResponse.json({
                success: false,
                error: "partitionId는 필수입니다.",
            }, { status: 400 });
        }

        // draft가 아닐 때만 필수 필드 검증
        if (!isDraftFlag && (!recipientField || !companyField)) {
            return NextResponse.json({
                success: false,
                error: "recipientField, companyField는 필수입니다.",
            }, { status: 400 });
        }

        // 파티션 소유권 확인
        const [partition] = await db
            .select()
            .from(partitions)
            .innerJoin(workspaces, eq(workspaces.id, partitions.workspaceId))
            .where(and(eq(partitions.id, partitionId), eq(workspaces.orgId, user.orgId)))
            .limit(1);

        if (!partition) {
            return NextResponse.json({ success: false, error: "파티션을 찾을 수 없습니다." }, { status: 404 });
        }

        // 제품 소유권 확인
        if (productId) {
            const [product] = await db
                .select()
                .from(products)
                .where(and(eq(products.id, productId), eq(products.orgId, user.orgId)))
                .limit(1);
            if (!product) {
                return NextResponse.json({ success: false, error: "제품을 찾을 수 없습니다." }, { status: 404 });
            }
        }

        // 발신 주소 묶음: 이 조직 주소인지 확인하고 senderProfileId를 묶음의 첫 주소로 맞춘다
        const senderPool = await resolveRuleSenderPool(user.orgId, { senderProfileId, senderProfileIds });
        if (!senderPool.ok) {
            return NextResponse.json({ success: false, error: senderPool.error }, { status: 400 });
        }

        const [created] = await db
            .insert(emailAutoPersonalizedLinks)
            .values({
                orgId: user.orgId,
                name: name || null,
                partitionId,
                productId: productId || null,
                recipientField: recipientField || "",
                companyField: companyField || "",
                ctaUrl: ctaUrl || null,
                prompt: prompt || null,
                tone: tone || null,
                model: model || null,
                format: format || "plain",
                triggerType,
                triggerCondition: triggerCondition || null,
                autoResearch: autoResearch ?? 1,
                useSignaturePersona: useSignaturePersona ?? 0,
                useUnsubscribe: useUnsubscribe ?? 0,
                followupConfig: followupConfig || null,
                // draft는 자동으로 isActive=0
                isActive: isDraftFlag ? 0 : (isActive ?? 1),
                isDraft: isDraftFlag,
                preventDuplicate: preventDuplicate ? 1 : 0,
                weekdayMorningOnly: triggerType === "on_create" && weekdayMorningOnly,
                senderProfileId: senderPool.value?.senderProfileId ?? null,
                senderProfileIds: senderPool.value?.senderProfileIds ?? null,
                signatureId: signatureId || null,
                assetIds: Array.isArray(assetIds) && assetIds.length > 0 ? assetIds : null,
            })
            .returning();

        return NextResponse.json({ success: true, data: created }, { status: 201 });
    } catch (error) {
        console.error("Auto personalized link create error:", error);
        return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
    }
}
