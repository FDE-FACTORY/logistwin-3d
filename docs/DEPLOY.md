# 배포 가이드 (Deploy)

LogisTwin 3D 배포 스택: **Vercel(프론트) + Railway(백엔드) + Neon(DB, 선택)**.

> 백엔드는 상시 구동 WebSocket 프로세스라 서버리스(Vercel/CF Workers)에 올릴 수 없습니다.
> 반드시 Railway 같은 **영속 컨테이너**에 배포합니다.

---

## 1. 백엔드 → Railway

1. [Railway](https://railway.app)에서 **New Project → Deploy from GitHub repo** → `FDE-FACTORY/logistwin-3d` 선택.
2. 루트의 [Dockerfile](../Dockerfile)과 [railway.json](../railway.json)을 자동 인식합니다.
   - 빌드: Dockerfile / 시작: `node src/server.js` / 헬스체크: `/health`
3. **Variables**에 환경변수 설정 (`.env.example` 참고):
   | 키 | 값 | 비고 |
   | --- | --- | --- |
   | `CORS_ORIGIN` | `https://<your-app>.vercel.app` | 프론트 도메인으로 제한 |
   | `SIM_SPEED` | `1` | 실시간 |
   | `SIM_MODE` | `dual` | |
   | `DATABASE_URL` | (Neon URL) | 선택 — 설정 시 영속화 |
   - `PORT`는 Railway가 자동 주입합니다.
4. 배포 후 발급된 URL(`https://xxx.up.railway.app`)을 프론트 `VITE_WS_URL`에 사용합니다.
   - `https://xxx.up.railway.app/health`로 동작 확인.

## 2. 프론트엔드 → Vercel

1. [Vercel](https://vercel.com) **New Project → Import** → 같은 repo 선택.
2. **Root Directory**를 `web` 로 지정 (중요). 프레임워크는 Vite 자동 인식([vercel.json](../web/vercel.json)).
3. **Environment Variables**:
   | 키 | 값 |
   | --- | --- |
   | `VITE_WS_URL` | `https://xxx.up.railway.app` (Railway 백엔드) |
   | `VITE_KAKAO_MAP_KEY` | (선택) Kakao JS 키 — 설정 시 배송 관제가 실지도 |
4. 배포 후 `https://<your-app>.vercel.app` 접속 → 3D 트윈이 백엔드에 실시간 연결됩니다.
5. Railway의 `CORS_ORIGIN`을 이 Vercel 도메인으로 갱신.

## 3. DB(선택) → Neon

1. [Neon](https://neon.tech)에서 프로젝트 생성 → 연결 문자열 복사
   (`postgres://...sslmode=require`).
2. Railway `DATABASE_URL`에 붙여넣기. 서버 기동 시 [schema.sql](../src/db/schema.sql)이
   멱등 실행되어 `events`/`orders` 테이블이 생성되고, 주문·이벤트가 비차단 배치로 적재됩니다.
3. 미설정 시 in-memory + JSONL 이벤트로그로 정상 동작합니다(영속화만 비활성).

## 4. Kakao 지도(선택)

1. [Kakao Developers](https://developers.kakao.com)에서 앱 생성 → **JavaScript 키** 발급.
2. 플랫폼 → Web에 Vercel 도메인 등록.
3. Vercel `VITE_KAKAO_MAP_KEY`에 키 설정 → '배송 관제'가 시뮬 맵에서 실지도로 전환됩니다.

---

## CI

[.github/workflows/ci.yml](../.github/workflows/ci.yml) — push/PR마다 백엔드 스모크
(`compare`·`import-layout`)와 프론트 빌드를 검증합니다.

## 로컬 실행 요약

```bash
npm install && npm run serve              # 백엔드 :3001
cd web && npm install && npm run dev      # 프론트 :5173
```
