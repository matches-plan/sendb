import { NextRequest } from "next/server";
import { z } from "zod";
import { handleInbox, inboxActor, jsonBody } from "@/lib/inbox/http";
import { listDocs, createDoc } from "@/lib/customer-ai/library";
const workspace = z.coerce.number().int().positive("사업을 선택해주세요.");
export const GET = (req: NextRequest) =>
    handleInbox(() => listDocs(inboxActor(req), workspace.parse(req.nextUrl.searchParams.get("workspaceId"))));
export const POST = (req: NextRequest) =>
    handleInbox(async () => {
        const { workspaceId, ...input } = await jsonBody(req, 40000);
        return createDoc(inboxActor(req), workspace.parse(workspaceId), input);
    });
