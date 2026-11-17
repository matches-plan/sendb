"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import EmailConfigForm from "@/components/email/EmailConfigForm";
import EmailCategoryManager from "@/components/email/EmailCategoryManager";
import EmailDashboard from "@/components/email/dashboard/ui/EmailDashboard";
import { UnsubscribeSettings } from "@/components/email/unsubscribes/ui/UnsubscribeSettings";
import { SettingsSection } from "@/components/inbox/ui/SettingsSection";
import { LeadWorkspaceTabs } from "@/components/leads/ui/LeadWorkspaceTabs";
import { cn } from "@/lib/utils";
import { useLeadgenWorkspaces } from "../hooks/useLeadgenWorkspaces";
import { HealthRecipientToggles } from "./HealthRecipientToggles";
import { SignatureSettings } from "./SignatureSettings";

type Menu = "config" | "categories" | "health" | "unsubscribes" | "recipients" | "signatures";
type Group = "공통" | "사업부";

const MENUS: { id: Menu; group: Group; label: string }[] = [
    { id: "config", group: "공통", label: "발송 설정" },
    { id: "categories", group: "공통", label: "메일 분류" },
    { id: "health", group: "공통", label: "발송 경고" },
    { id: "recipients", group: "사업부", label: "알림 담당자" },
    { id: "signatures", group: "사업부", label: "이메일 서명" },
    // 수신거부는 사업부별이다 (사업부 없는 예전 줄은 모든 사업부를 막아 각 목록에 "전체"로 보인다)
    { id: "unsubscribes", group: "사업부", label: "수신거부 목록" },
];
const GROUPS: Group[] = ["공통", "사업부"];
const FIRST_COMMON = MENUS.find((m) => m.group === "공통")!.id;
const FIRST_WORKSPACE = MENUS.find((m) => m.group === "사업부")!.id;

const isMenu = (v: string | null): v is Menu => MENUS.some((m) => m.id === v);
const isWorkspaceMenu = (m: Menu) => MENUS.find((x) => x.id === m)?.group === "사업부";

/**
 * 리드젠 설정 — 맨 위 사업부 탭, 왼쪽 설정 메뉴, 오른쪽에 고른 설정 (상담 설정과 같은 틀). ?menu=…&ws=… 로 바로 연다 (알림 링크)
 * 공통 메뉴(발송 설정·메일 분류·발송 경고)는 조직 전체라 위 탭이 늘 "전체", 사업부 메뉴(알림 담당자·이메일 서명·수신거부 목록)는 한 사업부.
 * 공통 메뉴에서 사업부 탭을 누르면 첫 사업부 메뉴로, "전체"를 누르면 첫 공통 메뉴로 간다.
 * 사업부 메뉴를 사업부 없이 열면(전체에서 메뉴를 누름·예전 링크) 마지막에 보던 사업부, 없으면 첫 사업부로
 */
export function LeadgenSettingsPage() {
    const params = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const workspaceTabs = useLeadgenWorkspaces();
    const menuParam = params.get("menu");
    const menu: Menu = isMenu(menuParam) ? menuParam : "config";
    const workspaceMenu = isWorkspaceMenu(menu);
    const wsParam = Number(params.get("ws")) || null;
    // 공통 메뉴에서는 사업부를 쓰지 않는다 (탭은 "전체")
    const workspaceId = workspaceMenu ? wsParam : null;
    const firstWs = workspaceTabs.items[0]?.id ?? null;
    // 공통 메뉴로 갔다가 사업부 메뉴로 돌아오면 보던 사업부로
    const lastWs = useRef<number | null>(null);
    useEffect(() => {
        if (workspaceId) lastWs.current = workspaceId;
    }, [workspaceId]);

    const go = (next: { menu?: Menu; ws?: number | null }) => {
        const q = new URLSearchParams(params.toString());
        q.set("menu", next.menu ?? menu);
        const ws = next.ws === undefined ? workspaceId : next.ws;
        if (ws) q.set("ws", String(ws));
        else q.delete("ws");
        router.replace(`${pathname}?${q}`, { scroll: false });
    };
    const pickMenu = (m: Menu) => go(isWorkspaceMenu(m) ? { menu: m, ws: workspaceId ?? lastWs.current ?? firstWs } : { menu: m, ws: null });

    // 주소를 메뉴에 맞춘다 — 공통 메뉴의 ws는 지우고, 사업부 메뉴인데 ws가 없으면 사업부를 채운다
    const needsFix = workspaceMenu ? !wsParam && firstWs !== null : wsParam !== null;
    useEffect(() => {
        if (!needsFix) return;
        const q = new URLSearchParams(params.toString());
        q.set("menu", menu);
        if (workspaceMenu && firstWs) q.set("ws", String(firstWs));
        else q.delete("ws");
        router.replace(`${pathname}?${q}`, { scroll: false });
    }, [needsFix, workspaceMenu, firstWs, menu, params, pathname, router]);

    const allTab = { onSelect: () => go({ menu: workspaceMenu ? FIRST_COMMON : menu, ws: null }) };

    // 알림 담당자는 흰 카드 안에, 카드가 따로 있는 설정(발송 설정·메일 분류·발송 경고)은 회색 바탕 위에 그대로
    function content() {
        switch (menu) {
            case "config":
                return (
                    <SettingsSection title="발송 설정">
                        <EmailConfigForm />
                    </SettingsSection>
                );
            case "categories":
                return (
                    <SettingsSection title="메일 분류">
                        <EmailCategoryManager />
                    </SettingsSection>
                );
            case "health":
                return (
                    <SettingsSection title="발송 경고">
                        <EmailDashboard />
                    </SettingsSection>
                );
            case "unsubscribes":
                return (
                    <SettingsSection title="수신거부 목록">
                        {workspaceId ? (
                            <UnsubscribeSettings key={workspaceId} workspaceId={workspaceId} />
                        ) : (
                            <p className="text-sm text-muted-foreground">위에서 사업부를 골라주세요.</p>
                        )}
                    </SettingsSection>
                );
            case "recipients":
                return (
                    <div className="rounded-lg border border-border/40 bg-background p-8">
                        <HealthRecipientToggles key={workspaceId ?? 0} workspaceId={workspaceId} />
                    </div>
                );
            case "signatures":
                return (
                    <div className="rounded-lg border border-border/40 bg-background p-8">
                        {workspaceId ? (
                            <SignatureSettings key={workspaceId} workspaceId={workspaceId} />
                        ) : (
                            <p className="text-sm text-muted-foreground">위에서 사업부를 골라주세요.</p>
                        )}
                    </div>
                );
        }
    }

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col">
            <LeadWorkspaceTabs
                value={workspaceId}
                onChange={(id) => go({ menu: workspaceMenu ? menu : FIRST_WORKSPACE, ws: id })}
                allTab={allTab}
                items={workspaceTabs.items}
                loading={workspaceTabs.isLoading}
                prefKey="email"
            />
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
                <div className="grid grid-cols-[13rem_minmax(0,1fr)] items-start gap-8 p-8">
                    <nav aria-label="리드젠 설정 메뉴" className="sticky top-0 space-y-6">
                        {GROUPS.map((group) => (
                            <div key={group}>
                                <p className="mb-2 px-4 text-xs font-medium text-muted-foreground">{group}</p>
                                {MENUS.filter((m) => m.group === group).map((m) => (
                                    <button
                                        key={m.id}
                                        type="button"
                                        onClick={() => pickMenu(m.id)}
                                        className={cn(
                                            "mb-0.5 flex w-full items-center gap-2 rounded-lg px-4 py-2.5 text-left text-sm",
                                            menu === m.id ? "bg-muted font-medium text-foreground" : "text-foreground/80 hover:bg-muted/60",
                                        )}
                                    >
                                        {m.label}
                                    </button>
                                ))}
                            </div>
                        ))}
                    </nav>
                    <div className="min-w-0">{content()}</div>
                </div>
            </div>
        </div>
    );
}
