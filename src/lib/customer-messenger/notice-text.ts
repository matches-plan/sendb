export const escapeEmailHtml = (s: string) =>
    s.replace(
        /[&<>"']/g,
        (c) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[c]!,
    );
const html = escapeEmailHtml;

/** 답변 알림 메일 본문 — 상담 내용·첨부·토큰은 넣지 않고, 사이트를 열어 상담창에서 확인하게 한다 */
export function noticeMailBody(text: string, link: string, color: string) {
    const paragraphs = text
        .split(/\n{2,}/)
        .map((p) => `<p style="margin:0 0 12px;line-height:1.6">${html(p).replaceAll("\n", "<br>")}</p>`)
        .join("");
    return `${paragraphs}<p style="margin:20px 0"><a href="${html(link)}" style="display:inline-block;padding:10px 18px;border-radius:10px;background:${html(color)};color:#fff;text-decoration:none;font-weight:600">답변 확인하기</a></p>`;
}

