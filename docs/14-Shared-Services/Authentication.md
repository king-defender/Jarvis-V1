# Authentication Shared Service Specification

The Authentication Shared Service validates JWT payloads and API keys.

---

## 1. Description
Verifies request signatures, parses user claims, validates key expirations, and checks roles against system actions.

---

## 2. API Contract
```typescript
export interface UserClaims {
  userId: string;
  roles: string[];
}

export interface IAuthenticationService {
  verifyJwt(token: string): Promise<UserClaims>;
  verifyApiKey(apiKey: string): Promise<boolean>;
}
```
