import { redirect } from "next/navigation";

// 고객 관리 페이지는 없앴다 — 예전 주소로 들어오면 고객 연락처로 보낸다
export default function Page() {
    redirect("/customer-contacts");
}
