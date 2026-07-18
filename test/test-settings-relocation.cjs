// 「データを入れる」「全データをリセット」を上部ナビから物件情報タブの「設定情報」欄へ
// 移動した変更(2026-07-17)の検証。
// 背景: 上部ナビゲーションは点検中どの画面からも常に見えているため、隣接する
// ロック・拡大・文字サイズのアイコンと一緒に並んでいる「全データをリセット」(ゴミ箱)や
// 「データを入れる」(インポート)を、点検中の操作で誤ってタップしてしまう危険があった。
// 物件情報タブを開くという1手間を挟む場所(設定情報欄)に移すことで、意図しないタップを防ぐ。
// ボタン自体のid(resetDataBtn/uploadToggle)や既存の動作(確認ダイアログ等)は変更していない。
const { chromium } = require('playwright');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(fileUrl);
  await page.waitForSelector('.room-card', { timeout: 10000 });

  // 1. 上部ナビには、もう「全データをリセット」「データを入れる」が無いこと
  //    (誤操作に強いロック・拡大・文字サイズの3つだけが残っている)
  const topbarIds = await page.evaluate(() => Array.from(document.querySelectorAll('.topbar-right button')).map((b) => b.id));
  assert(topbarIds.indexOf('resetDataBtn') === -1, '上部ナビに#resetDataBtn(全データをリセット)がもう無い');
  assert(topbarIds.indexOf('uploadToggle') === -1, '上部ナビに#uploadToggle(データを入れる)がもう無い');
  assert(JSON.stringify(topbarIds) === JSON.stringify(['lockScreenBtn', 'gridExpandToggle', 'fontSizeToggle']),
    '上部ナビにはロック・拡大・文字サイズの3つだけが残っている (got: ' + JSON.stringify(topbarIds) + ')');

  // 部屋の一覧画面(ホーム)からは、そもそも#resetDataBtn/#uploadToggleが見えない・押せないこと
  const resetVisibleFromHome = await page.locator('#resetDataBtn').isVisible().catch(() => false);
  assert(!resetVisibleFromHome, 'ホーム画面では#resetDataBtnは表示されていない(誤タップできない)');
  const uploadVisibleFromHome = await page.locator('#uploadToggle').isVisible().catch(() => false);
  assert(!uploadVisibleFromHome, 'ホーム画面では#uploadToggleは表示されていない(誤タップできない)');

  // 2. 物件情報タブ(#navList)を開くと、「設定情報」欄にこの2つのボタンが表示されること
  await page.locator('#navList').click();
  await page.waitForTimeout(200);

  const sectionTitles = await page.locator('#listView .section-title').allTextContents();
  assert(sectionTitles.indexOf('設定情報') !== -1, '物件情報タブ内に「設定情報」セクションが追加されている (got: ' + JSON.stringify(sectionTitles) + ')');

  const uploadVisibleInSettings = await page.locator('#uploadToggle').isVisible();
  assert(uploadVisibleInSettings, '設定情報欄に「物件データを読み込む」ボタンが表示される');
  const resetVisibleInSettings = await page.locator('#resetDataBtn').isVisible();
  assert(resetVisibleInSettings, '設定情報欄に「全データをリセット」ボタンが表示される');
  const resetButtonText = await page.locator('#resetDataBtn').textContent();
  assert(resetButtonText.indexOf('全データをリセット') !== -1, '「全データをリセット」ボタンのラベルが分かりやすく表示されている');

  // 警告文言(「元に戻せない操作です」)がリセットボタンの近くに表示されていること
  const listViewText = await page.locator('#listView').textContent();
  assert(listViewText.indexOf('元に戻せない') !== -1, '「全データをリセット」の近くに、元に戻せない操作である旨の注意書きがある');

  // 3. 動作自体は従来通り機能すること(移動しただけで壊れていないことの確認)
  //    3a. 「データを入れる」→ アップロード選択ダイアログが開く
  await page.locator('#uploadToggle').click();
  await page.waitForTimeout(150);
  const uploadDialogVisible = await page.locator('#uploadChoiceDialog').isVisible();
  assert(uploadDialogVisible, '「物件データを読み込む」タップで#uploadChoiceDialogが開く(移動後も機能する)');
  await page.locator('#uploadChoiceCancel').click();
  await page.waitForTimeout(150);

  //    3b. 「全データをリセット」→ 確認ダイアログ(confirm)が出て、キャンセルすればデータは消えない
  let dialogMessage = null;
  page.once('dialog', async (dialog) => {
    dialogMessage = dialog.message();
    await dialog.dismiss(); // キャンセル操作をエミュレート
  });
  await page.locator('#resetDataBtn').click();
  await page.waitForTimeout(150);
  assert(dialogMessage && dialogMessage.indexOf('元に戻せません') !== -1,
    '「全データをリセット」タップで、従来通りconfirm()の警告ダイアログが表示される(移動後も機能する) (got: ' + dialogMessage + ')');
  const roomCardCountAfterCancel = await page.locator('.room-card').count();
  assert(roomCardCountAfterCancel > 0, 'キャンセルした場合、データは削除されず部屋一覧はそのまま残っている');

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL SETTINGS-RELOCATION ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
