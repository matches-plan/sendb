import { usePathname } from "next/navigation";

export type EmailPurpose = "cold" | "crm";

/** 템플릿·자동발송 화면이 어느 메뉴 소속인지 — /email(콜드메일) 또는 /crm-email(CRM관리 > 이메일) */
export function emailSectionOf(pathname: string | null): { purpose: EmailPurpose; base: "/email" | "/crm-email" } {
    return pathname?.startsWith("/crm-email") ? { purpose: "crm", base: "/crm-email" } : { purpose: "cold", base: "/email" };
}

export function useEmailSection() {
    return emailSectionOf(usePathname());
}
