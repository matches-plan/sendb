"use client";

import { useRouter, useSearchParams } from "next/navigation";
import WorkspaceLayout, { QueryErrorState } from "@/components/layouts/WorkspaceLayout";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Mail } from "lucide-react";
import EmailTemplateList from "@/components/email/EmailTemplateList";
import EmailTemplateLinkList from "@/components/email/EmailTemplateLinkList";
import { useAllPartitionOptions } from "@/components/email/hooks/useAllPartitionOptions";
import { useEmailConfig } from "@/hooks/useEmailConfig";
import { useSenderProfiles } from "@/hooks/useSenderProfiles";

/** CRM관리 > 이메일 — 이미 고객사가 된 곳에 보내는 안내 메일(템플릿·템플릿 자동발송) */
export default function CrmEmailPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const activeTab = searchParams.get("tab") === "links" ? "links" : "templates";
    const setActiveTab = (tab: string) => router.replace(`/crm-email?tab=${tab}`);

    const { config, isLoading: configLoading } = useEmailConfig();
    const { profiles, isLoading: profilesLoading } = useSenderProfiles();
    const { partitions, error: partitionsError, retry } = useAllPartitionOptions();

    const isReady = !!config?.appKey && (profiles?.length ?? 0) > 0;
    const isSetupLoading = configLoading || profilesLoading;

    if (partitionsError) {
        return <WorkspaceLayout><QueryErrorState error={partitionsError} onRetry={retry} /></WorkspaceLayout>;
    }

    return (
        <WorkspaceLayout>
            <PageContainer>
                <PageHeader title="이메일" />

                {!isSetupLoading && !isReady ? (
                    <div className="mt-6 flex flex-col items-center justify-center py-20">
                        <Card className="max-w-md w-full text-center">
                            <CardHeader>
                                <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-muted">
                                    <Mail className="size-6 text-muted-foreground" />
                                </div>
                                <CardTitle>이메일 설정이 필요합니다</CardTitle>
                                <CardDescription>
                                    {!config?.appKey ? "NHN Cloud Email API 키를 등록해주세요." : "발신자 프로필을 등록해주세요."}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button onClick={() => router.push("/email?tab=settings")}>
                                    <Settings className="size-4 mr-2" />
                                    설정으로 이동
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                ) : (
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList>
                            <TabsTrigger value="templates">템플릿</TabsTrigger>
                            <TabsTrigger value="links">템플릿 자동발송</TabsTrigger>
                        </TabsList>
                        <TabsContent value="templates" className="mt-6">
                            <EmailTemplateList />
                        </TabsContent>
                        <TabsContent value="links" className="mt-6">
                            <EmailTemplateLinkList partitions={partitions} />
                        </TabsContent>
                    </Tabs>
                )}
            </PageContainer>
        </WorkspaceLayout>
    );
}
