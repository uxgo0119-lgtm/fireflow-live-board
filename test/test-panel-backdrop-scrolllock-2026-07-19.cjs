// 2026-07-19 追加バグ修正の回帰テスト。
// 背景: ユーザーから送られた画面録画で、「ホーム画面のスクロールが動いて画面は固まっている」
// 現象が確認された。これは同日先に修正した#signFullscreenOverlay(サイン全画面)固有の問題
// ではなく、通常の部屋パネル(#panel、showBackdrop/hideBackdrop経由で開閉するモーダル全般)で
// 起きていた。#panelはoverflow-y:autoで自身の内容をスクロールできるが、内容が画面に収まって
// いる場合や、スクロールが端に達した状態でさらにスワイプすると、スクロールが裏のbody
// (通常のドキュメントスクロール)へ伝播し、パネル自体は動かないのに背後のホーム画面(部屋
// カード一覧)だけが動いて見える。
// 対策: showBackdrop/hideBackdropに、参照カウント方式のbodyスクロールロック
// (lockBodyScrollForModal/unlockBodyScrollForModal、body自体をposition:fixedにする一般的な
// 手法)を組み込んだ。これにより#panelを含むバックドロップ付きの全モーダル(写真パネル・設備
// パネル・進捗詳細パネル等も含む)で、表示中は背景がスクロールしなくなる。
const { chromium } = require('playwright');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(fileUrl);
  await page.waitForSelector('.room-card', { timeout: 10000 });

  // ---- ホーム画面をスクロールした状態を作る ----
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(100);
  const homeScrollBefore = await page.evaluate(() => window.scrollY);
  assert(homeScrollBefore > 100, '事前準備としてホーム画面を下にスクロールした状態を作った (got scrollY: ' + homeScrollBefore + ')');

  // ---- #panel(通常の部屋パネル)を開くと、背景スクロールがロックされる ----
  await page.locator('.room-card').first().click();
  await page.waitForTimeout(300);
  const lockedStyle = await page.evaluate(() => ({ position: document.body.style.position, overflow: document.body.style.overflow }));
  assert(lockedStyle.position === 'fixed', '部屋パネルを開くと、bodyがposition:fixedになり背景スクロールがロックされる (got: ' + lockedStyle.position + ')');
  assert(lockedStyle.overflow === 'hidden', '部屋パネルを開くと、bodyのoverflowがhiddenになる (got: ' + lockedStyle.overflow + ')');

  // ---- パネル表示中にホイール操作をしても、裏のホーム画面(window.scrollY)が動かない ----
  // (動画で確認された「ホーム画面のスクロールが動いて画面は固まっている」の再現・修正確認)
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(150);
  const scrollWhilePanelOpen = await page.evaluate(() => window.scrollY);
  assert(scrollWhilePanelOpen === 0, '部屋パネル表示中にホイール操作をしても、裏のホーム画面がスクロールされない (got scrollY: ' + scrollWhilePanelOpen + ')');

  // パネル自体は正常に表示されたまま(意図せず閉じたりしていない)
  const panelStillVisible = await page.locator('#panel').isVisible();
  assert(panelStillVisible, '背景スクロールをロックしても、部屋パネル自体は引き続き正常に表示されている');

  // ---- パネルを閉じると、ロックが解除されて元のスクロール位置に戻る ----
  await page.locator('#closePanel').click();
  await page.waitForTimeout(200);
  const unlockedStyle = await page.evaluate(() => ({ position: document.body.style.position, overflow: document.body.style.overflow }));
  assert(unlockedStyle.position === '', '部屋パネルを閉じると、bodyのposition固定が解除される (got: "' + unlockedStyle.position + '")');
  assert(unlockedStyle.overflow === '', '部屋パネルを閉じると、bodyのoverflowロックが解除される (got: "' + unlockedStyle.overflow + '")');
  const scrollAfterClose = await page.evaluate(() => window.scrollY);
  assert(Math.abs(scrollAfterClose - homeScrollBefore) < 5, '部屋パネルを閉じると、開く前のスクロール位置に復元される (got: ' + scrollAfterClose + ', expected近く: ' + homeScrollBefore + ')');

  // ---- 写真パネル(#photoPanel、別系統のモーダル)でも同様にロックされることを確認 ----
  await page.locator('#navPhotos').click();
  await page.waitForTimeout(300);
  const albumCard = page.locator('.album-room-card').first();
  if (await albumCard.count() > 0) {
    await albumCard.click();
    await page.waitForTimeout(300);
    const photoLockedStyle = await page.evaluate(() => document.body.style.position);
    assert(photoLockedStyle === 'fixed', '写真パネルを開いても同じ共通ロックが働き、bodyがposition:fixedになる (got: ' + photoLockedStyle + ')');
    await page.locator('#closePhotoPanel').click().catch(() => {});
    await page.waitForTimeout(200);
    const photoUnlockedStyle = await page.evaluate(() => document.body.style.position);
    assert(photoUnlockedStyle === '', '写真パネルを閉じると、ロックが解除される (got: "' + photoUnlockedStyle + '")');
  } else {
    console.log('SKIP: 写真パネルの検証(該当する部屋カードが見当たらないため)');
  }

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'Not implemented', 'exitFullscreen', 'requestFullscreen', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL PANEL-BACKDROP SCROLL-LOCK ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
