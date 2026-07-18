// 2026-07-17 写真タグの重複解消 と タブ切り替え時のスクロール修正 の回帰テスト。
// ①「写真一覧に共同住宅用自動火災報知設備が2つあるので1つを削除」→ EQUIPMENT_LIST(設備点検の
//    設備名)とPHOTO_TAG_BASE(写真の不良タグ)の両方に「共同住宅用自動火災報知設備」が含まれて
//    いたため、写真一覧のタグ絞り込み・撮影時のクイックタグ選択(#capturePopupTags)の両方で
//    同名のボタンが2つ並んでいた。equipmentTagList()でPHOTO_TAG_BASEに既にある名前を除外し、
//    重複を解消した(設備点検チェックリスト側のEQUIPMENT_LISTそのものは変更していない)。
// ②「ホーム/感知器/写真/物件情報の切り替えでスクロールの動きが連動しているようで不自然」→
//    タブ切り替え時、以前はwindow.scrollTo({top:0, behavior:'smooth'})でスクロール位置を
//    アニメーションさせていたため、切り替えた瞬間は前のタブのスクロール位置がそのまま見えて
//    しまい、そこから上端まで滑っていくように見えていた(タブ同士が繋がって動いているように
//    見える原因)。アニメーションを止め、切り替えと同時に即座に一番上から始まるようにした。
const { chromium } = require('playwright');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 420, height: 700 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(fileUrl);
  await page.waitForSelector('.room-card', { timeout: 10000 });

  // ---- ① 写真一覧のタグ絞り込みに「共同住宅用自動火災報知設備」が1つだけ ----
  await page.locator('#navPhotos').click();
  await page.waitForTimeout(300);
  const albumLabels = await page.evaluate(() => Array.from(document.querySelectorAll('#albumTagFilter .tag-chip')).map((el) => el.textContent.trim()));
  const albumDupCount = albumLabels.filter((l) => l === '共同住宅用自動火災報知設備').length;
  assert(albumDupCount === 1, '写真一覧のタグ絞り込みに「共同住宅用自動火災報知設備」が1つだけ表示されている (got count: ' + albumDupCount + ', all: ' + JSON.stringify(albumLabels) + ')');
  // 他のタグ・設備名は引き続き表示されている(巻き添え削除されていない)
  ['避難器具', '連結送水管（共同住宅用連結送水管）', '防排煙制御設備', '粉末消火設備', '消火器', '降下障害'].forEach((label) => {
    assert(albumLabels.indexOf(label) !== -1, '写真一覧のタグ絞り込みに「' + label + '」は引き続き表示されている');
  });

  // ---- ① 撮影時のクイックタグ選択(#capturePopupTags)にも重複が無いこと ----
  const fs = require('fs');
  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tagdedup-'));
  const tmpImgPath = path.join(tmpDir, 'test.png');
  fs.writeFileSync(tmpImgPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
  await page.locator('#navHome').click();
  await page.waitForTimeout(200);
  await page.locator('#fabCapture').click();
  await page.waitForTimeout(150);
  await page.locator('#fabPhotoInput').setInputFiles(tmpImgPath);
  await page.waitForTimeout(300);
  const captureLabels = await page.evaluate(() => Array.from(document.querySelectorAll('#capturePopupTags .tag-chip')).map((el) => el.textContent.trim()));
  const captureDupCount = captureLabels.filter((l) => l === '共同住宅用自動火災報知設備').length;
  assert(captureLabels.length > 0, '撮影時のクイックタグ選択にタグが表示されている (got: ' + JSON.stringify(captureLabels) + ')');
  assert(captureDupCount === 1, '撮影時のクイックタグ選択にも「共同住宅用自動火災報知設備」が1つだけ表示されている (got count: ' + captureDupCount + ', all: ' + JSON.stringify(captureLabels) + ')');
  await page.locator('#captureCancelBtn').click().catch(() => {});
  fs.rmSync(tmpDir, { recursive: true, force: true });

  // ---- 設備点検チェックリスト(EQUIPMENT_LIST)には引き続き「共同住宅用自動火災報知設備」が
  //      1件だけ通常通り表示されていること(equipmentTagList()の変更がEQUIPMENT_LIST自体に
  //      影響していないことの確認) ----
  await page.locator('#navList').click();
  await page.waitForTimeout(300);
  const equipmentListLabels = await page.evaluate(() => Array.from(document.querySelectorAll('#equipmentList')).length ? Array.from(document.querySelectorAll('#equipmentList [class*="equipment"]')).map((el) => el.textContent) : []);
  const equipmentListText = await page.evaluate(() => document.getElementById('equipmentList') ? document.getElementById('equipmentList').textContent : '');
  const equipCount = (equipmentListText.match(/共同住宅用自動火災報知設備/g) || []).length;
  assert(equipCount === 1, '設備点検チェックリストには「共同住宅用自動火災報知設備」が引き続き1件表示されている(EQUIPMENT_LIST自体は変更していない) (got count: ' + equipCount + ')');

  // ---- ② タブ切り替え時、常に即座に一番上から始まる(アニメーションによる「連動」感が無い) ----
  // 2026-07-17再修正: タブ切替直後は、慣性スクロール対策として一時的にhtml/bodyのoverflowが
  // hiddenになり(showView()内、260ms間)、その間はJSからの手動scrollTo()も効かないため、
  // 手動でスクロール位置を作る前に必ずこのロックが解除される300ms以上を空けてから行う。
  await page.locator('#navHome').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 800));
  await page.waitForTimeout(100);
  const homeScrollBefore = await page.evaluate(() => window.scrollY);
  assert(homeScrollBefore > 100, 'ホーム画面を下にスクロールした状態を作った (got scrollY: ' + homeScrollBefore + ')');

  async function assertInstantTopOnSwitch(navId, label) {
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(100);
    await page.locator('#' + navId).click();
    // クリック直後(アニメーションの途中であれば0以外の値が残っているはず)を即座に確認する
    const scrollImmediate = await page.evaluate(() => window.scrollY);
    assert(scrollImmediate === 0, label + 'へ切り替えた直後、アニメーション無しで即座に一番上(scrollY=0)になっている (got: ' + scrollImmediate + ')');
    await page.waitForTimeout(300);
  }
  await assertInstantTopOnSwitch('navDetector', '感知器');
  await page.locator('#navHome').click();
  await page.waitForTimeout(300);
  await assertInstantTopOnSwitch('navPhotos', '写真');
  await page.locator('#navHome').click();
  await page.waitForTimeout(300);
  await assertInstantTopOnSwitch('navList', '物件情報');

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'Not implemented', 'exitFullscreen', 'requestFullscreen', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL PHOTO-TAG-DEDUP / SCROLL-RESET ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
