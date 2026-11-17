"use client";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsSection } from "@/components/inbox/ui/SettingsSection";
import { useEmailMailboxes } from "../hooks/useEmailMailboxes";
import { controlGoogleConnection, createEmailMailbox } from "../api";
import type { EmailMailbox } from "../types";
import { connectionResultMessage } from "../utils/connection-result";
import { MailboxCard } from "./MailboxCard";

/** 상담 설정 › 이메일 연결 — 연결된 메일 목록 + 메일 추가 연결 (등록하면 바로 Google 로그인으로 넘어간다) */
export function EmailMailboxSettings({ workspaceId }: { workspaceId: number }) {
    const params = useSearchParams(),
        router = useRouter(),
        pathname = usePathname();
    const connectionResult = params.get("emailConnection");
    // 결과 안내를 닫으면 승인 결과 쿼리를 지워 새로고침할 때 지난 결과가 반복되지 않게 한다.
    const dismissResult = () => {
        const next = new URLSearchParams(params.toString());
        next.delete("emailConnection");
        const query = next.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    };
    const { data, error, mutate } = useEmailMailboxes(workspaceId);
    const [adding, setAdding] = useState(false);
    return (
        <SettingsSection
            title="이메일 연결"
            action={
                !adding && (
                    <Button onClick={() => setAdding(true)}>
                        <Plus className="h-4 w-4" />
                        메일 연결
                    </Button>
                )
            }
        >
            {connectionResult && (
                <p role="status" className="flex items-start justify-between gap-3 rounded-lg border border-border/40 bg-muted/40 p-3 text-sm">
                    {connectionResultMessage(connectionResult)}
                    <Button variant="ghost" size="xs" className="shrink-0" onClick={dismissResult}>
                        닫기
                    </Button>
                </p>
            )}
            {error && (
                <p role="alert" className="text-sm text-red-700">
                    {error.message}{" "}
                    <button className="underline" onClick={() => void mutate()}>
                        다시 불러오기
                    </button>
                </p>
            )}
            {!data && !error && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
            {adding && <AddMailbox workspaceId={workspaceId} onCancel={() => setAdding(false)} />}
            {data && !data.length && !adding && <p className="text-sm text-muted-foreground">연결된 메일이 없어요.</p>}
            <div className="space-y-3">
                {data?.map((box) => <MailboxCard key={box.id} box={box} onChange={mutate} />)}
            </div>
        </SettingsSection>
    );
}

/** 보내는 이름·주소를 넣으면 등록하고 곧바로 Google 로그인 화면으로 보낸다 */
function AddMailbox({ workspaceId, onCancel }: { workspaceId: number; onCancel: () => void }) {
    const [name, setName] = useState(""),
        [address, setAddress] = useState(""),
        [googleAccount, setGoogleAccount] = useState(""),
        [busy, setBusy] = useState(false);
    return (
        <form
            className="space-y-4 rounded-lg border border-border/40 p-5"
            onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                    const box = (await createEmailMailbox(workspaceId, address.trim(), name.trim(), googleAccount.trim() || undefined)) as EmailMailbox;
                    const result = await controlGoogleConnection(box.id, { action: "connect", version: box.version, lookbackDays: 7 });
                    if (result.authorizationUrl) window.location.assign(result.authorizationUrl);
                } catch (err) {
                    toast.error((err as Error).message);
                    setBusy(false);
                }
            }}
        >
            <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5">
                    <span className="block text-sm font-medium">메일 주소</span>
                    <Input type="email" className="border-border/70" required maxLength={254} placeholder="support@example.com" value={address} onChange={(e) => setAddress(e.target.value)} disabled={busy} />
                </label>
                <label className="block space-y-1.5">
                    <span className="block text-sm font-medium">보내는 이름</span>
                    <Input className="border-border/70" required maxLength={100} placeholder="디자이너하이어 고객센터" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
                </label>
            </div>
            <label className="block space-y-1.5">
                <span className="block text-sm font-medium">Google 로그인 계정 (메일 주소와 다를 때만)</span>
                <Input type="email" className="border-border/70" maxLength={254} value={googleAccount} onChange={(e) => setGoogleAccount(e.target.value)} disabled={busy} />
            </label>
            <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" className="border-border/70" disabled={busy} onClick={onCancel}>
                    취소
                </Button>
                <Button type="submit" disabled={busy}>
                    {busy ? "연결하는 중…" : "Google로 연결"}
                </Button>
            </div>
        </form>
    );
}
