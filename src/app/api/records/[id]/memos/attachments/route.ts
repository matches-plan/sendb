import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { db, records } from "@/lib/db";
import { getActiveUserFromNextRequest } from "@/lib/auth";
import { uploadToR2 } from "@/lib/r2";

const MAX_SIZE = 20 * 1024 * 1024; // 20MB
// 실행 파일 등은 막는다
const BLOCKED_EXT = new Set(["exe", "bat", "cmd", "sh", "js", "msi", "dll", "app", "html", "htm", "svg"]);
const TEXT_EXT = new Set(["txt", "csv", "tsv", "log", "md"]);

/**
 * 글 파일은 UTF-8로 맞춰 저장한다 — 윈도우 메모장·통화 녹음 요약처럼 EUC-KR(CP949)로 저장된 파일이
 * 브라우저에서 열 때 글자가 깨지지 않게. 엑셀이 CSV 한글을 읽도록 맨 앞에 BOM을 붙인다.
 */
function toUtf8Text(buf: Buffer): Buffer {
    const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
    if (buf.subarray(0, 3).equals(BOM)) return buf;
    let text: string;
    try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
        text = new TextDecoder("euc-kr").decode(buf);
    }
    return Buffer.concat([BOM, Buffer.from(text, "utf-8")]);
}

/**
 * POST: 리드 댓글 첨부파일 올리기 — 저장한 주소를 돌려주고, 댓글 등록 때 함께 보낸다.
 * 주의: 지금은 공개 저장소(R2 공개 주소)라 주소를 아는 사람은 열 수 있다. 비공개 저장소 전환은 개발자 확인 후 (2026-11-11 주희님)
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getActiveUserFromNextRequest(req);
    if (!user) {
        return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }
    const recordId = Number((await params).id);
    const [record] = recordId
        ? await db.select({ id: records.id }).from(records).where(and(eq(records.id, recordId), eq(records.orgId, user.orgId)))
        : [];
    if (!record) {
        return NextResponse.json({ success: false, error: "레코드를 찾을 수 없습니다." }, { status: 404 });
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
        return NextResponse.json({ success: false, error: "파일이 없습니다." }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
        return NextResponse.json({ success: false, error: "파일은 20MB 이하만 올릴 수 있습니다." }, { status: 400 });
    }
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (BLOCKED_EXT.has(ext)) {
        return NextResponse.json({ success: false, error: "올릴 수 없는 파일 형식입니다." }, { status: 400 });
    }

    const safeExt = /^[a-z0-9]{1,8}$/.test(ext) ? `.${ext}` : "";
    const key = `memo-attachments/${user.orgId}/${randomBytes(16).toString("hex")}${safeExt}`;
    const isText = TEXT_EXT.has(ext) || file.type.startsWith("text/");
    const raw = Buffer.from(await file.arrayBuffer());
    const body = isText ? toUtf8Text(raw) : raw;
    const contentType = isText ? `${file.type && file.type.startsWith("text/") ? file.type.split(";")[0] : "text/plain"}; charset=utf-8` : file.type || "application/octet-stream";
    const url = await uploadToR2(body, key, contentType);

    return NextResponse.json({
        success: true,
        data: { url, name: file.name, type: contentType, size: body.length },
    });
}
