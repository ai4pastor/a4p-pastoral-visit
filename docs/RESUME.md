# RESUME — 세션 이어가기

> 마지막 갱신: 2026-07-12 (v0.2 개발 완료 — 디자인 고급화 + 성도 탭·브리핑 탭)

## 현재 상태 (한눈에)

- **v0.2 기능 완성 + 첫 릴리스 발행** — 빌드·테스트(131건) 통과
- GitHub: `ai4pastor/a4p-pastoral-visit` (**private**, main 브랜치)
- **릴리스 0.2.0 발행됨** (2026-07-12, release.yml 자동 빌드 — main.js/manifest.json/styles.css 첨부) → BRAT 설치 테스트 가능
- v0.2에서 추가된 것:
  - **디자인 고급화** — UI 크롬 이모지 → Lucide 전면 전환(`safeIcon` 폴백), styles.css 간격/폰트 토큰화(`--size-4-*`, `--font-semibold`), 카운트 뱃지(pill, neutral/warn/accent), 공용 빈 상태(`renderEmpty`, CTA 지원), 카드 접기(`<details>` + `collapsedCards` 설정 저장), 포커스 링·hover 트랜지션·reduced-motion, 행 키보드 접근(tabIndex+Enter/Space)
  - **미리보기 diff화** — `SyncPlan.insertions` 필드 추가(계약 유지, 필드만), sync/prayer-digest 모달이 `renderDiff`(파일 헤더 + 섹션 컨텍스트 + `+` 초록 라인)와 `callout` 사용
  - **성도 탭** — 검색(이름/구역/직분, NFC) + 목록 + 노트 열기/일지 작성 버튼, `filterMembers` 순수 함수
  - **심방 브리핑** — 행 클릭/커맨드("심방 브리핑 열기")/성도 노트 우클릭 3진입점 → 헤더(마스킹 경유 연락처·생년월일·나이) + 마지막 심방 + 미완 후속조치(visitPath 집합 필터, 동명이인 안전) + 최근 기도제목(최근 일지 2건) + 가족(`가족관계` wikilink 해석, 가족 브리핑 이동) + 심방 이력 타임라인 + 일지 작성 CTA
  - **버그 수정** — `renderSensitive`가 phone에 `maskPhone` 미적용이던 것 수정 (mask.ts로 승격, 뷰·모달 공유)
- 신규 모듈: `src/ui.ts`(safeIcon/badge/renderEmpty/callout/renderDiff), `src/briefing-core.ts`(순수), `src/briefing.ts`(수집기) + `tests/briefing-core.test.ts`

## 구현된 기능 (커밋 순)

1. **v0.1 MVP** — 성도 등록 모달 / 심방일지 생성(기본정보 자동 채움, 커서 위치) / 일지→성도 노트 반영(미리보기·append-only·멱등 이중 방어) / 사이드 패널(대시보드+후속조치 탭) / 설정(경로 검증) / 마스킹·동기화 노출 점검 / 반영 배너(addAction)
2. **폴더 자동완성** — 모든 경로 입력란에 FolderSuggest/FileSuggest (글로벌 CLAUDE.md에 영구 규칙화됨)
3. **분석 헤딩 커스터마이즈** — 설정에서 9개 헤딩 변경 + 검증(형식·커버리지) + HeadingWatcher(헤딩 삭제 감지 경고)
4. **기도 탭** — 기도제목 수집(그룹 라벨 추적), 체크 = 라인 끝 `✅ 날짜` 마커(응답/마침 표시, 왕복 복원)
5. **주간 기도제목 모음** — 미리보기 모달 → 성도별 묶음 노트 생성 (기도모음 폴더)
6. **WORD 템플릿 분석** — 설정에서 분류법 템플릿 경로 지정 → `ALLOWED_WORLD` 배열/wikilink 파싱 → world/route 드롭다운 선택 (수강생별 다른 번호 체계 지원). 실제 템플릿에서 world 70개 추출 검증됨
7. **헤딩 느슨 매칭** — 이모지 없는 헤딩(`## 대화내용`)도 전 분석 경로에서 인식 + `resolveAnchors`로 임베드가 일지의 실제 헤딩을 따라감

## 아키텍처 핵심 (새 세션에서 꼭 알 것)

- **순수 로직 / IO 분리**: `*-core.ts`·`note-builders.ts`·`utils.ts`·`word-config.ts`·`mask.ts`는 obsidian import 금지 → vitest 직접 테스트. IO는 `sync.ts`·`actions.ts`·`prayers.ts`·`visit-note.ts`·`member-note.ts` 등
- **헤딩 상수**: `src/constants.ts`의 `DEFAULT_HEADINGS`가 기본값, 실사용은 `settings.headings` (커스터마이즈 가능). 섹션 탐지는 `findSectionRange`(정확→느슨 2단계)
- **비파괴 규율**: append-only, 명시 클릭 단일 라인 변경만 예외, dry-run 미리보기 (CLAUDE.md 참조)
- 테스트: `npm test` (131건) + `node scripts/e2e-check.mjs` (실볼트 읽기 전용 골든 검증)
- dev 볼트 배포: `npm run build && cp main.js manifest.json styles.css ~/obsidian_dev_vault/.obsidian/plugins/a4p-pastoral-visit/`

## 다음 할 일 (우선순위)

1. **dev 볼트에서 사용자 수동 E2E** — 탭 4개 전환, 카드 접기 상태 유지(재시작 후), 성도 검색, 브리핑 진입 3경로(행 클릭/커맨드/우클릭), 마스킹 on/off 시 브리핑 연락처, diff 미리보기 → 반영 멱등, 키보드 탐색(Tab/Enter)
2. **테마 매트릭스 확인** — 기본 라이트/다크 + Minimal, 액센트 2종에서 뱃지 warn 틴트·diff 초록 틴트·칩 대비 확인 (color-mix 틴트가 다크에서 안 보이면 `.theme-dark` 스코프로 16~18% 상향)
3. **BRAT 설치 테스트** — 릴리스 0.2.0은 발행됨. private 리포라 BRAT에서 GitHub 토큰 설정 필요할 수 있음
4. v0.3 후보: 연락 템플릿(#3), 소급 반영 마이그레이션(#8), 월간 통계 리포트(#4) — `docs/03-확장아이디어.md`
5. 강의 자료화: `docs/03-확장아이디어.md`의 90분 실습 커리큘럼 참조

## 주의사항

- 사용자 볼트 템플릿(`900. Settings/901. Templates/Template-WORD-분류법.md`)에 **OpenAI API 키 하드코딩됨** — 사용자가 인지하고 있음(배포 안 함, 업로드 금지 지시). 리포에는 미포함 확인됨
- 실볼트(`~/obsidian_remote/csh_remote`) 쓰기 절대 금지 — 테스트는 dev 볼트에서만
- 기획 문서 3부: `docs/01-기획서.md`(명세) / `02-기술설계.md` / `03-확장아이디어.md`
