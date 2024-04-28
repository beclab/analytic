import { sign, verify } from 'jsonwebtoken';

export function createToken(payload: any, secret: any, options?: any) {
  return sign(payload, secret, options);
}

export function parseToken(token: string, secret: any) {
  try {
    return verify(token, secret);
  } catch {
    return null;
  }
}
