# Marketplace deploy (MST Testnet)

Deploy `TicketMarketplace` and set `MARKETPLACE_CONTRACT_ADDRESS`:

```bash
pnpm --filter @ticketchain/contracts compile
pnpm --filter @ticketchain/contracts deploy:marketplace:testnet
```

Constructor defaults in the script:

- platform fee recipient / royalty receiver = deployer
- platform fee = 200 bps (2%)
- royalty = 500 bps (5%)

Output is written to `deployments/mstTestnet-marketplace.json`.

Then update:

1. Local `.env` → `MARKETPLACE_CONTRACT_ADDRESS`
2. Secrets Manager `ticketchain/prod/app`
3. Redeploy `ticketchain-api` and `ticketchain-worker`

Without this address, the API keeps the custodial (DB) resale path.
