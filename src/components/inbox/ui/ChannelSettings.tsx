"use client";
import { SettingsSection } from "./SettingsSection";
import { MessengerPreview } from "@/components/customer-messenger/ui/MessengerPreview";
import { workspaceLabel } from "@/lib/workspace-label";
import { MessengerSettingsFields } from "@/components/customer-messenger/ui/MessengerSettingsFields";
import { defaultMessengerSettings, messengerLinks, messengerSettingsSchema } from "@/lib/customer-messenger/rules";
import { ProfileImageField } from "@/components/customer-messenger/ui/ProfileImageField";
import { ColorField } from "@/components/ui/color-field";
import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { InboxBootstrap, InboxChannel } from "../types";
import { inboxWrite } from "../api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
export function ChannelSettings({
    bootstrap,
    channel,
    initialWorkspaceId,
    onSaved,
}: {
    bootstrap: InboxBootstrap;
    channel?: InboxChannel;
    /** 새 상담창: 미리 골라 둘 사업부 */
    initialWorkspaceId?: number | null;
    onSaved: (channel: InboxChannel) => void;
}) {
    const availableWorkspaces = channel
        ? bootstrap.workspaces
        : bootstrap.workspaces.filter(
              (w) =>
                  w.abilities.manage &&
                  !bootstrap.channels.some((c) => c.workspaceId === w.id),
          );
    const [workspaceId, setWorkspace] = useState(
        channel?.workspaceId ??
            availableWorkspaces.find((w) => w.id === initialWorkspaceId)?.id ??
            availableWorkspaces[0]?.id ??
            0,
    );
    const [name, setName] = useState(channel?.name ?? "고객 상담");
    const [greeting, setGreeting] = useState(
        channel?.greeting ??
            "반갑습니다. 무엇을 도와드릴까요?\n궁금한 점을 남겨주시면 안내드리겠습니다.",
    );
    // 저장된 값에 새 항목(프로필·전화·연락처 받기)이 없을 수 있어 기본값을 채워 읽는다
    const [messengerSettings, setMessengerSettings] = useState(
        () => {
            const saved = messengerSettingsSchema.safeParse(channel?.messengerSettings ?? {}).data ?? defaultMessengerSettings;
            return { ...saved, links: messengerLinks(saved), consultationUrl: "" };
        },
    );
    const [color, setColor] = useState(channel?.color ?? "#635BFF");
    // Sendb 자체 주소는 서버가 늘 허용하므로 칸에서 숨기고, 저장할 때 그대로 남긴다
    const hiddenOrigins = channel?.allowedOrigins.filter(isSendbOrigin) ?? [];
    const [origins, setOrigins] = useState(
        channel?.allowedOrigins.filter((o) => !isSendbOrigin(o)).join("\n") ?? "",
    );
    const [busy, setBusy] = useState(false);
    const base = typeof window === "undefined" ? "" : window.location.origin;
    const snippet = channel
        ? `<script src="${base}/sendb-chat.js" data-channel="${channel.publicKey}" defer></script>`
        : "";
    return (
        <SettingsSection
            title={channel ? "사이트 상담창" : "새 상담창 만들기"}
            action={
                workspaceId > 0 && (
                    <Button variant="outline" className="border-border/70" asChild>
                        <a href={`/customer-workflows?workspaceId=${workspaceId}`} target="_blank" rel="noreferrer">
                            고객 자동화 설정
                            <ExternalLink className="h-4 w-4" />
                        </a>
                    </Button>
                )
            }
        >
            {/* 왼쪽 설정, 오른쪽 저장 전 미리보기 */}
            <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_390px]">
            <div className="min-w-0">
                <form
                    className="space-y-5"
                    onSubmit={async (e) => {
                        e.preventDefault();
                        setBusy(true);
                        try {
                            const typed = origins
                                .split(/\n|,/)
                                .map((s) => s.trim())
                                .filter(Boolean);
                            const allowedOrigins = [...new Set([...hiddenOrigins, ...typed])];
                            const saved = await inboxWrite<InboxChannel>(
                                "/api/inbox/channels",
                                {
                                    workspaceId,
                                    name,
                                    greeting,
                                    messengerSettings,
                                    color,
                                    allowedOrigins,
                                    // 설치 도메인을 넣으면 상담창이 켜진다 (따로 끄는 스위치는 두지 않음)
                                    enabled: typed.length > 0,
                                },
                            );
                            toast.success("저장했어요.");
                            onSaved(saved);
                        } catch (e) {
                            toast.error((e as Error).message);
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    {!channel && (
                        <label className="block space-y-1.5">
                            <span className="block text-sm font-medium">사업부</span>
                            <Select value={String(workspaceId)} onValueChange={(v) => setWorkspace(Number(v))}>
                                <SelectTrigger className="w-full border-border/70" aria-label="상담창 사업부">
                                    <SelectValue placeholder="모든 사업의 상담창을 만들었어요" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableWorkspaces.map((w) => (
                                        <SelectItem key={w.id} value={String(w.id)}>
                                            {workspaceLabel(w)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </label>
                    )}
                    <div className="space-y-1.5">
                        <span className="block text-sm font-medium">프로필 이미지</span>
                        <ProfileImageField
                            value={messengerSettings.profileImageUrl}
                            name={name}
                            color={color}
                            onChange={(profileImageUrl) => setMessengerSettings({ ...messengerSettings, profileImageUrl })}
                        />
                    </div>
                    <label className="block space-y-1.5">
                        <span className="block text-sm font-medium">상담창 이름</span>
                        <Input className="border-border/70" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
                    </label>
                    <label className="block space-y-1.5">
                        <span className="block text-sm font-medium">한 줄 소개</span>
                        <Input
                            className="border-border/70"
                            value={messengerSettings.tagline}
                            onChange={(e) => setMessengerSettings({ ...messengerSettings, tagline: e.target.value })}
                            maxLength={120}
                        />
                    </label>
                    <label className="block space-y-1.5">
                        <span className="block text-sm font-medium">환영 인사</span>
                        <Textarea className="border-border/70" rows={3} value={greeting} onChange={(e) => setGreeting(e.target.value)} required maxLength={1000} />
                    </label>
                    <div className="space-y-1.5">
                        <span className="block text-sm font-medium">포인트 컬러</span>
                        <ColorField label="포인트 컬러" value={color} onChange={setColor} />
                    </div>
                    <MessengerSettingsFields value={messengerSettings} onChange={setMessengerSettings} />
                    <label className="block space-y-1.5">
                        <span className="block text-sm font-medium">설치 도메인</span>
                        <Textarea className="border-border/70" rows={3} value={origins} onChange={(e) => setOrigins(e.target.value)} placeholder="https://designer-hire.com" />
                    </label>
                    <div className="flex justify-end">
                        <Button type="submit" disabled={busy || !workspaceId}>
                            {busy ? "저장 중…" : "저장"}
                        </Button>
                    </div>
                </form>
                {channel && (
                    <div className="mt-7 space-y-3 border-t border-border/40 pt-5">
                        <h3 className="font-medium">사이트에 설치</h3>
                        <pre className="overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-4 text-xs">{snippet}</pre>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                className="border-border/70"
                                onClick={async () => {
                                    try {
                                        await navigator.clipboard.writeText(snippet);
                                        toast.success("설치 코드를 복사했어요.");
                                    } catch {
                                        toast.error("코드를 직접 선택해서 복사해주세요.");
                                    }
                                }}
                            >
                                <Copy className="h-4 w-4" />
                                설치 코드 복사
                            </Button>
                            <Button variant="outline" className="border-border/70" asChild>
                                <a href={`/chat/${channel.publicKey}`} target="_blank" rel="noreferrer">
                                    <ExternalLink className="h-4 w-4" />
                                    상담창 열기
                                </a>
                            </Button>
                        </div>
                    </div>
                )}
            </div>
            <aside className="hidden xl:block">
                <div className="sticky top-0">
                    <MessengerPreview name={name} greeting={greeting} color={color} settings={messengerSettings} />
                </div>
            </aside>
            </div>
        </SettingsSection>
    );
}

const isSendbOrigin = (origin: string) => /^https:\/\/(www\.)?sendb\.kr$/.test(origin);
