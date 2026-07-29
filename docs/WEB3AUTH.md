# Web3Auth production checklist

TicketChain embeds `@web3auth/no-modal` with **Sapphire Devnet**.

## Client IDs

Set the same Client ID in:

- `WEB3AUTH_CLIENT_ID` (API)
- `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID` (web — baked at Docker build)

Changing Client ID changes custodial wallet addresses for email/SMS users.

## Allowlist

Dashboard → Project Settings → Allowlist:

```text
https://mstticket.clawxlab.xyz
http://localhost:3000
```

Exact match required (scheme + host + port). No trailing slash.

## MST Testnet custom chain

| Field | Value |
|-------|--------|
| Network Name | MST Testnet |
| Symbol | tMSTC |
| Symbol name | MST Native Coin |
| Chain ID | 91562037 |
| Namespace | EIP155 |
| Decimals | 18 |
| RPC | https://testnetrpc.mstblockchain.com |
| Explorer | https://testnet.mstscan.com |

More detail: [`AUTH.md`](./AUTH.md).
