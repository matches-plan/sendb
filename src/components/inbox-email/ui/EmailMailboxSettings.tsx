"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SettingsSection } from "@/components/inbox/ui/SettingsSection";
import { GoogleConnectionPanel } from "./GoogleConnectionPanel";
import { MailboxGoogleAccount } from "./MailboxGoogleAccount";
import { MailboxName } from "./MailboxName";
import { MailboxToggle } from "./MailboxToggle";
import { toast } from "sonner";
import { useEmailMailboxes } from "../hooks/useEmailMailboxes";
import { createEmailMailbox } from "../api";
import { connectionResultMessage } from "../utils/connection-result";
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
    const [address, setAddress] = useState(""),
        [googleAccount, setGoogleAccount] = useState(""),
        [name, setName] = useState(""),
        [busy, setBusy] = useState(false);
    const run = async (fn: () => Promise<unknown>) => {
        setBusy(true);
        try {
            await fn();
            await mutate();
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <SettingsSection
            title="이메일 연결"
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
                {data?.map((box) => (
                    <article
                        key={box.id}
                        className="space-y-4 rounded-lg border border-border/40 p-5"
                    >
                        <div className="flex items-start gap-4">
                            <div className="min-w-0 flex-1">
                                <h3 className="font-semibold">{box.name}</h3>
                                <p className="text-sm text-muted-foreground">{box.address}</p>
                            </div>
                            <label className="flex items-center gap-2 text-sm">
                                수신·발송
                                <MailboxToggle box={box} busy={busy} onChange={mutate} />
                            </label>
                        </div>
                        {!!box.aliasMailboxCount &&
                            (!box.googleAccount ||
                                box.googleAccount === box.address) && (
                                <p className="text-xs text-amber-800">
                                    이 계정을 같이 쓰는 다른 사업 메일함이 {box.aliasMailboxCount}개 있어요.
                                </p>
                            )}
                        <MailboxName
                            key={`name:${box.name}`}
                            box={box}
                            onChange={mutate}
                        />
                        <MailboxGoogleAccount
                            key={box.googleAccount || box.address}
                            box={box}
                            onChange={mutate}
                        />
                        <GoogleConnectionPanel box={box} onChange={mutate} />
                    </article>
                ))}
                <form
                    className="space-y-4 border-t border-border/40 pt-5"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void run(async () => {
                            await createEmailMailbox(
                                workspaceId,
                                address,
                                name,
                                googleAccount.trim() || undefined,
                            );
                            setAddress("");
                            setName("");
                            setGoogleAccount("");
                        });
                    }}
                >
                    <h3 className="font-semibold">메일함 등록</h3>
                    <label className="block space-y-1.5">
                        <span className="block text-sm font-medium">보내는 이름</span>
                        <Input
                            className="border-border/70"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            maxLength={100}
                            disabled={busy}
                        />
                    </label>
                    <label className="block space-y-1.5">
                        <span className="block text-sm font-medium">문의 받을 주소</span>
                        <Input
                            type="email"
                            className="border-border/70"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            required
                            maxLength={254}
                            disabled={busy}
                        />
                    </label>
                    <label className="block space-y-1.5">
                        <span className="block text-sm font-medium">Google 로그인 계정 (다를 때만)</span>
                        <Input
                            type="email"
                            className="border-border/70"
                            value={googleAccount}
                            onChange={(e) => setGoogleAccount(e.target.value)}
                            maxLength={254}
                            disabled={busy}
                            placeholder="예: support@100office.kr"
                        />
                    </label>
                    <div className="flex justify-end">
                        <Button type="submit" disabled={busy || !data}>
                            등록
                        </Button>
                    </div>
                </form>
        </SettingsSection>
    );
}
