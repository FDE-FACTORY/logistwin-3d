# 진행 상태 핸드오프 (자동 재개용)

> 이 문서는 작업 중단/한도 리셋 후 **정확히 이어서 진행**하기 위한 체크포인트입니다.
> 각 단계 완료 시 갱신하고 커밋합니다.

## 완료 (커밋됨)
- **Phase 1~2 백엔드 코어**: 3D 랙 스키마, 포아송·ABC 수요, 시드 결정론, 크레인 4상태 FSM,
  Dual-Command 최적화(주행 34.5%·전력 31%↓), ESG 엔진, WebSocket 브로드캐스트
- **CAD 임포트**: 평면도(DXF)→레이아웃 자동 설계 + 수동 치수 모드
- **크레인 제원 카탈로그**: compact/standard/highbay/heavyduty, 선택 투입 + 층수 검증
- **Phase 3 프론트(web/)**: R3F 3D 트윈(랙·팔레트·크레인) + KPI/ESG HUD
- **크레인 상세 모델 + glTF 교체 경로**
- **3D 비주얼 고도화**: 조명·그림자·랙 구조·카메라
- **2D 평면도 뷰 + 2D/3D 토글** (Canvas2D)

## 진행 중 — Phase 4 (관제 대시보드 + 양방향 제어)
- [x] BE: slotting 옵티마이저(`src/services/slotting.js`)
- [x] BE: 예외 매니저(`src/services/exceptionManager.js`) + 서버 command/patch(저지연) — 검증 완료
- [x] FE: 산업용 테마(`web/src/theme.js`), index.css(CSS 변수·break-keep·반응형)
- [ ] FE: store(exceptions/events/kpiHistory/socketEmit) + useSocket(patch/history)
- [ ] FE: 대시보드 UI — 적재 효율화 버튼, 예외 팝업([조치 완료]), ESG SVG 차트, 예외 셀 하이라이트
- [ ] FE: 기존 HUD/Plan2D 산업톤 리튜닝 + 반응형/줄바꿈
- [ ] 검증: slotting/예외/차트 E2E 스크린샷(데스크톱·태블릿·모바일) + 커밋

## 다음 — Phase 5 (TMS 지도)
- Kakao 지도(`VITE_KAKAO_MAP_KEY` env), 키 없으면 **시뮬 맵 폴백**
- 가상 트럭 라우팅(백엔드 트럭 시뮬 → 브로드캐스트), 폴리라인
- 컴플라이언스: 위치 수집 동의 토글 → 마스킹, 업무 종료 시 차단

## 다음 — Phase 6 (배포 설정·문서만, 라이브 배포 X)
- 백엔드 Dockerfile + railway.json, 프론트 vercel.json, GitHub Actions CI
- Neon Postgres: `schema.sql` + `DATABASE_URL` env 게이트(없으면 in-memory+JSONL)
- `.env.example`(루트·web), `docs/DEPLOY.md` 단계별 가이드, README 아키텍처

## 작업 원칙 (사용자 지시)
- 업계 최고 품질·실수 제로, 매 단계 **E2E 검증 + 리팩토링 검증**
- UI: 산업용 WMS 컬러(그래파이트/스틸+기능색), **AI스럽지 않게**, 자연스러운 한국어 문구
- **반응형**(브라우저·모바일·태블릿), 한국어 **줄바꿈 어색하지 않게**(break-keep)
- **지연 최소화·실시간성**(크레인 클라 보간 + 명령 즉시 patch)
- 리포: `FDE-FACTORY/logistwin-3d`(public), 매 단계 커밋·푸시
