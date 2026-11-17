"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";
import { changeGoogleAccount } from "../api";
import type { EmailMailbox } from "../types";
export function MailboxGoogleAccount({
    box,
    onChange,
}: {
    box: EmailMailbox;
    onChange: () => Promise<unknown>;
}) {
    const current = box.googleAccount || box.address;
    const [account, setAccount] = useState(current),
        [busy, setBusy] = useState(false);
    return (
        <form
            className="space-y-1.5"
            onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                    await changeGoogleAccount(box.id, box.version, account);
                    await onChange();
                    toast.success("저장했어요. 수신·발송이 중지됐으니 Google 계정을 연결해주세요.");
                } catch (e) {
                    toast.error((e as Error).message);
                } finally {
                    setBusy(false);
                }
            }}
        >
            <span className="block text-sm font-medium">Google 로그인 계정</span>
            <div className="flex gap-2">
                <Input aria-label={`${box.address} Google 로그인 계정`} className="border-border/70" type="email" required maxLength={254} value={account} onChange={(e) => setAccount(e.target.value)} disabled={busy} />
                <Button type="submit" variant="outline" className="border-border/70" disabled={busy || account.trim().toLowerCase() === current}>
                    저장
                </Button>
            </div>
        </form>
    );
}
