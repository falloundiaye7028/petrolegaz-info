'use strict';
const { createHmac, timingSafeEqual } = require('node:crypto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AGE = 180 * 24 * 60 * 60;
function key(secret) {
  // Dedicated random 32-byte key, encoded as 64 hexadecimal characters.
  if (typeof secret !== 'string' || !/^[a-f0-9]{64}$/i.test(secret)) throw new Error('Unsubscribe key unavailable');
  return Buffer.from(secret, 'hex');
}
function sign(value, secret) { return createHmac('sha256', key(secret)).update(value).digest('base64url'); }
function createToken(userId, secret, now = Math.floor(Date.now() / 1000)) {
  if (!UUID.test(userId) || !Number.isSafeInteger(now) || now < 0) throw new Error('Invalid token input');
  const payload = Buffer.from(JSON.stringify({ purpose: 'unsubscribe-alerts-v1', sub: userId, iat: now, exp: now + MAX_AGE })).toString('base64url');
  return payload + '.' + sign(payload, secret);
}
function verifyToken(token, secret, now = Math.floor(Date.now() / 1000)) {
  key(secret);
  if (typeof token !== 'string' || token.length > 1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [payload, signature] = token.split('.');
  const expected = Buffer.from(sign(payload, secret));
  if (!timingSafeEqual(Buffer.from(signature), expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.purpose !== 'unsubscribe-alerts-v1' || !UUID.test(data.sub) || !Number.isSafeInteger(data.iat) ||
        !Number.isSafeInteger(data.exp) || data.iat > now || data.exp <= now || data.exp - data.iat !== MAX_AGE) return null;
    return data.sub;
  } catch { return null; }
}
module.exports = { createToken, verifyToken };
