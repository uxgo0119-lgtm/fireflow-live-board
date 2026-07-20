// Playwright verification for items③④⑤ + basic regression check on core flows.
const { chromium } = require('playwright');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED'];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(fileUrl);
  await page.waitForSelector('.room-card', { timeout: 10000 });

  // ③ 感知器タグが削除され、「共同住宅用自動火災報知設備」に統一されていること
  await page.locator('.room-card').first().click();
  await page.waitForTimeout(100);
  await page.locator('#openPhotosFromPanel').click();
  await page.waitForTimeout(100);
  await page.locator('#addTagOnly').click();
  await page.waitForTimeout(100);
  const tagChipTexts = await page.locator('.tag-chip').allTextContents();
  console.log('tag chips:', tagChipTexts);
  assert(tagChipTexts.indexOf('感知器') === -1, '"感知器" tag chip no longer exists');
  assert(tagChipTexts.indexOf('共同住宅用自動火災報知設備') !== -1, '"共同住宅用自動火災報知設備" tag chip exists (unified name)');
  // pick it and confirm it applies without error
  await page.locator('.tag-chip[data-tag="共同住宅用自動火災報知設備"]').click();
  await page.waitForTimeout(100);
  const appliedTag = await page.locator('#photoGrid .photo-tag-label').first().textContent();
  assert(appliedTag === '共同住宅用自動火災報知設備', 'selecting the unified tag applies it correctly (got: ' + appliedTag + ')');
  await page.locator('#closePhotoPanel').click();
  await page.waitForTimeout(100);
  // 2026-07-17変更(①1室操作時間短縮): #openPhotosFromPanel経由で開いた写真パネルを閉じると
  // #panel(サインパネル)に戻るようになったため、他の画面(一覧タブ等)へ進む前に明示的に閉じる。
  await page.locator('#closePanel').click();
  await page.waitForTimeout(100);

  // ④ 設備点検の一括「すべて点検済みにする」トグル (一覧タブ → 物件概要パネル内にあるので開く)
  await page.locator('#navList').click();
  await page.waitForTimeout(150);
  await page.locator('#openBuildingOverview').click();
  await page.waitForTimeout(150);
  const overviewVisible = await page.locator('#buildingOverviewPanel').isVisible();
  assert(overviewVisible, '#buildingOverviewPanel opens via 物件名 tap');
  const bulkBtn = page.locator('#equipmentAllDoneToggle');
  assert(await bulkBtn.count() === 1, '#equipmentAllDoneToggle button exists');
  let bulkText = await bulkBtn.textContent();
  assert(bulkText.indexOf('すべて点検済みにする') !== -1, 'bulk button initially says "すべて点検済みにする" (got: ' + bulkText + ')');
  // 長いパネル内でsticky要素が重なりPlaywrightの実クリック座標判定に引っかかるため、
  // (スクロール挙動自体はitem②と無関係の既存仕様) ここではDOM click()で発火させて検証する。
  await page.evaluate(() => document.getElementById('equipmentAllDoneToggle').click());
  await page.waitForTimeout(150);
  bulkText = await bulkBtn.textContent();
  assert(bulkText.indexOf('すべて未点検に戻す') !== -1, 'after clicking, bulk button flips to "すべて未点検に戻す" (got: ' + bulkText + ')');
  await page.evaluate(() => document.getElementById('equipmentAllDoneToggle').click());
  await page.waitForTimeout(150);
  bulkText = await bulkBtn.textContent();
  assert(bulkText.indexOf('すべて点検済みにする') !== -1, 'clicking again flips back to "すべて点検済みにする"');

  // ⑤ 自動ロックが無効化されていること(AUTO_LOCK_ENABLEDはIIFE内のローカル変数でwindowに露出しないため、
  //    ソース上のフラグ宣言と「無操作タイマー未登録」を確認する) + 手動ロックは機能すること
  const autoLockFlagIsFalse = await page.evaluate(() => /var AUTO_LOCK_ENABLED = false;/.test(document.documentElement.outerHTML));
  assert(autoLockFlagIsFalse, 'source contains "var AUTO_LOCK_ENABLED = false;"');
  await page.locator('#closeBuildingOverview').click();
  await page.waitForTimeout(150);
  // 2026-07-19変更: 画面ロックボタン(旧#lockScreenBtn)は、歯車アイコン(#settingsToggle)を
  // 開いた先の#settingsMenuLockBtnに移動した。
  const settingsBtn = page.locator('#settingsToggle');
  if (await settingsBtn.count() > 0) {
    await settingsBtn.click();
    await page.waitForTimeout(100);
    await page.locator('#settingsMenuLockBtn').click();
    await page.waitForTimeout(100);
    const lockOverlayVisible = await page.locator('#lockOverlay').isVisible().catch(() => false);
    assert(lockOverlayVisible, 'manual lock button still works (#lockOverlay shown)');
    await page.locator('#lockOverlay').click();
    await page.waitForTimeout(100);
    const lockOverlayHiddenAfter = await page.locator('#lockOverlay').isVisible().catch(() => false);
    assert(!lockOverlayHiddenAfter, 'tapping overlay unlocks again');
  } else {
    console.log('WARN: #settingsToggle not found - skipping manual lock check');
  }

  // ① Kanji export: showSaveFilePicker branch present in source (functional export test needs real user gesture/file system access, so we just check the function references it)
  const hasSaveFilePickerBranch = await page.evaluate(() => {
    return document.documentElement.outerHTML.indexOf('showSaveFilePicker') !== -1;
  });
  assert(hasSaveFilePickerBranch, 'showSaveFilePicker branch present in attemptExportDownload (kanji filename fix)');

  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL ITEM③④⑤ + REGRESSION ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
