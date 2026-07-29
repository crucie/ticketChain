# TicketChain MST

Enterprise NFT ticketing platform on the MST Blockchain — multi-tenant SaaS monorepo.

Live site: **https://mstticket.clawxlab.xyz**

## Prerequisites

- Node.js **20+**
- pnpm **9+**
- Docker Desktop (running)

## Run locally (quick start)

### 1. One-time setup

```bash
cp .env.example .env
# Fill at least: WEB3AUTH_CLIENT_ID, NEXT_PUBLIC_WEB3AUTH_CLIENT_ID,
# MST_DEPLOYER_PRIVATE_KEY, and (optional) NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

pnpm docker:up
pnpm install
pnpm --filter @ticketchain/shared build
pnpm --filter @ticketchain/api generate:keys
pnpm migrate
pnpm seed
```

Docker ports used by `.env`:

| Service  | Host port | Notes |
|----------|-----------|--------|
| Postgres | **25432** | Avoids conflict with local Postgres |
| Redis    | **16379** | Avoids conflict with local Redis |

### 2. Start the app (3 terminals)

```bash
pnpm dev:api
```

```bash
pnpm dev:web
```

```bash
pnpm --filter @ticketchain/api worker:dev
```

### 3. Open these URLs

| What | URL |
|------|-----|
| Web app | http://localhost:3000 |
| API health | http://localhost:5000/health |
| Platform admin | http://localhost:3000/login → Platform Administrator Portal |

### 4. Seed logins

| Role | How to sign in |
|------|----------------|
| Platform admin | `admin@ticketchain.com` / `ChangeMe123!` |
| Org / consumer | Web3Auth email/SMS on `/login` |

Demo org slug: `demo-events`

### 5. After first consumer sign-in

1. Open http://localhost:3000/profile
2. Connect **MetaMask** or **Phantom** (required)
3. Use tickets, mint, check-in, etc.

### Local Web3Auth note

In the Web3Auth dashboard, allowlist:

```text
http://localhost:3000
```

`WEB3AUTH_CLIENT_ID` and `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID` must be the same Client ID (Sapphire Devnet).

### Stop local deps

```bash
pnpm docker:down
```

More detail: [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md) · [docs/WEB3AUTH.md](docs/WEB3AUTH.md)

## Project structure

```
apps/api          Express API + migrations + BullMQ worker
apps/web          Next.js 14 App Router (consumer, admin, platform, scanner PWA)
packages/shared   Shared TypeScript types & constants
packages/contracts Hardhat — EventTickets1155, OrgRegistry, TicketMarketplace
deploy/k8s        Kubernetes manifests (API, web, worker)
docs/             AUTH, DEPLOYMENT, WEB3AUTH, LOCAL_DEV, …
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

Set `MARKETPLACE_CONTRACT_ADDRESS` in `.env` after deploying the marketplace contract. See [packages/contracts/MARKETPLACE.md](packages/contracts/MARKETPLACE.md).

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
| `pnpm docker:down` | Stop Postgres + Redis |
| `pnpm migrate` | Run DB migrations |
| `pnpm seed` | Insert dev seed data |
| `pnpm dev:api` | Start API on port 5000 |
| `pnpm dev:web` | Start Next.js on port 3000 |
| `pnpm typecheck` | Type-check all packages |
| `pnpm contracts:test` | Run Solidity tests |

## Production deployment

Live HTTPS: **https://mstticket.clawxlab.xyz**

See the full guide: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** (AWS, secrets, images, K8s/ECS, migrations, checklist).
Auth / Web3Auth allowlist: **[docs/AUTH.md](docs/AUTH.md)** · **[docs/WEB3AUTH.md](docs/WEB3AUTH.md)**.

```bash
# Build container images
docker build -f apps/api/Dockerfile -t ticketchain/api:latest .
docker build -f apps/web/Dockerfile -t ticketchain/web:latest .
```

## Documentation

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — local + AWS deployment guide
- [docs/CUSTOM_DOMAIN.md](docs/CUSTOM_DOMAIN.md) — ACM / ALB HTTPS for mstticket.clawxlab.xyz
- [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md) — local run checklist
- [docs/AUTH.md](docs/AUTH.md) — authentication strategy
- [docs/WEB3AUTH.md](docs/WEB3AUTH.md) — Web3Auth allowlist and MST network checklist
- [docs/DIRECT_MINT_AND_WALLET.md](docs/DIRECT_MINT_AND_WALLET.md) — direct mint, tMSTC, wallet balance setup
- [TICKETCHAIN_MASTER_SPEC.md](TICKETCHAIN_MASTER_SPEC.md) — full architecture specification

Blockchain SDK: [@mstblockchain/mst-sdk](https://www.npmjs.com/package/@mstblockchain/mst-sdk)
