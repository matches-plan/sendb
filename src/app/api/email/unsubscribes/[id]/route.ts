import type { NextRequest } from "next/server";
import { unsubscribeManagementHandlers } from "@/lib/email-unsubscribe-management";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    return unsubscribeManagementHandlers.DELETE(request, (await params).id);
}
