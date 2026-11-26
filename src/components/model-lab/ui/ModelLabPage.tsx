"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/common/page-header";
import { PreviewPanel } from "./PreviewPanel";
import { LeaderboardPanel } from "./LeaderboardPanel";
import { ResearchPanel } from "./ResearchPanel";

/** AI 모델 실험실 — 나란히 미리보기, 모델별 성과 순위, 회사 조사 관찰. 실제 발송 비교는 규칙의 AB 테스트(AI 모델)로 한다 */
export function ModelLabPage() {
    return (
        <div className="space-y-6 p-6">
            <PageHeader title="AI 모델 실험실" description="같은 메일을 여러 모델로 써 보고, 실제 발송 성과로 모델을 고릅니다." />
            <Tabs defaultValue="preview">
                <TabsList>
                    <TabsTrigger value="preview">나란히 미리보기</TabsTrigger>
                    <TabsTrigger value="leaderboard">모델 성과</TabsTrigger>
                    <TabsTrigger value="research">회사 조사</TabsTrigger>
                </TabsList>
                <TabsContent value="preview" className="pt-4">
                    <PreviewPanel />
                </TabsContent>
                <TabsContent value="leaderboard" className="pt-4">
                    <LeaderboardPanel />
                </TabsContent>
                <TabsContent value="research" className="pt-4">
                    <ResearchPanel />
                </TabsContent>
            </Tabs>
        </div>
    );
}
