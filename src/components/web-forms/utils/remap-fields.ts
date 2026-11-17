import { basicRoleOfQuestion, findBasicFields, BASIC_ROLES, type BasicFieldLike, type BasicRole } from "@/lib/leads/basic-fields";
import type { FormFieldItem } from "../FormBuilder";

type FieldLike = BasicFieldLike;

/** 연결 안 된 이름·이메일·연락처 질문을 파티션의 기본 칸에 잇는다 */
export function autoLinkBasic<Q extends Pick<FormFieldItem, "label" | "fieldType" | "linkedFieldKey">>(questions: Q[], fields: FieldLike[]): Q[] {
    const basics = findBasicFields(fields);
    const used = new Set(questions.map((q) => q.linkedFieldKey).filter(Boolean));
    return questions.map((q) => {
        if (q.linkedFieldKey) return q;
        const role = basicRoleOfQuestion(q);
        const target = role ? basics[role] : null;
        if (!target || used.has(target.key)) return q;
        used.add(target.key);
        return { ...q, linkedFieldKey: target.key };
    });
}

/** 새 웹 폼 기본 질문 — 파티션의 이름·이메일·연락처 칸에 연결 */
export function basicQuestions(fields: FieldLike[]) {
    const basics = findBasicFields(fields);
    const meta: Record<BasicRole, { label: string; fieldType: string }> = {
        name: { label: "이름", fieldType: "text" },
        email: { label: "이메일", fieldType: "email" },
        phone: { label: "연락처", fieldType: "phone" },
    };
    return BASIC_ROLES.map((role) => ({
        label: meta[role].label,
        description: "",
        placeholder: "",
        fieldType: meta[role].fieldType,
        linkedFieldKey: basics[role]?.key ?? "",
        isRequired: role !== "phone",
        options: [] as string[],
    }));
}

function roleOfKey(key: string, fields: FieldLike[]): BasicRole | null {
    const basics = findBasicFields(fields);
    return BASIC_ROLES.find((r) => basics[r]?.key === key) ?? null;
}

/** 옛 파티션의 칸 key → 새 파티션의 칸 key (같은 key → 같은 라벨 → 이름·이메일·연락처 역할 순). 못 찾으면 null */
function matchKey(key: string, from: FieldLike[], to: FieldLike[], hint?: { label: string; fieldType: string }): string | null {
    if (to.some((f) => f.key === key)) return key;
    const old = from.find((f) => f.key === key);
    if (old) {
        const sameLabel = to.find((f) => f.label.trim() === old.label.trim());
        if (sameLabel) return sameLabel.key;
    }
    const role = roleOfKey(key, from) ?? (hint ? basicRoleOfQuestion(hint) : null);
    return role ? findBasicFields(to)[role]?.key ?? null : null;
}

export interface PartitionRemap {
    fields: FormFieldItem[];
    defaultValues: { field: string; value: string }[];
    /** 연결이 바뀌거나 새로 이어진 질문 */
    relinked: { label: string; from: string; to: string }[];
    /** 새 파티션에 맞는 칸이 없어 연결이 풀리는(또는 원래 없던) 질문 */
    unlinked: string[];
    /** 새 파티션에 맞는 칸이 없어 빠지는 기본값 */
    droppedDefaults: string[];
}

/** 웹 폼의 연결 파티션을 바꿀 때 질문·기본값의 연결 칸을 새 파티션 칸으로 다시 잇는다 */
export function remapToPartition(
    questions: FormFieldItem[],
    defaultValues: { field: string; value: string }[],
    from: FieldLike[],
    to: FieldLike[],
): PartitionRemap {
    const labelOf = (fields: FieldLike[], key: string) => fields.find((f) => f.key === key)?.label ?? key;
    const relinked: PartitionRemap["relinked"] = [];
    const unlinked: string[] = [];
    const used = new Set<string>();

    const mapped = questions.map((q) => {
        const next = q.linkedFieldKey ? matchKey(q.linkedFieldKey, from, to, q) : null;
        if (next && !used.has(next)) {
            used.add(next);
            if (labelOf(from, q.linkedFieldKey) !== labelOf(to, next) || q.linkedFieldKey !== next) {
                relinked.push({ label: q.label, from: labelOf(from, q.linkedFieldKey), to: labelOf(to, next) });
            }
            return { ...q, linkedFieldKey: next };
        }
        return { ...q, linkedFieldKey: "" };
    });
    // 연결이 풀린 질문 중 이름·이메일·연락처는 새 파티션 기본 칸에 잇는다
    const linked = autoLinkBasic(mapped, to).map((q, i) => {
        if (!mapped[i].linkedFieldKey && q.linkedFieldKey) {
            relinked.push({ label: q.label, from: questions[i].linkedFieldKey ? labelOf(from, questions[i].linkedFieldKey) : "연결 안 함", to: labelOf(to, q.linkedFieldKey) });
        }
        if (!q.linkedFieldKey) unlinked.push(q.label || "이름 없는 질문");
        return q;
    });

    const droppedDefaults: string[] = [];
    const nextDefaults = defaultValues.flatMap((dv) => {
        if (!dv.field) return [dv];
        const key = matchKey(dv.field, from, to);
        if (!key) {
            droppedDefaults.push(labelOf(from, dv.field));
            return [];
        }
        return [{ ...dv, field: key }];
    });

    return { fields: linked, defaultValues: nextDefaults, relinked, unlinked, droppedDefaults };
}
