/** 머리 종 알림 한 줄 (GET /api/notifications) */
export interface UserNotificationItem {
    id: number;
    kind: string;
    workspaceId: number | null;
    title: string;
    body: string | null;
    link: string | null;
    readAt: string | null;
    createdAt: string;
}

export interface UserNotificationList {
    items: UserNotificationItem[];
    unreadCount: number;
}
