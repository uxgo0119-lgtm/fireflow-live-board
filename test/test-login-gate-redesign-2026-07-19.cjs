// 2026-07-19 追加: 最初のログイン画面の全面刷新に対する回帰テスト。
// 背景: ユーザーから添付されたSUNTORY+のログイン画面を参考に、「真ん中にロゴが現れて
// 下に青塗り潰しで文字は白でLive Boardに新規登録、その下に同じくアカウントでログイン、
// 背景は全て白背景」というご指示があった。以前はグレー背景+白カード+最初からメール/
// パスワード欄が並ぶデザインだったが、白背景いっぱいに「中央のアイコン+ロゴ」→
// 「新規登録/ログインの2つの塗りつぶしボタン」だけを表示するランディング画面(#sbGateLanding)
// に差し替え、実際の入力フォーム(#sbGateForm、従来のメール/パスワード欄とロジックをそのまま
// 流用)はボタンタップ後の2画面目に分離した。
//
// supabase-integration.js自体はCDN(jsdelivr)からsupabase-jsを読み込む設計だが、サンドボックス
// からは外部ネットワークへ到達できないため、test_supabase_integration_offline.cjsと同じ手法
// (page.routeでCDNリクエストをスタブに差し替え、window.supabase.createClientを偽のクライアント
// に差し替える)でログインゲートを実際に表示させて検証する。
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

const HARNESS_HTML = `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<script src="supabase-integration.js"></script>
</head><body></body></html>`;

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-logingate-test-'));
  const harnessPath = path.join(tmpDir, 'harness.html');
  fs.writeFileSync(harnessPath, HARNESS_HTML);
  fs.copyFileSync(path.resolve(__dirname, '..', 'supabase-integration.js'), path.join(tmpDir, 'supabase-integration.js'));

  await page.addInitScript(() => {
    function chain(resolver) {
      var obj = {
        select: function () { return obj; }, eq: function () { return obj; }, upsert: function () { return obj; },
        insert: function () { return obj; }, maybeSingle: function () { return obj; }, single: function () { return obj; },
        is: function () { return obj; }, like: function () { return obj; },
        then: function (resolve, reject) { return Promise.resolve().then(resolver).then(resolve, reject); },
      };
      return obj;
    }
    window.__fakeSb = {
      // 未ログイン状態を模す(session:null) -> ログインゲートが表示されるはず
      auth: {
        getSession: async function () { return { data: { session: null } }; },
        signInWithPassword: async function (args) {
          window.__lastAuthCall = { type: 'login', args: args };
          return { data: { user: { id: 'u1', email: args.email }, session: { access_token: 'tok' } }, error: null };
        },
        signUp: async function (args) {
          window.__lastAuthCall = { type: 'signup', args: args };
          return { data: { user: { id: 'u2', email: args.email, identities: [{}] }, session: { access_token: 'tok' } }, error: null };
        },
      },
      channel: function () { return { on: function () { return this; }, subscribe: function () {} }; },
      from: function () { return chain(async function () { return { data: null, error: null }; }); },
    };
    window.supabase = { createClient: function () { return window.__fakeSb; } };
  });
  await page.route('**/cdn.jsdelivr.net/npm/@supabase/supabase-js@2/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* stub: window.supabase already defined */' });
  });

  await page.goto('file://' + harnessPath);
  await page.waitForSelector('#sbLoginGate', { timeout: 5000 });

  // ---- 背景が全て白背景になっている ----
  const gateBg = await page.evaluate(() => getComputedStyle(document.getElementById('sbLoginGate')).backgroundColor);
  assert(gateBg === 'rgb(255, 255, 255)', 'ログイン画面全体の背景が白になっている (got: ' + gateBg + ')');

  // ---- ランディング画面: アイコン+ロゴが中央に、下に2つの青塗りつぶしボタンがある ----
  const landingVisible = await page.locator('#sbGateLanding').isVisible();
  assert(landingVisible, '最初はランディング画面(アイコン+ロゴ+2ボタン)が表示されている');
  const formHiddenAtStart = !(await page.locator('#sbGateForm').isVisible());
  assert(formHiddenAtStart, '最初はメール/パスワード入力フォームは非表示になっている');

  const iconVisible = await page.locator('#sbGateLanding img').first().isVisible();
  assert(iconVisible, 'ランディング画面にアイコン画像が表示されている');
  const imgCount = await page.locator('#sbGateLanding img').count();
  assert(imgCount === 2, 'ランディング画面にアイコンとワードマークロゴの2つの画像がある (got: ' + imgCount + ')');

  // ---- 2026-07-19追加: 「アイコンの白枠はいらない」の指示により、白い角丸四角の背景・
  //      box-shadowを削除し、キューブの形そのまま(背景透明)のアイコンに差し替えた ----
  const iconStyle = await page.evaluate(() => {
    var img = document.querySelector('#sbGateLanding img');
    var cs = getComputedStyle(img);
    return { boxShadow: cs.boxShadow, borderRadius: cs.borderRadius, backgroundColor: cs.backgroundColor };
  });
  assert(iconStyle.boxShadow === 'none', 'アイコン画像にbox-shadow(白い枠のような縁取り)が付いていない (got: ' + iconStyle.boxShadow + ')');

  const signupBtnText = (await page.locator('#sbGoSignup').textContent()).trim();
  assert(signupBtnText === 'Live Boardに新規登録', '新規登録ボタンの文言が指定通り「Live Boardに新規登録」になっている (got: ' + signupBtnText + ')');
  const loginBtnText = (await page.locator('#sbGoLogin').textContent()).trim();
  assert(loginBtnText === 'アカウントでログイン', 'ログインボタンの文言が指定通り「アカウントでログイン」になっている (got: ' + loginBtnText + ')');

  const btnStyles = await page.evaluate(() => {
    var s1 = getComputedStyle(document.getElementById('sbGoSignup'));
    var s2 = getComputedStyle(document.getElementById('sbGoLogin'));
    return {
      bg1: s1.backgroundColor, color1: s1.color,
      bg2: s2.backgroundColor, color2: s2.color,
    };
  });
  assert(btnStyles.bg1 === 'rgb(0, 122, 254)', '「Live Boardに新規登録」ボタンが青塗りつぶしになっている (got: ' + btnStyles.bg1 + ')');
  assert(btnStyles.color1 === 'rgb(255, 255, 255)', '「Live Boardに新規登録」ボタンの文字が白になっている (got: ' + btnStyles.color1 + ')');
  assert(btnStyles.bg2 === 'rgb(0, 122, 254)', '「アカウントでログイン」ボタンも同じく青塗りつぶしになっている (got: ' + btnStyles.bg2 + ')');
  assert(btnStyles.color2 === 'rgb(255, 255, 255)', '「アカウントでログイン」ボタンの文字も白になっている (got: ' + btnStyles.color2 + ')');
  assert(btnStyles.bg1 === btnStyles.bg2 && btnStyles.color1 === btnStyles.color2, '2つのボタンが同じ見た目(色)で統一されている(「その下に同じく」の指示通り)');

  // ---- 「アカウントでログイン」タップでフォーム画面に遷移し、ログインモードになる ----
  await page.locator('#sbGoLogin').click();
  await page.waitForTimeout(150);
  assert(!(await page.locator('#sbGateLanding').isVisible()), 'ログインボタンタップでランディング画面が隠れる');
  assert(await page.locator('#sbGateForm').isVisible(), 'ログインボタンタップでフォーム画面が表示される');
  const loginModeBtnText = (await page.locator('#sbLoginBtn').textContent()).trim();
  assert(loginModeBtnText === 'ログイン', '「アカウントでログイン」から遷移すると送信ボタンが「ログイン」モードになっている (got: ' + loginModeBtnText + ')');

  // ---- 「← 戻る」でランディング画面に戻れる ----
  await page.locator('#sbGateBack').click();
  await page.waitForTimeout(150);
  assert(await page.locator('#sbGateLanding').isVisible(), '「← 戻る」でランディング画面に戻る');
  assert(!(await page.locator('#sbGateForm').isVisible()), '「← 戻る」でフォーム画面が隠れる');

  // ---- 「Live Boardに新規登録」タップで新規登録モードのフォームに遷移する ----
  await page.locator('#sbGoSignup').click();
  await page.waitForTimeout(150);
  assert(await page.locator('#sbGateForm').isVisible(), '新規登録ボタンタップでフォーム画面が表示される');
  const signupModeBtnText = (await page.locator('#sbLoginBtn').textContent()).trim();
  assert(signupModeBtnText === '新規登録', '「Live Boardに新規登録」から遷移すると送信ボタンが「新規登録」モードになっている (got: ' + signupModeBtnText + ')');

  // ---- 実際に新規登録を実行すると、従来通りsb.auth.signUpが正しい引数で呼ばれ、ログイン完了する ----
  await page.fill('#sbEmail', 'newuser@example.com');
  await page.fill('#sbPassword', 'testpass123');
  await page.locator('#sbLoginBtn').click();
  await page.waitForFunction(() => !document.getElementById('sbLoginGate'), { timeout: 5000 });
  const lastCall = await page.evaluate(() => window.__lastAuthCall);
  assert(lastCall.type === 'signup', '新規登録ボタン経由でのフォーム送信で、実際にsb.auth.signUp()が呼ばれる(既存ロジックは維持されている)');
  assert(lastCall.args.email === 'newuser@example.com', '入力したメールアドレスが正しく渡っている');
  const gateRemoved = await page.evaluate(() => !document.getElementById('sbLoginGate'));
  assert(gateRemoved, '認証成功後、ログインゲート自体がDOMから削除される(従来通り)');

  const relevantErrors = errors.filter((e) => e.indexOf('cdn.jsdelivr.net') === -1);
  if (relevantErrors.length) {
    console.log('--- unexpected page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL LOGIN-GATE-REDESIGN ASSERTIONS PASSED');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
