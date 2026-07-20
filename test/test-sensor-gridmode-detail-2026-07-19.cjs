// 2026-07-19 追加: 「全体で見た時の感知器が反映されていない」のご指摘への対応の回帰テスト。
//
// 背景: 感知器タブ(currentHomeMode==='sensor')の部屋カード(.room-card-sensor)は、差動式/
// 定温式の感知器個数(.sensor-detail、.room-detail内)を表示するのが唯一の情報だったが、
// 密なグリッドモード「全体」(body.enlarged)・「全体拡大」(body.overview)では、通常モードの
// 点検状況表示と共通の汎用ルールで.room-detailを一律非表示にしていたため、感知器タブに
// 切り替えても部屋番号しか見えず、感知器の個数情報が全く分からなくなっていた。感知器タブの
// カードに限り.room-detailを再度表示し、通常モード用の大きな丸アイコン(.sensor-circle)は
// 密なカードに収まらないため、枠なしの小さな文字表記(「差2定1」のように)に切り替えた。
const { chromium } = require('playwright');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(fileUrl);
  await page.waitForSelector('.room-card', { timeout: 10000 });
  await page.waitForFunction(() => {
    var el = document.getElementById('appSplash');
    return !el || el.getAttribute('data-hidden') === 'true';
  }, { timeout: 5000 });
  await page.waitForTimeout(300);

  await page.locator('#navDetector').click();
  await page.waitForTimeout(300);

  // ---- 標準モードでは従来通り丸アイコン付きで表示される(巻き添え変更されていないこと) ----
  const normalModeCheck = await page.evaluate(() => {
    var el = document.querySelector('.room-card-sensor .sensor-detail');
    var circle = document.querySelector('.room-card-sensor .sensor-circle');
    return {
      detailVisible: el ? getComputedStyle(el.closest('.room-detail')).display !== 'none' : false,
      circleWidth: circle ? getComputedStyle(circle).width : null,
    };
  });
  assert(normalModeCheck.detailVisible, '標準モードでは引き続き感知器個数(.sensor-detail)が表示されている');
  assert(normalModeCheck.circleWidth === '30px', '標準モードでは引き続き丸アイコン(直径30px)のまま(巻き添え変更されていない) (got: ' + normalModeCheck.circleWidth + ')');

  // ---- 「全体」モード: 感知器個数が表示されるようになっている ----
  await page.locator('#gridExpandToggle').click();
  await page.waitForTimeout(150);
  await page.locator('.grid-mode-option[data-mode="enlarged"]').click();
  await page.waitForTimeout(200);

  const enlargedCheck = await page.evaluate(() => {
    var card = document.querySelector('.room-card-sensor');
    var detail = card ? card.querySelector('.room-detail') : null;
    var circle = card ? card.querySelector('.sensor-circle') : null;
    return {
      detailDisplay: detail ? getComputedStyle(detail).display : null,
      detailText: detail ? detail.textContent.trim() : null,
      circleBorder: circle ? getComputedStyle(circle).borderStyle : null,
    };
  });
  assert(enlargedCheck.detailDisplay !== 'none', '「全体」モードで感知器タブの.room-detailが表示されている (got: ' + enlargedCheck.detailDisplay + ')');
  assert(/差\d+定\d+/.test(enlargedCheck.detailText), '「全体」モードで感知器の個数(差◯定◯の形式)が表示されている (got: ' + enlargedCheck.detailText + ')');
  assert(enlargedCheck.circleBorder === 'none', '「全体」モードでは丸アイコンの枠が外れ、コンパクトな文字表記になっている (got: ' + enlargedCheck.circleBorder + ')');

  // ---- 「全体拡大」モード: 同様に感知器個数が表示される ----
  await page.locator('#gridExpandToggle').click();
  await page.waitForTimeout(150);
  await page.locator('.grid-mode-option[data-mode="overview"]').click();
  await page.waitForTimeout(200);

  const overviewCheck = await page.evaluate(() => {
    var card = document.querySelector('.room-card-sensor');
    var detail = card ? card.querySelector('.room-detail') : null;
    return {
      detailDisplay: detail ? getComputedStyle(detail).display : null,
      detailText: detail ? detail.textContent.trim() : null,
    };
  });
  assert(overviewCheck.detailDisplay !== 'none', '「全体拡大」モードで感知器タブの.room-detailが表示されている (got: ' + overviewCheck.detailDisplay + ')');
  assert(/差\d+定\d+/.test(overviewCheck.detailText), '「全体拡大」モードで感知器の個数(差◯定◯の形式)が表示されている (got: ' + overviewCheck.detailText + ')');

  // ---- ホームタブ(通常の点検状況表示)は今回の変更で巻き添え変更されていない ----
  await page.locator('#navHome').click();
  await page.waitForTimeout(200);
  const homeTabCheck = await page.evaluate(() => {
    var detail = document.querySelector('.room-card:not(.room-card-sensor) .room-detail');
    return detail ? getComputedStyle(detail).display : null;
  });
  assert(homeTabCheck === 'none', 'ホームタブ(通常モード)では、密なグリッドモード中は引き続き.room-detailが非表示のまま(巻き添え変更なし) (got: ' + homeTabCheck + ')');

  // 標準モードに戻す
  await page.locator('#gridExpandToggle').click();
  await page.waitForTimeout(150);
  await page.locator('.grid-mode-option[data-mode="normal"]').click();
  await page.waitForTimeout(200);

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'Not implemented', 'exitFullscreen', 'requestFullscreen', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL SENSOR-GRIDMODE-DETAIL ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
