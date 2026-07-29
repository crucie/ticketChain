# TicketChain MST — Deployment Guide

Practical guide for running TicketChain locally and deploying it to AWS. This document reflects **what the monorepo actually ships today** (`apps/api`, `apps/web`, BullMQ worker, `deploy/k8s/*`, Dockerfiles). Parts of `TICKETCHAIN_MASTER_SPEC.md` §32 describe a fuller target architecture; gaps are called out below.

---

## Table of contents

1. [Architecture overview](#1-architecture-overview)
2. [What you must provision](#2-what-you-must-provision)
3. [Environment variables](#3-environment-variables)
4. [Local development](#4-local-development)
5. [AWS infrastructure](#5-aws-infrastructure)
6. [Secrets and JWT keys](#6-secrets-and-jwt-keys)
7. [Smart contracts](#7-smart-contracts)
8. [Build container images](#8-build-container-images)
9. [Kubernetes deployment (EKS)](#9-kubernetes-deployment-eks)
10. [ECS Fargate alternative](#10-ecs-fargate-alternative)
11. [Database migrations](#11-database-migrations)
12. [Domains, TLS, cookies, CORS](#12-domains-tls-cookies-cors)
13. [External integrations](#13-external-integrations)
14. [Rollout procedure](#14-rollout-procedure)
15. [Pre-deploy checklist](#15-pre-deploy-checklist)
16. [Smoke tests](#16-smoke-tests)
17. [Operations and troubleshooting](#17-operations-and-troubleshooting)
18. [Known gaps vs the master spec](#18-known-gaps-vs-the-master-spec)

---

## 1. Architecture overview

TicketChain is a **pnpm monorepo** with three long-running processes and two managed datastores:

| Process | Image / entrypoint | Port | Role |
|---------|--------------------|------|------|
| **API** | `apps/api` → `node dist/app.js` | `5000` | REST API, auth cookies, mint/check-in, webhooks |
| **Worker** | Same API image → `node dist/worker.js` | — | BullMQ jobs (orphan mint reconcile, on-chain check-in retries) |
| **Web** | `apps/web` Next.js standalone → `node server.js` | `3000` | Consumer, org admin, platform, volunteer scanner PWA |

| Datastore | Local | Production |
|-----------|-------|------------|
| PostgreSQL 15 | Docker host port **25432** | AWS RDS |
| Redis 7 | Docker host port **16379** | AWS ElastiCache |

Hardhat contracts (`packages/contracts`) are **not** hosted. Deploy them once to MST testnet/mainnet and put addresses in env.

```
Internet
   │
CDN / WAF (optional: Cloudflare)
   │
AWS ALB + ACM (TLS)
   │
EKS or ECS
   ├── ticketchain-web   (:3000)
   ├── ticketchain-api   (:5000)  ──► RDS PostgreSQL
   └── ticketchain-worker         ──► ElastiCache Redis
                                         │
                    MST RPC · Web3Auth · Pinata · ChainPay · Google Maps
```

**Health:** `GET /health` on the API requires **both** Postgres and Redis to be reachable.

---

## 2. What you must provision

### Always required

| Item | Purpose |
|------|---------|
| Node.js 20+, pnpm 9+ | Build and local run |
| Docker | Local Postgres/Redis; image builds |
| Postgres 15 | Primary application data |
| Redis 7 | QR nonces, inventory counters, BullMQ |
| JWT RS256 keypair | Auth cookies (`apps/api/certs/*.pem` locally) |
| Web3Auth project | Consumer / org login |
| MST RPC URL + chain ID | Chain reads/writes |
| Deployer private key + gas | Mint, check-in txs, event contract deploy |
| `ORG_REGISTRY_ADDRESS` | Org on-chain registration |

### Required for full product features

| Item | Needed for |
|------|------------|
| `MARKETPLACE_CONTRACT_ADDRESS` | Resale list/buy |
| Pinata API key + secret | Image / NFT metadata uploads |
| ChainPay API key (+ webhook secret) | Crypto checkout |
| Google Maps JS + Places API key | Create-event location picker |
| Public HTTPS API URL | ChainPay webhooks, production cookies |

### Optional / not wired in app code today

| Item | Status |
|------|--------|
| AWS S3 | Listed in `.env.example`; uploads go **base64 → Pinata** today |
| SendGrid | Spec / env only — no email client in code |
| SARAL SSO | Legacy / reserved — see `docs/AUTH.md` |
| In-app MST faucet | Optional; separate from deployer wallet |

---

## 3. Environment variables

Source of truth for **API validation**: `apps/api/src/config/env.ts`.  
Template: `.env.example`.  
Web loads the **root** `.env` via `node --env-file=../../.env` (see `apps/web/package.json`).

### 3.1 API / worker (runtime)

| Variable | Required | Notes |
|----------|----------|--------|
| `NODE_ENV` | Yes | `production` in AWS |
| `PORT` | No | Default `5000` |
| `DATABASE_URL` | Yes | RDS connection string |
| `DATABASE_POOL_SIZE` | No | Default `10`; use ~`20` in prod |
| `REDIS_URL` | Yes | ElastiCache URL (include AUTH password in prod) |
| `FRONTEND_URL` | Yes | Exact web origin (CORS allowlist) |
| `API_BASE_URL` | Yes | Public API base URL |
| `JWT_PRIVATE_KEY_PATH` | Yes | Path inside container to PEM |
| `JWT_PUBLIC_KEY_PATH` | Yes | Path inside container to PEM |
| `JWT_ACCESS_EXPIRY` / `JWT_REFRESH_EXPIRY` | No | Defaults `15m` / `7d` |
| `COOKIE_DOMAIN` | Yes | Parent domain, e.g. `.ticketchain.com` |
| `COOKIE_SECURE` | Yes | Must be `true` behind HTTPS |
| `WEB3AUTH_CLIENT_ID` | Yes | Must match Web3Auth dashboard |
| `WEB3AUTH_JWKS_URL` / `WEB3AUTH_ISSUER` | No | Defaults to Web3Auth cloud JWKS |
| `MST_RPC_URL` | Yes | Prefer dedicated / failover RPC in prod |
| `MST_CHAIN_ID` | Yes | Must match MST Testnet (`91562037`) |
| `MST_BLOCK_EXPLORER_URL` | No | Used for explorer links |
| `MST_DEPLOYER_PRIVATE_KEY` | Strongly yes | Without it, on-chain mint/check-in/transfer fail |
| `ORG_REGISTRY_ADDRESS` | Yes for orgs | `0x` + 40 hex |
| `MARKETPLACE_CONTRACT_ADDRESS` | For marketplace | Optional at boot; required for resale |
| `PINATA_API_KEY` / `PINATA_SECRET_KEY` | For uploads | |
| `PINATA_GATEWAY` | No | Default Pinata gateway |
| `CHAINPAY_API_KEY` / `CHAINPAY_API_URL` | For checkout | |
| `PAYMENTS_WEBHOOK_SECRET` | For webhooks | HMAC verification |
| `ALLOW_DIRECT_MINT` | Dev flag | Set `false` in real production unless intentional |

### 3.2 Web (`NEXT_PUBLIC_*` — baked at **image build** time)

Next.js inlines `NEXT_PUBLIC_*` during `next build`. Passing them only at container runtime **does not** update client bundles. Rebuild the web image when these change.

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | Browser → API base URL |
| `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID` | Client login |
| `NEXT_PUBLIC_MST_CHAIN_ID` | Wallet / chain checks |
| `NEXT_PUBLIC_MST_RPC_URL` | Client RPC (if used) |
| `NEXT_PUBLIC_MST_BLOCK_EXPLORER_URL` | Explorer links in UI |
| `NEXT_PUBLIC_PINATA_GATEWAY` | Display IPFS media |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Admin location picker |
| `NEXT_PUBLIC_ALLOW_DIRECT_MINT` | Show on-chain mint UI |

### 3.3 Production cookie / CORS rules

- `FRONTEND_URL` must equal the browser origin (scheme + host + port if any).
- `COOKIE_DOMAIN` should be the shared parent (e.g. `.example.com`) if web is `app.example.com` and API is `api.example.com`.
- `COOKIE_SECURE=true` whenever TLS is enabled.
- Do not leave `ALLOW_DIRECT_MINT=true` on public mainnet unless product requires it.

---

## 4. Local development

### Prerequisites

- Node.js **20+**
- pnpm **9+**
- Docker Desktop

### One-time / whenever Docker is down

```bash
cd /path/to/ticketChain

cp .env.example .env   # if you do not already have .env
# Edit .env — fill Web3Auth, deployer key, Pinata, etc.

pnpm docker:up
pnpm install
pnpm --filter @ticketchain/shared build

pnpm --filter @ticketchain/api generate:keys   # first time only
pnpm migrate
pnpm seed
```

Local Docker ports (see `docker-compose.yml`):

| Service | Host port |
|---------|-----------|
| Postgres | **25432** |
| Redis | **16379** |

`DATABASE_URL` / `REDIS_URL` in `.env` must use those host ports.

### Run (3–4 terminals)

```bash
pnpm dev:api                                          # http://localhost:5000
pnpm dev:web                                          # http://localhost:3000
pnpm --filter @ticketchain/api worker:dev             # BullMQ worker
```

### Seed accounts (local only)

| Role | Credentials |
|------|-------------|
| Platform admin | Created by `pnpm seed` into `platform_admins` — see `apps/api/src/scripts/seed.ts` (dev password only; never reuse in prod) |
| Org super admin | `founder@demo-org.com` via Web3Auth |
| Org slug | `demo-events` |

Production: create platform admins with a strong password against RDS; do **not** run `pnpm seed` on the live database.

Health: http://localhost:5000/health

More auth detail: [`docs/AUTH.md`](./AUTH.md).  
Direct mint / wallet: [`docs/DIRECT_MINT_AND_WALLET.md`](./DIRECT_MINT_AND_WALLET.md).

---

## 5. AWS infrastructure

**Region (recommended):** `ap-south-1` (Mumbai), matching the product spec for India latency.

### Minimal production footprint

| AWS service | Maps to |
|-------------|---------|
| **ECR** | Store `ticketchain/api` and `ticketchain/web` images |
| **EKS** (or **ECS Fargate**) | Run api, worker, web |
| **Application Load Balancer + ACM** | HTTPS termination |
| **RDS PostgreSQL 15** | `DATABASE_URL` (Multi-AZ for prod) |
| **ElastiCache Redis 7** | `REDIS_URL` (AUTH enabled) |
| **Secrets Manager** or **SSM Parameter Store** | Private keys, API keys, DB password |
| **CloudWatch Logs** | Container stdout/stderr |
| **Route 53** (optional) | DNS for app + API hosts |

### Recommended sizing (starting point)

| Component | Start with |
|-----------|------------|
| API | 2 replicas |
| Web | 2 replicas |
| Worker | 1–2 replicas |
| RDS | `db.t3.medium` or larger; storage autoscaling; daily backups + PITR |
| Redis | `cache.t3.small` or larger; not a single unauthenticated node in prod |

### Networking

- Place RDS and ElastiCache in **private subnets**.
- Place EKS/ECS tasks in private subnets with NAT for egress (MST RPC, Pinata, Web3Auth, ChainPay).
- ALB in public subnets.
- Security groups: ALB → web:3000 / api:5000; api+worker → RDS:5432 and Redis:6379; no public RDS/Redis.

---

## 6. Secrets and JWT keys

**Never** bake secrets into Docker images or commit `.env` to git.

### Generate JWT keys (once per environment)

```bash
pnpm --filter @ticketchain/api generate:keys
# Produces apps/api/certs/private.pem and public.pem
```

In Kubernetes, mount PEMs as a secret volume and set:

```bash
JWT_PRIVATE_KEY_PATH=/run/secrets/jwt_private.pem
JWT_PUBLIC_KEY_PATH=/run/secrets/jwt_public.pem
```

### Secrets Manager inventory

Store at least:

- `DATABASE_URL` (or discrete username/password)
- `REDIS_URL`
- `MST_DEPLOYER_PRIVATE_KEY`
- JWT PEM contents
- `WEB3AUTH_CLIENT_ID` (and JWKS overrides if any)
- `PINATA_API_KEY`, `PINATA_SECRET_KEY`
- `CHAINPAY_API_KEY`, `PAYMENTS_WEBHOOK_SECRET`
- Optional: `MST_FAUCET_PRIVATE_KEY`, SendGrid, AWS keys

K8s manifests expect a secret named **`ticketchain-secrets`** (`envFrom.secretRef`). That Secret object is **not** checked into the repo — create it in-cluster.

Example (do not commit real values):

```bash
kubectl create namespace ticketchain --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic ticketchain-secrets \
  --namespace ticketchain \
  --from-literal=DATABASE_URL='postgresql://...' \
  --from-literal=REDIS_URL='redis://:password@...' \
  --from-literal=NODE_ENV=production \
  --from-literal=PORT=5000 \
  --from-literal=FRONTEND_URL='https://app.example.com' \
  --from-literal=API_BASE_URL='https://api.example.com' \
  --from-literal=COOKIE_DOMAIN='.example.com' \
  --from-literal=COOKIE_SECURE='true' \
  --from-literal=WEB3AUTH_CLIENT_ID='...' \
  --from-literal=MST_RPC_URL='https://...' \
  --from-literal=MST_CHAIN_ID='...' \
  --from-literal=MST_DEPLOYER_PRIVATE_KEY='...' \
  --from-literal=ORG_REGISTRY_ADDRESS='0x...' \
  --from-literal=MARKETPLACE_CONTRACT_ADDRESS='0x...' \
  --from-literal=PINATA_API_KEY='...' \
  --from-literal=PINATA_SECRET_KEY='...' \
  --from-literal=CHAINPAY_API_KEY='...' \
  --from-literal=PAYMENTS_WEBHOOK_SECRET='...' \
  --from-literal=ALLOW_DIRECT_MINT='false' \
  --from-literal=JWT_PRIVATE_KEY_PATH='/run/secrets/jwt_private.pem' \
  --from-literal=JWT_PUBLIC_KEY_PATH='/run/secrets/jwt_public.pem'
```

Also create a TLS/key volume or separate secret for the PEM files themselves.

ConfigMap referenced by web (`ticketchain-config` / `API_URL`) should hold non-secret URLs. Remember: client-facing `NEXT_PUBLIC_*` values must still be present at **web image build**.

---

## 7. Smart contracts

```bash
pnpm contracts:compile
pnpm contracts:test
pnpm contracts:deploy:testnet    # or your mainnet deploy script
```

| Contract | Purpose | Env after deploy |
|----------|---------|------------------|
| `OrgRegistry` | Org wallet registry | `ORG_REGISTRY_ADDRESS` |
| `TicketMarketplace` | On-chain resale | `MARKETPLACE_CONTRACT_ADDRESS` |
| `EventTickets1155` | Per-event ticket NFT | Deployed by API/deployer per event — not a single global address |

**Before go-live:**

1. Deploy + verify contracts on the target MST network.
2. Fund the deployer wallet with enough native gas token.
3. Confirm `MST_CHAIN_ID` / RPC match that network.
4. Set registry + marketplace addresses in Secrets Manager.
5. Prefer a dedicated deployer wallet (not a personal MetaMask seed).

---

## 8. Build container images

Dockerfiles (repo root as build context):

```bash
# API (+ worker uses the same image)
docker build -f apps/api/Dockerfile -t ticketchain/api:GIT_SHA .

# Web — pass NEXT_PUBLIC_* as build-args if you extend the Dockerfile;
# today the web Dockerfile runs `pnpm --filter @ticketchain/web build`
# using env available in the build environment. Set them in CI before build.
docker build -f apps/web/Dockerfile -t ticketchain/web:GIT_SHA .
```

### Push to ECR

```bash
aws ecr get-login-password --region ap-south-1 \
  | docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.ap-south-1.amazonaws.com

docker tag ticketchain/api:GIT_SHA ACCOUNT_ID.dkr.ecr.ap-south-1.amazonaws.com/ticketchain/api:GIT_SHA
docker tag ticketchain/web:GIT_SHA ACCOUNT_ID.dkr.ecr.ap-south-1.amazonaws.com/ticketchain/web:GIT_SHA

docker push ACCOUNT_ID.dkr.ecr.ap-south-1.amazonaws.com/ticketchain/api:GIT_SHA
docker push ACCOUNT_ID.dkr.ecr.ap-south-1.amazonaws.com/ticketchain/web:GIT_SHA
```

### Important web build note

Extend CI or the web Dockerfile so production `NEXT_PUBLIC_API_URL`, Web3Auth client ID, chain ID, explorer URL, Pinata gateway, and Maps key are set **during** `next build`. The runtime ConfigMap key `API_URL` alone is not enough for already-bundled client code.

---

## 9. Kubernetes deployment (EKS)

Manifests live under `deploy/k8s/`:

| File | Workload |
|------|----------|
| `api-deployment.yaml` | API Deployment (2 replicas) + Service `:5000`, probes on `/health` |
| `web-deployment.yaml` | Web Deployment (2 replicas) + Service `:80` → `:3000` |
| `worker-deployment.yaml` | Worker Deployment (1 replica), command `node dist/worker.js` |

### Apply

1. Create namespace, secrets, ConfigMap, JWT volume mounts (customize manifests as needed).
2. Replace `image: ticketchain/api:latest` / `ticketchain/web:latest` with your ECR URLs + digest or tag.
3. Ensure API and worker pods mount JWT PEMs at the paths in env.
4. Apply:

```bash
kubectl apply -f deploy/k8s/api-deployment.yaml
kubectl apply -f deploy/k8s/worker-deployment.yaml
kubectl apply -f deploy/k8s/web-deployment.yaml
```

5. Attach an Ingress / ALB Ingress Controller (or Gateway API) routing:

   - `api.example.com` → Service `ticketchain-api:5000`
   - `app.example.com` → Service `ticketchain-web:80`

Ingress YAML is **not** in-repo yet — add it for your cluster (ALB annotations, cert-manager, etc.).

### Rolling update

```bash
kubectl set image deployment/ticketchain-api api=ECR/ticketchain/api:GIT_SHA
kubectl set image deployment/ticketchain-worker worker=ECR/ticketchain/api:GIT_SHA
kubectl set image deployment/ticketchain-web web=ECR/ticketchain/web:GIT_SHA

kubectl rollout status deployment/ticketchain-api
kubectl rollout status deployment/ticketchain-worker
kubectl rollout status deployment/ticketchain-web
```

---

## 10. ECS Fargate alternative

If you prefer not to operate Kubernetes:

| ECS service | Task command | Port |
|-------------|--------------|------|
| `ticketchain-api` | `node dist/app.js` (API image default) | 5000 |
| `ticketchain-worker` | `node dist/worker.js` (same image) | — |
| `ticketchain-web` | `node server.js` (web image default) | 3000 |

Same ALB, RDS, ElastiCache, and Secrets Manager layout. Use one target group per service; worker needs no listener.

Task definition JSON templates (env filled at deploy time): `deploy/aws/task-*.json`. Secrets files `app-secret.json` / `ecs-env.json` are gitignored.

### Live stack (`ap-south-1`, account `123209654070`)

Separate from `clawx-*`. Provisioned July 2026.

| Resource | Name / value |
|----------|----------------|
| **Public URL** | https://mstticket.clawxlab.xyz |
| **Health** | https://mstticket.clawxlab.xyz/health |
| ALB | `ticketchain-prod` (HTTPS :443 with ACM; HTTP :80 → 301 HTTPS; `/` → web, `/api/*` + `/health` → api) |
| ACM cert | `mstticket.clawxlab.xyz` (`arn:aws:acm:ap-south-1:123209654070:certificate/05efab72-08a8-4038-bfa8-6dd7db0ae176`) |
| ALB DNS (CNAME target) | `ticketchain-prod-591279368.ap-south-1.elb.amazonaws.com` |
| ECS cluster | `ticketchain-prod` |
| ECS services | `ticketchain-api`, `ticketchain-web`, `ticketchain-worker` |
| ECR | `ticketchain/api`, `ticketchain/web` |
| RDS | `ticketchain-prod` (Postgres 15, private) — use `?sslmode=no-verify` in `DATABASE_URL` |
| ElastiCache | `ticketchain-prod` (Redis 7) |
| Secrets Manager | `ticketchain/prod/app` |
| Log groups | `/ecs/ticketchain/api`, `/ecs/ticketchain/web`, `/ecs/ticketchain/worker` |
| Migrate | one-off task family `ticketchain-migrate` |

**Notes**

- Path-based routing: browser `NEXT_PUBLIC_API_URL` is the public HTTPS origin (no `:5000`). Rebuild the web image whenever that URL or any `NEXT_PUBLIC_*` value changes.
- HTTPS is live (`COOKIE_SECURE=true`, `COOKIE_DOMAIN=.clawxlab.xyz`). HTTP requests to the ALB redirect to HTTPS.
- On-chain marketplace address is set in Secrets Manager after `deploy:marketplace:testnet` (see `packages/contracts/deployments/mstTestnet-marketplace.json`). Without it, resale falls back to custodial DB transfers.
- JWT PEMs are baked into the API image for this bootstrap; prefer Secrets Manager mounts for long-term ops.
- RDS connections from ECS must use `?sslmode=no-verify` (or mount the RDS CA) because the managed Postgres certificate chain is not trusted by Node by default.
- Web3Auth allowlist must include `https://mstticket.clawxlab.xyz` for the Sapphire Devnet Client ID baked into the web image. See [`docs/AUTH.md`](./AUTH.md).

### Rebuild / roll images

```bash
# API
docker build -f apps/api/Dockerfile -t 123209654070.dkr.ecr.ap-south-1.amazonaws.com/ticketchain/api:latest .
docker push 123209654070.dkr.ecr.ap-south-1.amazonaws.com/ticketchain/api:latest
aws ecs update-service --cluster ticketchain-prod --service ticketchain-api --force-new-deployment
aws ecs update-service --cluster ticketchain-prod --service ticketchain-worker --force-new-deployment

# Web (bake NEXT_PUBLIC_* at build)
docker build -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://mstticket.clawxlab.xyz \
  --build-arg NEXT_PUBLIC_WEB3AUTH_CLIENT_ID=... \
  --build-arg NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=... \
  -t 123209654070.dkr.ecr.ap-south-1.amazonaws.com/ticketchain/web:latest .
docker push 123209654070.dkr.ecr.ap-south-1.amazonaws.com/ticketchain/web:latest
aws ecs update-service --cluster ticketchain-prod --service ticketchain-web --force-new-deployment
```

### Attach ACM HTTPS (if recreating the listener)

```bash
CERT_ARN=arn:aws:acm:ap-south-1:123209654070:certificate/05efab72-08a8-4038-bfa8-6dd7db0ae176
ALB_ARN=arn:aws:elasticloadbalancing:ap-south-1:123209654070:loadbalancer/app/ticketchain-prod/25d6c4ca11805a38
WEB_TG=arn:aws:elasticloadbalancing:ap-south-1:123209654070:targetgroup/ticketchain-web/3ca43cb779fc39ca
API_TG=arn:aws:elasticloadbalancing:ap-south-1:123209654070:targetgroup/ticketchain-api/c27227cba5692ba1

# Create HTTPS :443 with cert, path rules for /api/* and /health, then
# set HTTP :80 default action to redirect HTTPS 301.
```

DNS CNAME: `mstticket` → `ticketchain-prod-591279368.ap-south-1.elb.amazonaws.com`.

---

## 11. Database migrations

Migrations: `apps/api/migrations/*.cjs` via `node-pg-migrate`.

```bash
# Local
pnpm migrate

# Against RDS from a bastion / CI job with DATABASE_URL set
pnpm --filter @ticketchain/api migrate

# From a running API pod (ensure migrate deps + migrations are in the image —
# the API Dockerfile copies migrations into the image)
kubectl exec -it deploy/ticketchain-api -- \
  node ./node_modules/node-pg-migrate/bin/node-pg-migrate.js up \
  --database-url-var DATABASE_URL -m migrations --migrations-table pgmigrations
```

**Rules:**

- Prefer **backward-compatible** migrations for zero-downtime rolling deploys.
- Run migrations **before** or at the start of a release that depends on new columns.
- Do **not** run `pnpm seed` against production.
- Take an RDS snapshot before the first production migrate.

---

## 12. Domains, TLS, cookies, CORS

| Concern | Production setting |
|---------|-------------------|
| TLS | ACM certificate on ALB (or Cloudflare proxy) |
| Web origin | `FRONTEND_URL=https://app.example.com` |
| API origin | `API_BASE_URL=https://api.example.com` |
| Cookies | `COOKIE_DOMAIN=.example.com`, `COOKIE_SECURE=true` |
| CORS | Driven by `FRONTEND_URL` in the API |

Platform login and Web3Auth session cookies will fail if:

- API is HTTP while `COOKIE_SECURE=true`, or
- Web and API are on unrelated domains without a shared `COOKIE_DOMAIN`, or
- `FRONTEND_URL` does not exactly match the browser origin.

---

## 13. External integrations

| Integration | Configure | Callback / note |
|-------------|-----------|-----------------|
| **Web3Auth** | Client ID for web + API | Authorized origins = production web URL |
| **Pinata** | API key/secret | Permanent NFT/media storage |
| **ChainPay** | API key + webhook secret | Webhook → `https://api…/api/webhooks/…` (see payments routes) |
| **Google Maps** | Browser key | Restrict by HTTP referrer to web domain; enable Maps JavaScript + Places |
| **MST explorer** | Public URL | UI “view tx” links |

After deploy, update each vendor dashboard with the **production** origins and webhook URLs (not localhost).

---

## 14. Rollout procedure

Suggested release flow:

1. **CI** — `.github/workflows/ci.yml` runs typecheck, migrate (ephemeral DB), Hardhat tests, API smoke. *(CI does not yet build/push ECR images or deploy.)*
2. **Build & push** API + web images tagged with git SHA.
3. **Migrate** RDS (backward-compatible).
4. **Deploy worker**, then **API**, then **web** (or simultaneous rolling updates).
5. **Smoke test** (section 16).
6. **Watch** 30+ minutes: API error rate, BullMQ failures, RDS CPU, Redis memory, deployer wallet balance.

Rollback:

```bash
kubectl rollout undo deployment/ticketchain-api
kubectl rollout undo deployment/ticketchain-worker
kubectl rollout undo deployment/ticketchain-web
```

Schema rollbacks require a deliberate `migrate:down` (dangerous on prod — prefer forward fixes).

---

## 15. Pre-deploy checklist

### Security

- [ ] Fresh JWT RS256 keypair for this environment
- [ ] All secrets in Secrets Manager / K8s Secret — not in git
- [ ] `COOKIE_SECURE=true` behind HTTPS; `COOKIE_DOMAIN=.clawxlab.xyz` for the live host
- [ ] Web3Auth allowlist includes `https://mstticket.clawxlab.xyz`
- [ ] CORS / `FRONTEND_URL` locked to production web origin
- [ ] `ALLOW_DIRECT_MINT=false` (unless intentionally enabled)
- [ ] ChainPay webhook HMAC secret set and verified
- [ ] Deployer key has least privilege (dedicated wallet)
- [ ] Redis requires AUTH; not open to the internet

### Data

- [ ] RDS Multi-AZ (prod) + automated backups / PITR
- [ ] Migrations applied; seed **not** run
- [ ] Connection pool sized for replica count

### Chain

- [ ] OrgRegistry + Marketplace deployed and addresses set
- [ ] Deployer funded for gas
- [ ] RPC URL stable; optional failover documented
- [ ] Chain ID matches web `NEXT_PUBLIC_MST_CHAIN_ID`

### Compute

- [ ] API, **worker**, and web all running
- [ ] Readiness/liveness on API `/health`
- [ ] ALB health checks passing
- [ ] CloudWatch log groups created
- [ ] Image tags immutable (`GIT_SHA`), not only `latest`

### Product / vendors

- [ ] Web3Auth production client + origins
- [ ] Pinata keys
- [ ] Google Maps key restricted to prod referrers
- [ ] ChainPay webhook points at prod API

---

## 16. Smoke tests

```bash
# API health (Postgres + Redis)
curl -sS https://api.example.com/health

# Public events (adjust path if needed)
curl -sS 'https://api.example.com/api/events?limit=1'

# Web
curl -sSI https://app.example.com | head
```

Manual UI checks:

1. Platform login with a real platform admin user (created securely — not the public seed password).
2. Web3Auth login as org/consumer.
3. Create or open an event; confirm Pinata upload if branding images are used.
4. Direct mint or ChainPay checkout path you intend to support.
5. Ticket QR drawer shows backup code; volunteer scanner opens.
6. After a check-in, confirm worker processes chain confirm jobs if contract check-in is enabled.
7. Gift/transfer returns a tx hash when a contract exists.

---

## 17. Operations and troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `/health` fails | RDS or Redis unreachable / wrong URL / SG |
| API boots then dies on auth | Missing JWT PEMs at configured paths |
| Browser login works but API 401 | Cookie domain / secure / SameSite / CORS mismatch |
| Mint / check-in no chain tx | Missing `MST_DEPLOYER_PRIVATE_KEY`, empty balance, or worker down |
| Resale errors | `MARKETPLACE_CONTRACT_ADDRESS` unset |
| Uploads fail | Pinata keys missing/invalid |
| Maps blank on create event | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` missing at **web build** |
| Client still calls localhost API | Web image built without prod `NEXT_PUBLIC_API_URL` |
| Jobs pile up | Worker deployment scaled to 0 or Redis AUTH mismatch |
| Webhook 401/ignored | `PAYMENTS_WEBHOOK_SECRET` mismatch |

### Useful commands

```bash
kubectl get pods -l 'app in (ticketchain-api,ticketchain-web,ticketchain-worker)'
kubectl logs deploy/ticketchain-api --tail=200
kubectl logs deploy/ticketchain-worker --tail=200

# Local Docker
pnpm docker:up
pnpm docker:down
docker compose ps
```

### Worker jobs (BullMQ)

Queue name: `ticketchain-maintenance` (see `apps/api/src/shared/queue/queue.service.ts`).

| Job | Purpose |
|-----|---------|
| `orphan-reconcile` | Stuck mint idempotency vs chain/Redis |
| `checkin-chain-confirm` | Retry on-chain check-in transactions |

Without the worker, DB check-in can still succeed while **chain confirmation** lags or stalls.

---

## 18. Known gaps vs the master spec

These are intentional honesty notes so ops planning stays accurate:

| Spec / aspirational | Current repo |
|---------------------|--------------|
| CI builds & pushes ECR, deploys K8s | CI tests only (`.github/workflows/ci.yml`) |
| `Dockerfile.prod` names | Use `apps/api/Dockerfile` and `apps/web/Dockerfile` |
| In-repo Ingress / ALB manifests | Deployments + Services only |
| `ticketchain-secrets` / `ticketchain-config` YAML | Referenced, not defined in git |
| AWS S3 temp upload staging | Env placeholders; uploads → Pinata |
| SendGrid email | Not implemented in application code |
| Socket.IO sticky sessions | Not present in current codebase |
| Terraform / CDK | Not in repo — provision AWS manually or add IaC later |

When those land, update this guide and keep `TICKETCHAIN_MASTER_SPEC.md` §32 in sync.

---

## Quick reference commands

```bash
# Local
pnpm docker:up && pnpm install && pnpm --filter @ticketchain/shared build
pnpm migrate && pnpm seed
pnpm dev:api
pnpm dev:web
pnpm --filter @ticketchain/api worker:dev

# Images
docker build -f apps/api/Dockerfile -t ticketchain/api:local .
docker build -f apps/web/Dockerfile -t ticketchain/web:local .

# K8s
kubectl apply -f deploy/k8s/
kubectl rollout status deployment/ticketchain-api
```

---

## Related docs

- [`README.md`](../README.md) — quick start
- [`docs/AUTH.md`](./AUTH.md) — Web3Auth vs platform login
- [`docs/DIRECT_MINT_AND_WALLET.md`](./DIRECT_MINT_AND_WALLET.md) — mint and wallet setup
- [`TICKETCHAIN_MASTER_SPEC.md`](../TICKETCHAIN_MASTER_SPEC.md) — full product/architecture spec (§32–33)
- [`.env.example`](../.env.example) — env template
