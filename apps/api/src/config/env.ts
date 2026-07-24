import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_SIZE: z.coerce.number().default(10),
  REDIS_URL: z.string().default('redis://localhost:16379'),
  MST_RPC_URL: z.string().url().default('https://testnetrpc.mstblockchain.com'),
  MST_CHAIN_ID: z.coerce.number().default(4545),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  API_BASE_URL: z.string().url().default('http://localhost:5000'),

  WEB3AUTH_CLIENT_ID: z.string().min(1).default('configure-in-env'),
  WEB3AUTH_JWKS_URL: z.string().url().default('https://api-auth.web3auth.io/jwks'),
  WEB3AUTH_ISSUER: z.string().url().default('https://api-auth.web3auth.io'),

  JWT_PRIVATE_KEY_PATH: z.string().default('./certs/private.pem'),
  JWT_PUBLIC_KEY_PATH: z.string().default('./certs/public.pem'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  COOKIE_DOMAIN: z.string().default('localhost'),
  COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  MST_DEPLOYER_PRIVATE_KEY: z.string().min(1).optional(),
  ORG_REGISTRY_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  MARKETPLACE_CONTRACT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),

  SARAL_APP_ID: z.string().optional(),
  SARAL_APP_SECRET: z.string().optional(),
  SARAL_ENVIRONMENT: z.enum(['testnet', 'mainnet']).optional(),

  PINATA_API_KEY: z.string().optional(),
  PINATA_SECRET_KEY: z.string().optional(),
  PINATA_GATEWAY: z.string().url().default('https://gateway.pinata.cloud'),

  CHAINPAY_API_KEY: z.string().optional(),
  CHAINPAY_API_URL: z
    .string()
    .url()
    .default('https://sandbox-api.chainpay.biz'),
  CHAINPAY_DEFAULT_CURRENCY: z.string().default('INR'),
  PAYMENTS_WEBHOOK_SECRET: z.string().optional(),
  ALLOW_DIRECT_MINT: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),

  MST_FAUCET_PRIVATE_KEY: z.string().min(1).optional(),
  MST_FAUCET_AMOUNT_WEI: z.string().regex(/^\d+$/).default('10000000000000000000'),
  MST_FAUCET_COOLDOWN_HOURS: z.coerce.number().int().min(1).default(24),
  MST_FAUCET_MAX_BALANCE_WEI: z.string().regex(/^\d+$/).default('5000000000000000000'),
  MST_FAUCET_EXTERNAL_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
