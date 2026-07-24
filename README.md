# TicketChain MST

Enterprise NFT ticketing platform on the MST Blockchain — multi-tenant SaaS monorepo.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker Desktop

## Quick start

```bash
# 1. Copy environment file
cp .env.example .env

# 2. Start Postgres + Redis (Docker)
pnpm docker:up

# 3. Install dependencies
pnpm install
pnpm --filter @ticketchain/shared build

# 4. Run migrations + seed
pnpm migrate
pnpm seed

# 5. Generate JWT keys (first time)
pnpm --filter @ticketchain/api generate:keys

# 6. Start services (separate terminals)
pnpm dev:api          # API on http://localhost:5000
pnpm dev:web          # Web on http://localhost:3000
pnpm --filter @ticketchain/api worker:dev   # BullMQ background worker
```

Health: http://localhost:5000/health

## Docker services

| Service  | Host port | Notes                          |
|----------|-----------|--------------------------------|
| Postgres | **25432** | Avoids conflict with local PG  |
| Redis    | **16379** | Avoids conflict with local Redis |

## Seed data (dev)

| Role            | Email                   | Password      |
|-----------------|-------------------------|---------------|
| Platform admin  | admin@ticketchain.com   | ChangeMe123!  |
| Org super admin | founder@demo-org.com    | Web3Auth      |

Organisation slug: `demo-events`

## Project structure

```
apps/api          Express API + migrations + BullMQ worker
apps/web          Next.js 14 App Router (consumer, admin, platform, scanner PWA)
packages/shared   Shared TypeScript types & constants
packages/contracts Hardhat — EventTickets1155, OrgRegistry, TicketMarketplace
deploy/k8s        Kubernetes manifests (API, web, worker)
docs/             AUTH.md — Web3Auth vs SARAL strategy
```

## Web application routes

| Area | Routes |
|------|--------|
| Consumer | `/`, `/events`, `/tickets`, `/marketplace`, `/profile` |
| Volunteer scanner (PWA) | `/checkin`, `/checkin/[eventId]` |
| Org admin | `/admin`, `/admin/events`, `/admin/members`, `/admin/finance` |
| Platform admin | `/platform`, `/platform/organisations`, `/platform/settlements`, `/platform/fraud`, `/platform/audit` |

## Smart contracts

```bash
pnpm contracts:compile          # Compile + copy ABIs to apps/api
pnpm contracts:test             # Hardhat tests
pnpm contracts:deploy:local     # Deploy to in-memory Hardhat network
pnpm contracts:deploy:testnet   # Deploy OrgRegistry to MST testnet
```

| Contract | Purpose |
|----------|---------|
| `EventTickets1155` | ERC-1155 + EIP-2981 NFT tickets (one per event) |
| `OrgRegistry` | Registers org wallets on-chain |
| `TicketMarketplace` | On-chain resale with price cap enforcement |

Set `MARKETPLACE_CONTRACT_ADDRESS` in `.env` after deploying the marketplace contract.

## Authentication

- **Consumers / org members:** Web3Auth (`POST /api/auth/verify`) — see [docs/AUTH.md](docs/AUTH.md)
- **Platform staff:** Email + password (`POST /api/auth/platform-login`)

## API highlights

```
POST /api/tickets/:id/transfer     Gift ticket to email or wallet
POST /api/tickets/:id/resell       List on resale marketplace
GET  /api/marketplace              Browse active listings
POST /api/marketplace/:id/buy      Purchase resale listing
GET  /api/platform/kpis            Platform dashboard metrics
GET  /api/platform/settlements     Settlement batches
GET  /api/platform/fraud           Fraud alerts
GET  /api/platform/audit           Audit log feed
GET  /api/admin/finance/earnings   Org earnings summary
GET  /api/profile/rewards          Loyalty rewards
GET  /api/profile/referral         Referral stats
GET  /api/profile/wallet           Custodial wallet + tMSTC balance
POST /api/tickets/checkout         ChainPay checkout (production path)
POST /api/tickets/mint             Direct on-chain mint (dev; requires ALLOW_DIRECT_MINT)
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm docker:up` | Start Postgres + Redis |
| `pnpm migrate` | Run DB migrations |
| `pnpm seed` | Insert dev seed data |
| `pnpm dev:api` | Start API on port 5000 |
| `pnpm dev:web` | Start Next.js on port 3000 |
| `pnpm typecheck` | Type-check all packages |
| `pnpm contracts:test` | Run Solidity tests |

## Production deployment

```bash
# Build container images
docker build -f apps/api/Dockerfile -t ticketchain/api:latest .
docker build -f apps/web/Dockerfile -t ticketchain/web:latest .

# Apply Kubernetes manifests
kubectl apply -f deploy/k8s/
```

## Documentation

- [TICKETCHAIN_MASTER_SPEC.md](TICKETCHAIN_MASTER_SPEC.md) — full architecture specification
- [docs/AUTH.md](docs/AUTH.md) — authentication strategy
- [docs/DIRECT_MINT_AND_WALLET.md](docs/DIRECT_MINT_AND_WALLET.md) — direct mint, tMSTC, wallet balance setup

Blockchain SDK: [@mstblockchain/mst-sdk](https://www.npmjs.com/package/@mstblockchain/mst-sdk)
