import { redirect } from "next/navigation";

// 수신거부 목록은 리드젠 설정 › 사업부 › 수신거부 목록으로 옮겼다 (사업부는 설정 화면이 첫 사업부로 채운다)
export default function Page() {
    redirect("/leadgen/settings?menu=unsubscribes");
}
