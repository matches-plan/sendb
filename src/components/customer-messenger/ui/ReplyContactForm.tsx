"use client";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { inboxRequest } from "@/components/inbox/api";
import type { ContactField, ReplyContactDraft } from "@/lib/customer-messenger/rules";
import { ContactCard } from "./ContactCard";
type Contact = {
    name: string;
    phone: string;
    email: string;
    consent: boolean;
};
/** 고객 첫 메시지 뒤에 나오는 연락처 받기 카드. 남긴 이메일·전화번호로 답변 알림을 보낸다 (안내 문구로 목적을 알린다) */
export function ReplyContactForm({
    channelKey,
    token,
    conversationId,
    profile,
    color,
    fields,
    onDraft,
    initialDraft,
}: {
    channelKey: string;
    token: string;
    conversationId: string;
    profile?: { name: string; email: string | null };
    /** 상담창 포인트 컬러 */
    color: string;
    fields: ContactField[];
    onDraft: (draft: ReplyContactDraft | null) => void;
    initialDraft?: ReplyContactDraft | null;
}) {
    const url = `/api/messenger/${channelKey}/contact?conversationId=${encodeURIComponent(conversationId)}`;
    const data = useSWR<Contact>(token ? [url, token] : null, ([u, t]: [string, string]) =>
        inboxRequest(u, { headers: { Authorization: `Bearer ${t}` } }),
    );
    const [values, setValues] = useState<Record<ContactField, string>>({
        name: initialDraft?.name ?? (profile?.name === "방문 고객" ? "" : (profile?.name ?? "")),
        phone: initialDraft?.phone ?? "",
        email: initialDraft?.email ?? profile?.email ?? "",
    });
    const [busy, setBusy] = useState(false),
        [saved, setSaved] = useState(false),
        [error, setError] = useState("");
    const touched = useRef(false);
    useEffect(() => {
        if (touched.current || !data.data) return;
        const c = data.data;
        setValues({ name: c.name, phone: c.phone, email: c.email });
        setSaved(fields.some((f) => !!c[f]));
    }, [data.data, fields]);
    async function act(body: unknown) {
        setBusy(true);
        setError("");
        try {
            const result = await inboxRequest(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            await data.mutate();
            return result;
        } catch (e) {
            setError((e as Error).message);
            return null;
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="text-sm">
            <ContactCard
                fields={fields}
                values={values}
                color={color}
                busy={busy}
                saved={saved}
                onChange={(field, value) => {
                    touched.current = true;
                    onDraft(null);
                    setSaved(false);
                    setValues((v) => ({ ...v, [field]: value }));
                }}
                onSubmit={async () => {
                    const email = fields.includes("email") ? values.email : (data.data?.email ?? "");
                    const draft: ReplyContactDraft = {
                        action: "contact",
                        name: fields.includes("name") ? values.name : (data.data?.name ?? ""),
                        phone: fields.includes("phone") ? values.phone : (data.data?.phone ?? ""),
                        email,
                        notifyEmail: !!email.trim(),
                    };
                    if (await act(draft)) {
                        onDraft(null);
                        touched.current = false;
                        setSaved(true);
                    }
                }}
            />
            {error && (
                <p role="alert" className="mt-2 text-xs text-red-600">
                    {error}
                </p>
            )}
        </div>
    );
}
