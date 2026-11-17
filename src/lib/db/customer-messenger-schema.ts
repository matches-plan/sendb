import {
    pgTable,
    uuid,
    integer,
    varchar,
    boolean,
    timestamp,
    index,
    uniqueIndex,
} from "drizzle-orm/pg-core";
import { inboxConversations, inboxMessages } from "./inbox-schema";
import { crmContacts } from "./customer-platform-schema";
const time = (name: string) =>
    timestamp(name, { withTimezone: true, precision: 3 });
export const customerReplyContacts = pgTable(
    "customer_reply_contacts",
    {
        conversationId: uuid("conversation_id")
            .primaryKey()
            .references(() => inboxConversations.id, { onDelete: "cascade" }),
        name: varchar("name", { length: 100 }).notNull().default(""),
        phone: varchar("phone", { length: 30 }).notNull().default(""),
        email: varchar("email", { length: 254 }).notNull().default(""),
        notifyEmail: boolean("notify_email").notNull().default(false),
        consentAt: time("consent_at"),
        verifiedAt: time("verified_at"),
        verificationHash: varchar("verification_hash", { length: 64 }),
        verificationExpiresAt: time("verification_expires_at"),
        verificationSentAt: time("verification_sent_at"),
        verificationAttempts: integer("verification_attempts")
            .notNull()
            .default(0),
        verificationSends: integer("verification_sends").notNull().default(0),
        readMessageId: integer("read_message_id").notNull().default(0),
        /** 남긴 연락처를 합친 고객 연락처 (drizzle/0153) */
        crmContactId: uuid("crm_contact_id").references(() => crmContacts.id, { onDelete: "set null" }),
        version: integer("version").notNull().default(1),
        updatedAt: time("updated_at").notNull().defaultNow(),
    },
    (t) => [
        index("customer_reply_contact_email").on(t.email, t.verificationSentAt),
    ],
);
export const customerReplyNotifications = pgTable(
    "customer_reply_notifications",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        conversationId: uuid("conversation_id")
            .notNull()
            .references(() => inboxConversations.id, { onDelete: "cascade" }),
        messageId: integer("message_id")
            .notNull()
            .references(() => inboxMessages.id, { onDelete: "cascade" }),
        contactVersion: integer("contact_version").notNull(),
        /** email | alimtalk (drizzle/0153) */
        medium: varchar("medium", { length: 10 }).notNull().default("email"),
        recipient: varchar("recipient", { length: 254 }).notNull().default(""),
        state: varchar("state", { length: 20 }).notNull().default("pending"),
        dueAt: time("due_at").notNull(),
        claimedAt: time("claimed_at"),
        providerId: varchar("provider_id", { length: 200 }),
        reason: varchar("reason", { length: 200 }),
        sentAt: time("sent_at"),
        createdAt: time("created_at").notNull().defaultNow(),
    },
    (t) => [
        uniqueIndex("customer_reply_notice_once").on(t.messageId, t.medium),
        index("customer_reply_notice_due").on(t.state, t.dueAt),
    ],
);

/** 답변 알림 링크로 다른 기기에서 지난 상담을 여는 접속 열쇠 (원래 브라우저의 열쇠는 그대로 둔다, drizzle/0153) */
export const inboxVisitorAccess = pgTable(
    "inbox_visitor_access",
    {
        tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
        conversationId: uuid("conversation_id")
            .notNull()
            .references(() => inboxConversations.id, { onDelete: "cascade" }),
        expiresAt: time("expires_at").notNull(),
        createdAt: time("created_at").notNull().defaultNow(),
    },
    (t) => [index("inbox_visitor_access_conversation").on(t.conversationId)],
);
