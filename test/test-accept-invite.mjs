// api/accept-invite.js の動作をNode単体でテストするスクリプト。
// 実際のVercel環境・実際のSupabaseを使わず、req/resとglobal.fetchを差し替えて検証する。
import assert from 'node:assert';
import handler from '../api/accept-invite.js';

function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
  };
  return res;
}

let passed = 0, failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log('OK   -', name);
  } catch (e) {
    failed++;
    console.log('FAIL -', name, '\n     ', e.message);
  }
}

const INVITE_ID = '9c1f5b3a-0000-4000-8000-000000000001';
const PROPERTY_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_ID = 'bbbbbbbb-1111-1111-1111-111111111111';

function inviteRow(overrides) {
  return Object.assign({
    id: INVITE_ID,
    property_id: PROPERTY_ID,
    role: 'inspector',
    expires_at: null,
    revoked_at: null,
    max_uses: null,
    use_count: 0,
    properties: { name: 'コスモ六甲ガーデンフォート' },
  }, overrides || {});
}

await test('SUPABASE_SERVICE_ROLE_KEY未設定時は500とわかりやすいエラーを返す', async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const req = { method: 'GET', query: { id: INVITE_ID } };
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 500);
  assert.ok(res.body.error.includes('SUPABASE_SERVICE_ROLE_KEY'));
});

process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-dummy';

await test('GET: idが未指定なら400', async () => {
  const req = { method: 'GET', query: {} };
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 400);
});

await test('GET: idの形式が不正なら400', async () => {
  const req = { method: 'GET', query: { id: 'not-a-uuid' } };
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 400);
});

await test('GET: 存在しないidなら404', async () => {
  global.fetch = async () => ({ ok: true, status: 200, json: async () => [] });
  const req = { method: 'GET', query: { id: INVITE_ID } };
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 404);
});

await test('GET: 有効な招待はvalid:trueで物件名・権限が返る', async () => {
  global.fetch = async () => ({ ok: true, status: 200, json: async () => [inviteRow()] });
  const req = { method: 'GET', query: { id: INVITE_ID } };
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.result.valid, true);
  assert.strictEqual(res.body.result.propertyName, 'コスモ六甲ガーデンフォート');
  assert.strictEqual(res.body.result.roleLabel, '点検員');
});

await test('GET: 無効化済み(revoked_at)の招待はvalid:falseで理由が返る', async () => {
  global.fetch = async () => ({ ok: true, status: 200, json: async () => [inviteRow({ revoked_at: '2026-07-17T00:00:00.000Z' })] });
  const req = { method: 'GET', query: { id: INVITE_ID } };
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.body.result.valid, false);
  assert.ok(res.body.result.reason.includes('無効化'));
});

await test('GET: 有効期限切れの招待はvalid:falseで理由が返る', async () => {
  global.fetch = async () => ({ ok: true, status: 200, json: async () => [inviteRow({ expires_at: '2000-01-01T00:00:00.000Z' })] });
  const req = { method: 'GET', query: { id: INVITE_ID } };
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.body.result.valid, false);
  assert.ok(res.body.result.reason.includes('有効期限が切れています'));
});

await test('GET: 利用上限に達した招待はvalid:falseで理由が返る', async () => {
  global.fetch = async () => ({ ok: true, status: 200, json: async () => [inviteRow({ max_uses: 3, use_count: 3 })] });
  const req = { method: 'GET', query: { id: INVITE_ID } };
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.body.result.valid, false);
  assert.ok(res.body.result.reason.includes('上限'));
});

await test('POST: idが未指定なら400', async () => {
  const req = { method: 'POST', query: {}, body: {}, headers: {} };
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 400);
});

await test('POST: Authorizationヘッダが無ければ401', async () => {
  const req = { method: 'POST', query: { id: INVITE_ID }, body: {}, headers: {} };
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 401);
});

await test('POST: トークン検証(/auth/v1/user)が失敗すれば401', async () => {
  global.fetch = async (url) => {
    if (String(url).includes('/auth/v1/user')) return { ok: false, status: 401, json: async () => ({}) };
    throw new Error('unexpected fetch: ' + url);
  };
  const req = { method: 'POST', query: { id: INVITE_ID }, body: {}, headers: { authorization: 'Bearer bad-token' } };
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 401);
});

await test('POST: 招待が存在しなければ404', async () => {
  global.fetch = async (url) => {
    if (String(url).includes('/auth/v1/user')) return { ok: true, status: 200, json: async () => ({ id: USER_ID, email: 'a@example.com' }) };
    if (String(url).includes('/rest/v1/property_invites')) return { ok: true, status: 200, json: async () => [] };
    throw new Error('unexpected fetch: ' + url);
  };
  const req = { method: 'POST', query: { id: INVITE_ID }, body: {}, headers: { authorization: 'Bearer good-token' } };
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 404);
});

await test('POST: 無効化済みの招待は400でブロックされ、property_membersへのinsertは一切行われない', async () => {
  let insertCalled = false;
  global.fetch = async (url, opts) => {
    if (String(url).includes('/auth/v1/user')) return { ok: true, status: 200, json: async () => ({ id: USER_ID, email: 'a@example.com' }) };
    if (String(url).includes('/rest/v1/property_invites') && (!opts || opts.method === undefined)) {
      return { ok: true, status: 200, json: async () => [inviteRow({ revoked_at: '2026-07-17T00:00:00.000Z' })] };
    }
    if (String(url).includes('/rest/v1/property_members') && opts && opts.method === 'POST') {
      insertCalled = true;
      return { ok: true, status: 201, json: async () => [{}] };
    }
    throw new Error('unexpected fetch: ' + url + ' ' + JSON.stringify(opts));
  };
  const req = { method: 'POST', query: { id: INVITE_ID }, body: {}, headers: { authorization: 'Bearer good-token' } };
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 400);
  assert.ok(res.body.error.includes('無効化'));
  assert.strictEqual(insertCalled, false, '無効な招待ではproperty_membersへのinsertが呼ばれてはいけない(脆弱性の再発防止)');
});

await test('POST: 有効な招待・未参加のユーザー → property_membersへinsertされ、use_countが加算される', async () => {
  let insertBody = null;
  let insertHeaders = null;
  let patchBody = null;
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, status: 200, json: async () => ({ id: USER_ID, email: 'a@example.com' }) };
    if (u.includes('/rest/v1/property_invites') && u.includes('id=eq.') && (!opts || !opts.method)) {
      return { ok: true, status: 200, json: async () => [inviteRow()] };
    }
    if (u.includes('/rest/v1/property_members') && u.includes('user_id=eq.') && (!opts || !opts.method)) {
      return { ok: true, status: 200, json: async () => [] }; // まだメンバーではない
    }
    if (u.includes('/rest/v1/property_members') && opts && opts.method === 'POST') {
      insertBody = JSON.parse(opts.body);
      insertHeaders = opts.headers;
      return { ok: true, status: 201, json: async () => [insertBody] };
    }
    if (u.includes('/rest/v1/property_invites') && opts && opts.method === 'PATCH') {
      patchBody = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => [{}] };
    }
    throw new Error('unexpected fetch: ' + u + ' ' + JSON.stringify(opts));
  };
  const req = { method: 'POST', query: { id: INVITE_ID }, body: {}, headers: { authorization: 'Bearer good-token' } };
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.result.alreadyMember, false);
  assert.strictEqual(res.body.result.propertyName, 'コスモ六甲ガーデンフォート');
  assert.strictEqual(res.body.result.role, 'inspector');
  assert.deepStrictEqual(insertBody, { property_id: PROPERTY_ID, user_id: USER_ID, role: 'inspector' });
  // Service Role Keyを使ってサーバー側から書き込んでいること(anon keyではないこと)を確認
  assert.ok(insertHeaders.Authorization.includes('test-service-role-key-dummy'));
  assert.deepStrictEqual(patchBody, { use_count: 1 });
});

await test('POST: 既にメンバーの場合はinsertせず、alreadyMember:trueを返す(重複参加・二重タップ対策)', async () => {
  let insertCalled = false;
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, status: 200, json: async () => ({ id: USER_ID, email: 'a@example.com' }) };
    if (u.includes('/rest/v1/property_invites') && (!opts || !opts.method)) return { ok: true, status: 200, json: async () => [inviteRow()] };
    if (u.includes('/rest/v1/property_members') && u.includes('user_id=eq.') && (!opts || !opts.method)) {
      return { ok: true, status: 200, json: async () => [{ role: 'admin' }] }; // 既にadminとして参加済み
    }
    if (u.includes('/rest/v1/property_members') && opts && opts.method === 'POST') {
      insertCalled = true;
      return { ok: true, status: 201, json: async () => [{}] };
    }
    throw new Error('unexpected fetch: ' + u + ' ' + JSON.stringify(opts));
  };
  const req = { method: 'POST', query: { id: INVITE_ID }, body: {}, headers: { authorization: 'Bearer good-token' } };
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.result.alreadyMember, true);
  assert.strictEqual(res.body.result.role, 'admin'); // 既存の役割がそのまま返る(招待のroleで上書きしない)
  assert.strictEqual(insertCalled, false);
});

await test('未対応メソッド(DELETE等)は405', async () => {
  const req = { method: 'DELETE', query: { id: INVITE_ID }, headers: {} };
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 405);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
