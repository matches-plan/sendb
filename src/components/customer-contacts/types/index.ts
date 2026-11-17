/** /api/customer-crm/contact-list 한 줄 (src/lib/customer-contacts/list.ts) */
export type ContactListRow = {
    id: string;
    version: number;
    name: string;
    email: string;
    phone: string;
    company: string;
    attributes: Record<string, unknown>;
    createdAt: string;
};
