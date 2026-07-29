# Custom domain and TLS (ALB + ACM)

## Current production host

```text
https://mstticket.clawxlab.xyz
```

## DNS

```text
CNAME  mstticket  →  ticketchain-prod-591279368.ap-south-1.elb.amazonaws.com
```

## ACM

- Region: `ap-south-1` (must match the ALB)
- Domain: `mstticket.clawxlab.xyz`
- Cert ARN: `arn:aws:acm:ap-south-1:123209654070:certificate/05efab72-08a8-4038-bfa8-6dd7db0ae176`

## ALB listeners

| Port | Action |
|------|--------|
| 443 HTTPS | Forward `/` → web TG; `/api/*` and `/health` → api TG; ACM cert attached |
| 80 HTTP | Redirect 301 → HTTPS |

## App env after TLS

```text
FRONTEND_URL=https://mstticket.clawxlab.xyz
API_BASE_URL=https://mstticket.clawxlab.xyz
COOKIE_DOMAIN=.clawxlab.xyz
COOKIE_SECURE=true
NEXT_PUBLIC_API_URL=https://mstticket.clawxlab.xyz
```

Rebuild the web image whenever `NEXT_PUBLIC_*` changes, then redeploy ECS services.
