import { createHash } from "node:crypto";
import { CopyActionError } from "../ai-copy/errors";

export type DihaRound = "DH02" | "DH03" | "DH04" | "DH05";
export type CaseGroup = "food" | "sns" | "banner";
export interface DihaMaterial {
    round: DihaRound;
    subjects: { A: string; B: string };
    text: string;
    label: string;
    urls: { A: string; B: string; food?: string; sns?: string; banner?: string };
    verifiedCompanies: Record<string, CaseGroup>;
}

const groups: Record<string, CaseGroup> = { 식품: "food", SNS: "sns", 배너: "banner" };
const companyKey = (value: string) =>
    createHash("sha256").update(value.trim().normalize("NFC").toLowerCase()).digest("hex");

/** 회사명은 기존 명단에서 확인한 표기만 사용한다. 실험 조건에는 분류와 해시만 보관한다. */
export function createDihaMaterial(round: DihaRound, entries: string, originalCta: string): DihaMaterial {
    let original: URL;
    try { original = new URL(originalCta); } catch { throw new CopyActionError("디하 원래 링크를 확인해 주세요."); }
    if (original.origin !== "https://designer-hire.com" || original.username || original.password) {
        throw new CopyActionError("디자이너하이어 운영 주소를 확인해 주세요.");
    }
    const verifiedCompanies: Record<string, CaseGroup> = {};
    if (round === "DH02") {
        for (const line of entries.split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
            const parts = line.split("\t").map(value => value.trim());
            const group = Object.hasOwn(groups, parts[0]) ? groups[parts[0]] : undefined;
            if (parts.length !== 2 || !group || !parts[1] || /[<>@]/.test(parts[1])) {
                throw new CopyActionError("업무와 확인한 회사명을 탭으로 구분해 주세요.");
            }
            const key = companyKey(parts[1]);
            if (verifiedCompanies[key] && verifiedCompanies[key] !== group) throw new CopyActionError("한 회사의 업무 분류가 두 가지입니다.");
            verifiedCompanies[key] = group;
        }
        if (!Object.keys(verifiedCompanies).length) throw new CopyActionError("업무가 확인된 회사를 한 곳 이상 입력해 주세요.");
    }
    const tagged = (path: string, arm: string) => {
        const url = new URL(path, original.origin);
        url.searchParams.set("utm_source", "sendb");
        url.searchParams.set("utm_medium", "email");
        url.searchParams.set("utm_campaign", "dh-20261125-" + round.toLowerCase());
        url.searchParams.set("utm_content", arm);
        return url.href;
    };
    const commonSubject = round === "DH02" ? "디자인 작업 사례를 보내드립니다" : "필요한 디자인 업무를 맡기는 방법";
    const material: DihaMaterial = {
        round, verifiedCompanies, subjects: { A: commonSubject, B: commonSubject },
        text: "디자이너하이어에서는 상세페이지와 배너 같은 디자인 업무를 필요한 시간만큼 맡기실 수 있습니다.",
        label: "이용 안내 보기", urls: { A: tagged("/", "A"), B: tagged("/signup/", "B") },
    };
    if (round === "DH02") {
        material.text = "상세페이지와 배너 등 디자이너하이어에서 진행한 작업을 살펴보실 수 있도록 사례를 보내드립니다.";
        material.label = "작업 사례 보기";
        material.urls = { A: tagged("/portfolio/", "A"), B: tagged("/portfolio/", "B"),
            food: tagged("/portfolio/?type=detail-page&industry=food-beverage", "B식품"),
            sns: tagged("/portfolio/?type=sns-content", "B콘텐츠"),
            banner: tagged("/portfolio/?type=web-banner", "B배너") };
    } else if (round === "DH04") {
        material.subjects = { A: "디자이너를 채용하기 전, 어떤 부담이 있을까요?", B: "상세페이지와 배너를 채용 없이 맡기는 방법" };
        material.urls = { A: original.href, B: original.href };
    } else if (round === "DH05") {
        material.subjects = { A: "", B: "방문해 주셔서 감사합니다" };
        material.text = "작업을 맡기실 때는 ‘신제품 상세페이지 첫 화면에 들어갈 배너 한 장이 필요합니다’처럼 요청하실 수 있습니다.";
        material.label = "작업 사례 보기";
        material.urls = { A: "", B: tagged("/portfolio/", "B") };
    }
    return material;
}

export function dihaCompanyGroup(material: DihaMaterial, company: unknown): CaseGroup | undefined {
    return typeof company === "string" ? material.verifiedCompanies[companyKey(company)] : undefined;
}

/** 배정 당시 저장된 업무 층을 사용해 재시도에도 같은 링크와 본문을 만든다. */
export function dihaMail(material: DihaMaterial, arm: "A" | "B", tier: string) {
    const key = material.round === "DH02" && arm === "B" ? tier : arm;
    const url = Object.hasOwn(material.urls, key) ? material.urls[key as keyof DihaMaterial["urls"]] : undefined;
    if (!url || (material.round === "DH02" && arm === "B" && !["food", "sns", "banner"].includes(tier))) {
        throw new CopyActionError("확인된 업무 분류의 사례 링크가 없습니다.");
    }
    const href = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const htmlBody = ["<p>안녕하세요.</p>", "<p>" + material.text + "</p>",
        '<p><a href="' + href + '">' + material.label + "</a></p>", "<p>궁금한 점은 이 메일에 답장해 주세요.</p>"].join("\n");
    return { subject: material.subjects[arm], htmlBody, url };
}
