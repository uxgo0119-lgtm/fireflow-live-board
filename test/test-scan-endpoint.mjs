// scan-time-request.js の動作をNode単体でテストするスクリプト。
// 実際のVercel環境を使わず、req/resとglobal.fetchを差し替えて検証する。
//
// 2026-07-17更新：以前はこのエンドポイントに認証チェックが一切無く、URLさえ分かれば
// 誰でも(ログインしていない第三者でも)叩けてAnthropic APIの利用料を消費させられる
// 状態だった。今回追加したaccept-invite.js同様のトークン検証(/auth/v1/user)と、
// ペイロードサイズ上限の挙動を検証するテストを追加した。
import assert from 'node:assert';
import handler from '../api/scan-time-request.js';

function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
  };
  return res;
}

function anthropicTextResponse(jsonPayload) {
  return {
    content: [{ type: 'text', text: JSON.stringify(jsonPayload) }],
  };
}

const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
function authedReq(overrides) {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer valid-token' },
    ...overrides,
  };
}

// 有効なアクセストークン検証(/auth/v1/user)を返しつつ、Anthropic APIへの呼び出しも
// 併せて処理するfetchモックを作るヘルパー。
function fetchMockWithValidAuth(anthropicHandler) {
  return async (url, opts) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) {
      return { ok: true, status: 200, json: async () => ({ id: USER_ID, email: 'inspector@example.com' }) };
    }
    return anthropicHandler(url, opts);
  };
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

const originalFetch = global.fetch;
process.env.ANTHROPIC_API_KEY = 'sk-ant-test-dummy-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-dummy-key';

await test('GETメソッドは405', async () => {
  const req = { method: 'GET', body: {} };
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 405);
});

await test('Authorizationヘッダが無い場合は401(修正前は誰でも通過できた)', async () => {
  const req = { method: 'POST', body: { mode: 'single', mediaType: 'image/jpeg', data: 'AAAA' } };
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 401);
  assert.ok(res.body.error.includes('ログイン'));
});

await test('Bearer形式でないAuthorizationヘッダは401', async () => {
  const req = { method: 'POST', headers: { authorization: 'not-bearer-format' }, body: { mode: 'single', mediaType: 'image/jpeg', data: 'AAAA' } };
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 401);
});

await test('トークン検証(/auth/v1/user)が失敗すれば401', async () => {
  global.fetch = async (url) => {
    if (String(url).includes('/auth/v1/user')) return { ok: false, status: 401, json: async () => ({}) };
    throw new Error('この時点でAnthropic APIへは呼ばれないはず');
  };
  const req = authedReq({ body: { mode: 'single', mediaType: 'image/jpeg', data: 'AAAA' } });
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 401);
});

await test('SUPABASE_SERVICE_ROLE_KEY未設定時は500とわかりやすいエラーを返す', async () => {
  const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const req = authedReq({ body: { mode: 'single', mediaType: 'image/jpeg', data: 'AAAA' } });
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 500);
  assert.ok(res.body.error.includes('SUPABASE_SERVICE_ROLE_KEY'));
  process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
});

await test('認証OKでもAPIキー未設定時は500とわかりやすいエラーを返す', async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  global.fetch = fetchMockWithValidAuth(() => { throw new Error('Anthropicへは呼ばれないはず'); });
  const req = authedReq({ body: { mode: 'single', mediaType: 'image/jpeg', data: 'AAAA' } });
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 500);
  assert.ok(res.body.error.includes('ANTHROPIC_API_KEY'));
  process.env.ANTHROPIC_API_KEY = saved;
});

await test('mode未指定は400(認証OK後)', async () => {
  global.fetch = fetchMockWithValidAuth(() => { throw new Error('Anthropicへは呼ばれないはず'); });
  const req = authedReq({ body: { mediaType: 'image/jpeg', data: 'AAAA' } });
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 400);
});

await test('single: 許容上限を超えるdataは413(修正前は上限が無かった)', async () => {
  global.fetch = fetchMockWithValidAuth(() => { throw new Error('Anthropicへは呼ばれないはず'); });
  const req = authedReq({ body: { mode: 'single', mediaType: 'image/jpeg', data: 'A'.repeat(8 * 1000 * 1000 + 1) } });
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 413);
});

await test('bulk: single用の上限は超えるがbulk用の上限内ならAnthropicまで到達する', async () => {
  global.fetch = fetchMockWithValidAuth(async () => ({
    ok: true,
    status: 200,
    json: async () => anthropicTextResponse([{ room_number: '101', symbol: '', time: '', time_end: '', note: '', name: '' }]),
  }));
  const req = authedReq({ body: { mode: 'bulk', mediaType: 'application/pdf', data: 'A'.repeat(9 * 1000 * 1000) } });
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 200);
});

await test('single: 正常系で room_number/symbol/time/time_end/note/name を返す', async () => {
  global.fetch = fetchMockWithValidAuth(async (url, opts) => {
    assert.strictEqual(url, 'https://api.anthropic.com/v1/messages');
    assert.strictEqual(opts.headers['x-api-key'], 'sk-ant-test-dummy-key');
    const sentBody = JSON.parse(opts.body);
    assert.strictEqual(sentBody.model, 'claude-sonnet-4-6');
    assert.strictEqual(sentBody.messages[0].content[0].type, 'image');
    return {
      ok: true,
      status: 200,
      json: async () => anthropicTextResponse({
        room_number: '217', symbol: '', time: '09:00', time_end: '10:45', note: '', name: '中村',
      }),
    };
  });
  const req = authedReq({ body: { mode: 'single', mediaType: 'image/jpeg', data: 'AAAA' } });
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.result.room_number, '217');
  assert.strictEqual(res.body.result.time_end, '10:45');
  assert.strictEqual(res.body.result.name, '中村');
});

await test('bulk: 配列レスポンスを正しく透過する。content typeはdocument', async () => {
  global.fetch = fetchMockWithValidAuth(async (url, opts) => {
    const sentBody = JSON.parse(opts.body);
    assert.strictEqual(sentBody.messages[0].content[0].type, 'document');
    assert.strictEqual(sentBody.max_tokens, 16000);
    return {
      ok: true,
      status: 200,
      json: async () => anthropicTextResponse([
        { room_number: '109', symbol: '', time: '09:15', time_end: '10:15', note: '', name: '小林' },
        { room_number: '115', symbol: '', time: '09:15', time_end: '', note: 'できるだけ早く', name: '渡辺' },
      ]),
    };
  });
  const req = authedReq({ body: { mode: 'bulk', mediaType: 'application/pdf', data: 'AAAA' } });
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.result.length, 2);
  assert.strictEqual(res.body.result[1].note, 'できるだけ早く');
});

await test('bulk: モデルが配列以外を返したら502エラー', async () => {
  global.fetch = fetchMockWithValidAuth(async () => ({
    ok: true,
    status: 200,
    json: async () => anthropicTextResponse({ not: 'an array' }),
  }));
  const req = authedReq({ body: { mode: 'bulk', mediaType: 'application/pdf', data: 'AAAA' } });
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 502);
});

await test('モデルの返答がJSONとして壊れていたら502エラー', async () => {
  global.fetch = fetchMockWithValidAuth(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: 'text', text: 'これはJSONではありません{{{' }] }),
  }));
  const req = authedReq({ body: { mode: 'single', mediaType: 'image/jpeg', data: 'AAAA' } });
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 502);
});

await test('Anthropic側がエラーを返したら502で内容を転送', async () => {
  global.fetch = fetchMockWithValidAuth(async () => ({
    ok: false,
    status: 401,
    json: async () => ({ type: 'error', error: { message: 'invalid x-api-key' } }),
  }));
  const req = authedReq({ body: { mode: 'single', mediaType: 'image/jpeg', data: 'AAAA' } });
  const res = makeRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 502);
  assert.ok(res.body.error.includes('invalid x-api-key'));
});

global.fetch = originalFetch;

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
