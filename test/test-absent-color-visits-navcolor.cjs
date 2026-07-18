// 2026-07-17 「不在」文字色変更・部屋カードの訪問時刻表示2回まで・下部ナビ選択色変更 の回帰テスト。
// ①「部屋カードの不在はオレンジ→黒文字に変更」→ .room-status-text.absentの文字色を
//   #C2740D(オレンジ)から黒に変更した。
// ②「訪問時間は2回までは部屋カードに記載する。3回訪問して不在でも部屋カードには最後の2回までの
//   記載にする」→ detailFor()のabsentケースで、記録(entry.visitTimes)自体は全件保持したまま、
//   部屋カードの表示だけ直近2回(slice(-2))に制限した。パネル内の全件表示
//   (#visitTimesList、refreshVisitTimesList)は変更せず、記録は失われていないことも確認する。
// ③「下部ナビゲーションのタップ後の黒文字を→青文字に変更」→ .nav-item.active/.nav-item:active
//   の文字色を#1B2333(黒に近い濃紺)からブランドブルーに変更した。
const { chromium } = require('playwright');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

function rgbToHex(rgb) {
  var m = rgb.match(/\d+/g);
  if (!m) return rgb;
  return '#' + m.slice(0, 3).map(function (n) { return Number(n).toString(16).padStart(2, '0'); }).join('').toUpperCase();
}

const BLUE = '#007AFE';

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(fileUrl);
  await page.waitForSelector('.room-card', { timeout: 10000 });

  // ---- ①② 817号室を未点検に戻し、訪問時刻を3回記録して「不在」にする ----
  await page.locator('.room-card[data-room="817"]').click();
  await page.waitForTimeout(150);
  await page.locator('#markUndo').click();
  await page.waitForTimeout(150);
  await page.locator('#closePanel').click().catch(() => {});
  await page.waitForTimeout(150);

  await page.locator('.room-card[data-room="817"]').click();
  await page.waitForTimeout(150);
  await page.locator('#visitTimesDetails summary').click();
  await page.waitForTimeout(150);
  async function addVisit(t) {
    await page.locator('#visitTimeInput').fill(t);
    await page.locator('#addVisitTime').click();
    await page.waitForTimeout(150);
  }
  await addVisit('09:00');
  await addVisit('11:00');
  await addVisit('14:00');

  // パネル内(記録の全件)には3回とも残っている
  const panelText = await page.locator('#visitTimesList').textContent();
  assert(panelText.indexOf('09:00') !== -1 && panelText.indexOf('11:00') !== -1 && panelText.indexOf('14:00') !== -1,
    'パネル内の訪問記録には3回とも保持されている(記録自体は失われていない) (got: "' + panelText.trim() + '")');

  await page.locator('#closePanel').click();
  await page.waitForTimeout(200);

  const cardInfo = await page.evaluate(() => {
    var card = document.querySelector('.room-card[data-room="817"]');
    var statusText = card.querySelector('.room-status-text');
    return {
      cls: card.className,
      statusColor: getComputedStyle(statusText).color,
      detail: card.querySelector('.room-detail').textContent.trim(),
    };
  });
  assert(cardInfo.cls.indexOf('room-card-absent') !== -1, '817号室が「不在」ステータスになっている (got: ' + cardInfo.cls + ')');
  assert(rgbToHex(cardInfo.statusColor) === '#000000', '「不在」のstatus-textの文字色が黒 (got: ' + cardInfo.statusColor + ')');
  assert(cardInfo.detail.indexOf('09:00') === -1, '部屋カードには最初(1回目)の訪問時刻(09:00)は表示されていない (got: "' + cardInfo.detail + '")');
  assert(cardInfo.detail.indexOf('11:00') !== -1 && cardInfo.detail.indexOf('14:00') !== -1,
    '部屋カードには直近2回(11:00、14:00)が表示されている (got: "' + cardInfo.detail + '")');

  // 2回のみ記録した場合は、2回とも表示される(3回以上の場合のみ切り詰められることの確認)
  await page.locator('.room-card[data-room="816"]').click();
  await page.waitForTimeout(150);
  await page.locator('#markUndo').click();
  await page.waitForTimeout(150);
  await page.locator('#closePanel').click().catch(() => {});
  await page.waitForTimeout(150);
  await page.locator('.room-card[data-room="816"]').click();
  await page.waitForTimeout(150);
  await page.locator('#visitTimesDetails summary').click();
  await page.waitForTimeout(150);
  await page.locator('#visitTimeInput').fill('10:00');
  await page.locator('#addVisitTime').click();
  await page.waitForTimeout(150);
  await page.locator('#visitTimeInput').fill('15:30');
  await page.locator('#addVisitTime').click();
  await page.waitForTimeout(150);
  await page.locator('#closePanel').click();
  await page.waitForTimeout(200);
  const card816Detail = await page.evaluate(() => document.querySelector('.room-card[data-room="816"] .room-detail').textContent.trim());
  assert(card816Detail.indexOf('10:00') !== -1 && card816Detail.indexOf('15:30') !== -1,
    '2回だけ訪問した部屋は、2回とも部屋カードに表示される (got: "' + card816Detail + '")');

  // ---- ③ 下部ナビゲーションのタップ後(選択中)の文字色が青 ----
  await page.locator('#navPhotos').click();
  await page.waitForTimeout(200);
  const navPhotosColor = await page.evaluate(() => getComputedStyle(document.getElementById('navPhotos')).color);
  assert(rgbToHex(navPhotosColor) === BLUE, '「写真」タブ選択中の文字色が青 (got: ' + navPhotosColor + ')');

  await page.locator('#navList').click();
  await page.waitForTimeout(200);
  const navListColor = await page.evaluate(() => getComputedStyle(document.getElementById('navList')).color);
  assert(rgbToHex(navListColor) === BLUE, '「物件情報」タブ選択中の文字色が青 (got: ' + navListColor + ')');

  await page.locator('#navDetector').click();
  await page.waitForTimeout(200);
  const navDetectorColor = await page.evaluate(() => getComputedStyle(document.getElementById('navDetector')).color);
  assert(rgbToHex(navDetectorColor) === BLUE, '「感知器」タブ選択中の文字色が青 (got: ' + navDetectorColor + ')');

  await page.locator('#navHome').click();
  await page.waitForTimeout(200);
  const navHomeColor = await page.evaluate(() => getComputedStyle(document.getElementById('navHome')).color);
  assert(rgbToHex(navHomeColor) === BLUE, '「ホーム」タブ選択中の文字色が青 (got: ' + navHomeColor + ')');

  // 非選択中のタブは引き続きグレーのまま(全部が青になっていないことの確認)
  const navPhotosInactiveColor = await page.evaluate(() => getComputedStyle(document.getElementById('navPhotos')).color);
  assert(rgbToHex(navPhotosInactiveColor) !== BLUE, '非選択中の「写真」タブは青になっていない(選択中のみ青) (got: ' + navPhotosInactiveColor + ')');

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'Not implemented', 'exitFullscreen', 'requestFullscreen', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL ABSENT-COLOR / VISIT-CAP / NAV-COLOR ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
