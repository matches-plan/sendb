"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatRelative } from "@/components/tracker/utils/format";
import { cn } from "@/lib/utils";
import { useNotifications } from "../hooks/useNotifications";
import type { UserNotificationItem } from "../types";

/** 머리 오른쪽 종 — 안 읽은 수, 누르면 최근 알림. 알림을 누르면 읽음 표시하고 그 화면으로 */
export function NotificationBell() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const { items, unreadCount, markRead } = useNotifications();

    const openItem = async (n: UserNotificationItem) => {
        setOpen(false);
        if (!n.readAt) markRead({ ids: [n.id] }).catch((e) => toast.error((e as Error).message));
        if (n.link) router.push(n.link);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={unreadCount > 0 ? `알림 ${unreadCount}개 안 읽음` : "알림"} className="relative">
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white">
                            {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="flex max-h-[28rem] w-80 flex-col p-0">
                <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/40 pl-4 pr-2">
                    <span className="text-sm font-semibold">알림</span>
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="xs"
                            className="text-muted-foreground"
                            onClick={() => markRead({ all: true }).catch((e) => toast.error((e as Error).message))}
                        >
                            모두 읽음
                        </Button>
                    )}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
                    {items.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-muted-foreground">알림이 없습니다.</p>
                    ) : (
                        <ul>
                            {items.map((n) => (
                                <li key={n.id} className="border-b border-border/40 last:border-0">
                                    <button
                                        type="button"
                                        onClick={() => openItem(n)}
                                        className={cn("flex w-full gap-2.5 px-4 py-3 text-left hover:bg-muted", !n.readAt && "bg-muted/40")}
                                    >
                                        <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-destructive")} />
                                        <span className="min-w-0 flex-1">
                                            <span className={cn("block truncate text-sm", !n.readAt && "font-semibold")}>{n.title}</span>
                                            {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>}
                                            <span className="mt-1 block text-[11px] text-muted-foreground">{formatRelative(n.createdAt)}</span>
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
