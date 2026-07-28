# TicketChain AWS (`ap-south-1`)

Imperative ECS/Fargate stack names: `ticketchain-*` (not `clawx-*`).

See **[docs/DEPLOYMENT.md §10](../../docs/DEPLOYMENT.md)** for live URLs, resource names, and roll procedures.

Task definition templates in this folder are registered to ECS; fill env from Secrets Manager `ticketchain/prod/app` (do not commit `app-secret.json` / `ecs-env.json`).
