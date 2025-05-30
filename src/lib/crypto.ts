//import crypto from 'crypto';
//import crypto = require('crypto');
import { createHash } from 'crypto';
//const { createHash } = await import('node:crypto');
import { v4, v5 } from 'uuid';
import { startOfMonth } from 'date-fns';

// const ALGORITHM = 'aes-256-gcm';
// const IV_LENGTH = 16;
// const SALT_LENGTH = 64;
// const TAG_LENGTH = 16;
// const TAG_POSITION = SALT_LENGTH + IV_LENGTH;
// const ENC_POSITION = TAG_POSITION + TAG_LENGTH;

const HASH_ALGO = 'sha512';
const HASH_ENCODING = 'hex';

export function hash(...args) {
  return createHash(HASH_ALGO).update(args.join('')).digest(HASH_ENCODING);
}

export function secret() {
  return hash(process.env.APP_SECRET || process.env.DATABASE_URL);
}

export function salt() {
  const ROTATING_SALT = hash(startOfMonth(new Date()).toUTCString());

  return hash(secret(), ROTATING_SALT);
}

export function uuid(...args) {
  if (!args.length) return v4();

  return v5(hash(...args, salt()), v5.DNS);
}

export function md5(...args) {
  return createHash('md5').update(args.join('')).digest('hex');
}
