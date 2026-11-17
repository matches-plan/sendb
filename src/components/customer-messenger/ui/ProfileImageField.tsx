"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ProfileAvatar } from "./ProfileAvatar";
import { squareImage } from "../utils/square-image";

/** 상담창 프로필 이미지 — 가운데를 1:1로 잘라 올린다 */
export function ProfileImageField({
    value,
    name,
    color,
    onChange,
}: {
    value: string;
    name: string;
    color: string;
    onChange: (url: string) => void;
}) {
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    async function upload(file: File) {
        setBusy(true);
        try {
            const form = new FormData();
            form.append("file", await squareImage(file), "profile.png");
            form.append("folder", "messenger");
            const res = await fetch("/api/upload", { method: "POST", body: form });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || "이미지를 올리지 못했어요.");
            onChange(json.data.url);
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="flex items-center gap-4">
            <ProfileAvatar src={value} name={name || "고객 상담"} color={color} size={56} />
            <input
                ref={input}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void upload(file);
                }}
            />
            <Button type="button" variant="outline" className="border-border/70" disabled={busy} onClick={() => input.current?.click()}>
                {busy ? "올리는 중…" : value ? "변경" : "이미지 올리기"}
            </Button>
            {value && (
                <Button type="button" variant="ghost" disabled={busy} onClick={() => onChange("")}>
                    삭제
                </Button>
            )}
        </div>
    );
}
