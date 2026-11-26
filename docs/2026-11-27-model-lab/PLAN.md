# AI 모델 실험실(Model Lab) 구현 계획 — 2026-11-27

작성: Fable(계획·코드 충돌 점검·ERD/PRD). 실행: Opus(오늘 밤 1세션, 운영 `main` 배포).
워크트리 `F:/Dev/sendb-serper-qwen-20261126` (브랜치 `claude/serper-qwen-research-20261126`, 기준 `origin/main` = `b9dfa83`).
이 워크트리의 **미커밋 작업(Serper 검색 + Qwen3.7-Flash 회사 조사)은 그대로 두고 같은 배포에 싣는다** — `docs/2026-11-26-company-research-serper/HANDOFF.md` 참고.

> 규칙 요약(AGENTS.md / CLAUDE.md): 한국어 문서·커밋, 저장소/문서/로그에 키 값 금지, 마이그레이션은 `drizzle/*.sql` + `meta/_journal.json`(idx 연속·when 증가, 빌드 시 `scripts/copy-runtime-migrations.cjs`가 검증, 부팅 시 `src/lib/db/migrate.ts`가 적용), 운영 DB 직접 접근 금지, `main` 푸시·배포는 사용자 요청 뒤에만. UI는 `h-9`·`border-border/40`·그림자 없음·`Select`/`AlertDialog` 사용·설명 문구 최소. `app/*/page.tsx`는 조립만, 기능 코드는 `src/components/{feature}/{ui,hooks,api,types}`.

---

## 0. 한 장 요약

| 항목 | 내용 |
| --- | --- |
| 목표 | 여러 AI 모델(Claude Haiku/Sonnet/Opus 5.5, DeepSeek V4.1 Flash, Qwen3.7 Flash, Gemini 3.8 Flash)을 **키만 넣으면** 같은 메일을 나란히 써 보고(미리보기), 실제 규칙에서 **모델 A/B 발송**으로 오픈·클릭·회신률을 비교하고, 모델별 성과 순위표에서 좋은 모델을 골라 규칙에 적용한다. 회사 조사(Serper+Qwen) 30일 관찰 통계도 같은 화면에서 본다. |
| 원칙 | **기존 규칙·메일은 사람이 새 모델을 고르거나 A/B를 켜기 전까지 한 글자도 바뀌지 않는다.** 키 없는 모델은 "키 필요"로 보이고 고를 수 없다. 고객 정보는 기본적으로 중국 서버(DeepSeek 직접 API)로 보내지 않는다(OpenRouter 비중국 공급자 경유 또는 명시적 opt-in). |
| P0(오늘 밤) | 모델 카탈로그+라우터(직접/OpenRouter) · 모델 가용성 API+공통 선택 컴포넌트 · 모델 실험실 페이지(나란히 미리보기, 토큰/비용/지연, 로컬 블라인드 모드) · 모델별 성과 순위표 · **규칙 모델 A/B(`kind: "model"`)** · 회사 조사 30일 통계. **DB 마이그레이션 0건.** |
| P1(내일 이후) | 블라인드 투표 저장(`ai_model_lab_runs`, 마이그레이션 0162) · 생각(thinking) 켜기/끄기 토글 · 캐시 적중 집계 · 순위표 원클릭 적용 · 리드젠통계 "모델" 탭 · 단가 자동 채우기 |
| P2 | 순위 기반 자동 폴백(1위 실패 시 2위) · 후속 메일(followup)도 작성 작업(job) 경로로 · Claude/Gemini의 OpenRouter 경유 |
| 배포 | 키 없이 **휴면 상태**로 배포. 내일 CloudType 환경변수에 키를 넣고 재배포하면 켜진다. 되돌리기 = 키 제거 또는 A/B "중단". |

---

## 1. PRD

### 1.1 배경과 목표
- 어제 기본 작성 모델을 Haiku 5.5로 바꿨고(`cbc5a78`), 회사 조사는 Serper+Qwen으로 바꾸는 중(미커밋). 월 약 4.5만 통(메일 1통 ≈ 입력 6,500 + 출력 400 토큰) 규모라 모델 단가 차이가 바로 비용이 된다.
- 후보 모델의 공식 요금(2026-11-26/27 확인, 100만 토큰당 입력/출력 USD): Haiku 5.5 $0.10/$0.50 · Sonnet 5.5 $2/$10 · Opus 5.5 $4/$20 · DeepSeek V4.1-Flash-1017(`deepseek-flash`) $0.30/$1.20(피크, 비피크 반값, 중국 서버) · Qwen3.7-Flash $0.03/$0.13(QwenCloud 싱가포르) · Gemini 3.8 Flash $0.75/$3.75(2027-01-01 2배). OpenRouter는 이 모델 전부를 하나의 OpenAI 호환 API로 쓰고(공급자 단가 전가 + 충전액 5.5% 수수료), 공급자 선택(`provider.only/ignore/order`, `data_collection: "deny"`)으로 DeepSeek을 비중국 호스트로 돌릴 수 있다.
- 월 4.5만 통 기준 작성 비용 추정(출력 400 토큰): Haiku 5.5 ≈ $38 · Qwen3.7 ≈ $11 · DeepSeek 4.1 Flash ≈ $110(피크) · Gemini 3.8 Flash ≈ $287 · Sonnet 5.5 ≈ $765 · Opus 5.5 ≈ $1,530. 품질(한국어 LMArena: Opus 5.5 1502, Gemini 3.8 Flash 1462, DeepSeek 4.1 Flash 1437, Sonnet 5.5 1428, Haiku 5.5 1387)이 실제 오픈·클릭·회신으로 이어지는지 **우리 데이터로** 확인하는 것이 이 기능의 목적이다.

### 1.2 사용자
- 운영자(owner/admin): 모델을 비교·선택·A/B 시작·채택. 실험실 페이지와 순위표·조사 통계는 관리자 전용(`copyAdminApi` 기본값).
- 일반 구성원(member): 규칙 수정 화면에서 기존 AB 테스트처럼 모델 A/B를 추가할 수 있다(`allowMembers: true`, 현행 prompt AB와 동일).

### 1.3 사용자 스토리와 수용 기준
| # | 스토리 | 수용 기준 |
| --- | --- | --- |
| U1 | 운영자가 규칙의 AI 모델 드롭다운에서 새 모델을 고른다 | 키가 없는 모델은 "키 필요"가 붙고 비활성. 서버도 저장 시 키 없는 모델로 **바꾸는** 요청을 400으로 막는다(기존 값 유지 저장은 허용). 모델을 바꾸지 않은 규칙은 저장해도 생성 결과가 바뀌지 않는다. |
| U2 | 같은 규칙·같은 레코드로 N개 모델이 쓴 메일을 나란히 본다 | 모델별 제목·본문·입력/출력 토큰·지연(ms)·추정 비용(USD, 카탈로그 정가)·오류 메시지. 실패한 모델이 있어도 나머지는 보인다. 회사 조사는 보관함 우선, 없으면 1회만 수행해 모든 모델이 같은 입력을 받는다. 테스트 발송과 같은 입력(규칙 지시사항·제품·서명 페르소나·형식). |
| U3 | 블라인드로 좋은 메일을 고른다 | P0: 모델 이름을 숨기고 섞어 보여 주는 로컬 토글, "공개" 뒤 이름 표시(저장 없음). P1: 선택 결과를 `ai_model_lab_runs`에 저장해 모델별 선택 승률 표시. |
| U4 | 규칙에서 모델 X(현재) vs Y(후보) 실제 발송 A/B | 기존 AB 테스트(prompt 실험) 엔진 그대로: 수신자 반반 배정, 안마다 최소 100통·필요 표본 계산, 14~42일 모집, 14일 관찰 뒤 95% 신뢰구간으로 자동 판정, B 승이면 규칙 `model`을 B로 바꾼다. 한 규칙에 진행 중 테스트는 하나. 규칙의 모델(A)을 사람이 바꾸면 테스트 자동 중단. B 모델 키가 사라지면 새 수신자는 배정하지 않고 규칙 모델로 보낸다(메일은 멈추지 않는다). |
| U5 | 모델별 오픈률·클릭률·회신률 순위표 | 기간(14/30/90일)·사업·규칙 필터. 발송 수, 오픈 추적 발송 수(오픈률 분모), 95% 신뢰구간(Wilson), 표본 100통 미만은 "표본 부족" 표시, 첫 시도 성공률·평균 지연·토큰·원화 비용(단가 등록된 모델만). 상단에 "규칙·시기·대상이 다른 모델 간 비교는 참고용 — 확실한 비교는 같은 규칙의 모델 A/B" 한 줄 고정. |
| U6 | 좋은 모델을 규칙에 적용 | P0: 순위표 행에서 규칙 수정 화면으로 이동(모델 선택 후 저장) + A/B 결과 화면의 기존 "A/B 적용" 버튼(모델 A/B에서는 규칙 `model`을 바꿈). P1: 순위표에서 원클릭(AlertDialog 확인 → `PUT /api/email/auto-personalized/{id}`). |
| U7 | Qwen 회사 조사 30일 관찰 | 날짜별 Qwen(또는 Haiku 대체) 정리 호출 수·토큰·추정 비용, Serper 조사 성공(보관함 `source='serper'` 신규 건)·간단 조사로 대신한 건(`company_research_fallback` 로그), 보관함 크기(출처별), 현재 모드(`compact/serper/search`)와 정리 모델(Qwen/Haiku) 표시. 캐시 적중 수는 P1. |

### 1.4 비목표(이번에 하지 않는 것)
- 모델 자동 전환·자동 폴백 체인(P2). 사람이 고르거나 A/B 판정이 바꾸는 것만.
- 알림톡·웹폼·필드 보강·제품 조사의 모델 변경(라우터는 공유하므로 새 모델이 드롭다운에 나오긴 하지만 성과 비교 대상은 첫 콜드메일만).
- 후속 메일(followup)은 `email-followup.ts`가 `getAiClient`를 직접 호출해 작성 작업(job)을 남기지 않는다 → 순위표에서 제외(규칙 모델을 따라가므로 A/B의 B 모델로 후속 메일이 나가지는 않는다 — 후속은 항상 규칙 `model`).
- OpenRouter 경유 Claude/Gemini(직접 키가 있으므로), 비용 최적화용 캐시(prompt caching).

---

## 2. 아키텍처

### 2.1 현재 구조(확인 결과)
- 작성 모델 목록: `src/lib/ai/models.ts` `AI_MODELS`(4개) · `resolveModel()` · `claudeSampling()`(Haiku 5.5는 `thinking:{type:"disabled"}`, temperature 미전송).
- 클라이언트: `src/lib/ai/client.ts` `getAiClient(model)` → `{provider, apiKey, model}`; 키 없으면 `null`. `AiClient.provider`가 `AiProvider | "qwen"`로 임시 확장돼 있다(미커밋).
- 호출 분기: `src/lib/ai/gemini.ts`(`callGeminiEmail/Json/WithSearch`, OpenAI 호환 `callChatCompletions` + `CHAT_APIS{deepseek,qwen}`), `src/lib/ai/claude.ts`.
- **자동 메일 본 경로**: `src/lib/auto-personalized-email.ts` → `prepareManagedEmail`(`src/lib/ai-copy/runtime.ts`) → `prepareCopy`(`preparation.ts`, 규칙 `model`로 `legacySnapshot` 생성: `provider/model/parameters`) → `ai_copy_generation_jobs.policy_snapshot` 저장 → 워커가 `callCopyProvider`(`src/lib/ai-copy/provider.ts`)로 호출 → `ai_copy_generation_attempts(provider, model, duration_ms, prompt/completion_tokens, cost_krw)` 기록(단가는 `ai_copy_price_versions(org, provider, model)`에서) → 발송 뒤 `attachCopyToSend`가 `jobs.send_log_id`를 채운다.
  - 따라서 **어느 모델이 어느 메일을 썼는지는 `email_send_logs l JOIN ai_copy_generation_jobs j ON j.send_log_id = l.id`, 모델은 `j.policy_snapshot->>'model'`**(또는 마지막 유효 attempt의 `model`)로 알 수 있다. 추가 컬럼 불필요.
  - 오픈: `email_open_logs(send_log_id, is_machine=false)`, `email_send_logs.open_tracked`(오픈률 분모). 클릭: `email_click_logs(send_log_id, is_bot=false)`. 회신: `email_replies(send_log_id|root_log_id, kind='human')`. 이미 `prompt-tests.ts`의 `armMetrics`/`baselineRate`가 같은 조건으로 집계한다.
- A/B: `src/lib/email-experiments/*`. `kind: "prompt"`가 `config.promptA/promptB/metric/scope`로 지시사항을 비교하고, 배정은 `repository.ts enrollForPreparation`(`armPromptOf`), 적용은 `auto-personalized-email.ts`(`promptArm.armPrompt`), 판정은 `prompt-tests.ts decidePromptTests`(`advanceExperimentLifecycles`가 호출), 목록은 `GET /api/email/ab-tests`, 시작은 `PUT /api/email/auto-personalized/[id]/ab-test`(`syncPromptTest`). `ruleKeys`에 `model`이 들어 있지만 prompt 실험은 규칙 지문 검사를 건너뛴다(`promptKind`).
- 스트리밍 수동 작성: `src/app/api/ai/generate-email-stream/route.ts`가 claude(SDK 스트림)/deepseek(`api.deepseek.com` 하드코딩 SSE)/gemini 분기.
- 정책 스냅샷 공급자 enum: `src/lib/ai-copy/types.ts` `PolicySnapshot.provider: "claude"|"gemini"|"deepseek"`, `rules.ts policySchema` z.enum + `AI_MODELS` 일치 검사.

### 2.2 모델 카탈로그(`src/lib/ai/models.ts` 확장)
내부 id(DB 저장값)와 공급자 전송 id(`apiModel`/`slug`)를 분리한다. 기존 4개 id는 그대로 둔다(운영 DB에 저장돼 있음).

```ts
export type AiProvider = "claude" | "gemini" | "deepseek" | "qwen";   // 공급자(벤더) 가족 — 경로가 달라도 불변
export type AiRoute = "direct" | "openrouter";
export interface AiModelOption {
    id: string; label: string; provider: AiProvider;
    adaptiveThinking?: boolean;                 // 기존 필드 유지(Haiku 5.5) — claudeThinking:"disable"의 별칭
    /** Claude 5.5 세대 생각 제어: disable(Haiku 5.5: thinking disabled), between_tools(Sonnet 5.5: {type:"between_tools"}), always(Opus 5.5: thinking 파라미터 생략, effort 기본 medium) */
    claudeThinking?: "disable" | "between_tools" | "always";
    noTemperature?: boolean;                    // 5.5 세대 Claude 전부 true(기본값 아닌 temperature는 400)
    direct?: { apiModel: string; endpoint?: string; extraBody?: Record<string, unknown>; region: "us" | "sg" | "cn"; timeoutMs?: number; envKey: string };
    openrouter?: { slug: string; extraBody?: Record<string, unknown>; providerPrefs?: Record<string, unknown> };
    routePreference: AiRoute[];                 // 앞에서부터 키가 있는 경로를 쓴다
    jsonMode?: boolean;                         // OpenAI 호환 경로에서 response_format json_object를 보낼지
    listPriceUsd?: { input: number; output: number; asOf: string; sourceUrl: string }; // 미리보기 추정 비용 전용(실제 비용은 ai_copy_price_versions)
    customerDataAllowed?: boolean;              // false: 고객 정보 메일 작성에 선택 불가(중국 서버). AI_ALLOW_CHINA_ENDPOINTS=1이면 허용
    retired?: boolean;                          // 목록에서 숨기되 저장값은 해석
    lab?: boolean;                              // 실험실에서 새로 다루는 모델 표시("실험")
}
export const AI_MODEL_CATALOG: AiModelOption[] = [...];
export const AI_MODELS = AI_MODEL_CATALOG.filter((m) => !m.retired);   // 기존 소비자 호환
export function resolveModel(model?: string) // AI_MODEL_CATALOG에서 찾고, 없으면 DEFAULT_MODEL_ID
export function claudeSampling(model, temperature?) // claudeThinking에 따라 {thinking} / {thinking:{type:"between_tools"}} / {} 반환, noTemperature면 temperature 생략
```

카탈로그 항목(정가는 2026-11-26/27 공식 페이지 기준, 출처 URL은 코드 주석에):

| id(내부, 저장값) | label | provider | 직접 경로 | OpenRouter slug | 생각(thinking) | 정가 in/out | 비고 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `claude-haiku-5-5` (기본) | Claude Haiku 5.5 | claude | `claude-haiku-5-5`, `ANTHROPIC_API_KEY`, us | `anthropic/claude-haiku-5.5` (내일 확인) | disable | 0.10/0.50 | 변경 없음 |
| `claude-haiku-4-5` | Claude Haiku 4.5 | claude | 동일 | — | 없음 | 1.00/5.00 | 변경 없음 |
| `claude-sonnet-5-5` **신규** | Claude Sonnet 5.5 | claude | `claude-sonnet-5-5`, 같은 키 | `anthropic/claude-sonnet-5.5` | between_tools (`thinking:{type:"disabled"}`는 400) | 2/10 | lab |
| `claude-opus-5-5` **신규** | Claude Opus 5.5 | claude | `claude-opus-5-5`, 같은 키 | `anthropic/claude-opus-5.5` | always (`thinking` 생략, effort 기본 medium; temperature·`disabled` 모두 400) | 4/20 | lab, `stop_reason:"refusal"` 처리 |
| `gemini-3.5-flash-lite` | Gemini 3.5 Flash Lite | gemini | 동일, `GEMINI_API_KEY` | `google/gemini-3.5-flash-lite` | — | (기존) | 변경 없음 |
| `gemini-3.8-flash` **신규** | Gemini 3.8 Flash | gemini | `gemini-3.8-flash` | `google/gemini-3.8-flash` | 기본값(생각 제어 파라미터는 내일 확인) | 0.75/3.75 | lab |
| `deepseek-v4-flash` | DeepSeek V4 Flash(예전) | deepseek | `deepseek-v4-flash` | — | — | — | **retired**(목록 숨김, 저장값 해석만). 키도 없고 전송 id도 바뀌어 동작하지 않던 항목 |
| `deepseek-v4-1-flash` **신규** | DeepSeek V4.1 Flash (1017) | deepseek | `deepseek-flash`, `DEEPSEEK_API_KEY`, **cn**, `thinking:{type:"disabled"}` | `deepseek/deepseek-v4.1-flash-20261017`, `reasoning:{enabled:false}`(확인), providerPrefs `{ignore:["DeepSeek"], data_collection:"deny"}`(공급자 슬러그 내일 확인) | 꺼짐 | 0.30/1.20 (OpenRouter는 전가+5.5%) | routePreference `["openrouter","direct"]`, direct는 `customerDataAllowed:false`(opt-in 필요) |
| `qwen3.7-flash` **신규(작성 목록 편입)** | Qwen3.7 Flash | qwen | `qwen3.7-flash`, `https://ap-southeast-1.maas.qwencloudapi.com/compatible-mode/v1/chat/completions`, `QWEN_API_KEY`, sg, `enable_thinking:false`, 60초 | `qwen/qwen3.7-flash`, `reasoning:{enabled:false}` | 꺼짐 | 0.03/0.13 | routePreference `["direct","openrouter"]`. 이미 `COMPANY_RESEARCH_MODEL_ID`로 쓰는 id와 같게 유지(`ai_usage_logs.model` 연속성) |

- `AI_MODELS[0]`은 Claude Haiku 5.5 유지(테스트 B17). 새 모델은 목록 뒤쪽에 둔다.
- Opus 5.5의 `output_config.effort`는 이번엔 보내지 않는다(SDK `@anthropic-ai/sdk ^0.122` 타입 확인 전; 기본 medium). 비용이 큰 실험실 전용 모델이므로 허용.

### 2.3 라우터(`src/lib/ai/client.ts` + 새 `src/lib/ai/openrouter.ts`)
```ts
export interface AiClient {
    provider: AiProvider; apiKey: string; model: string;   // model = 내부 id (기존 호환)
    route: AiRoute; apiModel: string;                       // 실제 전송 id/slug
    endpoint?: string;                                      // OpenAI 호환 경로의 chat/completions URL (deepseek 직접·qwen 직접·openrouter)
    extraBody?: Record<string, unknown>;                    // 생각 끄기·공급자 선호 등
    jsonMode?: boolean; noTemperature?: boolean; timeoutMs?: number;
    search?: { provider: "serper"; apiKey: string };        // 기존
}
export function resolveRoute(option: AiModelOption, env = process.env): { ok: true; client: Omit<AiClient,"search"> } | { ok: false; reason: "missing_key" | "customer_data_blocked"; missing: string[] }
export function getAiClient(model?: string): AiClient | null          // 기존 시그니처 유지 — 내부가 resolveRoute로 바뀜
export function listModelAvailability(env = process.env)             // GET /api/ai/models 용: [{ id, available, route, reason, missing }]
export function assertModelSelectable(model: string)                   // 규칙/정책 저장 API 가드 — 불가면 CopyActionError("…키 필요 (OPENROUTER_API_KEY)")
```
- 경로 결정: `routePreference` 순서대로 ① direct: `direct.envKey`가 있고(`customerDataAllowed !== false` 또는 `AI_ALLOW_CHINA_ENDPOINTS=1`) ② openrouter: `OPENROUTER_API_KEY`가 있고 `openrouter` 항목이 있으면. `AI_ROUTE_FORCE_OPENROUTER=1`이면 openrouter 항목이 있는 모델은 모두 OpenRouter 우선(사용자의 "전부 OpenRouter처럼 시험" 요구).
- OpenRouter 호출: URL `https://openrouter.ai/api/v1/chat/completions`, 헤더 `Authorization: Bearer`, `HTTP-Referer: https://sendb.kr`, `X-Title: Sendb`. 본문에 `provider: {...providerPrefs}`(기본 `{data_collection:"deny"}`, DeepSeek은 `ignore:["DeepSeek"]` 추가), `usage: {include: true}`(응답 `usage.cost` USD — 실제 비용 표시용, 없으면 정가 추정), 모델별 `extraBody`. 환경변수 `OPENROUTER_PROVIDER_PREFS`(JSON)로 기본 선호를 덮어쓸 수 있게 한다.
- `gemini.ts`: `CHAT_APIS` 맵 제거 → `usesChatCompletions(client) = client.route === "openrouter" || client.provider === "deepseek" || client.provider === "qwen"`; `callChatCompletions`는 `client.endpoint`/`client.apiModel`/`client.extraBody`/`client.jsonMode`/`client.timeoutMs` 사용. Gemini 직접·Claude 직접 분기는 그대로.
- `provider.ts callCopyProvider`: 검사 `client.model !== policy.model || client.provider !== policy.provider`는 유지(provider는 벤더 가족이라 경로와 무관). 분기: claude 직접(기존, `claudeSampling` 일반화 + `stop_reason === "refusal"` → `CopyProviderError("provider_refusal", false)`) / gemini 직접(기존) / 그 외 OpenAI 호환(`client.endpoint`, `apiModel`, `max_tokens`, `noTemperature`면 temperature 생략, `jsonMode`면 `response_format`, `...extraBody`).
- `generate-email-stream/route.ts`: deepseek 분기를 "OpenAI 호환 SSE" 분기로 일반화(URL·model·extraBody를 client에서). Qwen 직접·OpenRouter 모두 같은 SSE 형식.
- `PolicySnapshot.provider`에 `"qwen"` 추가(`types.ts`, `rules.ts` z.enum), `rules.ts` superRefine은 `AI_MODEL_CATALOG`로 검사(retired id 스냅샷도 유효). 저장된 스냅샷은 건드리지 않는다(enum 확장은 하위 호환).
- `ai_usage_logs`/`ai_copy_generation_attempts`의 `provider`는 벤더 가족, `model`은 내부 id로 기록(경로 정보는 로그에 넣지 않음 — 단가표 `ai_copy_price_versions(provider, model)` 조회 연속성). 경로는 OpenRouter 대시보드로 본다.

### 2.4 환경변수(CloudType) — 값은 어디에도 적지 않는다
| 이름 | 용도 | 상태 |
| --- | --- | --- |
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `QWEN_API_KEY`, `SERPER_API_KEY` | 기존 이름 유지 | Anthropic만 있음(추정). Qwen·Serper는 내일 발급 |
| `OPENROUTER_API_KEY` **신규** | OpenRouter 경로 | 내일 발급 |
| `AI_ROUTE_FORCE_OPENROUTER` **신규** | `1`이면 OpenRouter 항목이 있는 모델은 전부 OpenRouter 우선 | 기본 비움 |
| `AI_ALLOW_CHINA_ENDPOINTS` **신규** | `1`이면 DeepSeek 직접(중국) 경로를 고객 정보 작성에 허용 | 기본 비움(차단) |
| `OPENROUTER_PROVIDER_PREFS` **신규** | OpenRouter `provider` 선호 JSON 덮어쓰기 | 기본 비움 |
| `AI_COMPANY_RESEARCH_MODE` | 기존(`compact/serper/search`) | 비움 → Serper 키 있으면 serper |

---

## 3. ERD

### 3.1 P0: 새 테이블·컬럼 없음 (마이그레이션 0건) — 근거
| 필요 데이터 | 저장 위치(기존) |
| --- | --- |
| 모델 A/B 조건(modelA/modelB/metric) | `email_copy_experiments.config`(jsonb) — `kind: "model"`, `modelA`, `modelB` 키 추가. 트리거가 config 불변을 보장하므로 바꾸려면 새 실험 |
| 어떤 메일을 어느 모델이 썼나 | `ai_copy_generation_jobs.policy_snapshot->>'model'` + `jobs.send_log_id` |
| 오픈/클릭/회신 | `email_open_logs`, `email_click_logs`, `email_replies`, `email_send_logs.open_tracked` |
| 토큰·지연·원화 비용 | `ai_copy_generation_attempts(prompt_tokens, completion_tokens, duration_ms, cost_krw, usage_known, result)` |
| 단가 | `ai_copy_price_versions(org_id, provider, model, …)` — 새 모델은 운영자가 가격 설정 화면에서 등록(근거 URL 필수) |
| 미리보기 사용량 | `ai_usage_logs(purpose='model_lab_preview')` |
| 회사 조사 통계 | `ai_usage_logs(purpose IN auto_company_research, test_company_research, company_research, company_research_fallback)`, `company_research_cache(source, created_at)` |

- 간단 조사 대체(폴백) 집계를 위해 `ai_usage_logs`에 **토큰 0 행**을 남긴다: `provider='serper'`, `model='compact-fallback'`, `purpose='company_research_fallback'`. 임시 방편(P1에서 전용 집계로 이전). `logAiUsage`는 `aiUsageLogs`에 insert만 하므로 쿼터에 영향 없다.
- 순위표 조인 성능: `ai_copy_generation_jobs.send_log_id`에 인덱스가 없다(`ai_copy_jobs_pick_idx`, `ai_copy_jobs_scope_idx(org_id, workspace_id, created_at)`만). 쿼리에 `j.org_id = $org AND j.created_at >= now() - (days + 3일)` 조건을 함께 걸어 `ai_copy_jobs_scope_idx`를 타게 한다. 운영에서 2초를 넘기면 P1에서 `src/lib/db/send-log-indexes.ts` 방식(부팅 뒤 `CREATE INDEX CONCURRENTLY IF NOT EXISTS ai_copy_jobs_send_log_idx ON ai_copy_generation_jobs(send_log_id) WHERE send_log_id IS NOT NULL`)으로 추가.

### 3.2 P1: 블라인드 투표·미리보기 보관 — `drizzle/0162_ai_model_lab_runs.sql`
```sql
-- 모델 실험실 미리보기 결과와 블라인드 선택. 한 번 "미리보기 생성"이 group_key 하나, 모델마다 한 행.
CREATE TABLE IF NOT EXISTS "ai_model_lab_runs" (
    "id" serial PRIMARY KEY NOT NULL,
    "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
    "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "group_key" varchar(64) NOT NULL,
    "rule_id" integer,
    "record_id" integer,
    "provider" varchar(50) NOT NULL,
    "model" varchar(100) NOT NULL,
    "route" varchar(20) NOT NULL,
    "subject" varchar(500),
    "html_body" text,
    "prompt_tokens" integer,
    "completion_tokens" integer,
    "latency_ms" integer,
    "cost_usd" numeric,
    "error" text,
    "chosen" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_model_lab_runs_org_created_idx" ON "ai_model_lab_runs" ("org_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_model_lab_runs_group_idx" ON "ai_model_lab_runs" ("org_id", "group_key");
```
- `_journal.json` 항목: `{ "idx": 163, "version": "7", "when": 1795737600000, "tag": "0162_ai_model_lab_runs", "breakpoints": true }` (`when` = 2026-11-27T00:00:00Z; 직전 0161이 1795651260000). Drizzle 스키마는 `src/lib/db/schema.ts`에 `aiModelLabRuns` 추가.
- **번호 충돌 주의**: Codex 워크트리(`F:/Dev/sendb-research-cache-20261126`)에 미커밋 `0162_ai_search_usage.sql`(ai_usage_logs에 `search_provider/search_requests/search_request_unit` 컬럼 추가, idx 163)이 있다. 오늘 밤 우리가 0162를 쓰면 Codex 쪽은 **0163/idx 164로 재번호**해야 한다(5절). P0만 배포하면 충돌 없음.

---

## 4. API와 화면

### 4.1 API
| 경로 | 메서드 | 권한 | 내용 |
| --- | --- | --- | --- |
| `/api/ai/models` **신규** `src/app/api/ai/models/route.ts` | GET | 로그인 사용자 전체(`getActiveUserFromNextRequest`) | `listModelAvailability()` 결과: `[{ id, label, provider, lab, retired, available, route, reason ("missing_key"\|"customer_data_blocked"), missing: ["OPENROUTER_API_KEY"], listPriceUsd, customerDataAllowed }]`. 키 값은 절대 포함하지 않음 |
| `/api/ai/model-lab/preview` **신규** | POST | 관리자(`copyAdminApi`) | body `{ ruleId, recordId?, testData?, models: string[] (최대 6) }`. 규칙 조회 → 공통 초안 컨텍스트(`loadAutoEmailDraft`, 회사 조사는 보관함 우선·없으면 1회) → `Promise.allSettled`로 모델별 `generateEmail`(각 60초 `AbortSignal.timeout`) → 모델별 `{ model, route, subject, htmlBody, usage, latencyMs, estCostUsd, actualCostUsd?, error? }`. 모델마다 `logAiUsage(purpose:"model_lab_preview")` + `updateTokenUsage`; 쿼터 초과면 429. 키 없는 모델은 호출 없이 `error:"키 필요"` |
| `/api/ai/model-lab/leaderboard` **신규** | GET `?workspaceId=0&days=30&ruleId=0` | 관리자 | 3.3절 SQL. 응답 `{ days, caveat, rows:[{ model, label, provider, rules, sent, openTracked, opened, clicked, replied, openRate, openCi, clickRate, clickCi, replyRate, replyCi, firstAttemptSuccess, attempts, avgLatencyMs, promptTokens, completionTokens, costKrw|null, costKnown, sampleOk }], byRule:[{ ruleId, ruleName, partitionId, model, sent, openTracked, opened, clicked, replied }] }`. `days`는 14~90 |
| `/api/ai/model-lab/research-stats` **신규** | GET `?days=30` | 관리자 | `{ mode, summarizer: "qwen"\|"claude"\|null, days:[{ day, qwenCalls, claudeCalls, promptTokens, completionTokens, estCostUsd, serperNew, fallbacks }], cache:{ import, serper, total } }` |
| `/api/email/auto-personalized/[id]/ab-test` (기존) | PUT | allowMembers | zod 확장: `start: { kind: "prompt"\|"model" (기본 prompt), promptB?: string, modelB?: string, metric, scope?, name? }` → `syncPromptTest` |
| `/api/email/ab-tests` (기존) | GET | allowMembers | `kind`에 `"model"` 추가, 응답에 `modelA`, `modelB` 추가. LATERAL 이벤트 목록에 `'ab_test_model_changed'` 추가 |
| `/api/email/ab-tests/[id]` (기존) | POST/DELETE/PATCH | allowMembers | 모델 A/B도 적용·중단·이름 바꾸기 그대로(`applyPromptTestArm`이 model kind면 규칙 `model` 갱신) |
| `/api/email/auto-personalized` POST, `/[id]` PUT (기존) | | 기존 | `model`이 오고 기존 값과 다르면 `assertModelSelectable(model)` → 불가 시 400 |
| `/api/ai/copy-policies` POST (기존) | | 관리자 | 같은 가드 |

### 4.2 화면
- **`/email/model-lab`** (신규, `src/app/email/model-lab/page.tsx`는 조립만 → `src/components/model-lab/ui/ModelLabPage.tsx`). 관리자 아니면 "관리자 권한이 필요합니다" 안내. 탭 3개:
  1. **미리보기**: 규칙 선택(`useAutoPersonalizedEmail`/기존 규칙 목록 훅 재사용, 사업·파티션 표시) · 레코드 id 입력(비우면 테스트 발송과 같은 더미 "테스트 회사") · 모델 체크박스 목록(`useAiModels`; 키 없음은 비활성 + "키 필요", 중국 차단은 "고객 정보 전송 불가") · 「미리보기 생성」(h-9) · 결과 카드 그리드: 제목, 본문(`<iframe sandbox="" srcDoc>` — 스크립트 실행 없음), 토큰 in/out, 지연 ms, 추정 비용 USD(정가, OpenRouter는 실제 비용이 오면 그 값), 경로(직접/OpenRouter), 오류. 상단 `Switch` "블라인드": 카드 순서를 섞고 모델 이름을 "안 1·2·3"으로 바꿈, 「공개」 버튼으로 이름 표시(저장 없음, P1에서 투표 저장).
  2. **성과(순위표)**: 기간(14/30/90) · 사업 탭(`LeadWorkspaceTabs` 재사용 가능하면) · 규칙 필터 · 정렬 기준(오픈/클릭/회신) `Select` · 표(`Table`): 모델, 발송, 오픈률(CI), 클릭률(CI), 회신률(CI), 첫 시도 성공, 평균 지연, 토큰, 비용(원, 단가 없으면 "단가 미등록"), 표본 100 미만 행은 흐리게 + "표본 부족" `Badge`. 접이식 "규칙별 보기"(byRule). 각 행 끝 「규칙에서 바꾸기」 → `/email/ai-auto/{ruleId}?partitionId=`. 상단 고정 caveat 한 줄.
  3. **회사 조사 관찰**: 현재 모드·정리 모델 배지, 30일 일자별 표(Qwen 호출·토큰·추정 비용·Serper 신규 조사·간단 조사 대체), 보관함 크기(import/serper). 서버 로그 확인 안내 한 줄(`[CompanyResearch] Serper 조사 실패`).
- **규칙 수정/새 규칙**(`src/app/email/ai-auto/[id]/page.tsx`, `new/page.tsx`): AI 모델 `Select` → 공통 `ModelSelect`(비활성 항목 + 사유). 설명 문구 "(회사 리서치는 Gemini 고정)"은 사실과 달라졌으니 제거.
- **AB 테스트 추가 칸**(`src/components/email/ab-test/ui/AbTestField.tsx`): 첫 줄에 "비교 대상" `Choice`(지시사항 / AI 모델). AI 모델이면 scope 칸 대신 `ModelSelect`(B안 모델, 현재 규칙 모델 제외·키 없는 모델 비활성)와 평가 기준(오픈률·회신률·클릭률). 카드(`AbTestCard`)·완료 행 메타에 "모델 A → B" 표기.
- **내비게이션**(`src/components/dashboard/navigation.ts`): 리드젠 그룹 `{ href: "/email/model-lab", label: "AI 모델 실험실", icon: FlaskConical }`(콜드메일 다음), `segmentLabels["model-lab"] = "AI 모델 실험실"`. (bid-outreach 워크트리도 이 파일을 수정 중 — 5절.)
- 모델 선택 공통: `src/components/ai/hooks/useAiModels.ts`(SWR `/api/ai/models`), `src/components/ai/ui/ModelSelect.tsx`(props: `value, onChange, requireAvailable=true, exclude?: string[], className`). 교체 대상 6곳: `ai-auto/new`, `ai-auto/[id]`, `components/email/AiEmailPanel.tsx`, `components/alimtalk/AiAlimtalkPanel.tsx`, `components/ai-copy/ui/VersionForms.tsx`, `components/ai-copy/ui/PriceSettings.tsx`(가격은 키 없어도 미리 등록해야 하므로 `requireAvailable={false}`).

---

## 5. 코드 충돌 점검 (2026-11-27 새벽 기준, `git worktree list` 36개)

| 워크트리 / 브랜치 | main 대비 상태 | 겹치는 파일 | 위험 | 대응 |
| --- | --- | --- | --- | --- |
| `F:/Dev/salesflow` — **`codex/sendb-channel-export`**(main이 아님!) | 1커밋 앞(`65f2d04` 채널톡 자료 추출·가져오기 29파일, `src/lib/channel-source-export/*`, `customer-imports/*`) | 없음 | 낮음. 단, 메인 저장소가 main이 아닌 브랜치에 체크아웃돼 있어 "main에서 배포"를 착각하기 쉽다 | 우리 배포는 이 워크트리에서 PR → `origin/main`으로. 메인 저장소 브랜치는 건드리지 않음 |
| `F:/Dev/sendb-research-cache-20261126` — `codex/search-provider-20261126` | 기준 `175112a`(main보다 1커밋 뒤), **미커밋 22파일** | `src/lib/ai/{client,gemini,search,index,claude,email,quota}.ts`, `auto-personalized-email.ts`, `auto-enrich.ts`, `test-send/route.ts`, `research-company/route.ts`, `generate-product/route.ts`, `db/schema.ts`, `_journal.json`, **`drizzle/0162_ai_search_usage.sql`**, 신규 `serper.ts`(내용 다름)·`company-research-compact.ts`(main에 이미 다른 버전)·`search-usage.ts`·`search-provider.test.ts` | **높음**: 우리 미커밋 Serper 작업과 같은 파일을 다른 방식으로 고쳤다. 나중에 그대로 커밋/병합하면 `gemini.ts`·`client.ts`·`serper.ts` 전면 충돌 + 마이그레이션 0162 번호 충돌 | 이 브랜치는 **우리 작업으로 대체된 것으로 간주**하고 병합하지 않는다. 쓸 만한 아이디어(검색 호출량 컬럼)는 P1에서 `0163_`으로 다시 만든다. Codex에 "search-provider 워크트리는 폐기 또는 main 위에 재작성" 전달 |
| `F:/Dev/sendb-bid-outreach-20261125` — `claude/bid-winner-outreach-20261125` | 기준 `72e4a07`, 미커밋(신규 기능 디렉터리 + `drizzle/0159_bid_outreach.sql`, `_journal.json`, `schema.ts`, `navigation.ts`, `instrumentation.ts`) | `navigation.ts`(우리도 메뉴 1줄 추가), `schema.ts`(P1 테이블) | 중간: **`0159`는 이미 main의 `0159_lead_status_default_new`와 번호 충돌**(그쪽이 오래됨). 병합 시 재번호 필수 | 우리 변경은 `navigation.ts` 1줄·`schema.ts`(P1만)라 재병합이 쉽다. bid-outreach 쪽은 나중에 `0163+`로 재번호 |
| `F:/Dev/sendb-diha-experiment-delivery-20261125` — `work/diha-experiment-delivery-20261125` | **2커밋 앞**(`4bf158a` 디하 A/B·성과 집계, `6d91c38` 평일 오전 발송) | `email-experiments/{prompt-tests,prompt-decision,repository,types}.ts`, `auto-personalized-email.ts`, `ai-copy/{types,generation}.ts`, `db/schema.ts`, `components/email/ab-test/{hooks/useRuleAbTest,types,ui/AbTestCard,ui/AbTestField,utils/labels}`, `ai-auto/[id]/page.tsx`, `new/page.tsx` | **높음**: P0-E(모델 A/B)와 거의 같은 파일 | 우리 변경은 **덧붙이기만**(새 함수·새 분기·새 키, 기존 줄 재포맷 금지)으로 작성해 나중 리베이스 충돌을 줄인다. 그 브랜치 담당에게 "main에 모델 A/B가 들어가니 리베이스 필요" 알림 |
| `sendb-compact-production-20261126`, `sendb-haiku55-research-20261126`, `sendb-inbox-receipts-20261123`, `sendb-email-research-20261124` | 깨끗(main과 같거나 뒤) | — | 없음 | — |
| 그 외 10월 워크트리 30여 개 | 오래됨 | 확인 안 함 | 낮음(이번 파일과 무관한 기능) | 그대로 |

마이그레이션 번호 결정: **P0은 마이그레이션 없음**. P1 테이블을 오늘 밤 넣는다면 `0162_ai_model_lab_runs`(idx 163, when 1795737600000). 우리가 먼저 main에 들어가므로 Codex `0162_ai_search_usage` → `0163`(idx 164, when > 1795737600000), bid-outreach `0159_bid_outreach` → 그 다음 번호로 재번호.

기타 위험: `src/lib/ai/company-research-serper.test.ts`(오늘 미커밋)는 `getCompanyResearchClient()` 결과를 `deepEqual`로 비교한다 → `AiClient`에 필드가 늘면 이 테스트를 함께 고친다(route/apiModel/endpoint 포함 객체로).

---

## 6. 작업 순서(Opus) — 단계별 파일·테스트

> 각 단계 끝에 `pnpm exec tsc --noEmit`(tsconfig가 `noEmit`) + 해당 테스트. 커밋은 단계별로 나눠도 되고 모아서 해도 된다(한국어 메시지). 기존 줄은 재포맷하지 않는다. 예상 분량 합계 ≈ 1,800줄(테스트 포함). **1,500줄 안에 맞추려면**: 7단계는 표 대신 숫자 6개 요약, 8단계 블라인드 토글은 P1로, 4단계 미리보기 카드는 최소 정보만. 시간이 부족하면 **1→2→3→6단계(모델 A/B)까지 필수**, 4·5는 API만 먼저 올리고 화면은 최소로, 7·8은 단축.

### 1단계 — 카탈로그·라우터 (≈ 350줄)
파일: `src/lib/ai/models.ts`(카탈로그·타입·`claudeSampling` 일반화), `src/lib/ai/openrouter.ts`(신규, 상수·헤더·본문 조립), `src/lib/ai/client.ts`(`resolveRoute`, `getAiClient`, `listModelAvailability`, `assertModelSelectable`, `getCompanyResearchClient`는 `resolveRoute`로 Qwen 직접→OpenRouter→Haiku 순), `src/lib/ai/gemini.ts`(`usesChatCompletions`, `callChatCompletions`가 client 필드 사용, `CHAT_APIS` 제거), `src/lib/ai/claude.ts`(refusal `stop_reason` → `EmailResponseError`), `src/lib/ai-copy/provider.ts`, `src/lib/ai-copy/types.ts`·`rules.ts`(enum `qwen`, 카탈로그 검사), `src/app/api/ai/generate-email-stream/route.ts`(OpenAI 호환 SSE 분기 일반화), `src/lib/ai/index.ts`(export 추가).
테스트:
- `src/lib/ai/models.test.ts` 확장: 새 id 해석, `AI_MODELS`에 retired 없음·`AI_MODEL_CATALOG`에는 있음, `claudeSampling("claude-sonnet-5-5")` = `{thinking:{type:"between_tools"}}`, `claudeSampling("claude-opus-5-5", 0.3)` = `{}`, Haiku 5.5·4.5 기존 단언 유지.
- `src/lib/ai/client.test.ts` 확장(`withEnv`): 키 조합별 경로 — `OPENROUTER_API_KEY`만 → deepseek-v4-1-flash는 openrouter(`endpoint` openrouter, `apiModel` slug), `DEEPSEEK_API_KEY`만 → `null`(중국 차단) / `AI_ALLOW_CHINA_ENDPOINTS=1`이면 direct; `QWEN_API_KEY` → qwen direct(sg), 없고 OpenRouter 키만 → openrouter; `AI_ROUTE_FORCE_OPENROUTER=1` → claude도 openrouter; `listModelAvailability()`에 키 값이 포함되지 않음(JSON.stringify에 "sk-" 없음).
- 신규 `src/lib/ai/model-router-request.test.ts`(`haiku-5-5-request.test.ts` 방식으로 fetch 본문 캡처): OpenRouter 요청의 URL·헤더(Authorization 존재, Referer)·`provider` 선호·`reasoning`·`usage.include`; Qwen 직접의 `enable_thinking:false`; `callCopyProvider`가 Sonnet 5.5에 `between_tools`+temperature 없음, Opus 5.5에 `thinking` 없음, deepseek openrouter에 `response_format`과 `max_tokens`.
- 기존 `src/lib/ai/company-research-serper.test.ts`의 `deepEqual` 기대값을 새 `AiClient` 모양으로 수정. `email-stream-route.test.ts`에 qwen(OpenRouter 경유) 행 1개 추가.

### 2단계 — 가용성 API·공통 모델 선택·저장 가드 (≈ 250줄)
파일: `src/app/api/ai/models/route.ts`(신규), `src/components/ai/hooks/useAiModels.ts`, `src/components/ai/ui/ModelSelect.tsx`(신규), 교체 6곳(4.2절), `src/app/api/email/auto-personalized/route.ts`·`[id]/route.ts`·`src/app/api/ai/copy-policies/route.ts`(가드).
테스트: 신규 `src/lib/ai/models-route.test.ts`(`installFakeDb`/`isolateEnv` 방식): 키 없을 때 새 모델 `available:false, reason:"missing_key", missing:["OPENROUTER_API_KEY"]`, 응답 문자열에 키 값 없음; 규칙 PUT에 키 없는 모델로 바꾸면 400, 같은 모델 유지 저장은 200(기존 라우트 테스트 파일이 있으면 거기에 추가, 없으면 신규 `auto-personalized-model-guard.test.ts`).

### 3단계 — 초안 컨텍스트 공통화 (≈ 120줄, 동작 변화 없음)
`src/app/api/email/auto-personalized/test-send/route.ts`의 2·5·6·7·8단계(레코드 데이터 보정, 회사 조사 보관함→1회 조사, 제품, 페르소나, 지시사항 변수 치환)를 `src/lib/auto-personalized-draft.ts` `loadAutoEmailDraft({ orgId, userId, link, recordData, signatureJson, usagePurpose })` → `{ recordData, product, senderPersona, prompt, emailInput }`로 추출하고 test-send가 이를 쓰게 한다. 회사 조사 사용량 기록 3곳(`auto-personalized-email.ts`, test-send, `research-company/route.ts`)의 중복 블록을 `src/lib/ai/company-research-usage.ts` `logCompanyResearchUsage({ orgId, userId, client, research, purpose })`로 모으고, `client && research.method === "compact"`면 토큰 0 `company_research_fallback` 행을 남긴다(3.1절).
테스트: 신규 `src/lib/ai/company-research-usage.test.ts`(fake db: 폴백이면 fallback 행 1개·토큰 행 0개, 성공이면 토큰 행 1개). `company-research-serper.test.ts`·`company-research-route.test.ts` 통과 유지.

### 4단계 — 미리보기 API·실험실 페이지 골격 (≈ 350줄)
파일: `src/lib/model-lab/preview.ts`(`runModelLabPreview`: 모델 검증 → `getAiClient` → `generateEmail` 병렬·타이밍·정가 추정 `estimateUsd(option, usage)`), `src/app/api/ai/model-lab/preview/route.ts`, `src/components/model-lab/{types/index.ts, api/modelLab.ts, hooks/useModelLabPreview.ts, ui/ModelLabPage.tsx, ui/PreviewPanel.tsx, ui/PreviewCard.tsx}`, `src/app/email/model-lab/page.tsx`, `navigation.ts`.
테스트: 신규 `src/lib/model-lab/preview.test.ts`: 모델 3개 중 1개 키 없음·1개 실패(fetch 500) → 나머지 1개 성공, 결과 길이 3, 각 모델에 `ai_usage_logs` insert는 성공한 모델만; `estimateUsd` 계산(6500/400 토큰 × 정가). fetch는 `t.mock.method(globalThis, "fetch")`.

### 5단계 — 순위표 (≈ 250줄)
파일: `src/lib/model-lab/leaderboard.ts`(SQL + `wilsonInterval`(이미 export됨, `src/lib/email-experiments/rules.ts`) + 라벨 매핑), `src/app/api/ai/model-lab/leaderboard/route.ts`, `src/components/model-lab/{hooks/useModelLeaderboard.ts, ui/LeaderboardPanel.tsx}`.
핵심 SQL(개요):
```sql
SELECT j.policy_snapshot->>'model' AS model, j.policy_snapshot->>'provider' AS provider,
  count(DISTINCT l.auto_personalized_link_id)::int AS rules,
  count(*) FILTER (WHERE l.status='sent')::int AS sent,
  count(*) FILTER (WHERE l.status='sent' AND l.open_tracked)::int AS open_tracked,
  count(*) FILTER (WHERE l.status='sent' AND l.open_tracked AND EXISTS (SELECT 1 FROM email_open_logs o WHERE o.send_log_id=l.id AND o.is_machine=false))::int AS opened,
  count(*) FILTER (WHERE l.status='sent' AND EXISTS (SELECT 1 FROM email_click_logs c WHERE c.send_log_id=l.id AND c.is_bot=false))::int AS clicked,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM email_replies r WHERE r.send_log_id=l.id AND r.org_id=l.org_id AND r.kind='human'))::int AS replied,
  avg(t.duration_ms)::int AS avg_latency_ms, sum(t.prompt_tokens)::bigint AS prompt_tokens, sum(t.completion_tokens)::bigint AS completion_tokens,
  sum(t.cost_krw) AS cost_krw, count(t.id)>0 AND bool_and(t.usage_known AND t.cost_krw IS NOT NULL) AS cost_known
FROM email_send_logs l
JOIN ai_copy_generation_jobs j ON j.send_log_id=l.id AND j.org_id=l.org_id AND j.created_at >= now() - make_interval(days => ${days}+3)
JOIN partitions p ON p.id=l.partition_id
LEFT JOIN LATERAL (SELECT * FROM ai_copy_generation_attempts a WHERE a.job_id=j.id AND a.result='valid' ORDER BY a.attempt_number DESC LIMIT 1) t ON true
WHERE l.org_id=${org} AND l.parent_log_id IS NULL AND l.auto_personalized_link_id IS NOT NULL
  AND l.sent_at >= now() - make_interval(days => ${days}) AND (${ws}=0 OR p.workspace_id=${ws}) AND (${rule}=0 OR l.auto_personalized_link_id=${rule})
GROUP BY 1,2;
-- 첫 시도 성공률: ai_copy_generation_attempts(attempt_number=1) result='valid' 비율을 model별로 (started_at 기간 조건)
-- byRule: 같은 쿼리를 l.auto_personalized_link_id, model로 GROUP BY (+ 규칙명 JOIN)
```
오픈률 분모는 `open_tracked`, 클릭·회신 분모는 `sent`. `sampleOk = sent >= 100`.
테스트: 신규 `src/lib/model-lab/leaderboard.test.ts`: 순수 함수(행 → 비율·CI·sampleOk·정렬·라벨) 검증; SQL은 fake db로 호출 한 번·파라미터 범위(days 14~90) 검증.

### 6단계 — 모델 A/B (`kind: "model"`) (≈ 300줄) — **핵심**
파일(덧붙이기만):
- `src/lib/email-experiments/types.ts`: `kind?: "policy" | "prompt" | "model"`, `modelA?: string`, `modelB?: string`. `EnrollmentResult`(repository.ts)에 `armModel?: string`.
- `src/lib/email-experiments/prompt-decision.ts`: `promptTestResult` `kind` 타입에 `"model"` 추가(prompt와 같은 처리).
- `src/lib/email-experiments/prompt-tests.ts`: `syncPromptTest`의 `start`에 `kind`, `modelB` 추가. 규칙 조회에 `l.model` 추가. 진행 중 테스트가 `kind==="model"`이고 `(ruleRow.model ?? DEFAULT_MODEL_ID) !== config.modelA`면 `closeExperiment(..., "ab_test_model_changed")`. 시작 시 `kind==="model"`: `modelB`가 카탈로그에 있고 `assertModelSelectable(modelB)` 통과, `modelA = ruleRow.model ?? DEFAULT_MODEL_ID`, `modelA !== modelB`, config에 `kind:"model", modelA, modelB, metric, scope:"all"`(promptA/B 없음). 이벤트 `ab_test_started` detail에 `kind`. `decidePromptTests` 쿼리 `e.config->>'kind' IN ('prompt','model')`; B 승이고 model kind면 `UPDATE email_auto_personalized_links SET model=${modelB}, updated_at=now() WHERE id=… AND org_id=… AND coalesce(model, ${DEFAULT_MODEL_ID}) = ${modelA}`. `applyPromptTestArm`: model kind면 같은 UPDATE(조건 없이), 반환 `{ applied, model }`. `winnerPrompt`는 prompt 전용으로 그대로. `armMetrics` 변경 없음.
- `src/lib/email-experiments/repository.ts`: `armModelOf(experiment, arm)`(A → modelA, B → modelB) 추가·export; `promptKind` → `const lenientKind = kind === "prompt" || kind === "model"`(변수명만 바꾸지 말고 새 상수 추가 후 사용처 교체); model kind에서 **새 배정 전** `resolveRoute(resolveModel(config.modelB)).ok`가 아니면 `{ kind: "none" }`(배정하지 않고 규칙 모델로 발송); 반환 객체 두 곳에 `armModel: armModelOf(experiment, arm)`.
- `src/lib/auto-personalized-email.ts`: `promptArm` 판정을 `armPrompt || armModel`로 넓히고(`const armed = …`), `rawPrompt = armed?.armPrompt || link.prompt || …`, `model: armed?.armModel ?? link.model ?? undefined`, `assignmentId: armed?.assignment.id`.
- API: `[id]/ab-test/route.ts` zod(`kind`, `modelB` 선택), `ab-tests/route.ts`(`kind` 매핑에 model, 응답 `modelA/modelB`, LATERAL 액션에 `ab_test_model_changed`).
- UI: `components/email/ab-test/types/index.ts`(`AbTestRow.kind`에 `"model"`, `modelA/modelB`, `AbTestDraft.kind/modelB`), `utils/labels.ts`(`KIND_LABELS`, 메타 문구), `hooks/useRuleAbTest.ts`(필터 `kind !== "policy"`, `setKind/setModelB`, `invalid`에 model 조건), `api/abTests.ts`(그대로), `ui/AbTestField.tsx`(비교 대상 선택·`ModelSelect`), `ui/AbTestCard.tsx`(모델 표기). `[id]/page.tsx`는 `abTest.invalid` 로직 그대로.
테스트:
- `src/lib/email-experiments/prompt-decision.test.ts`에 `kind:"model"` 결과 케이스 추가.
- 신규 `src/lib/email-experiments/model-ab.test.ts`: `armModelOf` A/B·prompt 실험에서는 undefined; `syncPromptTest`를 fake conn(태그드 템플릿 스텁)으로 돌려 ① modelB 키 없음 → `CopyActionError`, ② modelA===modelB → 오류, ③ 정상 시작 config 모양, ④ 규칙 모델 바뀌면 `ab_test_model_changed`로 닫힘. (`rules.test.ts`에 conn 스텁 패턴이 있으면 따른다.)
- `auto-personalized-email`은 통합 테스트가 없으므로 `armed` 분기는 작은 순수 함수 `resolveArmedGeneration(enrollment, link)` → `{ prompt, model, assignmentId }`로 빼서 단위 테스트(3케이스: none/prompt/model).

### 7단계 — 회사 조사 관찰 통계 (≈ 150줄; 축소 시 표 대신 숫자 6개)
파일: `src/lib/model-lab/research-stats.ts`(ai_usage_logs 일자별 집계 + cache 집계 + `companyResearchMode()` + `summarizer = QWEN_API_KEY ? "qwen" : ANTHROPIC ? "claude" : null` — boolean만, 값 노출 없음), `src/app/api/ai/model-lab/research-stats/route.ts`, `src/components/model-lab/{hooks/useResearchStats.ts, ui/ResearchMonitorPanel.tsx}`.
테스트: 신규 `src/lib/model-lab/research-stats.test.ts`(fake db 행 → 응답 모양, 추정 비용 = 토큰 × Qwen 정가).

### 8단계 — 실험실 페이지 마무리 (≈ 100줄)
탭 조립, 블라인드 토글(로컬 상태·셔플·공개), 빈 상태/에러 상태(`QueryErrorState` 재사용), `AlertDialog`는 이번 단계에 없음(적용 버튼은 링크). 축소 시 블라인드 토글 생략.

### 검증 게이트(배포 전, 순서대로)
1. `pnpm exec tsc --noEmit`
2. `pnpm exec eslint <변경·신규 파일 전체>`
3. 대상 테스트: `pnpm exec tsx --test "src/lib/ai/*.test.ts" "src/lib/ai-copy/*.test.ts" "src/lib/email-experiments/*.test.ts" "src/lib/model-lab/*.test.ts"`
4. 전체 `pnpm test` — **알려진 기존 실패만 허용**: `partition-boundary.test.ts`의 웹폼 UX-042 ×2, `channel-source-export` 출력 타이밍(불안정). 그 외 실패는 고친 뒤 진행.
5. 운영 빌드: `DATABASE_URL=postgres://u:p@localhost:5432/dummy JWT_SECRET=dummy pnpm run build:cloudtype` (standalone + `copy-runtime-migrations.cjs` 저널 검증 통과 확인).
6. `git diff`에 키·토큰 문자열 없음(`git diff | grep -iE "sk-|api[_-]?key *[:=] *['\"][A-Za-z0-9]"`), `docs/`에 키 없음.
7. 커밋(한국어) → 브랜치 푸시 → PR(설명에 "키 없이 휴면 배포", 내일 켜는 절차) → **사용자 승인 후** main 병합 → CloudType 수동 배포. PR 생성은 배포 승인이 아니다(AGENTS.md).

---

## 7. 배포와 전환

### 오늘 밤(휴면 배포)
- 환경변수 추가 없음 → `/api/ai/models`에서 신규 모델 전부 `available:false`(키 필요). 규칙 드롭다운에 비활성으로 보이기만 한다. 회사 조사는 `SERPER_API_KEY`가 없으니 `compact` 그대로. 기존 규칙·발송·스냅샷·단가·실험 모두 동작 변화 없음.
- 배포 직후 확인(T+0): 부팅 로그에 마이그레이션 메시지 없음(0건), `/email/model-lab` 열림, 순위표에 Haiku 5.5/4.5·Gemini 3.5 Flash Lite 기존 데이터가 집계됨(쿼리 시간 메모), 규칙 저장 정상, 자동 메일 1통 정상 생성(T+20~60분).

### 내일(키 투입 뒤) 켜는 순서
1. CloudType 환경변수: `SERPER_API_KEY`, `QWEN_API_KEY`(**싱가포르 International 지역 키**), `OPENROUTER_API_KEY`(크레딧 충전, 지출 한도 설정), 필요 시 `DEEPSEEK_API_KEY`(직접 경로는 `AI_ALLOW_CHINA_ENDPOINTS=1` 없이는 고객 정보 작성에 쓰이지 않음). 재배포.
2. 실험실 → 미리보기: 규칙 1개·실제 레코드 1개로 후보 모델 전부 생성 → JSON 파싱 실패·한국어 품질·지연 확인. OpenRouter 대시보드에서 DeepSeek 요청이 어느 공급자로 갔는지 확인(중국 공급자가 섞이면 `OPENROUTER_PROVIDER_PREFS` 조정).
3. 가격 설정(`PriceSettings`)에 새 모델 단가 등록(USD + 환율 + 근거 URL) — 없으면 순위표 비용이 "단가 미등록".
4. 규칙 1개 선택 → AB 테스트 추가 → 비교 대상 "AI 모델", B = 후보(예: DeepSeek V4.1 Flash via OpenRouter 또는 Qwen3.7 Flash), 평가 기준 선택 → 규칙 저장으로 시작. 안마다 최소 100통·14일 모집.
5. 회사 조사: Serper 키 투입 뒤 서버 로그 `[CompanyResearch] Serper 조사 실패` 빈도와 실험실 "회사 조사 관찰" 탭을 30일 본다. 문제가 없으면 유지, 문제면 `AI_COMPANY_RESEARCH_MODE=compact`.

### 되돌리기
- 특정 모델 중단: 해당 키 제거 후 재배포 → 그 모델은 "키 필요", 진행 중 모델 A/B의 B는 새 배정이 멈추고(규칙 모델로 발송), 이미 만들어진 B 작업은 `provider_not_configured`로 재시도/보류될 수 있으니 A/B를 「중단」한다(닫힌 뒤 새 작업은 규칙 모델).
- 전체: 커밋 revert 후 재배포. P0에는 마이그레이션이 없어 DB 되돌릴 것이 없다. 저장된 `policy_snapshot.provider='qwen'`이 남아 있어도 enum 확장 전 코드는 그 작업을 다시 쓰지 않는다(이미 발송 완료 작업).

---

## 8. 내일 아침 결정할 것
1. **OpenRouter**: 계정·크레딧 금액(5.5% 수수료), 월 지출 한도, `data_collection:"deny"` 유지 여부, DeepSeek 비중국 공급자 지정 방식(`ignore:["DeepSeek"]` vs `only:[…]`) — 공급자 슬러그 확인 뒤 `OPENROUTER_PROVIDER_PREFS` 확정.
2. **DeepSeek 직접 키**를 살지(중국 서버, 비피크 반값). 기본은 OpenRouter만. 직접 경로를 고객 정보 작성에 허용(`AI_ALLOW_CHINA_ENDPOINTS=1`)할지 — 권고: 허용하지 않음.
3. **Qwen** 경로: 싱가포르 직접(싸고 이미 구현) vs OpenRouter(한 청구서). 권고: 직접 + 회사 조사 정리는 직접 고정.
4. **첫 모델 A/B**: 어느 규칙(발송량 많은 디하/매치스플랜 규칙), B 후보(DeepSeek V4.1 Flash vs Qwen3.7 Flash), 평가 기준(오픈률은 수백 통이면 판정, 회신률은 수천 통).
5. **Opus 5.5·Sonnet 5.5·Gemini 3.8 Flash**를 카탈로그에 넣을지(월 4.5만 통 전환 시 각 ≈ $1,530 / $765 / $287). 권고: 실험실 비교용으로 넣되 규칙 적용은 A/B 승리 뒤에만. Opus는 생각을 끌 수 없어 지연·비용이 더 든다.
6. **가격 등록**: 새 모델 단가와 환율(KRW) 기준값, 근거 URL.
7. **Serper** 크레딧($50/5만 회) 구매와 `AI_COMPANY_RESEARCH_MODE` 비움(자동 serper) 확인.
8. **P1 범위**: 블라인드 투표 저장(`0162_ai_model_lab_runs`)을 바로 할지 — 하면 Codex의 `0162_ai_search_usage`와 번호 조정 필요. 캐시 적중 집계를 Codex 방식(ai_usage_logs 컬럼)으로 할지 별도 테이블로 할지.
9. **메뉴 노출**: "AI 모델 실험실"을 모든 구성원에게 보일지(페이지는 관리자 제한) — 아니면 관리자만 보이게 nav 필터 추가(P1).
10. **Codex 워크트리 처리**: `sendb-research-cache-20261126`(search-provider) 폐기/재작성, `sendb-bid-outreach-20261125` 마이그레이션 재번호, `sendb-diha-experiment-delivery-20261125` 리베이스 — 담당자 통보.
