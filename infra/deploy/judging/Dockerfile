FROM node:22-bookworm

WORKDIR /app

RUN corepack enable

COPY . .

RUN pnpm install --frozen-lockfile

ENV NODE_ENV=production
ENV ENS_GATEWAY_URL=http://127.0.0.1:8787
ENV AXL_BIN=/app/infra/axl/bin/node-linux
ENV AXL_MCP_BASE_PORT=9303
ENV PORT=8080

EXPOSE 8080

CMD ["node", "infra/deploy/judging/start-stack.mjs"]
