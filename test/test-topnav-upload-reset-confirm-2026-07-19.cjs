// 2026-07-19 追加: 「全体拡大モードを横に7つに変更」に続くご指摘「（設定情報の読み込み・
// リセットボタンが）誤作動が心配なのと、下なのでわかりにくい」への対応の回帰テスト。
//
// 背景:
// 「物件データを読み込む」「全データをリセット」は、2026-07-17に点検中の誤タップ防止の
// ため上部ナビから物件情報タブの「設定情報」欄(一番下)へ移動していた。しかし今回、
// 「下にあると分かりにくい」というご指摘を受けたため、2つのボタンを危険度で分けて
// 再設計した(ユーザーに提示した4案から「C: 危険度で読み込み/リセットを分離」を採用)。
//
// ・「物件データを読み込む」は選択ダイアログ(#uploadChoiceDialog)を経由するため誤タップ
//   してもすぐには実行されず危険度が低い。そのため上部ナビに#uploadDataToggleとして
//   復活させ、見つけやすくした。設定情報欄側の#uploadToggleもそのまま残っており、
//   どちらからでも同じダイアログを開ける。
// ・「全データをリセット」は取り返しがつかないため、あえて上部ナビには戻さず設定情報欄の
//   ままにしつつ、確認方法自体を強化した。従来はブラウザ標準のwindow.confirm()(環境に
//   よっては表示されずボタンが反応しないように見えることがある、点検日程削除等で既に
//   判明していた問題と同じ穴)を使っていたが、アプリ内蔵の確認ダイアログ
//   (#resetDataConfirmDialog)に置き換え、「リセット」という文字を正しく入力しないと
//   実行ボタンが押せないようにして、誤タップだけでは絶対に実行されないようにした。
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
  await page.goto(fileUrl);
  await page.waitForSelector('.room-card', { timeout: 10000 });
  await page.waitForTimeout(1200); // スプラッシュが完全に消えるのを待つ

  // ---- 上部ナビに「物件データを読み込む」アイコンが復活し、常に見えている ----
  const uploadIconVisible = await page.locator('#uploadDataToggle').isVisible();
  assert(uploadIconVisible, 'ホーム画面から常に、上部ナビの「物件データを読み込む」アイコン(#uploadDataToggle)が見えている');
  await page.locator('#uploadDataToggle').click();
  await page.waitForTimeout(150);
  assert(await page.locator('#uploadChoiceDialog').isVisible(), '上部ナビのアイコンをタップすると、読み込み方法の選択ダイアログが開く');
  await page.locator('#uploadChoiceCancel').click();
  await page.waitForTimeout(150);
  assert(!(await page.locator('#uploadChoiceDialog').isVisible()), 'キャンセルするとダイアログが閉じる');

  // ---- 「全データをリセット」は引き続き上部ナビのアイコンとして直接は並んでいない ----
  // [2026-07-19再修正] 「REPORT FLOWのアイコンアプリ」に続くご指示で、物件情報タブの
  // 「設定情報」欄自体が撤去され、「全データをリセット」は上部ナビの歯車メニュー
  // (#settingsMenuPopup、⚙アイコンの先)へ移動した。危険な操作のため、上部ナビに
  // アイコン単体としては引き続き並んでいない(1タップでは実行できない)。
  const resetInTopbar = await page.evaluate(() => Array.from(document.querySelectorAll('.topbar-right button')).map((b) => b.id)).then((ids) => ids.indexOf('resetDataBtn') !== -1);
  assert(!resetInTopbar, '「全データをリセット」は危険なため上部ナビのアイコンとしては並んでいない');

  await page.locator('#settingsToggle').click();
  await page.waitForTimeout(200);
  const resetVisibleInSettings = await page.locator('#resetDataBtn').isVisible();
  assert(resetVisibleInSettings, '「全データをリセット」は上部ナビの歯車メニューから操作できる');

  // ---- 「全データをリセット」タップで、window.confirm()ではなくアプリ内蔵ダイアログが開く ----
  let nativeDialogFired = false;
  page.once('dialog', async (dialog) => { nativeDialogFired = true; await dialog.dismiss(); });
  await page.locator('#resetDataBtn').click();
  await page.waitForTimeout(200);
  assert(!nativeDialogFired, 'ブラウザ標準のwindow.confirm()はもう使われていない(環境によって出ないことがある問題を回避)');
  assert(await page.locator('#resetDataConfirmDialog').isVisible(), 'アプリ内蔵の確認ダイアログ(#resetDataConfirmDialog)が表示される');

  // ---- 「リセット」と正しく入力しないと実行ボタンが押せない(誤タップ防止) ----
  const okDisabledInitially = await page.locator('#resetDataConfirmOk').isDisabled();
  assert(okDisabledInitially, 'ダイアログを開いた直後は実行ボタンが無効になっている');

  await page.locator('#resetDataConfirmInput').fill('りせっと'); // ひらがな等、違う文字列
  await page.waitForTimeout(100);
  assert(await page.locator('#resetDataConfirmOk').isDisabled(), '「リセット」と完全一致しない入力では実行ボタンが有効にならない');

  await page.locator('#resetDataConfirmInput').fill('リセット');
  await page.waitForTimeout(100);
  assert(!(await page.locator('#resetDataConfirmOk').isDisabled()), '「リセット」と正しく入力すると実行ボタンが有効になる');

  // キャンセルすればデータは消えない
  await page.locator('#resetDataConfirmCancel').click();
  await page.waitForTimeout(150);
  assert(!(await page.locator('#resetDataConfirmDialog').isVisible()), 'キャンセルするとダイアログが閉じる');
  const roomCountAfterCancel = await page.locator('.room-card').count();
  assert(roomCountAfterCancel > 0, 'キャンセルした場合、部屋データは削除されず残っている (got: ' + roomCountAfterCancel + '件)');

  // ---- 実際に「リセット」と入力して実行すると、データが削除される ----
  // 2026-07-19追記: #resetDataBtnタップ時に歯車メニュー(#settingsMenuPopup)自体は
  // 閉じる仕様のため、再度タップする前にもう一度歯車アイコンからメニューを開き直す。
  await page.locator('#settingsToggle').click();
  await page.waitForTimeout(150);
  await page.locator('#resetDataBtn').click();
  await page.waitForTimeout(150);
  await page.locator('#resetDataConfirmInput').fill('リセット');
  await page.waitForTimeout(100);
  await page.locator('#resetDataConfirmOk').click();
  await page.waitForTimeout(300);
  assert(!(await page.locator('#resetDataConfirmDialog').isVisible()), '実行後、ダイアログが閉じる');
  const toastVisible = await page.locator('text=全てのデータをリセットしました').isVisible().catch(() => false);
  assert(toastVisible, '実行後、完了を知らせるトーストが表示される');

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'Not implemented', 'exitFullscreen', 'requestFullscreen', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL TOPNAV-UPLOAD-ICON / RESET-CONFIRM-DIALOG ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
