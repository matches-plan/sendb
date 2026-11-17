import { NextRequest, NextResponse } from "next/server";
import type { UnsubscribeEntry } from "@/components/email/unsubscribes/types";
import { manualUnsubscribeInput, parsePositiveId, parseUnsubscribePagination } from "./email-unsubscribe-management-rules";

interface Identity { orgId: string; role: string }
interface Dependencies {
    authenticate: (request: NextRequest) => Identity | null | Promise<Identity | null>;
    workspaceInOrg: (orgId: string, workspaceId: number) => Promise<boolean>;
    list: (orgId: string, options: { workspaceId: number; page: number; pageSize: number; q: string }) => Promise<{ items: UnsubscribeEntry[]; totalCount: number }>;
    register: (orgId: string, input: { email: string; workspaceId: number; reason?: string }) => Promise<void>;
    /** 그 사업부 목록에 보이는 줄(그 사업부 또는 사업부 없음)을 지운다. 지운 주소, 없으면 null */
    remove: (orgId: string, workspaceId: number, id: number) => Promise<string | null>;
}

function failure(error: string, status: number) {
    return NextResponse.json({ success: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}

function success(data: unknown) {
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
}

const canManage = (user: Identity) => user.role === "owner" || user.role === "admin";
const WORKSPACE_NOT_FOUND = "사업부를 찾을 수 없습니다.";

/** Keep identity outside request bodies: all reads and writes take the authenticated organization. 수신거부는 사업부별이다 */
export function createUnsubscribeManagementHandlers(deps: Dependencies) {
    async function identify(request: NextRequest): Promise<Identity | NextResponse> {
        const user = await deps.authenticate(request);
        if (!user) return failure("인증이 필요합니다.", 401);
        const expectedOrgId = request.headers.get("x-sendb-org-id");
        if (expectedOrgId && expectedOrgId !== user.orgId) return failure("조직이 변경되었습니다. 페이지를 새로고침해주세요.", 409);
        return user;
    }
    return {
        async GET(request: NextRequest) {
            const user = await identify(request);
            if (user instanceof NextResponse) return user;
            const options = parseUnsubscribePagination(request.nextUrl.searchParams);
            if (!options) return failure("사업부·검색어·페이지 범위를 확인해주세요.", 400);
            try {
                if (!await deps.workspaceInOrg(user.orgId, options.workspaceId)) return failure(WORKSPACE_NOT_FOUND, 404);
                return success({ ...await deps.list(user.orgId, options), page: options.page, pageSize: options.pageSize, canManage: canManage(user) });
            } catch {
                return failure("수신거부 목록을 불러오지 못했습니다.", 500);
            }
        },
        async POST(request: NextRequest) {
            const user = await identify(request);
            if (user instanceof NextResponse) return user;
            if (!canManage(user)) return failure("수동 등록은 관리자만 할 수 있습니다.", 403);
            const parsed = manualUnsubscribeInput.safeParse(await request.json().catch(() => null));
            if (!parsed.success) return failure("정확한 이메일 주소와 1,000자 이내의 사유를 입력해주세요. 도메인 전체 등록은 지원하지 않습니다.", 400);
            try {
                if (!await deps.workspaceInOrg(user.orgId, parsed.data.workspaceId)) return failure(WORKSPACE_NOT_FOUND, 404);
                await deps.register(user.orgId, parsed.data);
                return success({ email: parsed.data.email });
            } catch {
                return failure("수신거부 등록에 실패했습니다.", 500);
            }
        },
        async DELETE(request: NextRequest, rawId: string) {
            const user = await identify(request);
            if (user instanceof NextResponse) return user;
            if (!canManage(user)) return failure("수신거부 해제는 관리자만 할 수 있습니다.", 403);
            const id = parsePositiveId(rawId);
            const workspaceId = parsePositiveId(request.nextUrl.searchParams.get("workspaceId"));
            if (!id || !workspaceId) return failure("해제할 수신거부와 사업부를 확인해주세요.", 400);
            try {
                if (!await deps.workspaceInOrg(user.orgId, workspaceId)) return failure(WORKSPACE_NOT_FOUND, 404);
                const email = await deps.remove(user.orgId, workspaceId, id);
                if (!email) return failure("이미 해제됐거나 찾을 수 없는 수신거부입니다.", 404);
                return success({ email });
            } catch {
                return failure("수신거부 해제에 실패했습니다.", 500);
            }
        },
    };
}
