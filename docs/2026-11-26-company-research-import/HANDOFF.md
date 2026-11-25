# 회사 조사 미리 넣기 (2026-11-26)

자동 메일의 회사 자동 조사는 Claude 웹검색으로 회사마다 따로 조사한다(조사 1건 약 19,000 토큰 + 검색 1.6회). 10월 AI 사용량의 71%가 이 조사였다.
이 기능은 **곧 등록될 대기 명단의 회사를 미리 조사해 넣어 두는 보관함**이다. 넣어 둔 회사는 레코드가 등록될 때 웹검색 없이 그 결과로 메일을 쓴다.

## 동작

- 표 `company_research_cache`(마이그레이션 `0161`): 조직 · 회사명 키(`normalizeCompanyName`) · 조사 결과.
- `findCachedCompanyResearch`가 **보관함을 먼저** 보고, 없으면 예전처럼 레코드에 붙은 지난 조사를 찾는다. 조사 실패 문구("정보를 찾을 수 없습니다")는 쓰지 않는다.
- 회사명 키는 공백·법인 표기(㈜·(주)·주식회사·(유)·유한회사)·대소문자만 다른 이름을 같은 회사로 본다. **명단에 적힌 회사명과 같아야** 맞물린다.

## 외부 API (API 토큰)

토큰은 샌드비 설정의 API 토큰에서 만든다. 대상 파티션에 **읽기**(대상 조회)와 **수정**(결과 저장) 권한을 준다. 토큰 값은 채팅·문서·저장소에 적지 않는다.

### 1. 조사할 회사 받기

```bash
curl -s -H "Authorization: Bearer $SENDB_TOKEN" \
  "https://sendb.kr/api/v1/company-research/targets?partitionId=55&limit=100"
```

- 예약 등록 대기 명단을 등록 순서(내일 들어갈 것부터)로 읽어, 회사 자동 조사가 켜진 활성 규칙의 회사명 칸 값을 돌려준다.
- 이미 보관함이나 레코드에 조사 결과가 있는 회사는 뺀다. `limit` 최대 500.
- 응답: `{ partitionId, companyFields, scanned, items: [{ companyName }] }`

### 2. 조사 결과 넣기

```bash
curl -s -X POST -H "Authorization: Bearer $SENDB_TOKEN" -H "Content-Type: application/json" \
  -d @research.json https://sendb.kr/api/v1/company-research
```

`research.json` 형식 (한 번에 200건까지):

```json
{
  "partitionId": 55,
  "items": [
    {
      "companyName": "명단에 적힌 회사명 그대로",
      "industry": "업종",
      "description": "회사 소개 200~500자",
      "services": "주요 제품/서비스, 쉼표로 구분",
      "employees": "약 50명",
      "website": "https://...",
      "sources": [{ "url": "https://...", "title": "출처 제목" }]
    }
  ]
}
```

- 응답: `{ saved, skipped: [{ index, companyName, reason }] }`. 형식 오류·조사 실패 문구·http(s)가 아닌 출처는 건너뛴다.
- 같은 회사를 다시 넣으면 새 결과로 바꾼다.

## Gemini에게 맡기는 지시문 (예시)

> 아래 회사 목록을 하나씩 Google 검색으로 조사해 JSON 배열로만 답해 줘.
> 각 항목: `companyName`(목록의 이름을 **그대로**), `industry`(업종), `description`(주요 사업·특징 200~500자), `services`(주요 제품/서비스, 쉼표 구분), `employees`(직원 수나 규모), `website`(공식 사이트), `sources`(참고한 페이지 `url`·`title`, 최대 5개).
> 못 찾은 칸은 "정보 없음". 회사를 전혀 못 찾으면 그 회사는 배열에서 빼 줘. 한국어로.

받은 배열을 `items`에 넣어 2번으로 저장한다. 구독 요금제는 5시간·주간 한도가 있으니 하루 분량씩 나눠 돌린다.

## 확인·되돌리기

- 넣은 회사 수: 저장 응답의 `saved`. 대상 API를 다시 부르면 넣은 회사는 빠진다.
- 되돌리기: 보관함을 안 쓰려면 행을 지우면 된다(자동 메일은 예전처럼 웹검색으로 돌아간다). 표를 남겨 둬도 다른 기능에 영향이 없다.
