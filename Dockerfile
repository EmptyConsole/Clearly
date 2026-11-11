# Clearly: web app + API in one image. Build: docker build -t clearly .
# Run: docker run -p 3001:3001 --env-file apps/server/.env -v clearly-data:/data clearly

FROM node:24-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY . .
RUN pnpm install --frozen-lockfile
# Heavy assets (RNNoise, Whisper models, ONNX Runtime), verified against heavy-manifest.json.
RUN pnpm fetch:heavy
RUN pnpm --filter @clearly/web build && pnpm --filter @clearly/server build
# Production dependencies of the server only (better-sqlite3 is compiled here).
RUN pnpm --filter @clearly/server deploy --prod --legacy /out

FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3001 HOST=0.0.0.0 DATABASE_PATH=/data/clearly.sqlite WEB_DIST=/app/web
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/apps/server/dist ./dist
COPY --from=build /repo/apps/web/dist ./web
RUN mkdir -p /data && chown -R node:node /data
USER node
EXPOSE 3001
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
