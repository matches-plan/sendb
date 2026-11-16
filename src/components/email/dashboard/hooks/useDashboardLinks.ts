import { useRepliesEnabled } from "../../replies/hooks/useRepliesEnabled";

export function useDashboardLinks(onTabChange?: (tab: string) => void) {
    const isRepliesEnabled = useRepliesEnabled();
    return [
        { tab: "experiments", label: "문구 실험" },
        ...(isRepliesEnabled ? [{ tab: "replies", label: "회신" }] : []),
        { tab: "logs", label: "발송 이력" },
    ].map(link => ({ ...link, onClick: () => onTabChange?.(link.tab) }));
}
