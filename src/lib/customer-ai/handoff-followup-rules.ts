export const HANDOFF_WAITING_MESSAGE = "잠시만 기다려 주시면 답변 드리겠습니다:)";

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

// Compare full questions after folding common Korean wording and punctuation.
const comparableQuestion = (question: string) =>
    normalize(question)
        .replace(/^(?:(?:안녕하세요|테스트)[,:)]*)+/, "")
        .replace(/[·ㆍ・]/g, "")
        .replace(/(?:뭐하는|무슨)서비스(?:예요|에요|인가요|입니까|야)?$/, "어떤서비스")
        .replace(/어떤서비스(?:예요|에요|인가요|입니까|야)$/, "어떤서비스")
        .replace(/(?:진행(?:이)?가능|이용(?:이)?가능|신청(?:이)?가능)(?:한가요|할까요|해요|합니까|한지궁금해요)$/, "할수있나요")
        .replace(/(?:할수있|해도되)(?:나요|어요|을까요|습니까)$/, "할수있나요");

const serviceQuestions: [string, string[]][] = [
    ["경리 업무만 맡길 수 있나요?", ["경리·총무 서비스", "경리총무에서 무슨 일을 해주나요?"]],
    ["비서 라이트는 얼마이고 어떤 업무를 하나요?", ["비서 서비스", "비서 서비스는 어떤 서비스인가요?", "비서 업무는 뭐 해주나요?", "비서만 진행 가능한가요?"]],
    ["정부지원사업에 선정됐는데 사업비 정산도 맡길 수 있나요?", ["사업비 관리 서비스", "사업비 관리는 어떤 서비스인가요?", "정부지원사업비 관리는 어떤 일을 해주나요?", "연구비 관리도 맡길 수 있나요?"]],
    ["채용 공고나 입·퇴사 자료 정리도 지원하나요?", ["채용·인사 지원", "채용·인사 지원은 어떤 서비스인가요?", "인사 업무도 맡길 수 있나요?"]],
    ["온라인 고객 문의 응대도 맡길 수 있나요?", ["온라인 고객응대 서비스", "온라인 고객응대는 어떤 서비스인가요?", "고객 상담 업무는 어디까지 맡길 수 있나요?", "CS 대행도 가능한가요?"]],
    ["경리·총무와 비서, 사업비 관리를 함께 맡길 수 있나요?", ["맞춤 경영지원", "맞춤 경영지원은 어떤 서비스인가요?", "경영지원 업무를 여러 개 같이 맡길 수 있나요?"]],
];

const faqTitlesByPhrase = new Map([
    [normalize("무료체험 진행하고 싶어요"), "무료로 체험해 볼 수 있나요?"],
]);
const serviceTitlesByQuestion = new Map(serviceQuestions.flatMap(([title, questions]) =>
    questions.map(question => [comparableQuestion(question), title] as const),
));

export function followupMacroName(
    question: string,
    docs: { kind: string; title: string; questions?: string[] | null }[],
) {
    const normalized = normalize(question);
    if (!normalized) return undefined;
    const matchingTitle = faqTitlesByPhrase.get(normalized);
    const matches = docs.filter((doc) => doc.kind === "faq" &&
        (doc.title === matchingTitle ||
            [doc.title, ...(doc.questions ?? [])].some((variant) => normalize(variant) === normalized)));
    if (matches.length) return matches.length === 1 ? macroNames.get(matches[0].title) : undefined;

    const comparable = comparableQuestion(question);
    if (!comparable) return undefined;
    const serviceTitle = serviceTitlesByQuestion.get(comparable);
    const equivalent = docs.filter((doc) => doc.kind === "faq" &&
        (doc.title === serviceTitle ||
            [doc.title, ...(doc.questions ?? [])].some((variant) => comparableQuestion(variant) === comparable)));
    return equivalent.length === 1 ? macroNames.get(equivalent[0].title) : undefined;
}
