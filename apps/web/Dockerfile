FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
COPY tsconfig.base.json ./

# Public env must be present at next build time
ARG NEXT_PUBLIC_API_URL=http://localhost:5000
ARG NEXT_PUBLIC_WEB3AUTH_CLIENT_ID=
ARG NEXT_PUBLIC_MST_CHAIN_ID=4545
ARG NEXT_PUBLIC_MST_RPC_URL=https://testnetrpc.mstblockchain.com
ARG NEXT_PUBLIC_MST_BLOCK_EXPLORER_URL=https://testnet.mstscan.com
ARG NEXT_PUBLIC_PINATA_GATEWAY=https://gateway.pinata.cloud
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
ARG NEXT_PUBLIC_ALLOW_DIRECT_MINT=false

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WEB3AUTH_CLIENT_ID=$NEXT_PUBLIC_WEB3AUTH_CLIENT_ID \
    NEXT_PUBLIC_MST_CHAIN_ID=$NEXT_PUBLIC_MST_CHAIN_ID \
    NEXT_PUBLIC_MST_RPC_URL=$NEXT_PUBLIC_MST_RPC_URL \
    NEXT_PUBLIC_MST_BLOCK_EXPLORER_URL=$NEXT_PUBLIC_MST_BLOCK_EXPLORER_URL \
    NEXT_PUBLIC_PINATA_GATEWAY=$NEXT_PUBLIC_PINATA_GATEWAY \
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY \
    NEXT_PUBLIC_ALLOW_DIRECT_MINT=$NEXT_PUBLIC_ALLOW_DIRECT_MINT

RUN pnpm --filter @ticketchain/shared build
RUN pnpm --filter @ticketchain/web build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9 --activate

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

WORKDIR /app/apps/web
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
