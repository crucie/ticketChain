FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY tsconfig.base.json ./

RUN pnpm --filter @ticketchain/shared build
RUN pnpm --filter @ticketchain/api build

# Self-contained prod tree with resolved deps (pnpm workspace-safe)
RUN pnpm --filter @ticketchain/api deploy --prod /app/deploy

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/deploy ./
COPY --from=builder /app/apps/api/migrations ./migrations
COPY apps/api/certs ./certs

ENV JWT_PRIVATE_KEY_PATH=./certs/private.pem
ENV JWT_PUBLIC_KEY_PATH=./certs/public.pem
EXPOSE 5000
CMD ["node", "dist/app.js"]
