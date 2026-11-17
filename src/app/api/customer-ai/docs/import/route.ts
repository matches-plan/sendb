import { NextRequest } from "next/server";
import { z } from "zod";
import { handleInbox, inboxActor, jsonBody } from "@/lib/inbox/http";
import { importDoc } from "@/lib/customer-ai/library";
const workspace = z.coerce.number().int().positive("사업을 선택해주세요.");
// AI 정리에 시간이 걸린다
export const maxDuration = 240;
export const POST = (req: NextRequest) =>
    handleInbox(async () => {
        const { workspaceId, ...input } = await jsonBody(req, 250000);
        return importDoc(inboxActor(req), workspace.parse(workspaceId), input);
    });
