"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PRESETS = ["#635BFF", "#7C3AED", "#2563EB", "#0EA5E9", "#10B981", "#F97316", "#EF4444", "#1E293B"];
const HEX = /^#[0-9a-fA-F]{6}$/;

/** 색 고르기 — 자주 쓰는 색 칩 + #RRGGBB 직접 입력 */
export function ColorField({ value, onChange, label }: { value: string; onChange: (color: string) => void; label: string }) {
    const [text, setText] = useState(value);
    const [prev, setPrev] = useState(value);
    if (prev !== value) {
        setPrev(value);
        setText(value);
    }
    return (
        <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((c) => {
                const on = c.toLowerCase() === value.toLowerCase();
                return (
                    <button
                        key={c}
                        type="button"
                        aria-label={`${label} ${c}`}
                        aria-pressed={on}
                        onClick={() => onChange(c)}
                        className={cn("flex h-7 w-7 items-center justify-center rounded-full", on && "ring-2 ring-offset-2")}
                        style={{ backgroundColor: c, ["--tw-ring-color" as string]: c }}
                    >
                        {on && <Check className="h-4 w-4 text-white" />}
                    </button>
                );
            })}
            <div className="relative ml-1 w-32">
                <span className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 rounded" style={{ backgroundColor: HEX.test(text) ? text : value }} />
                <Input
                    aria-label={`${label} 직접 입력`}
                    className="border-border/70 pl-8 font-mono uppercase"
                    maxLength={7}
                    value={text}
                    onChange={(e) => {
                        const next = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
                        setText(next);
                        if (HEX.test(next)) onChange(next.toUpperCase());
                    }}
                    onBlur={() => setText(value)}
                />
            </div>
        </div>
    );
}
