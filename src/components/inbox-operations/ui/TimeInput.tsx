"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const times = Array.from({ length: 49 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

/** 시각 입력 — 직접 치거나(HH:mm) 아래로 열리는 30분 단위 목록에서 고른다. 24:00은 자정 종료 */
export function TimeInput({ value, onChange, ariaLabel, disabled }: { value: string; onChange: (v: string) => void; ariaLabel: string; disabled?: boolean }) {
    const [open, setOpen] = useState(false);
    return (
        <Popover open={open && !disabled} onOpenChange={setOpen}>
            <PopoverAnchor asChild>
                <Input
                    aria-label={ariaLabel}
                    className="w-24 border-border/70 tabular-nums"
                    value={value}
                    placeholder="09:00"
                    disabled={disabled}
                    maxLength={5}
                    onFocus={() => setOpen(true)}
                    onClick={() => setOpen(true)}
                    onChange={(e) => onChange(e.target.value)}
                />
            </PopoverAnchor>
            <PopoverContent
                align="start"
                className="max-h-60 w-28 overflow-y-auto p-1 scrollbar-thin"
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                {times.map((t) => (
                    <button
                        key={t}
                        type="button"
                        ref={(el) => {
                            if (t === value) el?.scrollIntoView({ block: "center" });
                        }}
                        onClick={() => {
                            onChange(t);
                            setOpen(false);
                        }}
                        className={cn("block w-full rounded-md px-2 py-1.5 text-left text-sm tabular-nums hover:bg-accent", t === value && "bg-accent font-medium")}
                    >
                        {t}
                    </button>
                ))}
            </PopoverContent>
        </Popover>
    );
}
