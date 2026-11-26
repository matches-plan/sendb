# AI 모델 실험실·모델 라우터 (2026-11-27)

계획은 같은 폴더 `PLAN.md`(Fable 작성). 이 문서는 실제로 넣은 것과 켜는 법이다.
키 없이 배포하면 기존 동작은 그대로다. 새 모델은 키를 넣기 전까지 "연결 필요"로 보이고 고를 수 없다.

## 바뀐 것

- **작성 모델 목록**: 기존(Haiku 5.5·4.5, Gemini 3.5 Flash Lite)에 Claude Sonnet 5.5, Claude Opus 5.5, Gemini 3.8 Flash, DeepSeek V4.1 Flash(10/17판), Qwen3.7 Flash를 더했다. 예전 DeepSeek V4 Flash는 목록에서 숨겼다. 그 값을 저장한 규칙은 예전처럼 동작한다.
- **라우터**(`src/lib/ai/client.ts` `resolveRoute`): 모델마다 직접 연결과 OpenRouter 경로가 있고, 키가 있는 첫 경로를 쓴다.
  - DeepSeek V4.1 Flash: OpenRouter 먼저. DeepSeek 자체 공급자(중국 서버)는 빼고 보낸다. 직접 연결은 `AI_ALLOW_CHINA_ENDPOINTS=1`일 때만 쓴다(메일 작성에는 받는 사람 정보가 들어간다).
  - Qwen3.7 Flash: 싱가포르 직접 먼저, 없으면 OpenRouter. 생각은 끈다.
  - Claude·Gemini: 지금처럼 직접 연결만.
  - 사용 기록·작성 단가표의 provider/model은 경로와 상관없이 모델 회사·내부 id로 남는다.
- **연결 안 된 모델 막기**: 모델 선택 목록 6곳(규칙 새로 만들기·수정, 수동 AI 메일, 알림톡, 웹 폼 2곳)에서 "연결 필요"로 막힌다. 서버도 규칙을 그 모델로 바꿔 저장하면 400으로 거절한다(이미 저장된 값은 둘 수 있다). 가용성은 `GET /api/ai/models`(키 값은 내려주지 않는다).
- **AI 모델 실험실** `/email/model-lab` (메뉴: 리드젠 › AI 모델 실험실, 화면은 관리자 전용)
  - 나란히 미리보기: 규칙·레코드 하나로 모델 6개까지 같은 메일을 쓴다. 토큰·시간·정가 추정 비용을 보여 주고, 블라인드로 이름을 가릴 수 있다. 메일은 보내지 않는다. 모델마다 실제 호출 비용이 든다(`ai_usage_logs.purpose = model_lab_preview`).
  - 모델 성과: 첫 메일 기준 모델별 발송·오픈률(분모는 오픈 추적 발송)·클릭률·회신률, 95% 범위, 표본 100통 미만은 흐리게. 규칙별 보기와 규칙 화면 바로가기가 있다. 어떤 모델이 썼는지는 작성 작업(`ai_copy_generation_jobs.policy_snapshot`)과 `send_log_id`로 잇는다.
  - 회사 조사: Serper·Qwen 30일 관찰. 날짜별 Qwen 정리 횟수·추정 비용, Serper로 새로 쌓인 회사, 간단 조사로 대신한 건을 보여 준다.
- **모델 A/B**: 규칙 화면 AB 테스트에 "비교 대상: AI 모델"을 더했다.
  - A는 시작 때 규칙 모델, B는 고른 후보 모델이고, 지시사항은 두 안이 같다.
  - 수신자 반반 배정, 안마다 최소 100통, 14~42일 모집, 14일 관찰, 95% 판정은 기존 AB 테스트와 같다. B가 이기면 규칙 모델을 B로 바꾼다.
  - 규칙 모델을 바꿔 저장하면 테스트가 중단된다. B 연결이 끊기면 새로 나누지 않고 규칙 모델로 보낸다(메일은 멈추지 않는다).
  - 승인된 작성 버전에 묶인 규칙은 버전의 모델로 쓰기 때문에 모델 A/B를 시작할 수 없다.
- Opus·Sonnet 5.5가 안전 분류기로 거절하면(`refusal`) 다시 시도하지 않는 실패로 남긴다. 대체 모델 자동 전환(fallbacks)은 넣지 않았다.

DB 마이그레이션은 없다.

## 환경변수 (CloudType)

키 값은 저장소·문서·채팅·로그에 적지 않는다.

| 이름 | 용도 |
| --- | --- |
| `OPENROUTER_API_KEY` | DeepSeek V4.1 Flash, (직접 키가 없을 때) Qwen. 키마다 사용 한도(USD)를 걸 수 있다 |
| `QWEN_API_KEY` | Qwen 직접 연결(**싱가포르 International 지역 키**). 회사 조사 정리도 이 키를 쓴다 |
| `SERPER_API_KEY` | 회사 조사 검색. 넣으면 회사 조사가 serper 방식으로 바뀐다(`docs/2026-11-26-company-research-serper/HANDOFF.md`) |
| `DEEPSEEK_API_KEY` | 선택. 직접 연결은 아래 값이 없으면 쓰지 않는다 |
| `AI_ALLOW_CHINA_ENDPOINTS` | `1`이면 DeepSeek 직접(중국 서버) 연결을 메일 작성에 허용. 기본 비움 |
| `OPENROUTER_PROVIDER_PREFS` | OpenRouter 공급자 선호 JSON. 기본은 `{"data_collection":"deny"}`, DeepSeek은 `"ignore":["deepseek"]`를 더한다 |

## 켜는 순서

1. 키를 CloudType 환경변수에 넣고 재배포한다.
2. 실험실 → 나란히 미리보기에서 규칙 하나·레코드 하나로 후보 모델을 모두 써 본다. JSON 오류·한국어 품질·속도를 본다.
3. OpenRouter 사용량 화면에서 DeepSeek 요청이 어느 공급자로 갔는지 본다. 중국 공급자가 섞였거나 `deepseek` 이름이 맞지 않으면, 모델 화면의 복사 버튼으로 공급자 이름을 확인해 `OPENROUTER_PROVIDER_PREFS`를 고친다.
4. 가격 설정(AI 작성 관리)에 새 모델 단가를 등록한다. 등록하지 않으면 성과 표의 비용 칸이 "단가 미등록"으로 나온다.
5. 규칙 하나에서 AB 테스트 추가 → 비교 대상 "AI 모델" → B 모델 → 평가 기준을 고르고 규칙을 저장하면 시작된다.

## 되돌리기

- 모델 하나만 멈추기: 그 모델의 키를 지우고 재배포한다. 진행 중인 모델 A/B는 새 배정이 멈추고 규칙 모델로 보낸다. 끝내려면 「중단」을 누른다.
- 전체 되돌리기: 이 커밋을 되돌리고 재배포한다. DB에서 되돌릴 것은 없다.

## 검증

- 타입 검사, 바뀐 파일 ESLint(새 오류 없음 — 남은 7개는 main에 원래 있던 것), 운영 빌드(`build:cloudtype`).
- 시험: 라우터·요청 본문(`src/lib/ai/model-router.test.ts`), 모델 A/B(`src/lib/email-experiments/model-ab.test.ts`), 실험실(`src/lib/model-lab/model-lab.test.ts`), Serper·Qwen 조사(`src/lib/ai/company-research-serper.test.ts`), 전체 `pnpm test`.
- 실제 키로는 호출하지 못했다(키 없음). 키를 넣은 뒤 아래 세 가지를 확인한다.
  - OpenRouter에서 DeepSeek 공급자 제외 이름
  - OpenRouter 경유 Qwen의 생각 끄기(`reasoning.effort: "none"`)
  - Gemini 3.8 Flash 첫 호출
