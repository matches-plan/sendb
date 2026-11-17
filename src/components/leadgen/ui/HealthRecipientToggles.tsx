"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { SettingsSection } from "@/components/inbox/ui/SettingsSection";
import { useHealthRecipients } from "../hooks/useHealthRecipients";

/** 리드젠 설정 › 알림 담당자 — 켠 직원이 이 사업의 발송 경고를 머리 종 알림으로 받는다. 관리자만 바꾼다 */
export function HealthRecipientToggles({ workspaceId }: { workspaceId: number | null }) {
    const { list, error, toggle } = useHealthRecipients(workspaceId);
    const [busy, setBusy] = useState<string | null>(null);
    return (
        <SettingsSection title="알림 담당자">
            {!workspaceId && <p className="text-sm text-muted-foreground">위에서 사업부를 골라주세요.</p>}
            {error && <p role="alert" className="text-sm text-red-700">{error.message}</p>}
            {workspaceId && !list && !error && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
            {list && (
                <table className="w-full text-left text-sm">
                    <thead className="text-xs text-muted-foreground">
                        <tr className="border-b border-border/40">
                            <th className="py-3 font-medium">직원</th>
                            <th className="font-medium">이메일</th>
                            <th className="w-24 font-medium">알림 받기</th>
                        </tr>
                    </thead>
                    <tbody>
                        {list.members.map((m) => (
                            <tr key={m.id} className="border-b border-border/40 last:border-0">
                                <td className="py-3 font-medium">{m.name}</td>
                                <td className="text-muted-foreground">{m.email}</td>
                                <td>
                                    <Switch
                                        aria-label={`${m.name} 알림 받기`}
                                        checked={m.enabled}
                                        disabled={!list.canManage || busy !== null}
                                        onCheckedChange={async (enabled) => {
                                            setBusy(m.id);
                                            try {
                                                await toggle(m.id, enabled);
                                                toast.success(enabled ? `${m.name}님이 알림을 받아요.` : `${m.name}님 알림을 껐어요.`);
                                            } catch (e) {
                                                toast.error((e as Error).message);
                                            } finally {
                                                setBusy(null);
                                            }
                                        }}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </SettingsSection>
    );
}
