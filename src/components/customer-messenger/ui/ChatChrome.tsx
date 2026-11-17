"use client";
import { ArrowUp, ChevronLeft, Home, LogOut, MessageCircle, Paperclip } from "lucide-react";
import { ProfileAvatar } from "./ProfileAvatar";

/** 고객 상담창 대화 화면 머리 — 실제 상담창과 설정 미리보기가 같이 쓴다 */
export function ChatHeader({
    name,
    avatar,
    color,
    onBack,
    onLeave,
    leaveDisabled,
}: {
    name: string;
    avatar?: string;
    color: string;
    onBack: () => void;
    /** 없으면 나가기 버튼을 숨긴다 (대화 목록 등) */
    onLeave?: () => void;
    leaveDisabled?: boolean;
}) {
    return (
        <header className="flex shrink-0 items-center gap-3 border-b border-gray-100 bg-white px-4 py-4">
            <button type="button" aria-label="상담 홈으로" onClick={onBack} className="-ml-1 rounded-lg p-1.5 text-gray-500 hover:bg-gray-50">
                <ChevronLeft size={22} aria-hidden="true" />
            </button>
            <ProfileAvatar src={avatar} name={name} color={color} size={28} />
            <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{name}</h1>
            {onLeave && (
                <button
                    type="button"
                    aria-label="채팅 나가기"
                    title="채팅 나가기"
                    disabled={leaveDisabled}
                    onClick={onLeave}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-50 disabled:opacity-50"
                >
                    <LogOut size={17} aria-hidden="true" />
                </button>
            )}
        </header>
    );
}

/** 상담 홈 아래 홈·대화 메뉴 */
export function HomeNav({
    color,
    unread,
    disabled,
    onHome,
    onChats,
}: {
    color: string;
    unread: number;
    disabled?: boolean;
    onHome: () => void;
    onChats: () => void;
}) {
    return (
        <nav aria-label="상담창 메뉴" className="grid shrink-0 grid-cols-2 border-t border-gray-100 bg-white p-2">
            <button type="button" aria-pressed onClick={onHome} className="flex flex-col items-center gap-1 rounded-xl py-2 text-[11px]" style={{ color }}>
                <Home size={20} aria-hidden="true" />홈
            </button>
            <button
                type="button"
                aria-pressed={false}
                disabled={disabled}
                onClick={onChats}
                className="relative flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] text-gray-400 disabled:opacity-50"
            >
                <span className="relative">
                    <MessageCircle size={20} aria-hidden="true" />
                    {unread > 0 && (
                        <span
                            className="absolute -right-3 -top-1 rounded-full px-1 text-[9px] text-white"
                            style={{ backgroundColor: color }}
                            aria-label={`안 읽은 답변 ${unread}개`}
                        >
                            {unread > 99 ? "99+" : unread}
                        </span>
                    )}
                </span>
                대화
            </button>
        </nav>
    );
}

/** 설정 미리보기용 입력창 — 실제 상담창 입력창과 같은 모양 (동작 없음) */
export function ComposerPreview({ color }: { color: string }) {
    return (
        <div className="shrink-0">
            <p className="px-5 py-2 text-center text-xs text-gray-500 underline">상담원 연결 요청</p>
            <div className="px-3 pb-3 pt-1">
                <div className="rounded-xl bg-gray-100 px-3 pb-2 pt-3">
                    <p className="h-12 text-[15px] text-gray-400">메시지를 입력해주세요</p>
                    <div className="mt-1 flex items-center justify-between">
                        <span className="flex h-8 w-8 items-center justify-center text-gray-500">
                            <Paperclip size={18} aria-hidden="true" />
                        </span>
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg text-white opacity-40" style={{ backgroundColor: color }}>
                            <ArrowUp size={17} aria-hidden="true" />
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
