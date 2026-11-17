import type { ContactListRow } from "../types";

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** 유입경로 — utm(첫 방문) 우선, 없으면 들어온 사이트 주소, 상담창에서 받은 연락처는 "상담창" */
export function contactSource(a: Record<string, unknown>) {
    const utm = [text(a.utmSource), text(a.utmMedium)].filter(Boolean).join(" / ");
    const campaign = text(a.utmCampaign);
    if (utm) return campaign ? `${utm} · ${campaign}` : utm;
    const referrer = text(a.referrer);
    if (!referrer) return text(a.source) === "messenger" ? "상담창" : "";
    try {
        return new URL(referrer).hostname.replace(/^www\./, "");
    } catch {
        return referrer;
    }
}

export type SortKey = "company" | "name" | "email" | "phone" | "source" | "createdAt";
export type Sort = { key: SortKey; dir: "asc" | "desc" };
export type ContactView = ContactListRow & { source: string };
export type ContactGroup = { key: string; company: string; rows: ContactView[] };

const collator = new Intl.Collator("ko");
function value(row: ContactView, key: SortKey) {
    return key === "company" ? companyKey(row.company) : key === "createdAt" ? row.createdAt : row[key];
}
/** 빈 값은 오름·내림 어느 쪽이든 맨 뒤 */
function compare(a: ContactView, b: ContactView, sort: Sort) {
    const x = value(a, sort.key),
        y = value(b, sort.key);
    if (!x !== !y) return x ? -1 : 1;
    const c = sort.key === "createdAt" ? Date.parse(x) - Date.parse(y) : collator.compare(x, y);
    return sort.dir === "asc" ? c : -c;
}

/** 같은 기업으로 볼 이름 — (주)·주식회사·띄어쓰기·대소문자 차이는 무시한다 */
export function companyKey(name: string) {
    return name
        .toLowerCase()
        .replace(/\(주\)|㈜|주식회사|\(유\)|유한회사/g, "")
        .replace(/[\s.,·]/g, "");
}

/** 같은 기업명끼리 묶고(기업명 없는 연락처는 한 명씩), 고른 칸 기준으로 정렬한다 */
export function groupContacts(rows: ContactListRow[], sort: Sort, query = ""): ContactGroup[] {
    const q = query.trim().toLowerCase();
    const views = rows
        .map((r) => ({ ...r, source: contactSource(r.attributes) }))
        .filter((r) => !q || [r.company, r.name, r.email, r.phone, r.source].some((v) => v.toLowerCase().includes(q)));
    const groups = new Map<string, ContactGroup>();
    for (const row of views) {
        const company = companyKey(row.company);
        const key = company ? `c:${company}` : `p:${row.id}`;
        const group = groups.get(key) ?? { key, company: row.company, rows: [] };
        group.rows.push(row);
        groups.set(key, group);
    }
    const list = [...groups.values()];
    for (const g of list) g.rows.sort((a, b) => compare(a, b, sort.key === "company" ? { key: "createdAt", dir: "desc" } : sort));
    return list.sort((a, b) => compare(a.rows[0], b.rows[0], sort));
}
