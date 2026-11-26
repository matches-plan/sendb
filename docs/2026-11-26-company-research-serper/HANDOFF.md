# 회사 조사: Serper 검색 + Qwen3.7-Flash 정리 (2026-11-26)

예전 회사 조사는 Claude 웹검색이었다. 검색 1,000회에 $10, 조사 1건에 약 19,000 토큰이 들었고 9~11월 웹검색은 월 3만~12만 회였다.
같은 날 낮에 검색 없는 간단 조사(compact)로 바꿨고, 이번에 싼 검색을 다시 붙였다. 한 번 조사한 회사는 보관함에 쌓아 다시 검색하지 않는다.

## 동작

1. 자동 메일·테스트 발송은 보관함(`company_research_cache`)과 레코드의 지난 조사를 먼저 찾는다. 찾으면 검색하지 않는다.
2. 없으면 Serper로 `"{회사명} 회사"`를 구글 검색 1회(`gl=kr`, `hl=ko`, 10건).
3. 검색 결과 요약문(snippet)을 Qwen3.7-Flash가 JSON으로 정리한다(생각 끔, JSON 모드). `QWEN_API_KEY`가 없으면 Haiku 5.5가 정리한다.
4. 새로 조사한 회사는 보관함에 `source='serper'`로 쌓는다. 키는 **레코드에 적힌 회사명**이라 같은 이름의 다음 레코드가 바로 찾는다. 화면의 재조사는 보관함을 새 결과로 바꾼다.
5. 검색·정리가 실패하거나(크레딧 소진·키 오류·1분 초과) 회사를 확인하지 못하면 간단 조사(저장된 정보·홈페이지 소개문)로 대신한다. **메일은 그대로 나간다.** 빈 간단 정보는 레코드·보관함에 남기지 않아 다음 메일 때 다시 검색한다.

밖으로 보내는 정보

- Serper: 검색어(회사명 + "회사")만.
- Qwen: 회사명, CRM의 회사 칸(업종·회사 소개·주요 서비스·직원 수·홈페이지), 검색 결과만. 담당자 이름·이메일·전화는 보내지 않는다.

## 설정 (CloudType 환경변수)

키 값은 저장소·문서·채팅·로그에 적지 않는다.

| 이름 | 내용 |
| --- | --- |
| `SERPER_API_KEY` | serper.dev에서 발급. 넣으면 회사 조사가 serper 방식으로 바뀐다 |
| `QWEN_API_KEY` | home.qwencloud.com/api-keys에서 **싱가포르(International) 지역**으로 발급. 키가 지역마다 따로라 다른 지역 키는 안 된다 |
| `AI_COMPANY_RESEARCH_MODE` | 비워 두면 Serper 키가 있을 때 serper, 없으면 compact. `compact`는 검색 안 함, `search`는 예전 Claude 웹검색 |

## 비용 (2026-11-26 공식 요금)

- Serper: 처음 2,500회 무료. $50에 5만 회(6개월 유효)라 1,000회에 $1.
- Qwen3.7-Flash(싱가포르, 입력 32K 이하): 100만 토큰당 입력 $0.03, 출력 $0.13. 조사 1건이 약 4천 입력·600 출력 토큰이라 약 $0.0002.
- 새 회사 월 3만 곳 기준 Serper 약 $30 + Qwen 약 $6. 같은 조사를 Claude 웹검색으로 하면 검색료만 약 $480이다(조사 1건 검색 1.6회). 보관함에 쌓인 회사는 비용이 없다.

## 확인·되돌리기

- 간단 조사로 대신한 건: 서버 로그 `[CompanyResearch] Serper 조사 실패`.
- 토큰 사용: `ai_usage_logs`의 provider `qwen`, model `qwen3.7-flash`, purpose `auto_company_research`(테스트 발송은 `test_company_research`, 화면 조사는 `company_research`).
- 검색 횟수는 DB에 남기지 않는다. Serper 대시보드에서 본다.
- 보관함에 쌓인 회사: `company_research_cache`의 `source = 'serper'`.
- 되돌리기: `AI_COMPANY_RESEARCH_MODE=compact`로 바꾸고 재배포한다. 코드를 되돌리지 않아도 되고, 쌓인 보관함은 그대로 둬도 된다.

## 그대로 둔 것

- 메일 작성은 Haiku 5.5다. Qwen은 작성 모델 목록에 넣지 않았다(한국어 메일 품질 비교 전).
- 필드 자동 보강·제품 정보 생성은 아직 Claude 웹검색이다.
