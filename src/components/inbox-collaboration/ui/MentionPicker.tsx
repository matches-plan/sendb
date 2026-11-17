"use client";
import { cn } from "@/lib/utils";

/** 내부 메모 입력창 위에 뜨는 팀원 목록 (@로 태그) */
export function MentionPicker({
    items,
    active,
    onHover,
    onPick,
}: {
    items: { id: string; name: string }[];
    active: number;
    onHover: (i: number) => void;
    onPick: (i: number) => void;
}) {
    return (
        <ul
            role="listbox"
            aria-label="태그할 팀원"
            className="absolute bottom-full left-0 z-20 mb-2 max-h-60 w-56 overflow-y-auto rounded-lg border border-border/70 bg-background p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
            {items.map((m, i) => (
                <li
                    key={m.id}
                    role="option"
                    aria-selected={i === active}
                    ref={(el) => {
                        if (i === active) el?.scrollIntoView({ block: "nearest" });
                    }}
                    onMouseEnter={() => onHover(i)}
                    // 입력창 포커스를 잃지 않도록 mousedown에서 넣는다
                    onMouseDown={(e) => {
                        e.preventDefault();
                        onPick(i);
                    }}
                    className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm",
                        i === active ? "bg-amber-100/70 text-foreground" : "hover:bg-muted",
                    )}
                >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                        {m.name.slice(0, 1)}
                    </span>
                    <span className="truncate">{m.name}</span>
                </li>
            ))}
            {!items.length && <li className="px-3 py-2 text-sm text-muted-foreground">맞는 팀원이 없어요.</li>}
        </ul>
    );
}
