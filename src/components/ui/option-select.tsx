"use client";

import * as React from "react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Radix Select는 빈 문자열 값을 못 쓴다 — 안에서만 이 값으로 바꿔 쓴다 */
const EMPTY = "__none__";
const toItem = (v: string) => (v === "" ? EMPTY : v);
const fromItem = (v: string) => (v === EMPTY ? "" : v);

type OptionNode = { kind: "option"; value: string; label: React.ReactNode; disabled?: boolean } | { kind: "group"; label: React.ReactNode; options: OptionNode[] };

function readOptions(children: React.ReactNode): OptionNode[] {
    const out: OptionNode[] = [];
    React.Children.forEach(children, (child) => {
        if (!React.isValidElement(child)) return;
        const props = child.props as { value?: unknown; children?: React.ReactNode; disabled?: boolean; label?: React.ReactNode };
        if (child.type === React.Fragment) {
            out.push(...readOptions(props.children));
        } else if (child.type === "option") {
            const value = props.value === undefined ? String(React.Children.toArray(props.children).join("")) : String(props.value);
            out.push({ kind: "option", value, label: props.children, disabled: props.disabled });
        } else if (child.type === "optgroup") {
            out.push({ kind: "group", label: props.label, options: readOptions(props.children) });
        }
    });
    return out;
}

/** onChange는 기본 선택칸처럼 e.target.value로 고른 값을 준다 — 기존 핸들러를 그대로 쓸 수 있다 */
export type OptionSelectChange = { target: { value: string; name?: string }; currentTarget: { value: string; name?: string } };

export interface OptionSelectProps {
    value?: string | number | readonly string[];
    defaultValue?: string | number;
    onChange?: (e: OptionSelectChange) => void;
    disabled?: boolean;
    required?: boolean;
    name?: string;
    id?: string;
    className?: string;
    title?: string;
    children?: React.ReactNode;
    "aria-label"?: string;
    "aria-labelledby"?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean | "true" | "false";
}

/**
 * 기본 `<select>` 자리에 그대로 넣는 디자인된 선택칸. 안의 `<option>`·`<optgroup>`을 읽어 Select 목록으로 바꾼다.
 * 목록은 선택칸 바로 아래에 연다 (SelectContent 기본값).
 */
export function OptionSelect({ value, defaultValue, onChange, children, className, id, title, disabled, required, name, ...aria }: OptionSelectProps) {
    const options = readOptions(children);
    const flat = options.flatMap((o) => (o.kind === "group" ? o.options : [o])).filter((o): o is Extract<OptionNode, { kind: "option" }> => o.kind === "option");
    const controlled = value !== undefined;
    // 값을 안 준 선택칸은 기본 선택칸처럼 첫 항목에서 시작한다
    const [inner, setInner] = React.useState(() => (defaultValue !== undefined ? String(defaultValue) : flat[0]?.value ?? ""));
    const current = controlled ? String(value) : inner;
    // 값이 목록에 없으면(기본 선택칸은 첫 항목을 보인다) 첫 항목 이름을 보인다
    const shown = !flat.some((o) => o.value === current) ? flat[0] : undefined;

    const renderItem = (o: Extract<OptionNode, { kind: "option" }>, i: number) => (
        <SelectItem key={`${o.value}-${i}`} value={toItem(o.value)} disabled={o.disabled}>
            {o.label}
        </SelectItem>
    );

    return (
        <>
        {/* 폼 전송 값 — 안에서 쓰는 빈 값 표시(__none__)가 아니라 실제 값이 나가게 직접 둔다 */}
        {name && <input type="hidden" name={name} value={shown ? shown.value : current} disabled={disabled} />}
        <Select
            value={toItem(shown ? shown.value : current)}
            onValueChange={(v) => {
                const next = fromItem(v);
                if (!controlled) setInner(next);
                onChange?.({ target: { value: next, name }, currentTarget: { value: next, name } });
            }}
            disabled={disabled}
            required={required}
        >
            <SelectTrigger id={id} title={title} className={className} {...aria}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {options.map((o, i) =>
                    o.kind === "group" ? (
                        <SelectGroup key={`g-${i}`}>
                            <SelectLabel>{o.label}</SelectLabel>
                            {o.options.map((c, j) => (c.kind === "option" ? renderItem(c, j) : null))}
                        </SelectGroup>
                    ) : (
                        renderItem(o, i)
                    )
                )}
            </SelectContent>
        </Select>
        </>
    );
}
