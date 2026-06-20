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

## 추가 완료 (Phase 6 이후)
- **Blender 실사형 크레인 glTF** — `scripts/blender/build_crane.py`로 생성, `web/public/models/crane_standard.glb`.
  carriage/fork 노드 애니메이션 매핑(Crane.jsx). 포터블 Blender: `C:\Users\Codelab\tools\blender\...`
- **적재율 균형 피드백** — 수요모델이 ~50% 밴드 유지(데모 가독성). compare 벤치마크 불변(34.5%/31%)
- **README 미리보기 스크린샷 + Mermaid 아키텍처 다이어그램**(docs/img)

## 남은 작업 (선택/후속 — 사용자 계정/에셋 필요)
- 라이브 배포(Railway/Vercel/Neon 로그인) — 설정/문서 준비 완료, 로그인만 하면 됨
- 크레인 제원별 변형 glb(highbay/heavyduty 등) — 현재 standard glb + 나머지 절차적 폴백
- Kakao 실지도 키(`VITE_KAKAO_MAP_KEY`) — 현재 시뮬 맵 폴백
- 포트폴리오 카드 링크를 배포 URL로 교체(현재 repo 링크)

## 크레인 glb 재생성 방법
```
& "C:\Users\Codelab\tools\blender\blender-4.2.12-windows-x64\blender.exe" --background \
  --python scripts/blender/build_crane.py -- 8 web/public/models/crane_standard.glb
```

## 작업 원칙 (사용자 지시)
- 업계 최고 품질·실수 제로, 매 단계 E2E 검증 + 리팩토링 검증
- UI: 산업용 WMS 컬러(그래파이트/스틸+기능색), AI스럽지 않게, 자연어 한국어, 반응형, break-keep
- 지연 최소화·실시간성(크레인 보간 + 명령 즉시 patch)
- 리포: FDE-FACTORY/logistwin-3d(public), 매 단계 커밋·푸시
