# Direct on-chain mint & tMSTC wallet setup

This guide explains how **direct mint** works, what **tMSTC** is, which env vars control what, and how users see their wallet balance.

## What is tMSTC?

On **MST testnet**, the native gas/token unit is **tMSTC** (test MST Coin). It works like ETH on Ethereum:

- Used for **gas** on transactions
- Used as **tier price** when minting via `mintTicket()` (direct mint path)
- Shown in the UI as `Number(priceWei) / 1e18` tMSTC

There is **no separate ERC-20 token** in this app for primary ticket sales — balances are **native chain balance** queried via RPC (`getBalance`).

## Two ways to buy tickets

| Path | UI button | Payment | Mint function |
|------|-----------|---------|---------------|
| **ChainPay** | Pay with ChainPay | Fiat via ChainPay gateway | `adminMint()` (free on-chain) |
| **Direct mint** | On-chain Mint | Platform **deployer** pays `priceWei` | `mintTicket()` with `msg.value` |

Direct mint is for **local/dev testing**. ChainPay is the production checkout path.

---

## What changes what (config map)

### Backend (`.env` → `apps/api`)

| Variable | Controls |
|----------|----------|
| `ALLOW_DIRECT_MINT=true` | Allows `POST /api/tickets/mint` (blocked in production unless explicitly true) |
| `MST_DEPLOYER_PRIVATE_KEY` | Wallet that **deploys** event contracts and **pays** for direct mints |
| `MST_RPC_URL` | RPC for balance checks, deploy, mint |
| `MST_CHAIN_ID` | Chain ID stored on events / returned in wallet API |
| `ORG_REGISTRY_ADDRESS` | On-chain org registry (deploy script) |

### Frontend (`.env` → `apps/web` via root `.env`)

| Variable | Controls |
|----------|----------|
| `NEXT_PUBLIC_ALLOW_DIRECT_MINT=true` | Shows **On-chain Mint** button on event tiers |
| `NEXT_PUBLIC_MST_CHAIN_ID` | Web3Auth chain config (must match `MST_CHAIN_ID`) |
| `NEXT_PUBLIC_MST_RPC_URL` | Web3Auth RPC (must match `MST_RPC_URL`) |
| `NEXT_PUBLIC_API_URL` | API base for mint/checkout calls |

### Code paths

| Layer | File | Role |
|-------|------|------|
| UI | `apps/web/src/components/TierPurchase.tsx` | Checkout + direct mint buttons |
| API client | `apps/web/src/lib/api.ts` | `createCheckout()`, `mintTickets()`, `getWalletBalance()` |
| Mint API | `apps/api/src/modules/tickets/tickets.controller.ts` | `POST /api/tickets/mint` gate |
| Mint logic | `apps/api/src/modules/tickets/tickets.service.ts` | Inventory + `mintTicketOnChain()` |
| Chain | `apps/api/src/shared/blockchain/event-contract.service.ts` | `mintTicket()`, `adminMint()`, deploy |
| Contract | `packages/contracts/contracts/EventTickets1155.sol` | `mintTicket` requires `msg.value` |
| Wallet API | `GET /api/profile/wallet` | Returns user balance from MST RPC |
| Profile UI | `apps/web/src/app/profile/page.tsx` | Shows tMSTC balance + explorer link |

---

## Setup checklist

### 1. Enable direct mint

In root `.env`:

```env
ALLOW_DIRECT_MINT=true
NEXT_PUBLIC_ALLOW_DIRECT_MINT=true
```

Restart **API** and **web** after changing env.

### 2. Configure MST chain (must match everywhere)

```env
MST_RPC_URL=https://testnetrpc.mstblockchain.com
MST_CHAIN_ID=91562037
NEXT_PUBLIC_MST_RPC_URL=https://testnetrpc.mstblockchain.com
NEXT_PUBLIC_MST_CHAIN_ID=91562037
NEXT_PUBLIC_MST_BLOCK_EXPLORER_URL=https://testnet.mstscan.com
```

### 3. Set deployer wallet

```env
MST_DEPLOYER_PRIVATE_KEY=<64-char hex private key, no 0x prefix>
```

Check balance:

```bash
pnpm --filter @ticketchain/api exec tsx src/scripts/check-deployer-balance.ts
```

**Fund the deployer address** with tMSTC from your MST testnet faucet / team wallet.  
Direct mint fails if the deployer cannot pay `tier.priceWei × quantity`.

> Note: Direct mint uses the **deployer** wallet to pay on-chain, not the buyer's Web3Auth wallet. The buyer still **receives** the NFT in their custodial wallet.

### 4. Event must be ready for sales

1. Create event (draft)
2. Add tiers with **`priceWei`** (wei string, e.g. `1000000000000000000` = 1 tMSTC)
3. Optionally set **`priceDisplay`** for ChainPay (INR) — not required for direct mint
4. **Deploy contract** (admin event → Deploy)
5. **Publish** event (opens sales + seeds Redis inventory)

### 5. User flow (direct mint)

1. Sign in via Web3Auth email/SMS (`/login`) — no MetaMask step on the login page
2. Open `/profile` and connect MetaMask or Phantom (required) so tickets mint to that address
3. Open published event → pick tier → **On-chain Mint**
4. API mints NFT to the linked wallet
5. View tickets at `/tickets`
6. View **tMSTC balance** at `/profile`

---

## Wallet balance API

```
GET /api/profile/wallet
Authorization: cookie (signed-in user)
```

Response:

```json
{
  "success": true,
  "data": {
    "walletAddress": "0x...",
    "balanceWei": "1000000000000000000",
    "symbol": "tMSTC",
    "chainId": 91562037,
    "rpcUrl": "https://testnetrpc.mstblockchain.com"
  }
}
```

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| No "On-chain Mint" button | `NEXT_PUBLIC_ALLOW_DIRECT_MINT=false` or not restarted web |
| 403 Direct mint disabled | `ALLOW_DIRECT_MINT=false` or `NODE_ENV=production` |
| Mint failed / insufficient funds | Deployer wallet empty — fund `MST_DEPLOYER_PRIVATE_KEY` address |
| Event contract not deployed | Run **Deploy contract** in admin before mint |
| Sold out | Redis inventory 0 or tier supply exhausted |
| Balance shows 0 on profile | User wallet never funded (normal for new Web3Auth users) |

For **marketplace resale buys**, the **buyer's** wallet must hold enough tMSTC — that path uses on-chain payment from the buyer, not the deployer.

## Testnet faucet behavior

By default, **Get test tMSTC** copies the linked wallet address and opens the official
[MST Testnet faucet](https://faucet.mstblockchain.com/). The app does not use
`MST_DEPLOYER_PRIVATE_KEY` as a faucet because that wallet deploys contracts and pays
platform transactions.

An in-app transfer is enabled only when `MST_FAUCET_PRIVATE_KEY` is set. Use a dedicated,
limited-balance testnet wallet for that key—never a personal wallet or the deployer. The
default in-app grant is 1 tMSTC with a 24-hour cooldown and a 5 tMSTC maximum-balance
check.
