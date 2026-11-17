"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { messengerLinks, type MessengerSettings } from "@/lib/customer-messenger/rules";
import { MessengerHome } from "./MessengerHome";
import { ChatHeader, ComposerPreview, HomeNav } from "./ChatChrome";
import { ContactCard } from "./ContactCard";
import { CustomerMessage, StaffMessage, customerBubbleClass } from "./ChatMessage";

/**
 * 상담 설정 › 사이트 상담창 오른쪽 미리보기 — 저장 전 값으로 고객 상담창 홈·대화 화면을 그린다.
 */
export function MessengerPreview({
    name,
    greeting,
    color,
    settings,
}: {
    name: string;
    greeting: string;
    color: string;
    settings: MessengerSettings;
}) {
    const [tab, setTab] = useState<"home" | "chat">("home");
    const publicSettings = { ...settings, links: messengerLinks(settings), aiAvailable: false, weekly: [] };
    const title = name || "고객 상담";
    const time = "오후 12:42";
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 rounded-lg bg-muted p-1 text-sm">
                {(
                    [
                        ["home", "홈"],
                        ["chat", "대화"],
                    ] as const
                ).map(([id, label]) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => setTab(id)}
                        className={cn("rounded-md py-1.5", tab === id ? "bg-background font-semibold" : "text-muted-foreground")}
                    >
                        {label}
                    </button>
                ))}
            </div>
            <div className="flex h-[680px] flex-col overflow-hidden rounded-[24px] border border-gray-200 bg-white font-sans text-gray-900">
                {tab === "home" ? (
                    <>
                    <MessengerHome
                        name={title}
                        greeting={greeting}
                        settings={publicSettings}
                        color={color}
                        busy={false}
                        loading={false}
                        unread={0}
                        hasConversations={false}
                        onStart={() => setTab("chat")}
                        onConversations={() => setTab("chat")}
                    />
                    <HomeNav color={color} unread={0} onHome={() => setTab("home")} onChats={() => setTab("chat")} />
                    </>
                ) : (
                    <>
                        <ChatHeader name={title} avatar={settings.profileImageUrl} color={color} onBack={() => setTab("home")} onLeave={() => setTab("home")} />
                        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                            <StaffMessage name={title} avatar={settings.profileImageUrl} color={color} time={time}>
                                <p className="whitespace-pre-wrap">{greeting}</p>
                            </StaffMessage>
                            <CustomerMessage time={time}>
                                <p className={customerBubbleClass}>안녕하세요, 문의드려요.</p>
                            </CustomerMessage>
                            {settings.contactEnabled && (
                                <StaffMessage name={title} avatar={settings.profileImageUrl} color={color} time={time}>
                                    <p className="whitespace-pre-wrap">{settings.contactPrompt}</p>
                                    <ContactCard fields={settings.contactFields} values={{ name: "", phone: "", email: "" }} color={color} />
                                </StaffMessage>
                            )}
                        </div>
                        <ComposerPreview color={color} />
                    </>
                )}
            </div>
            <div className="flex justify-end">
                {/* 사이트에 붙는 실제 상담 버튼 모양 (public/sendb-sdk.js) */}
                <span className="flex h-14 w-14 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ backgroundColor: color }}>
                    상담
                </span>
            </div>
        </div>
    );
}
