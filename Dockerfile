# LogisTwin 3D — 백엔드(WebSocket 시뮬레이터) 컨테이너
FROM node:20-alpine

WORKDIR /app

# 의존성 (프로덕션만)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 소스
COPY src ./src
COPY samples ./samples

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

# 헬스체크 (Railway가 /health 사용; 컨테이너 자체 점검도 제공)
HEALTHCHECK --interval=30s --timeout=4s --start-period=10s \
  CMD wget -qO- http://localhost:${PORT}/health || exit 1

CMD ["node", "src/server.js"]
