"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";
import { renameEmailMailbox } from "../api";
import type { EmailMailbox } from "../types";
/** 고객이 받는 답장의 보내는 이름(From 표시 이름). 바꿔도 발송 대기 답장은 취소되지 않는다. */
export function MailboxName({
    box,
    onChange,
}: {
    box: EmailMailbox;
    onChange: () => Promise<unknown>;
}) {
    const [name, setName] = useState(box.name),
        [busy, setBusy] = useState(false);
    return (
        <form
            className="space-y-1.5"
            onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                    await renameEmailMailbox(
                        box.id,
                        box.version,
                        box.enabled,
                        name.trim(),
                    );
                    await onChange();
                    toast.success("저장했어요.");
                } catch (e) {
                    toast.error((e as Error).message);
                } finally {
                    setBusy(false);
                }
            }}
        >
            <span className="block text-sm font-medium">보내는 이름</span>
            <div className="flex gap-2">
                <Input aria-label={`${box.address} 보내는 이름`} className="border-border/70" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
                <Button type="submit" variant="outline" className="border-border/70" disabled={busy || !name.trim() || name.trim() === box.name}>
                    저장
                </Button>
            </div>
        </form>
    );
}
