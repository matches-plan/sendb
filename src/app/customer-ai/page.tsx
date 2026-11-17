import { redirect } from "next/navigation";

// AI 응대는 상담 설정 › AI 응대로 옮겼다 — 예전 주소(?workspaceId=)로 들어와도 같은 사업으로 연다
export default async function Page({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
    const { workspaceId } = await searchParams;
    redirect(`/inbox/settings?open=ai${Number(workspaceId) > 0 ? `&workspaceId=${Number(workspaceId)}` : ""}`);
}
