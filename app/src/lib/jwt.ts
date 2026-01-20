import { jwtVerify } from 'jose';

export const AccessCookieName = 'kueli-access';

export interface AuthUser {
  id: number;
  username: string;
  isAdmin: boolean;
}

function getJwtSecret(): Uint8Array | null {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    return null;
  }
  return new TextEncoder().encode(secret);
}

export async function verifyAccessToken(token: string): Promise<AuthUser | null> {
  const secret = getJwtSecret();
  if (!secret) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
    });

    if (payload.typ !== 'access') {
      return null;
    }

    if (typeof payload.sub !== 'string' || typeof payload.username !== 'string') {
      return null;
    }

    const id = Number(payload.sub);
    if (!Number.isFinite(id)) {
      return null;
    }

    return {
      id,
      username: payload.username,
      isAdmin: Boolean(payload.isAdmin),
    };
  } catch {
    return null;
  }
}
