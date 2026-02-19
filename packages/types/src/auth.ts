/**
 * Authentication types — credentials, OAuth tokens, validation.
 * Extracted from src/auth/types.ts.
 */

export interface ApiKeyCredential {
  readonly kind: 'api_key';
  readonly value: string;
}

export interface OAuthCredential {
  readonly kind: 'oauth';
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
}

export type Credential = ApiKeyCredential | OAuthCredential;

export interface OAuthTokenResponse {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_in: number;
  readonly token_type: string;
}

export interface ValidationResult {
  readonly isValid: boolean;
  readonly error?: string;
  readonly accountInfo?: string;
}
