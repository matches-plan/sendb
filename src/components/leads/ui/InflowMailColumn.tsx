"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInflowMail } from "../hooks/useInflowMail";
import { formatDateTime } from "../utils/lead-fields";

/** 리드 상세 오른쪽 절반 — 콜드메일로 들어온 리드가 받은 메일 제목·본문 */
export function InflowMailColumn({ logId, onClose }: { logId: number; onClose: () => void }) {
    const { mail, error, isLoading } = useInflowMail(logId);
    return (
        <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-14 shrink-0 items-center justify-between border-b px-2">
                <span className="px-2 text-xs font-semibold text-muted-foreground">받은 콜드메일</span>
                <Button variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label="메일 닫기">
                    <X className="h-4 w-4" />
                </Button>
            </div>
            {isLoading ? (
                <p className="py-12 text-center text-sm text-muted-foreground">불러오는 중…</p>
            ) : error || !mail ? (
                <p role="alert" className="py-12 text-center text-sm text-muted-foreground">
                    메일을 불러오지 못했습니다.
                </p>
            ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="space-y-1 border-b px-6 py-4">
                        <p className="font-semibold leading-snug">{mail.subject || "(제목 없음)"}</p>
                        <p className="text-xs text-muted-foreground">
                            {[mail.partitionName, formatDateTime(mail.sentAt), mail.senderEmail && `${mail.senderEmail} → ${mail.recipientEmail}`]
                                .filter(Boolean)
                                .join(" · ")}
                        </p>
                    </div>
                    {mail.body ? (
                        <iframe srcDoc={mail.body} sandbox="" title="메일 본문" className="min-h-0 w-full flex-1 bg-white" />
                    ) : (
                        <p className="py-12 text-center text-sm text-muted-foreground">본문이 저장되지 않은 메일입니다.</p>
                    )}
                </div>
            )}
        </div>
    );
}
