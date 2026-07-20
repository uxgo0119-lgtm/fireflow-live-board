// 2026-07-19 追加: 「Lのアイコンをもっと大きく」「点検報告書/点検希望時間連絡票の各名前の
// 前にダウンロードアイコンをつけ、文字は物件データを読み込むぐらいの太さと大きさにする」
// 「その際、重複するので物件情報の設定情報の表示を削除する」の3点の回帰テスト。
//
// 背景:
// ① 上部ナビ左端のキューブアイコン(.brand-icon)のheightを36px→44pxにさらに拡大した。
// ② 上部ナビの読み込みアイコン(#uploadDataToggle)をタップすると開く#uploadChoiceDialogの
//    「点検報告書」「点検希望時間連絡票」ボタンに、ダウンロードアイコンと、物件情報タブに
//    かつてあった「物件データを読み込む」ボタン(.settings-toggle-btn)と同じ太さ・丸み・
//    サイズを適用した。
// ③ ②により、上部ナビの#uploadDataToggleと、物件情報タブの「設定情報」欄にあった
//    #uploadToggle(全く同じダイアログを開くだけ)が完全に重複したため、「設定情報」欄
//    自体を撤去した。「全データをリセット」(#resetDataBtn)は、ユーザーに確認の上、
//    上部ナビの歯車メニュー(#settingsMenuPopup、画面ロック・文字サイズと同じ場所)へ
//    移動した。ボタンのid・確認ダイアログの動作自体は変更していない。
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

  // ---- ① Live Boardアイコン(.brand-icon)がさらに大きくなっている ----
  const brandIconHeight = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.brand-icon')).height));
  assert(brandIconHeight >= 44, 'Live Boardアイコン(.brand-icon)の高さがさらに大きくなっている(44px以上) (got: ' + brandIconHeight + ')');

  // ---- ② uploadChoiceDialogの2つの選択肢に、アイコン+太字の見た目が付いている ----
  await page.locator('#uploadDataToggle').click();
  await page.waitForTimeout(150);
  assert(await page.locator('#uploadChoiceDialog').isVisible(), '上部ナビの読み込みアイコンで#uploadChoiceDialogが開く');

  const reportBtn = await page.evaluate(() => {
    var b = document.getElementById('uploadChoiceReport');
    var cs = getComputedStyle(b);
    return { hasIcon: !!b.querySelector('svg'), fontWeight: cs.fontWeight, fontSize: cs.fontSize, height: cs.height, bg: cs.backgroundColor, radius: cs.borderRadius };
  });
  assert(reportBtn.hasIcon, '「点検報告書」ボタンにダウンロードアイコンが付いている');
  assert(parseFloat(reportBtn.fontWeight) >= 700, '「点検報告書」ボタンの文字が太字(700以上)になっている (got: ' + reportBtn.fontWeight + ')');
  assert(parseFloat(reportBtn.radius) >= 20, '「点検報告書」ボタンが「物件データを読み込む」相当の丸いピル形状になっている (got: ' + reportBtn.radius + ')');
  assert(reportBtn.bg === 'rgb(0, 122, 254)', '「点検報告書」ボタンがブランドブルーで塗りつぶされている (got: ' + reportBtn.bg + ')');

  const stampBtn = await page.evaluate(() => {
    var b = document.getElementById('uploadChoiceStamp');
    var cs = getComputedStyle(b);
    return { hasIcon: !!b.querySelector('svg'), fontWeight: cs.fontWeight, bg: cs.backgroundColor };
  });
  assert(stampBtn.hasIcon, '「点検希望時間連絡票」ボタンにもダウンロードアイコンが付いている');
  assert(parseFloat(stampBtn.fontWeight) >= 700, '「点検希望時間連絡票」ボタンの文字も太字になっている (got: ' + stampBtn.fontWeight + ')');
  assert(stampBtn.bg === 'rgb(0, 122, 254)', '「点検希望時間連絡票」ボタンもブランドブルーで塗りつぶされている (got: ' + stampBtn.bg + ')');

  await page.locator('#uploadChoiceCancel').click();
  await page.waitForTimeout(150);

  // ---- ③ 物件情報タブの「設定情報」欄は撤去され、読み込みは上部ナビに一本化されている ----
  await page.locator('#navList').click();
  await page.waitForTimeout(200);
  const sectionTitles = await page.locator('#listView .section-title').allTextContents();
  assert(sectionTitles.indexOf('設定情報') === -1, '物件情報タブの「設定情報」欄は撤去されている (got: ' + JSON.stringify(sectionTitles) + ')');
  assert((await page.locator('#uploadToggle').count()) === 0, '物件情報タブ側の#uploadToggleはもう存在しない');
  assert(sectionTitles[sectionTitles.length - 1] === 'Report Flow', 'Report Flowが引き続き物件情報タブの一番下にある (got: ' + JSON.stringify(sectionTitles) + ')');

  // ---- ③ 「全データをリセット」は上部ナビの歯車メニューに移動している ----
  await page.locator('#navHome').click();
  await page.waitForTimeout(150);
  const resetInTopbarIcons = await page.evaluate(() => Array.from(document.querySelectorAll('.topbar-right button')).map((b) => b.id));
  assert(resetInTopbarIcons.indexOf('resetDataBtn') === -1, '「全データをリセット」は上部ナビのアイコンとしては並んでいない(危険なため)');

  await page.locator('#settingsToggle').click();
  await page.waitForTimeout(150);
  assert(await page.locator('#resetDataBtn').isVisible(), '「全データをリセット」が歯車メニュー内に表示される');
  assert(await page.locator('#settingsMenuLockBtn').isVisible(), '歯車メニューの他の項目(画面ロック)も引き続き機能している');
  const fontOptionLabels = await page.evaluate(() => Array.from(document.querySelectorAll('#settingsMenuPopup .font-size-option[data-scale]')).map((b) => b.textContent.replace('✓', '').trim()));
  assert(JSON.stringify(fontOptionLabels) === JSON.stringify(['標準', '大', '特大']), '歯車メニューの文字サイズ選択肢も引き続き機能している (got: ' + JSON.stringify(fontOptionLabels) + ')');

  // リセットボタンをタップすると、メニューが閉じて確認ダイアログが開く(誤操作防止は維持)
  await page.locator('#resetDataBtn').click();
  await page.waitForTimeout(150);
  assert(!(await page.locator('#settingsMenuPopup').isVisible()), 'リセットボタンタップで歯車メニューは閉じる');
  assert(await page.locator('#resetDataConfirmDialog').isVisible(), 'リセットボタンタップでアプリ内蔵の確認ダイアログが開く(移動後も機能は変わらない)');
  await page.locator('#resetDataConfirmCancel').click();
  await page.waitForTimeout(150);

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'Not implemented', 'exitFullscreen', 'requestFullscreen', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL BRANDICON-BIGGER / UPLOADICON-STYLED / SETTINGS-CONSOLIDATION ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
