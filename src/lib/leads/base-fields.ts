import { asc, eq, max } from "drizzle-orm";
import { db, fieldDefinitions } from "@/lib/db";
import { LEAD_STATUS_COLORS, LEAD_STATUS_DEFAULTS } from "./statuses";
import { BASIC_FIELD_DEFAULTS, BASIC_ROLES, findBasicField, findBasicFields, type BasicRole } from "./basic-fields";

// 새로 만드는 상태 칸의 선택지 — 테스트는 사업마다 설정에서 켠다
const LEAD_STATUS_OPTIONS = LEAD_STATUS_DEFAULTS.filter((s) => s !== "테스트");

/**
 * 리드 기본 칸 — 같은 뜻의 칸(key 또는 라벨)이 하나라도 있으면 그대로 두고, 없을 때만 만든다.
 * drizzle/0130_lead_base_fields.sql 과 같은 규칙.
 */
const BASE_FIELDS: Array<{
    keys: string[];
    labels?: string[];
    /** 이름·이메일·연락처 — key·라벨·종류로 같은 뜻의 칸을 찾는다 (./basic-fields) */
    role?: BasicRole;
    add: { key: string; label: string; fieldType: string; options?: string[]; optionColors?: Record<string, string>; trackHistory?: number; isGroupable?: number };
}> = [
    { keys: ["companyName", "companyname"], add: { key: "companyName", label: "기업명", fieldType: "text" } },
    { keys: ["contactName", "name"], role: "name", add: { key: "name", label: "이름", fieldType: "text" } },
    {
        keys: ["status"],
        add: { key: "status", label: "대응상태", fieldType: "select", options: [...LEAD_STATUS_OPTIONS], optionColors: LEAD_STATUS_COLORS, trackHistory: 1, isGroupable: 1 },
    },
    { keys: ["phone", "contact"], role: "phone", add: { key: "phone", label: "연락처", fieldType: "phone" } },
    { keys: ["email"], role: "email", add: { key: "email", label: "이메일", fieldType: "email" } },
    { keys: ["note", "memo"], labels: ["요청사항", "문의 내용", "문의내용"], add: { key: "note", label: "요청사항", fieldType: "textarea" } },
    { keys: ["source"], add: { key: "source", label: "유입경로", fieldType: "text" } },
];

/** 영업관리 칸 — 모든 사업이 같은 칸을 쓴다 (상태·요청사항·유입경로 없음) */
const SALES_FIELDS: typeof BASE_FIELDS = [
    { keys: ["companyName", "companyname"], add: { key: "companyName", label: "기업명", fieldType: "text" } },
    { keys: ["contactName", "name"], add: { key: "name", label: "이름", fieldType: "text" } },
    { keys: ["contactTitle", "title", "position"], add: { key: "contactTitle", label: "직책", fieldType: "text" } },
    { keys: ["phone", "contact"], add: { key: "phone", label: "연락처", fieldType: "phone" } },
    { keys: ["email"], add: { key: "email", label: "이메일", fieldType: "email" } },
    { keys: ["address"], add: { key: "address", label: "회사 주소", fieldType: "text" } },
    { keys: ["owner"], add: { key: "owner", label: "담당자", fieldType: "user_select" } },
    { keys: ["profileNote"], add: { key: "profileNote", label: "메모", fieldType: "textarea" } },
];

/**
 * 리드(영업) 파티션이 쓰는 속성 타입에 기본 칸이 없으면 채운다.
 * 리드관리(sales 아님)는 이름·이메일·연락처를 맨 위(0·1·2번)로 올리고 나머지는 원래 순서대로 그 아래에 둔다.
 */
export async function ensureLeadBaseFields(fieldTypeId: number | null | undefined, opts: { sales?: boolean } = {}) {
    if (!fieldTypeId) return;
    const existing = await db
        .select({ key: fieldDefinitions.key, label: fieldDefinitions.label, fieldType: fieldDefinitions.fieldType, isSystem: fieldDefinitions.isSystem })
        .from(fieldDefinitions)
        .where(eq(fieldDefinitions.fieldTypeId, fieldTypeId));
    const keys = new Set(existing.map((f) => f.key));
    const labels = new Set(existing.map((f) => f.label.trim()));
    const taken = new Set<string>();
    const missing = (opts.sales ? SALES_FIELDS : BASE_FIELDS).filter((b) => {
        if (b.role && !opts.sales) {
            const hit = findBasicField(existing, b.role, taken);
            if (hit) taken.add(hit.key);
            return !hit;
        }
        return !b.keys.some((k) => keys.has(k)) && !(b.labels ?? []).some((l) => labels.has(l));
    });

    if (missing.length > 0) {
        const [{ value: lastOrder } = { value: 0 }] = await db
            .select({ value: max(fieldDefinitions.sortOrder) })
            .from(fieldDefinitions)
            .where(eq(fieldDefinitions.fieldTypeId, fieldTypeId));
        await db.insert(fieldDefinitions).values(
            missing.map((b, i) => {
                // 같은 key가 다른 뜻으로 이미 쓰이면(예: 담당자 선택 칸 name) 예비 key로 만든다
                const key = b.role && keys.has(b.add.key) ? BASIC_FIELD_DEFAULTS[b.role].altKey : b.add.key;
                return {
                    fieldTypeId,
                    key,
                    label: b.add.label,
                    fieldType: b.add.fieldType,
                    options: b.add.options ?? null,
                    optionColors: b.add.optionColors ?? null,
                    trackHistory: b.add.trackHistory ?? 0,
                    isGroupable: b.add.isGroupable ?? 0,
                    sortOrder: (lastOrder ?? 0) + i + 1,
                };
            }),
        );
    }
    if (!opts.sales) await orderBasicFieldsFirst(fieldTypeId);
}

/** 이름·이메일·연락처를 0·1·2번으로, 나머지는 원래 순서(sortOrder, id)대로 3번부터 */
export async function orderBasicFieldsFirst(fieldTypeId: number) {
    const rows = await db
        .select({ id: fieldDefinitions.id, key: fieldDefinitions.key, label: fieldDefinitions.label, fieldType: fieldDefinitions.fieldType, isSystem: fieldDefinitions.isSystem, sortOrder: fieldDefinitions.sortOrder })
        .from(fieldDefinitions)
        .where(eq(fieldDefinitions.fieldTypeId, fieldTypeId))
        .orderBy(asc(fieldDefinitions.sortOrder), asc(fieldDefinitions.id));
    const basics = findBasicFields(rows);
    const firstIds = BASIC_ROLES.map((r) => basics[r]?.id).filter((id): id is number => id !== undefined);
    const ordered = [...firstIds.map((id) => rows.find((r) => r.id === id)!), ...rows.filter((r) => !firstIds.includes(r.id))];
    for (const [i, row] of ordered.entries()) {
        if (row.sortOrder !== i) await db.update(fieldDefinitions).set({ sortOrder: i }).where(eq(fieldDefinitions.id, row.id));
    }
}

export async function ensureLeadBaseFieldsForTypes(fieldTypeIds: Array<number | null | undefined>) {
    for (const id of new Set(fieldTypeIds.filter((v): v is number => !!v))) {
        await ensureLeadBaseFields(id);
    }
}
