import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db, crmCompanies, crmContactCompanies, crmContacts } from "@/lib/db";
import type { DbExec } from "@/lib/db/tx";
import { requireCustomerAccess, type CustomerActor } from "@/lib/customer-access/access";

export type ContactRow = {
    id: string;
    version: number;
    name: string;
    email: string;
    phone: string;
    company: string;
    attributes: Record<string, unknown>;
    createdAt: Date;
};

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** 상담 연락처 목록 — 사업부의 보관 안 된 연락처 전부 (화면에서 정렬·묶음·검색) */
export async function contactList(actor: CustomerActor, workspaceId: number, exec: DbExec = db): Promise<ContactRow[]> {
    await requireCustomerAccess(actor, workspaceId, "read", exec);
    const rows = await exec
        .select({
            id: crmContacts.id,
            version: crmContacts.version,
            name: crmContacts.name,
            email: crmContacts.email,
            phone: crmContacts.phone,
            attributes: crmContacts.attributes,
            createdAt: crmContacts.createdAt,
        })
        .from(crmContacts)
        .where(and(eq(crmContacts.orgId, actor.orgId), eq(crmContacts.workspaceId, workspaceId), isNull(crmContacts.archivedAt)))
        .orderBy(asc(crmContacts.createdAt))
        .limit(20000);
    const links = rows.length
        ? await exec
              .select({ contactId: crmContactCompanies.contactId, name: crmCompanies.name })
              .from(crmContactCompanies)
              .innerJoin(crmCompanies, eq(crmCompanies.id, crmContactCompanies.companyId))
              .where(and(eq(crmCompanies.workspaceId, workspaceId), inArray(crmContactCompanies.contactId, rows.map((r) => r.id))))
        : [];
    const companyOf = new Map(links.map((l) => [l.contactId, l.name]));
    return rows.map((r) => {
        const a = r.attributes ?? {};
        return {
            id: r.id,
            version: r.version,
            name: r.name,
            email: r.email ?? "",
            phone: r.phone || text(a.mobileNumber) || text(a.landlineNumber),
            company: companyOf.get(r.id) || text(a.companyName),
            attributes: pickSource(a),
            createdAt: r.createdAt,
        };
    });
}

/** 유입경로에 쓰는 값만 보낸다 */
function pickSource(a: Record<string, unknown>) {
    const keys = ["utmSource", "utmMedium", "utmCampaign", "referrer", "source"];
    return Object.fromEntries(keys.filter((k) => a[k] != null).map((k) => [k, a[k]]));
}
