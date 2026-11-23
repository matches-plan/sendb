"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { toPlainText } from "@/lib/rich-text/format";
import { newCustomerReplies } from "../utils/reply-alerts";
import type { NotificationPage, OpenSupportConversation } from "../types";
import { useRecentSupportNotifications } from "./useOperations";

export function useReplyAlerts(scope: string, openConversation: OpenSupportConversation) {
    const preference = `sendb:inbox:browser-alerts:${scope}`;
    const [enabled, setEnabled] = useState(false);
    const recent = useRecentSupportNotifications(scope, enabled);
    const previous = useRef<NotificationPage | undefined>(undefined);
    const displayed = useRef(new Map<string, () => void>());

    useEffect(() => {
        const sync = () => {
            try {
                setEnabled("Notification" in window && Notification.permission === "granted" && localStorage.getItem(preference) === "1");
            } catch { setEnabled(false); }
        };
        sync();
        window.addEventListener("storage", sync);
        window.addEventListener("focus", sync);
        const alerts = displayed.current;
        return () => {
            window.removeEventListener("storage", sync);
            window.removeEventListener("focus", sync);
            for (const close of alerts.values()) close();
            alerts.clear();
        };
    }, [preference]);

    async function setBrowserAlerts(on: boolean) {
        try {
            if (on && await Notification.requestPermission() !== "granted") {
                toast.info("브라우저의 사이트 설정에서 알림을 허용해주세요.");
                return;
            }
            localStorage.setItem(preference, on ? "1" : "0");
            setEnabled(on);
        } catch { toast.error("이 브라우저에서 알림 설정을 저장할 수 없습니다."); }
    }

    useEffect(() => {
        const page = recent.data;
        if (!page) return;
        const announce = () => {
            const visible = document.visibilityState === "visible";
            // 권한이 없는 백그라운드 탭은 돌아왔을 때 새 메시지를 표시한다.
            const canNotify = enabled && Notification.permission === "granted";
            if (!visible && previous.current && !canNotify) return;
            const replies = newCustomerReplies(previous.current, page.rows);
            previous.current = page;
            for (const row of replies) {
                const id = `inbox-reply:${scope}:${row.conversationId}`;
                if (!visible && canNotify) {
                    try {
                        // 잠금 화면에도 뜰 수 있어 이름과 상담 본문은 사이트 안에서만 보인다.
                        const notice = new Notification("샌드비 상담톡", { body: "고객의 새 메시지가 도착했습니다.", tag: id });
                        const close = () => notice.close();
                        notice.onclick = () => { window.focus(); close(); openConversation(row); };
                        notice.onclose = () => { if (displayed.current.get(id) === close) displayed.current.delete(id); };
                        displayed.current.set(id, close);
                        continue;
                    } catch { /* 시스템 알림을 지원하지 않는 환경에서는 사이트 알림을 사용한다. */ }
                }
                displayed.current.set(id, () => toast.dismiss(id));
                toast(`${row.name}님의 새 상담 메시지`, {
                    id,
                    description: toPlainText(row.preview).slice(0, 100),
                    duration: 8000,
                    action: { label: "상담 열기", onClick: () => openConversation(row) },
                    onDismiss: () => displayed.current.delete(id),
                    onAutoClose: () => displayed.current.delete(id),
                });
            }
        };
        announce();
        document.addEventListener("visibilitychange", announce);
        return () => document.removeEventListener("visibilitychange", announce);
    }, [recent.data, enabled, scope, openConversation]);

    return { recent, browserAlerts: enabled, setBrowserAlerts };
}
