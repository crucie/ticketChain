# Local development checklist

```bash
pnpm install
pnpm docker:up
pnpm migrate
pnpm seed
pnpm --filter @ticketchain/api generate:keys   # first time
```

Three terminals:

```bash
pnpm dev:api
pnpm dev:web
pnpm --filter @ticketchain/api worker:dev
```

Checks:

```bash
curl http://localhost:5000/health
```

Web3Auth local allowlist must include `http://localhost:3000`.

After sign-in, open `/profile` and connect MetaMask or Phantom (required for consumers).
