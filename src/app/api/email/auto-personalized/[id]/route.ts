import { NextRequest, NextResponse } from "next/server";
import { db, emailAutoPersonalizedLinks, emailCopyExperiments, emailSendQueue, emailTemplateLinks, products, partitions, workspaces } from "@/lib/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { reviveOrphanHeldRows } from "@/lib/partition-hold";
import { wakeSendQueue } from "@/lib/email-send-queue";
import { getActiveUserFromNextRequest } from "@/lib/auth";
import { resolveRuleSenderPool } from "@/lib/email-sender-resolver";
import { fingerprint } from "@/lib/ai-copy/rules";
import { ruleSnapshotOf } from "@/lib/email-experiments/repository";
import { ACTIVE_EXPERIMENT_STATES } from "@/lib/email-experiments/rules";

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) {
        return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }

    try {
        const { id } = await params;
        const linkId = Number(id);

        // 소유권 확인
        const [existing] = await db
            .select()
            .from(emailAutoPersonalizedLinks)
            .where(and(eq(emailAutoPersonalizedLinks.id, linkId), eq(emailAutoPersonalizedLinks.orgId, user.orgId)))
            .limit(1);

        if (!existing) {
            return NextResponse.json({ success: false, error: "규칙을 찾을 수 없습니다." }, { status: 404 });
        }

        const body = await req.json();
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
            format,
            triggerType,
            triggerCondition,
            autoResearch,
            useSignaturePersona,
            useUnsubscribe,
            isActive,
            isDraft,
            followupConfig,
            preventDuplicate,
            weekdayMorningOnly,
            senderProfileId,
            senderProfileIds,
            signatureId,
            assetIds,
        } = body;

        // 제품 변경 시 소유권 확인
        if (productId !== undefined && productId !== null) {
            const [product] = await db
                .select()
                .from(products)
                .where(and(eq(products.id, productId), eq(products.orgId, user.orgId)))
                .limit(1);
            if (!product) {
                return NextResponse.json({ success: false, error: "제품을 찾을 수 없습니다." }, { status: 404 });
            }
        }

        // 파티션 변경 시 소유권 확인 (워크스페이스 → 조직)
        if (partitionId !== undefined && partitionId !== existing.partitionId) {
            const [access] = await db
                .select({ partitionId: partitions.id })
                .from(partitions)
                .innerJoin(workspaces, eq(partitions.workspaceId, workspaces.id))
                .where(and(eq(partitions.id, Number(partitionId)), eq(workspaces.orgId, user.orgId)))
                .limit(1);
            if (!access) {
                return NextResponse.json({ success: false, error: "파티션을 찾을 수 없습니다." }, { status: 404 });
            }
        }

        // 발신 주소 묶음: 이 조직 주소인지 확인하고 두 칸을 같이 맞춘다. 둘 다 안 오면 건드리지 않는다
        const senderPool = await resolveRuleSenderPool(user.orgId, { senderProfileId, senderProfileIds });
        if (!senderPool.ok) {
            return NextResponse.json({ success: false, error: senderPool.error }, { status: 400 });
        }

        const updateData: Record<string, unknown> = { updatedAt: new Date() };
        if (weekdayMorningOnly !== undefined && typeof weekdayMorningOnly !== "boolean") {
            return NextResponse.json({ success: false, error: "오전 발송 설정을 확인해 주세요." }, { status: 400 });
        }
        if (triggerType === "on_update") updateData.weekdayMorningOnly = false;
        else if (weekdayMorningOnly !== undefined) updateData.weekdayMorningOnly = (triggerType ?? existing.triggerType) === "on_create" && weekdayMorningOnly;
        if (name !== undefined) updateData.name = name || null;
        if (partitionId !== undefined) updateData.partitionId = Number(partitionId);
        if (productId !== undefined) updateData.productId = productId;
        if (recipientField !== undefined) updateData.recipientField = recipientField;
        if (companyField !== undefined) updateData.companyField = companyField;
        if (ctaUrl !== undefined) updateData.ctaUrl = ctaUrl || null;
        if (prompt !== undefined) updateData.prompt = prompt || null;
        // 옮겨 온 고정 문구를 사람이 AI 방식으로 고치면 '수정 필요'가 없어진다
        if (prompt !== undefined && existing.needsReview === 1 && (prompt || null) !== existing.prompt) updateData.needsReview = 0;
        if (tone !== undefined) updateData.tone = tone || null;
        if (model !== undefined) updateData.model = model || null;
        if (format !== undefined) updateData.format = format || "plain";
        if (triggerType !== undefined) updateData.triggerType = triggerType;
        if (triggerCondition !== undefined) updateData.triggerCondition = triggerCondition || null;
        if (autoResearch !== undefined) updateData.autoResearch = autoResearch;
        if (useSignaturePersona !== undefined) updateData.useSignaturePersona = useSignaturePersona;
        if (useUnsubscribe !== undefined) updateData.useUnsubscribe = useUnsubscribe;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (isDraft !== undefined) {
            updateData.isDraft = isDraft ? 1 : 0;
            // draft 전환 시 자동 비활성화, 기존 draft를 해제할 때만 기본 활성화. 일반 편집은 기존 활성 상태 유지
            if (isDraft) updateData.isActive = 0;
            else if (isActive === undefined && existing.isDraft === 1) updateData.isActive = 1;
        }
        if (followupConfig !== undefined) updateData.followupConfig = followupConfig;
        if (preventDuplicate !== undefined) updateData.preventDuplicate = preventDuplicate ? 1 : 0;
        if (senderPool.value) {
            updateData.senderProfileId = senderPool.value.senderProfileId;
            updateData.senderProfileIds = senderPool.value.senderProfileIds;
        }
        if (signatureId !== undefined) updateData.signatureId = signatureId || null;
        if (assetIds !== undefined) updateData.assetIds = Array.isArray(assetIds) && assetIds.length > 0 ? assetIds : null;

        // 진행 중 문구 실험이 비교하는 규칙 항목이 바뀌면 다음 발송 준비 때 실험이 무효화되고 배정 메일이 보류된다.
        // 실행 경로와 같은 ruleSnapshotOf·fingerprint로 판정하고, 사용자가 확인하기 전에는 저장하지 않는다 (UX-165)
        if (body.confirmExperimentImpact !== true
            && fingerprint(ruleSnapshotOf(existing)) !== fingerprint(ruleSnapshotOf({ ...existing, ...updateData }))) {
            const experiments = await db
                .select({ id: emailCopyExperiments.id, name: emailCopyExperiments.name, state: emailCopyExperiments.state })
                .from(emailCopyExperiments)
                .where(and(
                    eq(emailCopyExperiments.orgId, user.orgId),
                    eq(emailCopyExperiments.ruleId, linkId),
                    inArray(emailCopyExperiments.state, ACTIVE_EXPERIMENT_STATES),
                    // AB 테스트(지시사항 비교)는 A·B 지시사항을 따로 담아 두고 저장 때 새로 맞추므로 막지 않는다
                    sql`coalesce(${emailCopyExperiments.config}->>'kind', 'policy') <> 'prompt'`,
                ));
            if (experiments.length > 0) {
                return NextResponse.json({
                    success: false,
                    code: "experiment_impact",
                    error: "진행 중인 문구 실험의 비교 조건이 바뀝니다. 확인 후 다시 저장해주세요.",
                    experiments,
                }, { status: 409 });
            }
        }

        const [updated] = await db
            .update(emailAutoPersonalizedLinks)
            .set(updateData)
            .where(eq(emailAutoPersonalizedLinks.id, linkId))
            .returning();

        // 고정 본문 규칙에서 옮겨 온 규칙을 켜면 원래 템플릿 규칙은 끈다 — 같은 사람에게 두 규칙이 같이 나가지 않게
        if (updated && updated.isActive === 1 && existing.isActive !== 1 && updated.sourceTemplateLinkId) {
            await db.update(emailTemplateLinks).set({ isActive: 0, updatedAt: new Date() })
                .where(eq(emailTemplateLinks.id, updated.sourceTemplateLinkId));
        }

        // 켜지는 규칙: 꺼 둔 동안 held로 둔 대기 줄을 되살려 원래 순서대로 이어 보낸다 (UX-228).
        // 실패해도 저장은 끝났다 — 워커가 회차 첫머리에 같은 조건으로 되살린다
        if (updated && updated.isActive === 1 && existing.isActive !== 1) {
            try {
                const revived = await reviveOrphanHeldRows("send_queue", {
                    scope: { orgId: user.orgId, partitionId: updated.partitionId },
                });
                if (revived > 0) wakeSendQueue();
            } catch (error) {
                console.error("[auto-personalized] 규칙 켜기 후 대기 줄 되살리기 실패 — 다음 회차에 되살림:", error);
            }
        }

        // 꺼지는 규칙: 같은 파티션·트리거에 켜진 규칙이 더 없으면 대기 줄 수를 알려 준다 — 그 줄은 다시 켤 때까지 보류된다 (UX-228)
        let queueWaiting = 0;
        if (updated && updated.isActive !== 1 && existing.isActive === 1) {
            const [stillActive] = await db
                .select({ id: emailAutoPersonalizedLinks.id })
                .from(emailAutoPersonalizedLinks)
                .where(
                    and(
                        eq(emailAutoPersonalizedLinks.partitionId, updated.partitionId),
                        eq(emailAutoPersonalizedLinks.triggerType, updated.triggerType),
                        eq(emailAutoPersonalizedLinks.isActive, 1)
                    )
                )
                .limit(1);
            if (!stillActive) {
                const [row] = await db
                    .select({ count: sql<number>`count(*)::int` })
                    .from(emailSendQueue)
                    .where(
                        and(
                            eq(emailSendQueue.orgId, user.orgId),
                            eq(emailSendQueue.partitionId, updated.partitionId),
                            eq(emailSendQueue.triggerType, updated.triggerType),
                            inArray(emailSendQueue.status, ["pending", "processing", "held"])
                        )
                    );
                queueWaiting = Number(row?.count) || 0;
            }
        }

        return NextResponse.json({ success: true, data: updated, ...(queueWaiting > 0 ? { queueWaiting } : {}) });
    } catch (error) {
        console.error("Auto personalized link update error:", error);
        return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) {
        return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }

    try {
        const { id } = await params;
        const linkId = Number(id);

        // 소유권 확인
        const [existing] = await db
            .select()
            .from(emailAutoPersonalizedLinks)
            .where(and(eq(emailAutoPersonalizedLinks.id, linkId), eq(emailAutoPersonalizedLinks.orgId, user.orgId)))
            .limit(1);

        if (!existing) {
            return NextResponse.json({ success: false, error: "규칙을 찾을 수 없습니다." }, { status: 404 });
        }

        await db
            .delete(emailAutoPersonalizedLinks)
            .where(eq(emailAutoPersonalizedLinks.id, linkId));

        return NextResponse.json({ success: true, message: "규칙이 삭제되었습니다." });
    } catch (error) {
        console.error("Auto personalized link delete error:", error);
        return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
    }
}
