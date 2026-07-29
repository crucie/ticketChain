# TicketChain AWS (`ap-south-1`)

Imperative ECS/Fargate stack names: `ticketchain-*` (not `clawx-*`).

## Live public endpoint

- **HTTPS:** https://mstticket.clawxlab.xyz
- **Health:** https://mstticket.clawxlab.xyz/health
- **ALB DNS (CNAME target):** `ticketchain-prod-591279368.ap-south-1.elb.amazonaws.com`
- **ACM:** `mstticket.clawxlab.xyz` in `ap-south-1`

ALB routing: HTTPS `:443` → web (default), `/api/*` + `/health` → api; HTTP `:80` → 301 HTTPS.

## Secrets

Task definition JSON templates in this folder are registered to ECS. Fill env from Secrets Manager `ticketchain/prod/app`.

**Do not commit** `app-secret.json`, `ecs-env.json`, or `task-*.json` (gitignored).

When rotating Web3Auth Client ID or public URLs:

1. Update Secrets Manager + `task-api` / `task-worker` env.
2. Rebuild the **web** image with matching `NEXT_PUBLIC_*` build-args (especially `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID`).
3. Force new ECS deployments for api, worker, and web.

See **[docs/DEPLOYMENT.md §10](../../docs/DEPLOYMENT.md)** for full resource names and roll procedures.
