let crypt = null;
try {
  crypt = require('unix-crypt-td-js');
} catch (e) {
  crypt = null;
}

function sanitizeSalt(s) {
  return String(s || '')
    .replace(/[\x00-\x20:;<=>?@[\\\]^_`]/g, '.')
    .replace(/[^.\/0-9A-Za-z]/g, '.');
}

function createTrip(source) {
  source = String(source || '');
  const salt = sanitizeSalt((source + 'H.').slice(1, 3));
  if (crypt) {
    const result = typeof crypt === 'function' ? crypt(source, salt) : crypt.crypt(source, salt);
    return String(result).slice(-10);
  }
  // Fallback:旧実装互換ではないが、依存が無い環境でもログインを止めない。
  // 2ch互換にするには package.json の unix-crypt-td-js を install すること。
  const crypto = require('crypto');
  return crypto.createHash('sha1').update(source).digest('base64').replace(/[+=/]/g, '').slice(0, 10);
}

module.exports = { createTrip };
