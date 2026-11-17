import { NextRequest } from "next/server";
import { z } from "zod";
import { handleInbox, inboxActor } from "@/lib/inbox/http";
import { contactList } from "@/lib/customer-contacts/list";

/** 상담 연락처 화면 — 사업부 연락처 전부 */
export async function GET(req: NextRequest) {
    return handleInbox(async () =>
        contactList(inboxActor(req), z.coerce.number().int().positive().parse(req.nextUrl.searchParams.get("workspaceId"))),
    );
}
