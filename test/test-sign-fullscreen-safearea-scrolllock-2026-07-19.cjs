// 2026-07-19 LB改善3点の回帰テスト。
// ①「サイン画面をいっぱいにした事によって各ボタンが見切れてしまったので画面を少し小さくして
//    見切れないようにしたい」→ .sign-fullscreen-overlayのpaddingにenv(safe-area-inset-*)を
//    加味し(フォールバック14px)、ノッチ・ステータスバー(上)やホームインジケーター(下)に
//    ヘッダー/保存・クリアボタンが重ならないようにした。
// ②「タブレットは見れるがスマホだと見切れる。スクロールするとホーム画面がスクロールされ
//    バグる」→ 小さめのスマホ相当ビューポートでもボタンが画面内に収まることを確認。また、
//    全画面サイン表示中はbody自体をposition:fixedにしてスクロールをロックし(一般的な
//    bodyスクロールロック手法)、閉じたら元のスクロール位置に復元するようにした。
//    「不良箇所の写真の文言は削除」→ サインパネル内の該当ヒント文を削除した(ボタン自体は
//    そのまま残る)。
// ③「不在だった場合の訪問を記録するも青文字に」→ #visitTimesDetailsのsummaryに、
//    「点検希望時刻を変更する」と同じpanel-collapsible-summary-accentクラスを追加した。
const { chromium } = require('playwright');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  // 小さめのスマホ相当ビューポート(iPhone SE程度)で検証する(②の「スマホだと見切れる」再現用)
  const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(fileUrl);
  await page.waitForSelector('.room-card', { timeout: 10000 });

  await page.locator('.room-card').first().click();
  await page.waitForTimeout(300);

  // ---- ②(文言削除) 「不良箇所の写真や記録を追加する場合はこちら」ヒント文が削除されている ----
  const hintCount = await page.locator('text=不良箇所の写真や記録を追加する場合はこちら').count();
  assert(hintCount === 0, 'サインパネル内の「不良箇所の写真や記録を追加する場合はこちら」ヒント文が削除されている (got count: ' + hintCount + ')');
  // ボタン自体は引き続き機能する(巻き添え削除されていない)
  const photoBtnVisible = await page.locator('#openPhotosFromPanel').isVisible();
  assert(photoBtnVisible, '「写真・不良を記録する」ボタンは引き続き表示されている(巻き添え削除されていない)');

  // ---- ③ 「不在だった場合の訪問時刻を記録する」が青文字アクセントになっている ----
  const visitSummaryInfo = await page.evaluate(() => {
    var el = document.querySelector('#visitTimesDetails summary');
    var cs = getComputedStyle(el);
    return { hasAccentClass: el.classList.contains('panel-collapsible-summary-accent'), color: cs.color };
  });
  assert(visitSummaryInfo.hasAccentClass, '「不在だった場合の訪問時刻を記録する」に panel-collapsible-summary-accent クラスが付いている');
  assert(visitSummaryInfo.color === 'rgb(0, 122, 254)', '「不在だった場合の訪問時刻を記録する」の文字色が青(ブランドブルー)になっている (got: ' + visitSummaryInfo.color + ')');
  // 「点検希望時刻を変更する」も引き続き青のまま(巻き添えで消えていない)
  const scheduleSummaryHasAccent = await page.evaluate(() => document.querySelector('#scheduleOverrideDetails summary').classList.contains('panel-collapsible-summary-accent'));
  assert(scheduleSummaryHasAccent, '「点検希望時刻を変更する」の青アクセントも引き続き維持されている');

  // ---- ①② 全画面サイン: 小さいビューポートでもヘッダー・ボタンが画面内に収まる(見切れない) ----
  await page.locator('#signFullscreenBtn').click();
  await page.waitForTimeout(300);
  const overlayVisible = await page.locator('#signFullscreenOverlay').isVisible();
  assert(overlayVisible, '「画面いっぱいに大きく書く」タップで全画面サインオーバーレイが表示される');

  const headerTop = await page.evaluate(() => document.querySelector('.sign-fullscreen-header').getBoundingClientRect().top);
  assert(headerTop >= 10, 'ヘッダー(閉じるボタン等)がステータスバー相当の上端に重ならない位置にある (got top: ' + headerTop + 'px)');

  const layoutInfo = await page.evaluate(() => {
    var saveBtn = document.getElementById('signFullscreenSave');
    var clearBtn = document.getElementById('signFullscreenClear');
    var sr = saveBtn.getBoundingClientRect();
    var cr = clearBtn.getBoundingClientRect();
    return {
      saveBottom: sr.bottom, clearBottom: cr.bottom,
      saveVisible: sr.width > 0 && sr.height > 0,
      clearVisible: cr.width > 0 && cr.height > 0,
      viewportH: window.innerHeight,
    };
  });
  assert(layoutInfo.saveVisible && layoutInfo.clearVisible, '「サインを保存」「クリア」ボタンが両方とも描画されている(サイズ0でない)');
  assert(layoutInfo.saveBottom <= layoutInfo.viewportH, '「サインを保存」ボタンの下端がビューポート内に収まっている(見切れていない) (got bottom: ' + layoutInfo.saveBottom + ', viewportH: ' + layoutInfo.viewportH + ')');
  assert(layoutInfo.clearBottom <= layoutInfo.viewportH, '「クリア」ボタンの下端がビューポート内に収まっている(見切れていない) (got bottom: ' + layoutInfo.clearBottom + ', viewportH: ' + layoutInfo.viewportH + ')');

  // ---- ② 全画面サイン表示中はbodyスクロールがロックされ、裏のホーム画面が連動スクロールしない ----
  const lockStyle = await page.evaluate(() => ({ position: document.body.style.position, overflow: document.body.style.overflow }));
  assert(lockStyle.position === 'fixed', '全画面サイン表示中、bodyがposition:fixedでスクロールロックされている (got: ' + lockStyle.position + ')');
  assert(lockStyle.overflow === 'hidden', '全画面サイン表示中、bodyのoverflowがhiddenになっている (got: ' + lockStyle.overflow + ')');

  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(150);
  const scrollYWhileOpen = await page.evaluate(() => window.scrollY);
  assert(scrollYWhileOpen === 0, '全画面サイン表示中にホイール操作をしても、裏のホーム画面がスクロールされない(バグ修正確認) (got scrollY: ' + scrollYWhileOpen + ')');

  // ---- 2026-07-19追記: 全画面サインは#panel(通常の部屋パネル)を閉じずに重ねて開くことが
  //      あるため、参照カウント方式の共通モーダルロックを使っている。全画面サインだけを閉じても
  //      #panelがまだ開いていれば、背景スクロールのロックは維持されたままになる(意図した動作。
  //      「ホーム画面のスクロールが動いて画面は固まっている」バグの再発防止)。 ----
  await page.locator('#signFullscreenClose').click();
  await page.waitForTimeout(200);
  const overlayHiddenAfterClose = !(await page.locator('#signFullscreenOverlay').isVisible());
  assert(overlayHiddenAfterClose, '閉じるボタンで全画面サインオーバーレイが非表示に戻る');
  const stillLockedStyle = await page.evaluate(() => ({ position: document.body.style.position, overflow: document.body.style.overflow }));
  assert(stillLockedStyle.position === 'fixed', '全画面サインを閉じても、裏の#panelがまだ開いているのでbodyのスクロールロックは維持される (got: ' + stillLockedStyle.position + ')');
  assert(stillLockedStyle.overflow === 'hidden', '全画面サインを閉じても、#panelが開いている間はoverflow:hiddenが維持される (got: ' + stillLockedStyle.overflow + ')');

  // #panel自体も閉じると、そこで初めてスクロールロックが解除される
  await page.locator('#closePanel').click();
  await page.waitForTimeout(200);
  const unlockStyle = await page.evaluate(() => ({ position: document.body.style.position, overflow: document.body.style.overflow }));
  assert(unlockStyle.position === '', '#panelも閉じると、bodyのposition固定が解除される');
  assert(unlockStyle.overflow === '', '#panelも閉じると、bodyのoverflowロックが解除される');

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'Not implemented', 'exitFullscreen', 'requestFullscreen', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL SIGN-FULLSCREEN-SAFEAREA / SCROLL-LOCK / VISIT-ACCENT ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
