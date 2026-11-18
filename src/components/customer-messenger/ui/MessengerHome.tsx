"use client";

import { ArrowUpRight, ChevronRight, MessageCircle, Phone, Send } from "lucide-react";
import { ProfileAvatar } from "./ProfileAvatar";
import type { MessengerBrand, PublicMessengerSettings } from "../types";

export type MessengerBusinessHours = {
    open: boolean;
    nextOpenAt: string | null;
    timezone: string;
    awayMessage: string;
};

export function MessengerHome({
    name,
    brand,
    greeting,
    settings,
    color,
    businessHours,
    busy,
    loading,
    unread,
    hasConversations,
    onStart,
    onConversations,
}: {
    name: string;
    brand?: MessengerBrand;
    greeting: string;
    settings?: PublicMessengerSettings;
    color: string;
    businessHours?: MessengerBusinessHours | null;
    busy: boolean;
    loading: boolean;
    unread: number;
    hasConversations: boolean;
    onStart: () => void;
    onConversations: () => void;
}) {
    const avatar = settings?.profileImageUrl || brand?.iconUrl;
    const { quick, text: statusText } = responseStatus(settings, businessHours);
    return (
        <section aria-label="상담 홈" className="min-h-0 flex-1 overflow-y-auto bg-[#f6f6f6] px-4 pb-6 pt-6">
            <header className="mb-5 flex items-center gap-3 px-1">
                <ProfileAvatar src={avatar} name={name} color={color} size={48} />
                <div className="min-w-0">
                    <h1 className="truncate text-lg font-bold tracking-tight">{name}</h1>
                    {settings?.tagline && <p className="mt-0.5 truncate text-[13px] text-gray-500">{settings.tagline}</p>}
                </div>
            </header>

            <article className="rounded-2xl bg-white p-4">
                <div className="flex items-start gap-3">
                    <ProfileAvatar src={avatar} name={name} color={color} size={40} />
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold">{name}</h2>
                        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-[1.5] text-gray-600">{greeting}</p>
                    </div>
                </div>
                <button
                    type="button"
                    disabled={busy || loading}
                    onClick={onStart}
                    className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: color }}
                >
                    {loading ? "상담을 준비하고 있어요…" : "문의하기"}
                    {!loading && <Send size={15} aria-hidden="true" />}
                </button>
                <p className="mt-2.5 flex items-center justify-center gap-1.5 text-xs text-gray-400">
                    <span className={`h-2 w-2 rounded-full ${quick ? "bg-emerald-500" : "bg-gray-300"}`} aria-hidden="true" />
                    {statusText}
                </p>
            </article>

            {hasConversations && (
                <button
                    type="button"
                    disabled={busy || loading}
                    onClick={onConversations}
                    className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-white px-5 py-4 text-left disabled:opacity-50"
                >
                    <MessageCircle size={20} style={{ color }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-sm font-semibold">
                        이전 대화 이어보기
                        {unread > 0 && <span className="ml-1.5 font-normal text-gray-500">답변 {unread > 99 ? "99+" : unread}개</span>}
                    </span>
                    <ChevronRight size={16} className="text-gray-400" aria-hidden="true" />
                </button>
            )}

            {settings?.phoneEnabled && settings.phone && (
                <a
                    href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`}
                    title={settings.phone}
                    className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-white py-3 pl-5 pr-3"
                >
                    <span className="text-sm font-semibold text-gray-500">다른 방법으로 문의</span>
                    <span
                        className="flex h-9 w-9 items-center justify-center rounded-xl"
                        style={{ backgroundColor: `${color}1f`, color }}
                        aria-label={`전화 문의 ${settings.phone}`}
                    >
                        <Phone size={18} fill="currentColor" strokeWidth={0} aria-hidden="true" />
                    </span>
                </a>
            )}

            {settings?.links?.map((link) => (
                <a
                    key={`${link.label}:${link.url}`}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-white py-3 pl-5 pr-3"
                >
                    <span className="min-w-0 truncate text-sm font-semibold text-gray-500">{link.label}</span>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}1f`, color }}>
                        <ArrowUpRight size={19} strokeWidth={2.4} aria-hidden="true" />
                    </span>
                </a>
            ))}
        </section>
    );
}

/** 상담 홈·사이트 상담 버튼 말풍선에 보이는 응답 안내 */
export function responseStatus(settings?: { aiAvailable?: boolean } | null, businessHours?: MessengerBusinessHours | null) {
    const quick = !!settings?.aiAvailable || businessHours?.open !== false;
    return { quick, text: quick ? "몇 분 내 답변 받으실 수 있어요" : nextOpenText(businessHours) };
}

/** 운영시간 밖일 때 — "내일 오전 10:00부터 답변드려요" */
function nextOpenText(hours?: MessengerBusinessHours | null) {
    if (!hours?.nextOpenAt) return "지금은 운영시간이 아니에요";
    const tz = hours.timezone || "Asia/Seoul";
    const at = new Date(hours.nextOpenAt);
    const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: tz });
    const diff = Math.round((Date.parse(day(at)) - Date.parse(day(new Date()))) / 86_400_000);
    const when =
        diff <= 0 ? "오늘" : diff === 1 ? "내일" : at.toLocaleDateString("ko-KR", { timeZone: tz, month: "long", day: "numeric", weekday: "short" });
    return `${when} ${at.toLocaleTimeString("ko-KR", { timeZone: tz, hour: "numeric", minute: "2-digit" })}부터 답변드려요`;
}
