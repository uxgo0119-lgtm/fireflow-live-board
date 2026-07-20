// 2026-07-19 追加: 「スプラッシュ画面は1秒→2秒に変更（LB、RFも同様）」「表示モードを
// 全体の時の文字サイズ大きくする。全体拡大も同様。タブレットでみた場合に全体と全体拡大の
// 文字が小さ過ぎる」「サイン画面で未点検ボタンをタップしても画面が切り替わるようにして
// ください」の3点の回帰テスト(Live Board側)。RF(report_flow_tool.html)側のスプラッシュは
// test_app_icon_2026-07-19.jsと同じディレクトリ(/tmp/rf_tool/)に別途追加している。
//
// 背景:
// ① 起動スプラッシュ(#appSplash)のフォールバック自動非表示タイマーを1000ms→2000msに
//    延長した。
// ② 表示モード「全体」(body.enlarged、5列)と「全体拡大」(body.overview、7列)の部屋番号・
//    時刻ラベル・階見出しの文字サイズを引き上げた。カードは可変サイズ(fr単位)のため、
//    タブレット等の広い画面ではカードに対して文字が相対的に小さく見えてしまっていた。
// ③ サイン画面の「未点検に戻す」(#markUndo)ボタンは、これまでクリックしても同じ部屋
//    パネルに留まったままだったが、他の操作(キャンセル扱いにする等)と同様に、完了メッセージの
//    トーストを出しつつ一覧画面(グリッド)へ戻るようにした。次の未点検の部屋への自動遷移は
//    行わない(取り消し操作のため)。
const { chromium } = require('playwright');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'index.html');
  const t0 = Date.now();
  await page.goto(fileUrl);

  // ---- ① スプラッシュがおよそ2秒(前回の1秒より長く)表示され続けている ----
  await page.waitForTimeout(500);
  assert(await page.locator('#appSplash').isVisible(), 'スプラッシュはページ読み込み後500ms時点でもまだ表示されている(前回の1秒より長くなった)');
  await page.waitForFunction(() => {
    var el = document.getElementById('appSplash');
    return !el || el.getAttribute('data-hidden') === 'true';
  }, { timeout: 5000 });
  const elapsed = Date.now() - t0;
  assert(elapsed >= 1800, 'スプラッシュがおよそ2秒(1800ms以上)表示されてから隠れる (got: ' + elapsed + 'ms)');
  assert(elapsed < 3500, 'スプラッシュの表示時間が異常に長すぎない (got: ' + elapsed + 'ms)');

  await page.waitForSelector('.room-card', { timeout: 10000 });
  await page.waitForTimeout(300);

  // ---- ② 「全体」「全体拡大」モードの文字サイズが以前より大きくなっている ----
  await page.locator('#gridExpandToggle').click();
  await page.waitForTimeout(150);
  await page.locator('.grid-mode-option[data-mode="enlarged"]').click();
  await page.waitForTimeout(200);
  const enlargedRoomNumSize = await page.evaluate(() => {
    var el = document.querySelector('body.enlarged .room-card .room-num');
    return el ? parseFloat(getComputedStyle(el).fontSize) : null;
  });
  assert(enlargedRoomNumSize !== null, '「全体」モードで部屋番号の要素が見つかる');
  assert(enlargedRoomNumSize > 13, '「全体」モードの部屋番号の文字サイズが以前(13px)より大きくなっている (got: ' + enlargedRoomNumSize + ')');

  await page.locator('#gridExpandToggle').click();
  await page.waitForTimeout(150);
  await page.locator('.grid-mode-option[data-mode="overview"]').click();
  await page.waitForTimeout(200);
  const overviewRoomNumSize = await page.evaluate(() => {
    var el = document.querySelector('body.overview .room-card .room-num');
    return el ? parseFloat(getComputedStyle(el).fontSize) : null;
  });
  assert(overviewRoomNumSize !== null, '「全体拡大」モードで部屋番号の要素が見つかる');
  assert(overviewRoomNumSize > 10, '「全体拡大」モードの部屋番号の文字サイズが以前(10px)より大きくなっている (got: ' + overviewRoomNumSize + ')');

  // 標準モードに戻す
  await page.locator('#gridExpandToggle').click();
  await page.waitForTimeout(150);
  await page.locator('.grid-mode-option[data-mode="normal"]').click();
  await page.waitForTimeout(200);

  // ---- ③ 「未点検に戻す」タップで、パネルが閉じて一覧画面(グリッド)に戻る ----
  const targetRoom = '817';
  await page.locator('.room-card[data-room="' + targetRoom + '"]').click();
  await page.waitForTimeout(200);
  assert(await page.locator('#panel').isVisible(), '部屋パネルが開いている');
  await page.locator('#markUndo').click();
  await page.waitForTimeout(300);
  assert(!(await page.locator('#panel').isVisible()), '「未点検に戻す」タップで部屋パネルが閉じ、一覧画面(グリッド)に戻る');
  const roomStatusClass = await page.evaluate((room) => document.querySelector('.room-card[data-room="' + room + '"]').className, targetRoom);
  assert(roomStatusClass.indexOf('room-card-done') === -1, '対象の部屋は未点検(pending)状態に戻っている (got: ' + roomStatusClass + ')');
  const toastVisible = await page.locator('text=未点検に戻しました').isVisible().catch(() => false);
  assert(toastVisible, '「未点検に戻す」後、完了を知らせるトーストが表示される');

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'Not implemented', 'exitFullscreen', 'requestFullscreen', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL SPLASH-2S / GRIDMODE-FONTSIZE / MARKUNDO-SCREEN-SWITCH ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
