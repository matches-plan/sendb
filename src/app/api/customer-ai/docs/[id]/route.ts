import { NextRequest } from "next/server";
import { z } from "zod";
import { handleInbox, inboxActor, jsonBody } from "@/lib/inbox/http";
import { updateDoc, deleteDoc } from "@/lib/customer-ai/library";
type C = { params: Promise<{ id: string }> };
const id = z.coerce.number().int().positive();
export const PATCH = (req: NextRequest, ctx: C) =>
    handleInbox(async () => updateDoc(inboxActor(req), id.parse((await ctx.params).id), await jsonBody(req, 40000)));
export const DELETE = (req: NextRequest, ctx: C) =>
    handleInbox(async () => deleteDoc(inboxActor(req), id.parse((await ctx.params).id)));
