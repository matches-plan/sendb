/**
 * 발송 경고 구글 챗 글(email_health_alerts.message)을 화면 알림(머리 종) 한 줄 제목·짧은 본문으로 줄인다. 순수 함수.
 * 매일 보고(report:)는 알림으로 만들지 않는다 — null.
 */

const BODY_MAX = 160;

export interface SendHealthNotificationText {
    title: string;
    body: string;
}

/** 꾸밈 없이 한 줄로, 코드 포인트 기준으로 자른다 */
function clip(text: string, max: number): string {
    const one = text.replace(/\s+/g, " ").trim();
    const chars = [...one];
    return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : one;
}

/** "[발송 위험 · 명단 보류] 사업 › 명단" → 머리 표시와 나머지 */
function splitHead(line: string): { head: string; rest: string } {
    const m = /^\[([^\]]+)\]\s*(.*)$/.exec(line.trim());
    return m ? { head: m[1], rest: m[2] } : { head: "", rest: line.trim() };
}

/** 링크 줄·빈 줄을 뺀 줄들 */
function contentLines(message: string): string[] {
    return message
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("자세히:") && !l.startsWith("외 ") && !l.startsWith("…("));
}

export function sendHealthNotificationText(x: { batchKey: string; message: string; workspaceName: string | null }): SendHealthNotificationText | null {
    const kind = x.batchKey.split(":")[0];
    if (kind === "report") return null;
    const prefix = x.workspaceName ? `${x.workspaceName} ` : "";
    const lines = contentLines(x.message);

    if (kind === "sync") {
        const { rest } = splitHead(lines[0] ?? "");
        const body = rest.includes(" — ") ? rest.slice(rest.indexOf(" — ") + 3) : rest;
        const ok = x.batchKey.startsWith("sync:recovered") || x.batchKey.startsWith("sync:never_recovered");
        return { title: ok ? "NHN 결과 확인 정상" : "NHN 결과 확인 문제", body: clip(body, BODY_MAX) };
    }

    if (kind === "release") {
        const { rest } = splitHead(lines[0] ?? "");
        return { title: `${prefix}발송 다시 시작`, body: clip(rest, BODY_MAX) };
    }

    // 회차 묶음 (run:) — 머리 줄 "[발송 건강] 조직 — 알림 N건" 다음에 사건 블록이 온다
    const blockHeads = lines.filter((l) => l.startsWith("[발송 위험"));
    const heads = blockHeads.map((l) => splitHead(l).head);
    const title = heads.some((h) => h.includes("멈춤"))
        ? "발송 자동 멈춤"
        : heads.some((h) => h.includes("보류"))
          ? "명단 발송 보류"
          : "발송 위험";
    const first = blockHeads[0];
    let body: string;
    if (first) {
        const idx = lines.indexOf(first);
        const detail = lines[idx + 1] && !lines[idx + 1].startsWith("[") ? ` — ${lines[idx + 1]}` : "";
        body = clip(`${splitHead(first).rest}${detail}`, BODY_MAX);
        if (blockHeads.length > 1) body = `${body} 외 ${blockHeads.length - 1}건`;
    } else {
        body = clip(lines.slice(1).join(" ") || lines[0] || "", BODY_MAX);
    }
    return { title: `${prefix}${title}`, body };
}

/**
 * 알림을 누르면 여는 곳 — 발송 이력을 이 알림의 사건(명단·발신 주소·도메인·기간·실패 갈래)으로 거르고 위에 문제·할 일을 띄운다.
 * 사업 알림이면 그 사업 탭(ws), 운영 알림이면 전체
 */
export function sendHealthNotificationLink(x: { alertId: number; workspaceId: number | null }): string {
    return `/email?tab=logs${x.workspaceId ? `&ws=${x.workspaceId}` : ""}&health=${x.alertId}`;
}
