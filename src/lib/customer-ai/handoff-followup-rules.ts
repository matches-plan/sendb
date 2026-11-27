export const HANDOFF_FOLLOWUP_DELAY = 5 * 60 * 1000;
export const HANDOFF_WAITING_MESSAGE = "잠시만 기다려 주시면 답변 드리겠습니다:)";

export const HANDOFF_WAITING_MESSAGES = [
    HANDOFF_WAITING_MESSAGE,
    "현재 확인 중에 있습니다. 잠시만 기다려주세요 :)",
];

const macroNames = new Map([
    ["어떤 서비스를 제공하나요?", "서비스소개"],
    ["무료로 체험해 볼 수 있나요?", "무료체험"],
    ["경리 업무만 맡길 수 있나요?", "경리단독"],
    ["도입 상담은 어떻게 신청하나요?", "도입상담"],
    ["이메일이나 전화로 문의할 수 있나요?", "연락처"],
    ["담당자와 직접 이야기하고 싶어요.", "담당자연결"],
    ["비용은 얼마인가요?", "전체요금"],
    ["경리·총무 Standard는 얼마이고 어떤 회사에 맞나요?", "경리Standard"],
    ["경리·총무 Plus와 Pro의 차이는 무엇인가요?", "경리PlusPro"],
    ["영수증이나 세금계산서 정리도 맡길 수 있나요?", "영수증세금계산서"],
    ["급여 이체와 급여명세 발송도 지원하나요?", "급여명세"],
    ["비서 라이트는 얼마이고 어떤 업무를 하나요?", "비서라이트"],
    ["기존 요금제에 경량 비서를 추가할 수 있나요?", "경량비서추가"],
    ["출장 예약이나 회의 일정도 맡길 수 있나요?", "출장회의"],
    ["정부지원사업에 선정됐는데 사업비 정산도 맡길 수 있나요?", "사업비정산"],
    ["정부지원·연구 사업비 관리 비용은 얼마인가요?", "사업비견적"],
    ["채용 공고나 입·퇴사 자료 정리도 지원하나요?", "채용인사"],
    ["경리·총무와 비서, 사업비 관리를 함께 맡길 수 있나요?", "맞춤경영지원"],
    ["도입 상담 후 업무는 어떤 순서로 시작하나요?", "도입절차"],
    ["온라인 고객 문의 응대도 맡길 수 있나요?", "온라인고객응대"],
]);

const normalize = (text: string) =>
    text.normalize("NFKC").toLowerCase().trim().replace(/[.!?]+$/, "").replace(/\s+/g, "");

export function followupMacroName(
    question: string,
    docs: { kind: string; title: string; questions?: string[] | null }[],
) {
    const normalized = normalize(question);
    if (!normalized) return undefined;
    const matches = docs.filter((doc) => doc.kind === "faq" &&
        [doc.title, ...(doc.questions ?? [])].some((variant) => normalize(variant) === normalized));
    return matches.length === 1 ? macroNames.get(matches[0].title) : undefined;
}
