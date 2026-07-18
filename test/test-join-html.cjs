// join.html (招待リンクからの物件参加ページ) をPlaywrightで実際に開き、
// /api/accept-invite と supabase-js(CDN)をスタブして一連のUI操作を検証する。
// supabase-jsはCDN読み込みのため、このサンドボックスの回線状況に依存させないよう
// page.routeでCDNへのリクエスト自体を最小限のフェイク実装に差し替えている。
const { chromium } = require('playwright');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

const SAMPLE_INVITE_ID = '9c1f5b3a-0000-4000-8000-000000000001';

async function withFakeSupabase(page) {
  await page.addInitScript(() => {
    window.__sessions = null; // テストごとにセットする
    window.__signInResponse = { data: { session: null, user: null }, error: null };
    window.__signUpResponse = { data: { session: null, user: null }, error: null };
    window.__lastSignIn = null;
    window.__lastSignUp = null;
    window.__authImpl = {
      getSession: async function () { return { data: { session: window.__sessions } }; },
      signInWithPassword: async function (creds) {
        window.__lastSignIn = creds;
        if (window.__signInResponse.data.session) window.__sessions = window.__signInResponse.data.session;
        return window.__signInResponse;
      },
      signUp: async function (creds) {
        window.__lastSignUp = creds;
        if (window.__signUpResponse.data.session) window.__sessions = window.__signUpResponse.data.session;
        return window.__signUpResponse;
      },
      signOut: async function () { window.__sessions = null; },
    };
  });
  await page.route('**/cdn.jsdelivr.net/npm/@supabase/supabase-js@2/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: 'window.supabase = { createClient: function () { return { auth: window.__authImpl }; } };',
    });
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // ---- シナリオ1: invite パラメータが無い ----
  {
    const page = await browser.newPage();
    await withFakeSupabase(page);
    await page.goto('file://' + path.resolve(__dirname, '../join.html'));
    await page.waitForSelector('#fatalErrorBlock', { state: 'visible', timeout: 5000 });
    const desc = await page.locator('#fatalErrorDesc').textContent();
    assert(desc.indexOf('正しくありません') !== -1, 'inviteパラメータが無い場合はエラー画面 (got: ' + desc + ')');
    await page.close();
  }

  // ---- シナリオ2: 無効な招待(失効済みなど) ----
  {
    const page = await browser.newPage();
    await withFakeSupabase(page);
    await page.route('**/api/accept-invite**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ result: { propertyName: 'コスモ六甲ガーデンフォート', role: 'inspector', roleLabel: '点検員', valid: false, reason: 'この招待リンクは発行者によって無効化されています。新しいリンクを発行してもらってください。' } }),
        });
      }
    });
    await page.goto('file://' + path.resolve(__dirname, '../join.html') + '?invite=' + SAMPLE_INVITE_ID);
    await page.waitForSelector('#mainBlock', { state: 'visible', timeout: 5000 });
    const propertyName = await page.locator('#fPropertyName').textContent();
    assert(propertyName === 'コスモ六甲ガーデンフォート', '無効な招待でも物件名は表示される (got: ' + propertyName + ')');
    const errVisible = await page.locator('#errorBox').isVisible();
    assert(errVisible, '無効な招待の場合はエラーメッセージが表示される');
    const errText = await page.locator('#errorBox').textContent();
    assert(errText.indexOf('無効化されています') !== -1, '無効化理由が表示される (got: ' + errText + ')');
    const authVisible = await page.locator('#authBlock').isVisible();
    assert(!authVisible, '無効な招待の場合はログインフォームが表示されない(参加できない)');
    await page.close();
  }

  // ---- シナリオ3: 有効な招待・未ログイン → ログインして参加する ----
  {
    const page = await browser.newPage();
    await withFakeSupabase(page);
    let getCallCount = 0;
    let postAuthHeader = null;
    await page.route('**/api/accept-invite**', async (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        getCallCount++;
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ result: { propertyName: 'コスモ六甲ガーデンフォート', role: 'inspector', roleLabel: '点検員', valid: true, reason: null } }),
        });
      } else if (req.method() === 'POST') {
        postAuthHeader = req.headers()['authorization'];
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ result: { propertyId: 'prop-1', propertyName: 'コスモ六甲ガーデンフォート', role: 'inspector', roleLabel: '点検員', alreadyMember: false } }),
        });
      }
    });

    await page.goto('file://' + path.resolve(__dirname, '../join.html') + '?invite=' + SAMPLE_INVITE_ID);
    await page.waitForSelector('#mainBlock', { state: 'visible', timeout: 5000 });
    assert(getCallCount === 1, 'ページ読み込み時にGET /api/accept-invite が1回呼ばれる');
    const roleLabel = await page.locator('#fRoleLabel').textContent();
    assert(roleLabel === '点検員', '権限ラベルが表示される (got: ' + roleLabel + ')');

    const authVisible = await page.locator('#authBlock').isVisible();
    assert(authVisible, '未ログインの場合はログインフォームが表示される');
    const sessionVisible = await page.locator('#sessionBlock').isVisible();
    assert(!sessionVisible, '未ログインの場合はセッション表示ブロックは非表示');

    await page.evaluate(() => {
      window.__signInResponse = {
        data: { session: { access_token: 'fake-token-abc', user: { id: 'user-1', email: 'inspector@example.com' } }, user: { id: 'user-1', email: 'inspector@example.com' } },
        error: null,
      };
    });
    await page.locator('#authEmail').fill('inspector@example.com');
    await page.locator('#authPassword').fill('password123');
    await page.locator('#authBtn').click();
    await page.waitForSelector('#joinedBlock', { state: 'visible', timeout: 5000 });

    const lastSignIn = await page.evaluate(() => window.__lastSignIn);
    assert(lastSignIn.email === 'inspector@example.com' && lastSignIn.password === 'password123', 'signInWithPasswordが正しい認証情報で呼ばれる');
    assert(postAuthHeader === 'Bearer fake-token-abc', 'POST /api/accept-invite にAuthorization: Bearer <アクセストークン>が付与される (got: ' + postAuthHeader + ')');

    const joinedTitle = await page.locator('#joinedTitle').textContent();
    assert(joinedTitle === '参加が完了しました', '参加成功時のタイトル (got: ' + joinedTitle + ')');
    const joinedDesc = await page.locator('#joinedDesc').textContent();
    assert(joinedDesc.indexOf('コスモ六甲ガーデンフォート') !== -1 && joinedDesc.indexOf('点検員') !== -1, '参加完了メッセージに物件名・権限が含まれる (got: ' + joinedDesc + ')');
    const openBtnHref = await page.locator('a.open-btn').getAttribute('href');
    assert(openBtnHref === 'index.html', '「Live Boardを開く」ボタンがindex.htmlへのリンクになっている');
    await page.close();
  }

  // ---- シナリオ4: 既にログイン済みセッションがある場合、そのまま「この物件に参加する」ボタンが使える ----
  {
    const page = await browser.newPage();
    await withFakeSupabase(page);
    let postAuthHeader = null;
    await page.route('**/api/accept-invite**', async (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ result: { propertyName: 'コスモ六甲ガーデンフォート', role: 'admin', roleLabel: '管理者', valid: true, reason: null } }),
        });
      } else if (req.method() === 'POST') {
        postAuthHeader = req.headers()['authorization'];
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ result: { propertyId: 'prop-1', propertyName: 'コスモ六甲ガーデンフォート', role: 'admin', roleLabel: '管理者', alreadyMember: true } }),
        });
      }
    });
    await page.addInitScript(() => {
      window.__sessions = { access_token: 'existing-token-xyz', user: { id: 'user-2', email: 'already@example.com' } };
    });
    await page.goto('file://' + path.resolve(__dirname, '../join.html') + '?invite=' + SAMPLE_INVITE_ID);
    await page.waitForSelector('#mainBlock', { state: 'visible', timeout: 5000 });

    const sessionVisible = await page.locator('#sessionBlock').isVisible();
    assert(sessionVisible, '既にログイン済みの場合はセッション表示ブロックが見える');
    const authVisible = await page.locator('#authBlock').isVisible();
    assert(!authVisible, '既にログイン済みの場合はログインフォームは表示されない');
    const loggedInAsText = await page.locator('#fLoggedInAs').textContent();
    assert(loggedInAsText.indexOf('already@example.com') !== -1, 'ログイン中のメールアドレスが表示される (got: ' + loggedInAsText + ')');

    await page.locator('#joinBtnLoggedIn').click();
    await page.waitForSelector('#joinedBlock', { state: 'visible', timeout: 5000 });
    assert(postAuthHeader === 'Bearer existing-token-xyz', '既存セッションのトークンでPOSTされる (got: ' + postAuthHeader + ')');
    const joinedTitle = await page.locator('#joinedTitle').textContent();
    assert(joinedTitle === '既に参加済みです', 'alreadyMember:trueの場合は「既に参加済みです」と表示される (got: ' + joinedTitle + ')');
    await page.close();
  }

  // ---- シナリオ5: 新規登録で、既に登録済みのメールアドレスだった場合(identities空配列) ----
  {
    const page = await browser.newPage();
    await withFakeSupabase(page);
    await page.route('**/api/accept-invite**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ result: { propertyName: 'コスモ六甲ガーデンフォート', role: 'inspector', roleLabel: '点検員', valid: true, reason: null } }),
        });
      }
    });
    await page.goto('file://' + path.resolve(__dirname, '../join.html') + '?invite=' + SAMPLE_INVITE_ID);
    await page.waitForSelector('#mainBlock', { state: 'visible', timeout: 5000 });

    await page.locator('#authToggle').click(); // 新規登録モードへ切り替え
    const toggleLabel = await page.locator('#authBtn').textContent();
    assert(toggleLabel === '新規登録して参加する', '新規登録モードに切り替わる (got: ' + toggleLabel + ')');

    await page.evaluate(() => {
      window.__signUpResponse = {
        data: { session: null, user: { id: 'user-3', email: 'existing@example.com', identities: [] } },
        error: null,
      };
    });
    await page.locator('#authEmail').fill('existing@example.com');
    await page.locator('#authPassword').fill('password123');
    await page.locator('#authBtn').click();
    await page.waitForTimeout(300);

    const errText = await page.locator('#errorBox').textContent();
    assert(errText.indexOf('既に登録されています') !== -1, '登録済みメールアドレスの場合は専用のエラーメッセージが表示される (got: ' + errText + ')');
    const toggleLabelAfter = await page.locator('#authBtn').textContent();
    assert(toggleLabelAfter === 'ログインして参加する', 'ログインモードに自動的に切り替わる (got: ' + toggleLabelAfter + ')');
    const joinedVisible = await page.locator('#joinedBlock').isVisible();
    assert(!joinedVisible, 'まだ参加は完了していない(joinedBlockは非表示のまま)');
    await page.close();
  }

  console.log('\nALL join.html ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
