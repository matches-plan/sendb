"use client";
import type { ReactNode } from "react";
import { ProfileAvatar } from "./ProfileAvatar";

/** 상담 쪽 메시지 — 말풍선 없이 글만, 아래에 프로필·이름·시간 */
export function StaffMessage({
    name,
    avatar,
    color,
    time,
    receiptId,
    children,
}: {
    name: string;
    avatar?: string;
    color: string;
    time?: ReactNode;
    receiptId?: number;
    children: ReactNode;
}) {
    return (
        <div data-receipt-id={receiptId} className="max-w-[92%]">
            <div className="break-words text-[15px] leading-[1.5] text-gray-900">{children}</div>
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-400">
                <ProfileAvatar src={avatar} name={name} color={color} size={18} />
                <span className="truncate">
                    {name}
                    {time && <>, {time}</>}
                </span>
            </p>
        </div>
    );
}

/** 고객 메시지 — 회색 말풍선, 시간은 아래 */
export function CustomerMessage({ time, children }: { time?: ReactNode; children: ReactNode }) {
    return (
        <div className="ml-auto flex max-w-[85%] flex-col items-end">
            {children}
            {time && <p className="mr-2 mt-1 text-[11px] text-gray-400">{time}</p>}
        </div>
    );
}

export const customerBubbleClass = "whitespace-pre-wrap break-words rounded-2xl bg-gray-100 px-4 py-2.5 text-[15px] leading-[1.5] text-gray-900";

export const messageTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
