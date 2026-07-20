// 「データを入れる」「全データをリセット」の置き場所の変遷の回帰テスト。
//
// 履歴:
// 1. (2026-07-17) 上部ナビから物件情報タブの「設定情報」欄へ移動(点検中の誤タップ防止)。
// 2. (2026-07-19) 「誤作動が心配なのと、下なのでわかりにくい」というご指摘を受け、危険度で
//    分離。「物件データを読み込む」は選択ダイアログを経由するため危険度が低いとして上部ナビに
//    #uploadDataToggleとして復活。「全データをリセット」は物件情報タブの「設定情報」欄に
//    残しつつ、確認方法自体をアプリ内蔵ダイアログ(#resetDataConfirmDialog、「リセット」の
//    文字入力必須)に強化。
// 3. (2026-07-19再修正、本テスト) 「REPORT FLOWのアイコンアプリ」に続くご指示で、
//    「点検報告書」「点検希望時間連絡票」の読み込みボタンに専用のアイコン・太字スタイルを
//    与えたことで、上部ナビの#uploadDataToggle(#uploadChoiceDialogを開く)と、物件情報
//    タブの「設定情報」欄にあった#uploadToggle(同じダイアログを開くだけ)が完全に重複した
//    ため、「設定情報」欄自体を撤去。「全データをリセット」の行き先をユーザーに確認した結果、
//    上部ナビの歯車メニュー(#settingsMenuPopup、画面ロック・文字サイズと同じ場所)へ移動する
//    ことになった。ボタン自体のid(resetDataBtn)や既存の動作(確認ダイアログ等)は変更していない。
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

  // 1. 上部ナビには、もう「全データをリセット」がアイコン単体としては無いこと(危険度が高いため)。
  //    一方「データを入れる」は#uploadDataToggleとして上部ナビにあり続けている(危険度が低いため)。
  const topbarIds = await page.evaluate(() => Array.from(document.querySelectorAll('.topbar-right button')).map((b) => b.id));
  assert(topbarIds.indexOf('resetDataBtn') === -1, '上部ナビのアイコンとして#resetDataBtn(全データをリセット)は並んでいない(危険なので据え置き)');
  assert(topbarIds.indexOf('uploadDataToggle') !== -1, '上部ナビに#uploadDataToggle(物件データを読み込む)がある (got: ' + JSON.stringify(topbarIds) + ')');
  assert(JSON.stringify(topbarIds) === JSON.stringify(['uploadDataToggle', 'gridExpandToggle', 'settingsToggle']),
    '上部ナビは読み込み・拡大・設定(歯車)の3つになっている (got: ' + JSON.stringify(topbarIds) + ')');

  // ホーム画面からは、そもそも#resetDataBtnが見えない・押せないこと(歯車メニューを開くまで隠れている)
  const resetVisibleFromHome = await page.locator('#resetDataBtn').isVisible().catch(() => false);
  assert(!resetVisibleFromHome, 'ホーム画面では#resetDataBtnは(歯車メニューを開くまで)表示されていない(誤タップできない)');
  // 上部ナビの#uploadDataToggleはホーム画面でも常に見えている(見つけやすさのため)
  const uploadDataToggleVisibleFromHome = await page.locator('#uploadDataToggle').isVisible().catch(() => false);
  assert(uploadDataToggleVisibleFromHome, 'ホーム画面でも上部ナビの#uploadDataToggleは常に見えている(見つけやすさ優先)');

  // 2. 物件情報タブ(#navList)を開いても、もう「設定情報」欄自体が存在しないこと
  //    (読み込み・リセットの重複した入り口だったため撤去された)
  await page.locator('#navList').click();
  await page.waitForTimeout(200);

  const sectionTitles = await page.locator('#listView .section-title').allTextContents();
  assert(sectionTitles.indexOf('設定情報') === -1, '物件情報タブ内の「設定情報」セクションは撤去されている (got: ' + JSON.stringify(sectionTitles) + ')');
  assert((await page.locator('#uploadToggle').count()) === 0, '物件情報タブ側の#uploadToggleはもう存在しない');

  // 3. 「全データをリセット」は、上部ナビの歯車メニュー(#settingsMenuPopup)の中にあること
  await page.locator('#navHome').click();
  await page.waitForTimeout(150);
  await page.locator('#settingsToggle').click();
  await page.waitForTimeout(150);
  const resetVisibleInGearMenu = await page.locator('#resetDataBtn').isVisible();
  assert(resetVisibleInGearMenu, '歯車メニューに「全データをリセット」ボタンが表示される');
  const resetButtonText = await page.locator('#resetDataBtn').textContent();
  assert(resetButtonText.indexOf('全データをリセット') !== -1, '「全データをリセット」ボタンのラベルが分かりやすく表示されている');
  // 危険な操作であることが色(枠・文字)で分かるようになっていること
  const resetBorderColor = await page.locator('#resetDataBtn').evaluate((el) => getComputedStyle(el).borderColor);
  assert(resetBorderColor !== 'rgba(0, 0, 0, 0)', '「全データをリセット」ボタンには色付きの枠があり、他の選択肢と見分けがつく (got: ' + resetBorderColor + ')');

  // 4. 動作自体は従来通り機能すること(移動しただけで壊れていないことの確認)
  //    4a. 「データを入れる」→ アップロード選択ダイアログが開く(上部ナビ経由)
  await page.locator('#settingsMenuCancelBtn').click();
  await page.waitForTimeout(150);
  await page.locator('#uploadDataToggle').click();
  await page.waitForTimeout(150);
  const uploadDialogVisible = await page.locator('#uploadChoiceDialog').isVisible();
  assert(uploadDialogVisible, '「物件データを読み込む」タップで#uploadChoiceDialogが開く(移動後も機能する)');
  await page.locator('#uploadChoiceCancel').click();
  await page.waitForTimeout(150);

  //    4b. 「全データをリセット」→ アプリ内蔵の確認ダイアログが出て、キャンセルすればデータは消えない
  await page.locator('#settingsToggle').click();
  await page.waitForTimeout(150);
  await page.locator('#resetDataBtn').click();
  await page.waitForTimeout(150);
  assert(!(await page.locator('#settingsMenuPopup').isVisible()), '「全データをリセット」タップで歯車メニュー自体は閉じる');
  assert(await page.locator('#resetDataConfirmDialog').isVisible(), '「全データをリセット」タップでアプリ内蔵の確認ダイアログ(#resetDataConfirmDialog)が表示される');
  const okDisabledInitially = await page.locator('#resetDataConfirmOk').isDisabled();
  assert(okDisabledInitially, '「リセット」と入力するまで実行ボタンは押せない(誤タップ防止)');
  await page.locator('#resetDataConfirmCancel').click();
  await page.waitForTimeout(150);
  assert(!(await page.locator('#resetDataConfirmDialog').isVisible()), 'キャンセルするとダイアログが閉じる');
  const roomCardCountAfterCancel = await page.locator('.room-card').count();
  assert(roomCardCountAfterCancel > 0, 'キャンセルした場合、データは削除されず部屋一覧はそのまま残っている');

  //    4c. 「リセット」と正しく入力すれば実行ボタンが有効になり、実際に削除される
  await page.locator('#settingsToggle').click();
  await page.waitForTimeout(150);
  await page.locator('#resetDataBtn').click();
  await page.waitForTimeout(150);
  await page.locator('#resetDataConfirmInput').fill('ちがう文字');
  await page.waitForTimeout(100);
  assert(await page.locator('#resetDataConfirmOk').isDisabled(), '「リセット」以外の文字列では実行ボタンが有効にならない');
  await page.locator('#resetDataConfirmInput').fill('リセット');
  await page.waitForTimeout(100);
  assert(!(await page.locator('#resetDataConfirmOk').isDisabled()), '「リセット」と正しく入力すると実行ボタンが有効になる');
  await page.locator('#resetDataConfirmOk').click();
  await page.waitForTimeout(300);
  assert(!(await page.locator('#resetDataConfirmDialog').isVisible()), '実行後、ダイアログが閉じる');

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
