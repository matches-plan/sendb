"use client";
import { useEffect, type RefObject } from "react";
import { inboxRequest } from "../api";

type Message = { id: number; kind: string; recipientReadAt?: string | null };

/** 열린 대화에서 화면에 보인 상대 메시지만 확인한다. */
export function useVisibleMessageReceipts(
    scroll: RefObject<HTMLDivElement | null>,
    url: string | null,
    messages: Message[],
    incoming: "customer" | "reply",
    token?: string,
) {
    const unreadIds = messages.filter(m => m.kind === incoming && !m.recipientReadAt).map(m => m.id).join(",");
    useEffect(() => {
        if (!url || !unreadIds || !scroll.current || typeof IntersectionObserver === "undefined") return;
        const endpoint = url;
        const unread = new Set(unreadIds.split(",").map(Number));
        const visible = new Set<number>();
        let active = true;
        let sending = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        function schedule(delay = 150) {
            if (active && !sending && timer === undefined && visible.size)
                timer = setTimeout(flush, delay);
        }
        async function flush() {
            timer = undefined;
            if (!active || document.visibilityState !== "visible") return;
            const messageIds = [...visible].slice(0, 100);
            if (!messageIds.length) return;
            sending = true;
            let delay = 150;
            try {
                await inboxRequest(endpoint, {
                    method: "POST",
                    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                    body: JSON.stringify({ action: "read-messages", messageIds }),
                });
                for (const id of messageIds) {
                    unread.delete(id);
                    visible.delete(id);
                }
            } catch {
                delay = 5000;
            } finally {
                sending = false;
                schedule(delay);
            }
        }
        const observer = new IntersectionObserver(entries => {
            for (const entry of entries) {
                const id = Number((entry.target as HTMLElement).dataset.receiptId);
                if (unread.has(id) && entry.isIntersecting && entry.intersectionRect.height > 0 && entry.intersectionRect.width > 0)
                    visible.add(id);
                else visible.delete(id);
            }
            schedule();
        }, { threshold: [0, 0.01] });
        for (const element of scroll.current.querySelectorAll<HTMLElement>("[data-receipt-id]"))
            if (unread.has(Number(element.dataset.receiptId))) observer.observe(element);
        const onVisibility = () => schedule();
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            active = false;
            clearTimeout(timer);
            observer.disconnect();
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [scroll, url, token, unreadIds]);
}
