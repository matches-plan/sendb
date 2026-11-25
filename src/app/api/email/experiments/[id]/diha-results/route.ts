import type { NextRequest } from "next/server";
import { z } from "zod";
import { copyAdminApi } from "@/lib/ai-copy/api";
import { dihaOutcomes } from "@/lib/email-experiments/diha-outcomes";

export const GET = (req: NextRequest, context: { params: Promise<{ id: string }> }) =>
    copyAdminApi(req, async (conn, user) =>
        dihaOutcomes(conn, user.orgId, z.coerce.number().int().positive().parse((await context.params).id), new Date()));
