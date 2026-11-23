import type { Notification, NotificationPage } from "../types";

/** 서버가 최신순으로 준 두 목록을 비교한다. 기존 알림의 읽음 변경이나 페이지 끝의 과거 알림은 제외한다. */
export function newCustomerReplies(previous: NotificationPage | undefined, rows: Notification[]) {
    if (!previous) return [];
    const known = new Set(previous.rows.map(row => row.id));
    const oldest = previous.hasMore ? previous.rows.at(-1) : undefined;
    return rows.filter(row =>
        row.type === "customer" && !row.readAt && !known.has(row.id) &&
        (!oldest || row.createdAt >= oldest.createdAt),
    ).reverse();
}
