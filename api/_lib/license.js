// Shared licensing helpers for the cad2d activation API (Vercel serverless).
// Files under api/ whose name starts with "_" are NOT routed by Vercel, so this
// is a private module the route handlers require().
//
// This is the server side of the SAME scheme the shipped desktop app verifies:
//   - license keys are Ed25519-signed tokens (cad2d-lic|v2|...), verified here
//     with the PUBLIC key so we can read the licensee name / id / seat count;
//   - a successful activation returns a short-lived, machine-bound LEASE
//     (cad2d-lease|v1|...) signed with the PRIVATE key, which the app verifies
//     with its embedded public key.
// The wire format and crypto match com.cad2d.License / LicenseServer exactly,
// so the unmodified desktop client works against this endpoint. Keep them in
// sync if either side changes.

const crypto = require('crypto');

// Must mirror com.cad2d.License.
const LEASE_DAYS = 30;
const OFFLINE_GRACE_DAYS = 14;

// ---- base64url (no padding), matching Java's Base64.getUrlEncoder().withoutPadding() ----
function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBuf(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

// ---- keys from env (the private key is the crown jewel; set it as a Vercel secret) ----
function privateKey() {
  const der = Buffer.from(reqEnv('CAD2D_LICENSE_PRIVATE_KEY'), 'base64');
  return crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
}
function publicKey() {
  const der = Buffer.from(reqEnv('CAD2D_LICENSE_PUBLIC_KEY'), 'base64');
  return crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
}
function reqEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error('missing env var ' + name);
  return v.trim();
}

// ---- license key verification (parses cad2d-lic|v1|.. and |v2|..) ----
function verifyKey(key) {
  try {
    const parts = String(key || '').trim().split('.');
    if (parts.length !== 2) return null;
    const payloadBytes = b64urlToBuf(parts[0]);
    const sig = b64urlToBuf(parts[1]);
    if (!crypto.verify(null, payloadBytes, publicKey(), sig)) return null;   // Ed25519
    const f = payloadBytes.toString('utf8').split('|');
    if (f.length < 6 || f[0] !== 'cad2d-lic') return null;
    const v1 = f[1] === 'v1' && f.length === 6;
    const v2 = f[1] === 'v2' && f.length === 7;
    if (!v1 && !v2) return null;
    const name = b64urlToBuf(f[2]).toString('utf8');
    const id = b64urlToBuf(f[3]).toString('utf8');
    const seats = v2 ? parseInt(f[6], 10) : 1;
    if (!(seats >= 1)) return null;
    return { name, id, edition: f[4], seats };
  } catch (e) {
    return null;
  }
}

// ---- lease signing (mirror of com.cad2d.License.signLease) ----
function leasePayload(licenseId, machine, expiryEpochSec, name, seats) {
  return 'cad2d-lease|v1|' + b64url(Buffer.from(licenseId, 'utf8'))
    + '|' + machine + '|' + expiryEpochSec
    + '|' + b64url(Buffer.from(name, 'utf8')) + '|' + seats;
}
function signLease(licenseId, machine, expiryEpochSec, name, seats) {
  const p = leasePayload(licenseId, machine, expiryEpochSec, name, seats);
  const pbytes = Buffer.from(p, 'utf8');
  const sig = crypto.sign(null, pbytes, privateKey());                       // Ed25519
  return b64url(pbytes) + '.' + b64url(sig);
}

// ---- Supabase (PostgREST) access using the SERVICE ROLE key (bypasses RLS;
//      the tables are not exposed to anon). Same fetch-based style as
//      api/contact.js, just a stronger key. ----
function sbBase() {
  return reqEnv('SUPABASE_URL').replace(/\/rest\/v1\/?$/, '');
}
function sbHeaders(extra) {
  const key = reqEnv('SUPABASE_SERVICE_ROLE_KEY');
  return Object.assign({
    'Content-Type': 'application/json',
    'apikey': key,
    'Authorization': 'Bearer ' + key,
  }, extra || {});
}
async function sbGet(pathAndQuery) {
  const r = await fetch(sbBase() + '/rest/v1/' + pathAndQuery, { headers: sbHeaders() });
  if (!r.ok) throw new Error('supabase GET ' + r.status + ' ' + (await r.text()));
  return r.json();
}
async function sbUpsert(table, row, onConflict) {
  const q = onConflict ? '?on_conflict=' + encodeURIComponent(onConflict) : '';
  const r = await fetch(sbBase() + '/rest/v1/' + table + q, {
    method: 'POST',
    headers: sbHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error('supabase UPSERT ' + r.status + ' ' + (await r.text()));
}
async function sbDelete(table, query) {
  const r = await fetch(sbBase() + '/rest/v1/' + table + '?' + query, {
    method: 'DELETE',
    headers: sbHeaders({ 'Prefer': 'return=minimal' }),
  });
  if (!r.ok) throw new Error('supabase DELETE ' + r.status + ' ' + (await r.text()));
}
async function sbPatch(table, query, patch) {
  const r = await fetch(sbBase() + '/rest/v1/' + table + '?' + query, {
    method: 'PATCH',
    headers: sbHeaders({ 'Prefer': 'return=minimal' }),
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error('supabase PATCH ' + r.status + ' ' + (await r.text()));
}

const eq = (v) => 'eq.' + encodeURIComponent(v);

// ---- domain operations ----
function nowSec() { return Math.floor(Date.now() / 1000); }

async function isRevoked(licenseId) {
  const rows = await sbGet('license_revocations?license_id=' + eq(licenseId) + '&select=license_id');
  return rows.length > 0;
}

/** Try to grant/renew a seat for `machine` on `info`. Returns a signed lease
 *  string, or the string code 'SEATS_FULL'. */
async function grantSeat(info, machine) {
  const rows = await sbGet('license_activations?license_id=' + eq(info.id)
    + '&select=machine,lease_expiry');
  const cutoff = nowSec() - OFFLINE_GRACE_DAYS * 86400;
  const active = rows.filter(r => Number(r.lease_expiry) >= cutoff);
  const held = active.some(r => r.machine === machine);
  if (!held && active.length >= info.seats) return 'SEATS_FULL';

  const expiry = nowSec() + LEASE_DAYS * 86400;
  await sbUpsert('license_activations',
    { license_id: info.id, machine, lease_expiry: expiry, updated_at: new Date().toISOString() },
    'license_id,machine');
  return signLease(info.id, machine, expiry, info.name, info.seats);
}

async function releaseSeat(licenseId, machine) {
  await sbDelete('license_activations',
    'license_id=' + eq(licenseId) + '&machine=' + eq(machine));
}

async function seatUsage(licenseId, seats) {
  const rows = await sbGet('license_activations?license_id=' + eq(licenseId) + '&select=lease_expiry');
  const cutoff = nowSec() - OFFLINE_GRACE_DAYS * 86400;
  const used = rows.filter(r => Number(r.lease_expiry) >= cutoff).length;
  return used + '/' + seats;
}

async function setRevoked(licenseId, revoke) {
  if (revoke) {
    await sbUpsert('license_revocations',
      { license_id: licenseId, revoked_at: new Date().toISOString() }, 'license_id');
  } else {
    await sbDelete('license_revocations', 'license_id=' + eq(licenseId));
  }
}

// ---- account sign-in (Supabase Auth) + entitlements ----
// Used by the account model: the desktop app sends email+password (or a refresh
// token); we exchange it with Supabase Auth server-side, look up the account's
// entitlement (which product, how many seats), and issue the same signed lease.
// No Supabase keys are ever embedded in the shipped app.

const PRODUCT = 'cad2d';

/** Exchange credentials with Supabase Auth. `grant` is 'password' or
 *  'refresh_token'. Returns { userId, email, refreshToken } or null. */
async function supabaseAuth(grant, body) {
  const anon = reqEnv('SUPABASE_ANON_KEY');
  const r = await fetch(sbBase() + '/auth/v1/token?grant_type=' + grant, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': anon },
    body: JSON.stringify(body),
  });
  if (!r.ok) return null;                       // bad credentials / expired refresh
  const j = await r.json();
  if (!j || !j.access_token || !j.user) return null;
  return { userId: j.user.id, email: j.user.email || '', refreshToken: j.refresh_token || '' };
}

const passwordGrant = (email, password) => supabaseAuth('password', { email, password });
const refreshGrant  = (refresh_token)   => supabaseAuth('refresh_token', { refresh_token });

/** Resolve a Supabase access token (JWT) to its user. Used by the browser
 *  account page, which authenticates client-side and sends the bearer token.
 *  Returns { userId, email } or null. */
async function resolveUser(bearer) {
  if (!bearer) return null;
  const anon = reqEnv('SUPABASE_ANON_KEY');
  const r = await fetch(sbBase() + '/auth/v1/user', {
    headers: { 'apikey': anon, 'Authorization': 'Bearer ' + bearer },
  });
  if (!r.ok) return null;
  const j = await r.json();
  if (!j || !j.id) return null;
  return { userId: j.id, email: j.email || '' };
}

/** The account's currently-held device seats (non-lapsed activations). */
async function listDevices(userId) {
  const rows = await sbGet('license_activations?license_id=' + eq(userId)
    + '&select=machine,lease_expiry,updated_at');
  const cutoff = nowSec() - OFFLINE_GRACE_DAYS * 86400;
  return rows.filter(r => Number(r.lease_expiry) >= cutoff)
    .map(r => ({ machine: r.machine, expiry: Number(r.lease_expiry), updated_at: r.updated_at }));
}

/** The account's entitlement for cad2d, or null if none / inactive. */
async function getEntitlement(userId) {
  const rows = await sbGet('entitlements?user_id=' + eq(userId)
    + '&product=' + eq(PRODUCT) + '&select=seats,active');
  if (rows.length === 0 || rows[0].active === false) return null;
  return { seats: Number(rows[0].seats) || 1 };
}

/** Full account activation: resolve the auth result -> entitlement -> lease.
 *  `auth` is the object returned by passwordGrant/refreshGrant. Returns
 *  { code, lease?, refresh? } where code is OK / NO_ENTITLEMENT / SEATS_FULL. */
async function activateAccount(auth, machine) {
  const ent = await getEntitlement(auth.userId);
  if (!ent) return { code: 'NO_ENTITLEMENT' };
  // seats are per (user, product); the lease's licenseId is the user id, its
  // name is the account email (shown in the app's title/among support).
  const lease = await grantSeat({ id: auth.userId, name: auth.email, seats: ent.seats }, machine);
  if (lease === 'SEATS_FULL') return { code: 'SEATS_FULL' };
  return { code: 'OK', lease, refresh: auth.refreshToken };
}

// ---- paid-key model: issue + look up random keys ----
// A license key is a long random string you generate after a payment. It is
// stored in license_keys and confirmed server-side on activation (no signature
// in the key itself — the SIGNED thing is the lease the server returns).

// Charset for keys: alphanumerics (minus look-alikes 0/O/1/l/I) + a set of
// special characters that are safe in emails, JSON and URLs. ~68 symbols.
const KEY_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_=+?';

/** A cryptographically-random key of `len` chars (default 65). */
function randomKey(len = 65) {
  const bytes = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += KEY_CHARSET[bytes[i] % KEY_CHARSET.length];
  return s;
}

/** Generate + store a new license key. Returns { id, key }. */
async function issueKey({ email, seats, note }) {
  const id = crypto.randomUUID();
  const key = randomKey(65);
  await sbUpsert('license_keys',
    { id, key, email: email || null, seats: seats && seats >= 1 ? seats : 1, note: note || null, active: true },
    'id');
  return { id, key };
}

/** Look up a key. Returns { id, seats, active, email } or null. */
async function lookupKey(key) {
  if (!key) return null;
  const rows = await sbGet('license_keys?key=' + eq(key) + '&select=id,seats,active,email');
  if (rows.length === 0) return null;
  return { id: rows[0].id, seats: Number(rows[0].seats) || 1, active: rows[0].active !== false, email: rows[0].email || '' };
}

/** Revoke (active=false) or restore (active=true) a key. */
async function setKeyActive(key, active) {
  await sbPatch('license_keys', 'key=' + eq(key), { active: !!active });
}

// ---- request/response helpers matching the desktop client's text protocol ----

/** Parse an x-www-form-urlencoded (or JSON) body into a plain object,
 *  defensively, the way api/contact.js does. */
function readForm(req) {
  let body = req.body;
  if (body == null) return {};
  if (typeof body === 'object') return body;
  const s = String(body);
  // JSON?
  if (s.trim().startsWith('{')) { try { return JSON.parse(s); } catch { /* fall through */ } }
  const out = {};
  for (const [k, v] of new URLSearchParams(s)) out[k] = v;
  return out;
}

/** Send the plain-text reply the client expects: first line is the code, an
 *  optional lease token follows on line 2. */
function sendText(res, status, text) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(status).send(text);
}

module.exports = {
  LEASE_DAYS, OFFLINE_GRACE_DAYS, PRODUCT,
  b64url, b64urlToBuf, verifyKey, leasePayload, signLease,
  isRevoked, grantSeat, releaseSeat, seatUsage, setRevoked,
  passwordGrant, refreshGrant, getEntitlement, activateAccount,
  resolveUser, listDevices,
  randomKey, issueKey, lookupKey, setKeyActive,
  readForm, sendText,
};
