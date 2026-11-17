"use client";
import { Plus, X } from "lucide-react";
import { CONTACT_FIELD_LABELS, contactField, type MessengerLink, type MessengerSettings } from "@/lib/customer-messenger/rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
/** 사이트 상담창의 전화 문의·연락처 받기·링크 카드 */
export function MessengerSettingsFields({
    value,
    onChange,
}: {
    value: MessengerSettings;
    onChange: (settings: MessengerSettings) => void;
}) {
    const update = (patch: Partial<MessengerSettings>) => onChange({ ...value, ...patch });
    return (
        <div className="space-y-5">
            <div className="space-y-1.5">
                <label className="flex items-center justify-between gap-4 text-sm font-medium">
                    전화 문의
                    <Switch aria-label="전화 문의 사용" checked={value.phoneEnabled} onCheckedChange={(phoneEnabled) => update({ phoneEnabled })} />
                </label>
                {value.phoneEnabled && (
                    <Input
                        aria-label="전화번호"
                        type="tel"
                        className="border-border/70"
                        value={value.phone}
                        onChange={(e) => update({ phone: e.target.value })}
                        placeholder="02-1234-5678"
                        maxLength={30}
                        required
                        pattern="\+?[\d \-]{7,30}"
                    />
                )}
            </div>
            <div className="space-y-2">
                <label className="flex items-center justify-between gap-4 text-sm font-medium">
                    연락처 받기
                    <Switch aria-label="연락처 받기 사용" checked={value.contactEnabled} onCheckedChange={(contactEnabled) => update({ contactEnabled })} />
                </label>
                {value.contactEnabled && (
                    <>
                        <Textarea
                            aria-label="연락처 받기 안내 문구"
                            className="border-border/70"
                            rows={4}
                            maxLength={500}
                            value={value.contactPrompt}
                            onChange={(e) => update({ contactPrompt: e.target.value })}
                        />
                        <div className="divide-y divide-border/40 rounded-lg border border-border/40">
                            {contactField.options.map((f) => {
                                const on = value.contactFields.includes(f);
                                const last = on && value.contactFields.length === 1;
                                return (
                                    <label key={f} className="flex items-center justify-between px-4 py-2.5 text-sm">
                                        {CONTACT_FIELD_LABELS[f]}
                                        <Switch
                                            aria-label={`연락처 ${CONTACT_FIELD_LABELS[f]} 받기`}
                                            checked={on}
                                            // 한 칸은 남아 있어야 한다
                                            disabled={last}
                                            onCheckedChange={(checked) =>
                                                update({
                                                    contactFields: contactField.options.filter((x) => (x === f ? checked : value.contactFields.includes(x))),
                                                })
                                            }
                                        />
                                    </label>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
            <div className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-medium">링크 카드</span>
                    {value.links.length < 5 && (
                        <Button type="button" variant="outline" className="border-border/70" onClick={() => update({ links: [...value.links, { label: "", url: "" }] })}>
                            <Plus className="h-4 w-4" />
                            추가
                        </Button>
                    )}
                </div>
                {value.links.map((link, i) => {
                    const set = (patch: Partial<MessengerLink>) => update({ links: value.links.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
                    return (
                        <div key={i} className="flex gap-2">
                            <Input aria-label={`링크 ${i + 1} 문구`} className="w-48 shrink-0 border-border/70" maxLength={40} required placeholder="1:1 도입 상담 신청하기" value={link.label} onChange={(e) => set({ label: e.target.value })} />
                            <Input aria-label={`링크 ${i + 1} 주소`} type="url" className="border-border/70" required pattern="https://.+" placeholder="https://" value={link.url} onChange={(e) => set({ url: e.target.value })} />
                            <Button type="button" variant="ghost" size="icon" aria-label={`링크 ${i + 1} 삭제`} onClick={() => update({ links: value.links.filter((_, j) => j !== i) })}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
