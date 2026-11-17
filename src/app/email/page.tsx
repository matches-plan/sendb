"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import WorkspaceLayout, { QueryErrorState } from "@/components/layouts/WorkspaceLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Settings, Mail } from "lucide-react";
import EmailSendLogTable from "@/components/email/EmailSendLogTable";
import AutoPersonalizedEmailConfig from "@/components/email/AutoPersonalizedEmailConfig";
import RepliesTab from "@/components/email/replies/ui/RepliesTab";
import { useRepliesEnabled } from "@/components/email/replies/hooks/useRepliesEnabled";
import { useAllPartitionOptions } from "@/components/email/hooks/useAllPartitionOptions";
import { LeadWorkspaceTabs } from "@/components/leads/ui/LeadWorkspaceTabs";
import { useLeadgenWorkspaces } from "@/components/leadgen/hooks/useLeadgenWorkspaces";
import { useEmailConfig } from "@/hooks/useEmailConfig";
import { useSenderProfiles } from "@/hooks/useSenderProfiles";
import AiCopyManager from "@/components/ai-copy/ui/AiCopyManager";

function EmailPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const activeTab = searchParams.get("tab") || "ai-auto";
    // 위쪽 사업부 탭 — 주소(?ws=)에 남겨 새로고침·뒤로 가기에도 유지한다. 없으면 전체
    const workspaceId = Number(searchParams.get("ws")) || null;
    const emailHref = (tab: string, ws: number | null) => `/email?tab=${tab}${ws ? `&ws=${ws}` : ""}`;
    const setActiveTab = (tab: string) => {
        router.replace(emailHref(tab, workspaceId));
    };
    const setWorkspaceId = (ws: number | null) => router.replace(emailHref(activeTab, ws));
    // 발송 경고 알림에서 오면 ?health=<알림 id> — 발송 이력을 그 사건의 메일로 거른다
    const healthAlertId = Number(searchParams.get("health")) || null;
    // 발송 이력 "확인할 문제" 카드로 열면 ?hev=<사건 id> — 알림 안의 그 사건부터
    const healthEventId = Number(searchParams.get("hev")) || null;
    const workspaceTabs = useLeadgenWorkspaces();
    // 없앤 탭의 예전 주소: 고정 본문(템플릿)·에셋 → AI 콜드메일 설정, 후속 큐 → 발송 이력(줄을 펼쳐 후속을 본다)
    useEffect(() => {
        if (activeTab === "settings") { router.replace("/leadgen/settings"); return; }
        // 발송 상태는 리드젠 설정 › 발송 경고로 옮겼다 — 예전 탭 주소와 구글 챗 알림 링크(/email#send-health)도 그리로
        if (activeTab === "dashboard" || (!searchParams.get("tab") && window.location.hash === "#send-health")) {
            router.replace("/leadgen/settings?menu=health");
            return;
        }
        // AB테스트 결과는 리드젠통계 › AB 테스트로 옮겼다
        if (activeTab === "experiments") { router.replace("/leadgen/stats?view=ab"); return; }
        const moved: Record<string, string> = { templates: "ai-auto", links: "ai-auto", assets: "ai-auto", "followup-queue": "logs", "send-stats": "ai-auto" };
        if (moved[activeTab]) router.replace(`/email?tab=${moved[activeTab]}${workspaceId ? `&ws=${workspaceId}` : ""}`);
    }, [activeTab, router, workspaceId, searchParams]);

    const { config, isLoading: configLoading } = useEmailConfig();
    const { profiles, isLoading: profilesLoading } = useSenderProfiles();
    // 회신 탭은 회신 읽기 대상 조직에만 (대표 메일함 하나를 읽는다 — 다른 조직에는 보이지 않는다)
    const repliesEnabled = useRepliesEnabled();

    const isReady = !!config?.appKey && (profiles?.length ?? 0) > 0;
    const isSetupLoading = configLoading || profilesLoading;

    const { partitions, error: partitionsError, retry } = useAllPartitionOptions();

    if (partitionsError) {
        return <WorkspaceLayout><QueryErrorState error={partitionsError} onRetry={retry} /></WorkspaceLayout>;
    }

    return (
        <WorkspaceLayout>
            <div className="flex min-h-0 flex-1 flex-col">
            <LeadWorkspaceTabs
                value={workspaceId}
                onChange={setWorkspaceId}
                items={workspaceTabs.items}
                loading={workspaceTabs.isLoading}
                allTab={{ onSelect: () => setWorkspaceId(null) }}
                prefKey="email"
            />
            <div className="min-h-0 flex-1 overflow-y-auto px-8 py-4">
                {!isSetupLoading && !isReady && activeTab !== "ai-quality" ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <Card className="max-w-md w-full text-center">
                            <CardHeader>
                                <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-muted">
                                    <Mail className="size-6 text-muted-foreground" />
                                </div>
                                <CardTitle>이메일 설정이 필요합니다</CardTitle>
                                <CardDescription>
                                    {!config?.appKey
                                        ? "NHN Cloud Email API 키를 등록해주세요."
                                        : "발신자 프로필을 등록해주세요."}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button asChild>
                                    <Link href="/leadgen/settings">
                                        <Settings className="size-4 mr-2" />
                                        리드젠 설정으로 이동
                                    </Link>
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                ) : (
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <div className="overflow-x-auto">
                        <TabsList className="[&>button]:flex-none">
                            <TabsTrigger value="ai-auto">AI콜드메일 설정</TabsTrigger>
                            {/* AI 품질 탭은 숨긴다 (주소 ?tab=ai-quality로는 열린다) */}
                            {repliesEnabled && <TabsTrigger value="replies">회신</TabsTrigger>}
                            <TabsTrigger value="logs">발송 이력</TabsTrigger>
                        </TabsList>
                        </div>

                        <TabsContent value="ai-auto" className="mt-6">
                            <AutoPersonalizedEmailConfig partitions={partitions} workspaceId={workspaceId} />
                        </TabsContent>
                        <TabsContent value="ai-quality" className="mt-6">
                            <AiCopyManager />
                        </TabsContent>

                        {repliesEnabled && (
                            <TabsContent value="replies" className="mt-6">
                                <RepliesTab workspaceId={workspaceId} />
                            </TabsContent>
                        )}

                        <TabsContent value="logs" className="mt-6">
                            <EmailSendLogTable
                                workspaceId={workspaceId}
                                partitions={partitions}
                                healthAlertId={healthAlertId}
                                healthEventId={healthEventId}
                                onClearHealth={() => router.replace(emailHref("logs", workspaceId))}
                                onPickHealth={(p) => router.replace(`${emailHref("logs", workspaceId)}&health=${p.alertId}&hev=${p.eventId}`)}
                            />
                        </TabsContent>

                    </Tabs>
                )}
            </div>
            </div>
        </WorkspaceLayout>
    );
}

export default function EmailPage() {
    return (
        <Suspense>
            <EmailPageContent />
        </Suspense>
    );
}
