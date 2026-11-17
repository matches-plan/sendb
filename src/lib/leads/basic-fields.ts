// 리드관리 파티션의 기본 칸(이름·이메일·연락처) — 화면·서버 공용 (DB 의존 없음)
// drizzle/0156_lead_basic_fields_first.sql 과 같은 규칙

export type BasicRole = "name" | "email" | "phone";

/** 화면·속성 순서 — 이 셋이 맨 위, 나머지는 그 아래 */
export const BASIC_ROLES: BasicRole[] = ["name", "email", "phone"];

export const BASIC_FIELD_DEFAULTS: Record<BasicRole, { key: string; altKey: string; label: string; fieldType: string }> = {
    name: { key: "name", altKey: "contactName", label: "이름", fieldType: "text" },
    email: { key: "email", altKey: "contactEmail", label: "이메일", fieldType: "email" },
    phone: { key: "phone", altKey: "contactPhone", label: "연락처", fieldType: "phone" },
};

/** 같은 뜻으로 보는 key·라벨·종류 — 앞에 있을수록 먼저 고른다 */
const RULES: Record<BasicRole, { keys: string[]; labels: string[]; fieldType?: string }> = {
    name: {
        keys: ["name", "contactName", "username", "fullName"],
        labels: ["이름", "성함", "성명", "담당자", "담당자명", "이름/직함", "고객명", "신청자", "신청자명"],
    },
    email: { keys: ["email", "contactEmail"], labels: ["이메일", "이메일 주소", "E-mail", "e-mail", "email"], fieldType: "email" },
    phone: {
        keys: ["phone", "contact", "mobile", "phoneNumber", "contactPhone", "tel"],
        labels: ["연락처", "전화번호", "휴대폰", "휴대폰 번호", "휴대폰번호", "휴대전화", "핸드폰"],
        fieldType: "phone",
    },
};

export interface BasicFieldLike {
    key: string;
    label: string;
    fieldType: string;
    isSystem?: number | boolean | null;
}

/** 한 역할에 맞는 칸 — key → 라벨 → 종류(email/phone) 순. 이미 다른 역할에 쓴 칸은 건너뛴다 */
export function findBasicField<T extends BasicFieldLike>(fields: T[], role: BasicRole, taken: Set<string> = new Set()): T | null {
    const rule = RULES[role];
    const usable = fields.filter((f) => !f.isSystem && f.fieldType !== "user_select" && !taken.has(f.key));
    for (const k of rule.keys) {
        const hit = usable.find((f) => f.key === k);
        if (hit) return hit;
    }
    for (const l of rule.labels) {
        const hit = usable.find((f) => f.label.trim() === l);
        if (hit) return hit;
    }
    if (rule.fieldType) return usable.find((f) => f.fieldType === rule.fieldType) ?? null;
    return null;
}

/** 이름·이메일·연락처 칸을 한 번에 찾는다 (같은 칸을 두 역할에 쓰지 않는다) */
export function findBasicFields<T extends BasicFieldLike>(fields: T[]): Record<BasicRole, T | null> {
    const taken = new Set<string>();
    const out = {} as Record<BasicRole, T | null>;
    for (const role of BASIC_ROLES) {
        const hit = findBasicField(fields, role, taken);
        if (hit) taken.add(hit.key);
        out[role] = hit;
    }
    return out;
}

/** 웹폼 질문이 어느 기본 칸 질문인지 — 질문 종류(email/phone)나 제목으로 */
export function basicRoleOfQuestion(q: { label: string; fieldType: string }): BasicRole | null {
    if (q.fieldType === "email") return "email";
    if (q.fieldType === "phone") return "phone";
    const label = q.label.trim();
    for (const role of BASIC_ROLES) {
        if (RULES[role].labels.includes(label)) return role;
    }
    return null;
}
