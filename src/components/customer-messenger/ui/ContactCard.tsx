"use client";
import type { FormEvent } from "react";
import { CONTACT_FIELD_LABELS, type ContactField } from "@/lib/customer-messenger/rules";

type Values = Record<ContactField, string>;
const INPUT: Record<ContactField, { type: string; autoComplete: string; maxLength: number }> = {
    name: { type: "text", autoComplete: "name", maxLength: 100 },
    phone: { type: "tel", autoComplete: "tel", maxLength: 30 },
    email: { type: "email", autoComplete: "email", maxLength: 254 },
};

/** 연락처 받기 카드 — 설정에서 고른 칸만 보인다 (미리보기에서도 같은 모양) */
export function ContactCard({
    fields,
    values,
    color,
    busy = false,
    saved = false,
    onChange,
    onSubmit,
}: {
    fields: ContactField[];
    values: Values;
    color: string;
    busy?: boolean;
    saved?: boolean;
    onChange?: (field: ContactField, value: string) => void;
    onSubmit?: () => void;
}) {
    const ready = !saved && fields.some((f) => values[f].trim());
    return (
        <form
            className="mt-3 space-y-4 rounded-2xl border border-gray-200 bg-white p-4"
            aria-label="연락처 남기기"
            onSubmit={(e: FormEvent) => {
                e.preventDefault();
                onSubmit?.();
            }}
        >
            {fields.map((f) => (
                <label key={f} className="block space-y-1.5">
                    <span className="block text-sm font-semibold text-gray-900">{CONTACT_FIELD_LABELS[f]}</span>
                    <input
                        aria-label={`연락처 ${CONTACT_FIELD_LABELS[f]}`}
                        {...INPUT[f]}
                        value={values[f]}
                        onChange={(e) => onChange?.(f, e.target.value)}
                        placeholder="입력하세요"
                        className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-400"
                    />
                </label>
            ))}
            <button
                type="submit"
                disabled={busy || !ready}
                className="w-full rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:bg-gray-100 disabled:text-gray-400"
                style={ready && !busy ? { backgroundColor: color, color: "white" } : undefined}
            >
                {busy ? "저장 중…" : saved ? "저장했어요" : "저장"}
            </button>
        </form>
    );
}
