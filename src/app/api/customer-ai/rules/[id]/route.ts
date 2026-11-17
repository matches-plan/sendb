import { NextRequest } from "next/server";
import { z } from "zod";
import { handleInbox, inboxActor, jsonBody } from "@/lib/inbox/http";
import { updateRule, deleteRule } from "@/lib/customer-ai/library";
type C = { params: Promise<{ id: string }> };
const id = z.coerce.number().int().positive();
export const PATCH = (req: NextRequest, ctx: C) =>
    handleInbox(async () => updateRule(inboxActor(req), id.parse((await ctx.params).id), await jsonBody(req)));
export const DELETE = (req: NextRequest, ctx: C) =>
    handleInbox(async () => deleteRule(inboxActor(req), id.parse((await ctx.params).id)));
