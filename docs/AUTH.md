# Authentication Strategy

## Primary: Web3Auth (implemented)

Consumer and org-member login uses **Web3Auth** (`POST /api/auth/verify`):

- Email passwordless and SMS via `@web3auth/no-modal`
- Backend validates `idToken` via JWKS
- Users are keyed by `users.web3auth_sub`
- Sign-in is email/SMS only; MetaMask/Phantom is **not** offered on `/login`
- After login, consumers must connect a browser wallet on `/profile` (required modal) so tickets mint to their own address

Platform operators use a **separate path**: email + bcrypt via `platform_admins` (`POST /api/auth/platform-login`). They never authenticate through Web3Auth.

### Dashboard allowlist (required for hosted login)

In [Web3Auth Dashboard](https://dashboard.web3auth.io) for the project whose Client ID matches `WEB3AUTH_CLIENT_ID` / `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID`:

1. Environment must be **Sapphire Devnet** (the app initializes `WEB3AUTH_NETWORK.SAPPHIRE_DEVNET`).
2. **Project Settings → Allowlist** must include the exact origins:
   - `https://mstticket.clawxlab.xyz`
   - `http://localhost:3000`
3. Do not add trailing slashes or paths (`/login`).
4. Changing Client ID changes generated wallet addresses for users — do this only before real user onboarding.

### Custom MST Testnet network (dashboard)

If the project asks for a custom chain:

| Field | Value |
|-------|--------|
| Network Name | `MST Testnet` |
| Currency Symbol | `tMSTC` |
| Currency Symbol Name | `MST Native Coin` |
| Chain ID | `91562037` |
| Chain Namespace | `EIP155` |
| Decimals | `18` |
| RPC URL | `https://testnetrpc.mstblockchain.com` |
| Block Explorer | `https://testnet.mstscan.com` |
| Logo URL | `https://testnet.mstscan.com/favicon.ico` (or any public square image) |

## Legacy / future: SARAL SSO

The master spec describes SARAL Protocol (`saral_user_id`, `@mstblockchain/mst-sdk` SSO). This is **not wired in the current codebase**. Environment variables (`SARAL_APP_ID`, `SARAL_APP_SECRET`) are reserved for a future integration.

When SARAL is added, the recommended approach is:

1. Add `POST /api/auth/saral-verify` parallel to Web3Auth verify
2. Map `saral_user_id` to the same `users` row (nullable `web3auth_sub` / `saral_user_id`)
3. Keep platform admin auth unchanged

## Decision (May 2026)

**Web3Auth is the production consumer auth provider** until SARAL credentials and SDK flows are provisioned for this deployment.
