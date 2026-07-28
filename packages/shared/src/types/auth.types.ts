import type { Role } from '../index.js';

export interface AccessTokenPayload {
  userId: string;
  role: Role;
  walletAddress: string;
  orgIds: string[];
  isPlatformAdmin: boolean;
}

export interface AuthUserResponse {
  id: string;
  email: string;
  walletAddress: string;
  role: Role;
  orgIds: string[];
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
  bio: string | null;
  profileImage: string | null;
  isNewUser?: boolean;
}
