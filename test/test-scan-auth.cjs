// /api/scan-time-request 呼び出しに認証トークンを付けるようにした修正(2026-07-17)の検証。
// 背景: サーバー側(api/scan-time-request.js)にAuthorizationヘッダの検証を追加したが、
// LB本体(index.html)側がトークンを送っていなければ意味が無い。ここではLB側が
// window.getAccessToken()の有無に応じて正しくヘッダを付け外しすることを確認する。
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

// 1x1の白PNG(テスト用のダミー画像)
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'index.html');

  var capturedHeaders = [];
  await page.route('**/api/scan-time-request', async (route) => {
    capturedHeaders.push(route.request().headers());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ result: { room_number: '101', symbol: '', time: '', time_end: '', note: '', name: '' } }),
    });
  });

  await page.goto(fileUrl);
  await page.waitForSelector('.room-card', { timeout: 10000 });

  const tmpDir = fs.mkdtempSync('/tmp/scan-auth-test-');
  const tmpImgPath = path.join(tmpDir, 'test.png');
  fs.writeFileSync(tmpImgPath, Buffer.from(TINY_PNG_BASE64, 'base64'));

  // ---- シナリオ1: window.getAccessToken が無い(Supabase未接続)場合でも、
  //      エラーにならずContent-Typeだけ付けてリクエストできること ----
  await page.locator('#stampScanInput').setInputFiles(tmpImgPath);
  await page.waitForTimeout(500);
  assert(capturedHeaders.length === 1, 'window.getAccessToken未定義でも/api/scan-time-requestへのリクエストは送信される');
  assert(!('authorization' in capturedHeaders[0]), 'window.getAccessToken未定義の場合、Authorizationヘッダは付かない(サーバー側の401に任せる設計)');
  assert(capturedHeaders[0]['content-type'] === 'application/json', 'Content-Typeヘッダは引き続き送られる');

  // ---- シナリオ2: window.getAccessToken がトークンを返す場合、
  //      Authorizationヘッダとして正しく付与されること ----
  await page.evaluate(() => {
    window.getAccessToken = async function () { return 'test-access-token-xyz'; };
  });
  capturedHeaders = [];
  await page.locator('#stampScanInput').setInputFiles(tmpImgPath);
  await page.waitForTimeout(500);
  assert(capturedHeaders.length === 1, 'ログイン中の状態でも/api/scan-time-requestへのリクエストは送信される');
  assert(capturedHeaders[0]['authorization'] === 'Bearer test-access-token-xyz',
    'window.getAccessToken()が返すトークンがAuthorization: Bearer ヘッダとして送られる (got: ' + capturedHeaders[0]['authorization'] + ')');

  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log('\nALL SCAN-REQUEST AUTH HEADER ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
