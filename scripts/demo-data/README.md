# 시연 데이터 생성기 (`scripts/demo-data/`)

성도 폴더(`460. 성도`)의 **가짜 시연 데이터**를 재현 가능하게 만든다. 시나리오(성도 오버라이드 + 일지 조각)에서
성도 노트 53개와 심방일지를 렌더하고, 성도 노트의 심방 기록·임베드는 플러그인의 `planSync`를 그대로 호출해 만든다
(= 플러그인이 쓰는 것과 바이트 호환). 삭제 기능은 없다.

## 사용

```bash
# 1) dry-run — 변경 파일 표 + 기대 대시보드 카드 수 (쓰기 없음)
node scripts/demo-data/cli.mjs generate --vault "<볼트>/400. Education & Ministry/460. 성도" --anchor 2026-10-05
#    파일 하나 diff 보기
node scripts/demo-data/cli.mjs generate --vault "…/460. 성도" --anchor 2026-10-05 --diff 이미영.md

# 2) 적용 — tar.gz 백업(.backup/) → 일지·성도 노트 쓰기 → `성도 테스트/` 를 `../469. 성도 실습(테스트)/` 로 이동 → 검증
#    Obsidian 이 실행 중이면 중단한다 (--yes 로 강행). 실볼트는 Obsidian 종료 후 실행 권장.
node scripts/demo-data/cli.mjs generate --vault "…/460. 성도" --anchor 2026-10-05 --apply

# 3) 검증만
node scripts/demo-data/cli.mjs verify --vault "…/460. 성도" --anchor 2026-10-05
```

## 시나리오 파일

- `seed/members.json` — 1회성 `extract` 로 뽑은 성도 53명 프론트매터(키 순서·따옴표 원문 보존). 이름·구역·직분·가족관계의 기준.
- `members.overrides.json` — 앵커 상대 오버라이드. `birthdayOffset`(생일을 앵커+n일로), `registeredDaysAgo`(등록일을 앵커−n일로),
  `set`(임의 키), `drop`, 전역 `dropKeys`/`fillEmpty`/`statusIfVisited`/`rules`(위생 규칙: 배우자→기혼, 미세례+등록교인→세례 등).
- `logs/history/*.md` — 기존 일지 13건의 서사(절대 `date:`). `summary:` 가 있으면 성도 노트 요약줄에 그대로 쓴다.
- `logs/new/*.md` — 신규 일지(앵커 상대 `offset:`). 헤더 + 서사 5섹션만 쓴다. 프론트매터·제목·📋 기본정보·📍 심방정보는 생성기가 채운다.
  `synced: false` 면 `반영:` 없이 생성되고 성도 노트에도 링크되지 않는다(라이브 반영 시연용). 본문의 `{{T-3}}`, `{{T+14}}` 는 앵커 기준 날짜로 치환된다.

## 앵커를 바꿔 다시 쓰기

`--anchor` 를 바꾸면 `offset:` 일지의 날짜·파일명, 생일·등록일 오버라이드가 함께 이동한다. 서사는 가을 앵커에 맞춰 쓰였으므로
계절 언급이 어긋날 수 있다. 날짜가 바뀐 옛 일지 파일은 지우지 않으므로, 재앵커 시에는 이전 산출물을 먼저 휴지통으로 옮긴 뒤 적용한다.

## 검증 항목

파일명↔날짜↔성도 일치 · H2 7개 순서 · 임베드 앵커 · 반영된 일지의 `planSync` 멱등 · 미반영 일지는 성도 노트에 링크 없음 ·
성도 노트의 링크/앵커 실재 · 심방 기록 줄 날짜순 · ✅ 날짜 범위 · 가족관계 대칭·기혼 일관 · 중복 이름 0.
