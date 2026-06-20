# 진행 상태 핸드오프 (자동 재개용)

> 작업 중단/한도 리셋 후 **정확히 이어서 진행**하기 위한 체크포인트.

## 완료 (커밋·푸시됨) — Phase 1~6
- **Phase 1~2 백엔드 코어**: 3D 랙 스키마, 포아송·ABC 수요, 시드 결정론, 크레인 4상태 FSM,
  Dual-Command 최적화(주행 34.5%·전력 31%↓), ESG 엔진, WebSocket 브로드캐스트
- **CAD 임포트**: 평면도(DXF)→레이아웃 자동 설계 + 수동 치수 모드
- **크레인 제원 카탈로그**: compact/standard/highbay/heavyduty + 층수 검증
- **Phase 3**: R3F 3D 트윈 + 2D 평면도 뷰 + 상세 크레인(glTF 교체 경로) + 3D 비주얼 고도화
- **Phase 4 관제 대시보드**: 적재 효율화(Slotting), 예외 주입/조치(양방향), ESG 추이 차트,
  산업용 WMS UI, 반응형(데스크톱·태블릿·모바일), 명령 즉시 patch(저지연)
- **Phase 5 TMS**: 가상 트럭 추적(Kakao 지도 env / 시뮬 맵 폴백) + 위치정보 컴플라이언스(동의·업무시간 마스킹)
- **Phase 6 배포 설정**: Dockerfile·railway.json·vercel.json·CI(.github/workflows)·.env.example,
  Neon Postgres schema+db.js(env 게이트, 비차단 배치 영속화), docs/DEPLOY.md, README 갱신

## 남은 작업 (선택/후속)
- 라이브 배포(사용자 Railway/Vercel/Neon 로그인 필요) — 설정/문서는 준비 완료
- 제원별 실사 glTF 크레인 모델 에셋(현재 절차적 모델 + 교체 훅 대기)
- Kakao 실지도 키 연동(현재 시뮬 맵 폴백)
- 포트폴리오 카드 링크를 배포 URL로 교체(현재 repo 링크)

## 작업 원칙 (사용자 지시)
- 업계 최고 품질·실수 제로, 매 단계 E2E 검증 + 리팩토링 검증
- UI: 산업용 WMS 컬러(그래파이트/스틸+기능색), AI스럽지 않게, 자연어 한국어, 반응형, break-keep
- 지연 최소화·실시간성(크레인 보간 + 명령 즉시 patch)
- 리포: FDE-FACTORY/logistwin-3d(public), 매 단계 커밋·푸시
