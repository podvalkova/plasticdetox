/** Decrypts only x.com cookies from Chrome so puppeteer can browse as you. */
import crypto from 'node:crypto';
import sqlite3 from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyFileSync, unlinkSync, existsSync } from 'node:fs';

const CHROME_COOKIES = join(homedir(), 'Library/Application Support/Google/Chrome/Default/Cookies');

export function xCookies() {
  if (!existsSync(CHROME_COOKIES)) throw new Error('Chrome cookie store not found.');
  const tmp = join(tmpdir(), `_xck_${process.pid}.db`);
  copyFileSync(CHROME_COOKIES, tmp); // snapshot, so a running Chrome does not block us
  try {
    const db = new sqlite3.DatabaseSync(tmp, { readOnly: true });
    const rows = db.prepare(
      `select host_key, name, hex(encrypted_value) as enc, value, path, is_secure, is_httponly
         from cookies where host_key like '%x.com' or host_key like '%twitter.com'`).all();
    let pw;
    try {
      pw = execFileSync('security', ['find-generic-password', '-w', '-s', 'Chrome Safe Storage'],
        { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      throw new Error(
        'macOS would not release the Chrome cookie key.\n' +
        '  Approve the "Chrome Safe Storage" dialog with Always Allow, or run once in a terminal:\n' +
        '    security find-generic-password -w -s "Chrome Safe Storage" > /dev/null');
    }
    const key = crypto.pbkdf2Sync(pw, 'saltysalt', 1003, 16, 'sha1');
    const iv = Buffer.alloc(16, ' ');
    const decrypt = hex => {
      const buf = Buffer.from(hex, 'hex');
      if (!['v10', 'v11'].includes(buf.subarray(0, 3).toString())) return null;
      const d = crypto.createDecipheriv('aes-128-cbc', key, iv);
      d.setAutoPadding(false);
      let out = Buffer.concat([d.update(buf.subarray(3)), d.final()]);
      const pad = out[out.length - 1];
      if (pad >= 1 && pad <= 16) out = out.subarray(0, out.length - pad);
      for (const c of [out, out.subarray(32)]) { // Chrome M127+ prefixes a 32-byte hash
        const s = c.toString('utf8');
        if (s && /^[\x20-\x7E]*$/.test(s)) return s;
      }
      return null;
    };
    const cookies = [];
    for (const r of rows) {
      const value = r.value || decrypt(r.enc);
      if (value) cookies.push({ name: r.name, value, domain: r.host_key, path: r.path,
        secure: !!r.is_secure, httpOnly: !!r.is_httponly, url: 'https://x.com' });
    }
    db.close();
    if (!cookies.some(c => c.name === 'auth_token')) {
      throw new Error('no X auth_token found. Log into X in Chrome, then rerun.');
    }
    return cookies;
  } finally { try { unlinkSync(tmp); } catch {} }
}

export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
