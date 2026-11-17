import { db } from "@/lib/db";
import { getActiveUserFromNextRequest } from "@/lib/auth";
import { recordUnsubscribe, removeUnsubscribe } from "@/lib/email-unsubscribe";
import { workspaceInOrg } from "@/lib/workspace-in-org";
import { createUnsubscribeManagementHandlers } from "./email-unsubscribe-management-handlers";
import { createUnsubscribeManagementRepository } from "./email-unsubscribe-management-repository";

export const unsubscribeManagementHandlers = createUnsubscribeManagementHandlers({
    authenticate: (request) => getActiveUserFromNextRequest(request),
    workspaceInOrg,
    ...createUnsubscribeManagementRepository(db),
    async register(orgId, input) {
        await recordUnsubscribe({ orgId, workspaceId: input.workspaceId, email: input.email, reason: input.reason || null, source: "manual" });
    },
    remove: removeUnsubscribe,
});
