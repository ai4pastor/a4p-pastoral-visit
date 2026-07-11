# RESUME — 세션 이어가기

> 마지막 갱신: 2026-07-12 (v0.1 개발 완료 + GitHub 업로드 시점)

## 현재 상태 (한눈에)

- **v0.1 기능 완성** — 빌드·테스트(104건)·실볼트 E2E 전부 통과
- GitHub: `ai4pastor/a4p-pastoral-visit` (**private**, main 브랜치) — 푸시 완료
- dev 볼트(`~/obsidian_dev_vault`)에 최신 빌드 배포됨 (플러그인 리로드 필요할 수 있음)
- **아직 태그/릴리스 없음** — BRAT 배포하려면 태그 푸시 필요 (release.yml이 자동 처리)

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
- 테스트: `npm test` (104건) + `node scripts/e2e-check.mjs` (실볼트 읽기 전용 골든 검증)
- dev 볼트 배포: `npm run build && cp main.js manifest.json styles.css ~/obsidian_dev_vault/.obsidian/plugins/a4p-pastoral-visit/`

## 다음 할 일 (우선순위)

1. **dev 볼트에서 사용자 수동 E2E** — 성도 등록→일지 작성→반영→패널 3탭·기도 모음·WORD 분석 버튼 실제 확인 (아직 사용자가 직접 안 해봄)
2. **v0.1.0 태그 푸시 → 첫 릴리스** — `git tag 0.1.0 && git push origin 0.1.0` (release.yml이 자동 빌드·릴리스) → BRAT 설치 테스트
3. v0.2 후보 (기획서 7장): 심방 브리핑 탭, 성도 탭 검색, 기존 일지 소급 반영 마이그레이션(dry-run)
4. 강의 자료화: `docs/03-확장아이디어.md`의 90분 실습 커리큘럼 참조

## 주의사항

- 사용자 볼트 템플릿(`900. Settings/901. Templates/Template-WORD-분류법.md`)에 **OpenAI API 키 하드코딩됨** — 사용자가 인지하고 있음(배포 안 함, 업로드 금지 지시). 리포에는 미포함 확인됨
- 실볼트(`~/obsidian_remote/csh_remote`) 쓰기 절대 금지 — 테스트는 dev 볼트에서만
- 기획 문서 3부: `docs/01-기획서.md`(명세) / `02-기술설계.md` / `03-확장아이디어.md`
