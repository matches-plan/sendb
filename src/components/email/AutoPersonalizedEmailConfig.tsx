"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAutoPersonalizedEmail, type AutoPersonalizedLink } from "@/hooks/useAutoPersonalizedEmail";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { AsyncAlertDialog, useAsyncConfirm } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, Plus, MoreHorizontal } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import AiAutoTestSendDialog from "./AiAutoTestSendDialog";
import AiFollowupTestDialog from "./AiFollowupTestDialog";
import { linkSenderPool } from "@/lib/email-sender-limit-rules";
import { useSenderProfiles } from "@/components/email/sender-profiles/hooks/useSenderProfiles";
import { splitKnownSenderIds } from "@/components/email/sender-profiles/utils/senderPool";
import { followupBadgeLabel } from "@/components/email/sender-profiles/utils/ruleSummary";
import { QueryErrorState } from "@/components/layouts/WorkspaceLayout";
import { workspaceLabel } from "@/lib/workspace-label";

interface AutoPersonalizedEmailConfigProps {
    partitions: Array<{ id: number; name: string; workspaceId: number }>;
    /** 화면 위 사업부 탭이 고른 사업부 (null: 전체). 주면 이 카드의 사업부 선택칸은 숨긴다 */
    workspaceId?: number | null;
}

export default function AutoPersonalizedEmailConfig({
    partitions,
    workspaceId,
}: AutoPersonalizedEmailConfigProps) {
    const router = useRouter();
    const [ownWorkspaceId, setSelectedWorkspaceId] = useState<number | "all">("all");
    const workspaceControlled = workspaceId !== undefined;
    const selectedWorkspaceId: number | "all" = workspaceControlled ? workspaceId ?? "all" : ownWorkspaceId;
    const [pickedPartitionId, setSelectedPartitionId] = useState<number | "all">("all");
    // 사업부를 바꾸면 그 사업부에 없는 파티션 선택은 '전체'로 본다
    const selectedPartitionId: number | "all" = pickedPartitionId !== "all" && selectedWorkspaceId !== "all"
        && !partitions.some((p) => p.id === pickedPartitionId && p.workspaceId === selectedWorkspaceId) ? "all" : pickedPartitionId;
    const [deleteTarget, setDeleteTarget] = useState<AutoPersonalizedLink | null>(null);
    // 활성 전환 요청 중인 규칙 — 같은 행 중복 조작을 막는다 (UX-148)
    const [pendingIds, setPendingIds] = useState<Set<number>>(() => new Set());
    const { confirm, confirmationDialog } = useAsyncConfirm();
    const [testTarget, setTestTarget] = useState<AutoPersonalizedLink | null>(null);
    const [followupTestTarget, setFollowupTestTarget] = useState<AutoPersonalizedLink | null>(null);

    // 워크스페이스 목록 추출
    const workspaces = Array.from(
        new Map(partitions.map((p) => [p.workspaceId, p.name.match(/^\[(.+?)\]/)?.[1] || `WS ${p.workspaceId}`])).entries()
    ).map(([id, name]) => ({ id, name }));
    const hasMultipleWorkspaces = workspaces.length > 1;

    // 워크스페이스 필터 적용된 파티션 목록
    const filteredPartitions = selectedWorkspaceId === "all"
        ? partitions
        : partitions.filter((p) => p.workspaceId === selectedWorkspaceId);

    const { links: allLinks, isLoading, createLink, updateLink, deleteLink, loadError, mutate } =
        useAutoPersonalizedEmail(selectedPartitionId);

    // 워크스페이스 필터 적용
    const filteredPartitionIds = new Set(filteredPartitions.map((p) => p.id));
    // 고쳐야 하는 규칙('수정 필요')을 맨 위로 — 켜진 규칙 아래에 묻혀 안 보였다
    const links = (selectedWorkspaceId === "all"
        ? allLinks
        : allLinks.filter((l) => l.partitionId && filteredPartitionIds.has(l.partitionId)))
        .slice()
        .sort((a, b) => (b.needsReview ?? 0) - (a.needsReview ?? 0) || b.isActive - a.isActive || a.id - b.id);
    // 복제할 때 지워진 발신 프로필을 묶음에서 빼려고 지금 프로필 목록을 본다
    const { profiles: senderProfiles, isLoading: senderProfilesLoading, loadFailed: senderProfilesLoadFailed } =
        useSenderProfiles();

    const handleCreate = () => {
        const params = selectedPartitionId !== "all" ? `?partitionId=${selectedPartitionId}` : "";
        router.push(`/email/ai-auto/new${params}`);
    };

    const handleEdit = (linkId: number, partId?: number) => {
        const pId = partId || (selectedPartitionId !== "all" ? selectedPartitionId : null);
        router.push(`/email/ai-auto/${linkId}?partitionId=${pId}`);
    };

    const handleDuplicate = async (link: AutoPersonalizedLink) => {
        const dupPartitionId = selectedPartitionId !== "all" ? selectedPartitionId : link.partitionId;
        if (!dupPartitionId) return;
        // 발신 주소 묶음도 복제한다. 묶음 칸이 생기기 전 규칙은 senderProfileId 하나를 묶음으로 옮긴다.
        // 프로필을 지워도 규칙에는 id가 남는다 — 그대로 보내면 서버가 거절하므로 지금 있는 프로필만 남긴다.
        // 목록을 아직 못 읽었으면 거르지 않고 보낸다 (지워진 id가 있으면 서버가 이유를 알려 준다)
        const pool = linkSenderPool({
            senderProfileId: link.senderProfileId ?? null,
            senderProfileIds: link.senderProfileIds ?? null,
        });
        const canFilter = !senderProfilesLoading && !senderProfilesLoadFailed;
        const { kept, dropped } = canFilter
            ? splitKnownSenderIds(pool, senderProfiles.map((p) => p.id))
            : { kept: pool, dropped: [] as number[] };
        // 복제는 설정을 모두 그대로 옮기고 비활성으로만 바꾼다 (규칙명·CTA·서명·에셋·중복 방지·임시저장 포함)
        const result = await createLink({
            name: link.name ?? undefined,
            partitionId: dupPartitionId,
            productId: link.productId,
            ctaUrl: link.ctaUrl ?? undefined,
            recipientField: link.recipientField,
            companyField: link.companyField,
            prompt: link.prompt ?? undefined,
            tone: link.tone ?? undefined,
            model: link.model ?? undefined,
            format: link.format,
            triggerType: link.triggerType as "on_create" | "on_update",
            triggerCondition: link.triggerCondition?.field ? link.triggerCondition as { field: string; operator: string; value: string } : null,
            autoResearch: link.autoResearch,
            useSignaturePersona: link.useSignaturePersona,
            useUnsubscribe: link.useUnsubscribe,
            followupConfig: link.followupConfig ?? undefined,
            preventDuplicate: link.preventDuplicate,
            senderProfileIds: kept,
            signatureId: link.signatureId,
            assetIds: link.assetIds ?? undefined,
            isDraft: link.isDraft ?? 0,
            isActive: 0,
        });
        if (!result.success) {
            toast.error(result.error || "복제에 실패했습니다.");
            return;
        }
        if (dropped.length === 0) {
            toast.success("규칙이 복제되었습니다. (비활성 상태)");
        } else {
            // 묶음이 줄었거나 기본 발신 프로필로 바뀐 것을 알린다 — 켜기 전에 확인하게
            toast.success(
                `규칙이 복제되었습니다. (비활성 상태) 삭제된 발신 프로필 ${dropped.length}개는 빼고 복제했습니다` +
                (kept.length === 0 ? " — 기본 발신 프로필로 보냅니다." : ".")
            );
        }
    };

    // 서버 거부·응답 유실을 모두 안내한다. 진행 중 문구 실험이 걸리면 확인 후 다시 보낸다 (UX-148·165)
    const handleToggleActive = async (link: AutoPersonalizedLink) => {
        if (pendingIds.has(link.id)) return;
        const nextActive = link.isActive === 1 ? 0 : 1;
        const doneLabel = nextActive ? "활성화되었습니다." : "자동 발송을 중지했습니다.";
        // 켜진 규칙이 없어진 파티션의 대기 메일은 닫지 않고 보류한다 — 다시 켜면 원래 순서대로 나간다 (UX-228)
        const notifyQueueWaiting = (waiting: unknown) => {
            if (Number(waiting) > 0) {
                toast.info(`대기 중인 메일 ${Number(waiting).toLocaleString("ko-KR")}통은 보류됩니다. 규칙을 다시 켜면 이어서 보냅니다.`);
            }
        };
        setPendingIds((prev) => new Set(prev).add(link.id));
        try {
            const result = await updateLink(link.id, { isActive: nextActive });
            if (result?.code === "experiment_impact") {
                confirm({
                    title: nextActive ? "규칙을 켤까요?" : "규칙을 중지할까요?",
                    description: "이 규칙에 진행 중인 문구 실험이 있어, 바꾸면 다음 발송 준비 때 실험이 무효화되고 이미 배정된 미발송 메일은 실험을 종료할 때까지 보류됩니다.",
                    confirmLabel: nextActive ? "켜기" : "중지",
                    onConfirm: async () => {
                        const confirmed = await updateLink(link.id, { isActive: nextActive, confirmExperimentImpact: true })
                            .catch(() => ({ success: false, error: "결과를 확인하지 못했습니다. 목록을 새로고침해 상태를 확인해주세요." }));
                        if (!confirmed.success) throw new Error(confirmed.error || "변경에 실패했습니다.");
                        toast.success(doneLabel);
                        notifyQueueWaiting((confirmed as { queueWaiting?: unknown }).queueWaiting);
                    },
                });
            } else if (result?.success) {
                toast.success(doneLabel);
                notifyQueueWaiting(result.queueWaiting);
            } else {
                toast.error(result?.error || (nextActive ? "활성화에 실패했습니다." : "중지에 실패했습니다. 자동 발송이 계속될 수 있습니다."));
            }
        } catch {
            toast.error("결과를 확인하지 못했습니다. 목록을 새로고침해 실제 상태를 확인해주세요.");
            void mutate();
        } finally {
            setPendingIds((prev) => {
                const next = new Set(prev);
                next.delete(link.id);
                return next;
            });
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        let result;
        try {
            result = await deleteLink(deleteTarget.id);
        } catch {
            throw new Error("삭제 결과를 확인하지 못했습니다. 목록을 새로고침해 확인해주세요.");
        }
        if (!result?.success) throw new Error(result?.error || "삭제에 실패했습니다.");
        toast.success("규칙이 삭제되었습니다.");
    };

    if (loadError) return <QueryErrorState error={loadError} onRetry={() => mutate()} />;

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="whitespace-nowrap">AI 개인화 이메일 자동 발송</CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                        {hasMultipleWorkspaces && !workspaceControlled && (
                            <Select
                                value={String(selectedWorkspaceId)}
                                onValueChange={(v) => {
                                    setSelectedWorkspaceId(v === "all" ? "all" : Number(v));
                                    setSelectedPartitionId("all");
                                }}
                            >
                                <SelectTrigger className="w-full sm:w-45">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">전체 워크스페이스</SelectItem>
                                    {workspaces.map((ws) => (
                                        <SelectItem key={ws.id} value={ws.id.toString()}>
                                            {workspaceLabel(ws)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        <Select
                            value={String(selectedPartitionId)}
                            onValueChange={(v) => setSelectedPartitionId(v === "all" ? "all" : Number(v))}
                        >
                            <SelectTrigger className="w-full sm:w-45">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">전체 파티션</SelectItem>
                                {filteredPartitions.map((p) => (
                                    <SelectItem key={p.id} value={p.id.toString()}>
                                        {p.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button size="sm" onClick={handleCreate} className="shrink-0">
                            <Plus className="h-4 w-4 mr-1" />
                            규칙 추가
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : links.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                        등록된 자동 발송 규칙이 없습니다.
                    </p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>제목</TableHead>
                                <TableHead>파티션</TableHead>
                                <TableHead className="w-20">사용</TableHead>
                                <TableHead className="w-12" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {links.map((link) => (
                                <TableRow
                                    key={link.id}
                                    className="cursor-pointer"
                                    onClick={() => handleEdit(link.id, link.partitionId)}
                                >
                                    <TableCell className="max-w-0 w-full">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <span className="truncate font-medium">{link.name || link.productName || "이름 없음"}</span>
                                            {link.needsReview === 1 && (
                                                <Badge variant="outline" className="shrink-0 border-red-300 text-red-700 bg-red-50">수정 필요</Badge>
                                            )}
                                            {link.abTestActive && (
                                                <Badge variant="outline" className="shrink-0 border-violet-300 text-violet-700 bg-violet-50">AB 테스트</Badge>
                                            )}
                                            {link.isDraft === 1 && (
                                                <Badge variant="outline" className="shrink-0 border-amber-400 text-amber-700 bg-amber-50">임시저장</Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap text-muted-foreground">
                                        {(link as unknown as { partitionName?: string }).partitionName
                                            || partitions.find((p) => p.id === link.partitionId)?.name || "—"}
                                    </TableCell>
                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                        <Switch
                                            checked={link.isActive === 1}
                                            onCheckedChange={() => handleToggleActive(link)}
                                            disabled={link.isDraft === 1 || pendingIds.has(link.id)}
                                            aria-label={link.isActive === 1 ? "자동 발송 중지" : "자동 발송 켜기"}
                                        />
                                    </TableCell>
                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" aria-label="더보기">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onSelect={() => setTestTarget(link)}>테스트 발송</DropdownMenuItem>
                                                {followupBadgeLabel(link.followupConfig) && (
                                                    <DropdownMenuItem onSelect={() => setFollowupTestTarget(link)}>후속 메일 테스트</DropdownMenuItem>
                                                )}
                                                <DropdownMenuItem onSelect={() => handleDuplicate(link)}>복제</DropdownMenuItem>
                                                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(link)}>삭제</DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>

            {/* 삭제 확인 */}
            {/* 실패하면 창을 닫지 않고 오류를 보여준다 (UX-148) */}
            <AsyncAlertDialog
                open={!!deleteTarget}
                onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
                title="규칙 삭제"
                description="이 자동 발송 규칙을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다."
                onConfirm={handleDelete}
            />
            {confirmationDialog}

            {/* 테스트 발송 */}
            {testTarget && (
                <AiAutoTestSendDialog
                    open={!!testTarget}
                    onOpenChange={(open) => !open && setTestTarget(null)}
                    linkId={testTarget.id}
                    linkName={testTarget.productName || "제품 미지정"}
                    recipientField={testTarget.recipientField}
                    companyField={testTarget.companyField}
                />
            )}

            {/* 후속 메일 테스트 */}
            {followupTestTarget && (
                <AiFollowupTestDialog
                    open={!!followupTestTarget}
                    onOpenChange={(open) => !open && setFollowupTestTarget(null)}
                    linkId={followupTestTarget.id}
                    linkName={followupTestTarget.name || followupTestTarget.productName || "제품 미지정"}
                />
            )}
        </Card>
    );
}
