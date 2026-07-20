// 2026-07-19 追加: 「感知器の時は時間指定、A.Pはいらない」のご指摘への対応の回帰テスト。
//
// 背景: 感知器タブ(#navDetector)の部屋カードには、これまで他のモードと同じく点検希望時刻の
// A/P(または時刻)ラベル(.sched-label)が表示されていたが、感知器の個数を確認する文脈では
// この情報は不要とのご指摘を受け、感知器タブの部屋カードHTML生成部分(currentHomeMode==='sensor'
// の分岐)から.sched-labelの出力自体を取り除いた。normal/enlarged/overviewの全グリッドモードで
// 共通の1つのコード分岐のため、モードごとの個別対応は不要(1箇所の修正で全モードに反映される)。
//
// 前回(2026-07-19、test_sensor_gridmode_detail_2026-07-19.js)で追加した「全体/全体拡大モードでも
// 差◯定◯の感知器個数表示が見える」という機能自体には影響がないことも合わせて確認する。
// また、感知器タブ以外(#navHome、通常の点検モード)の.sched-labelは今回のご指摘の対象外であり、
// 引き続き従来通り表示されることも巻き添え変更が無いか確認する。
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

  // ---- 感知器タブへ切り替え ----
  await page.locator('#navDetector').click();
  await page.waitForTimeout(200);
  await page.waitForSelector('.room-card-sensor', { timeout: 5000 });

  // ---- 通常モード: 感知器カードに.sched-labelが無い ----
  const normalLabelCount = await page.evaluate(() => document.querySelectorAll('.room-card-sensor .sched-label').length);
  assert(normalLabelCount === 0, '通常モードの感知器タブでは、部屋カードに点検希望時刻ラベル(.sched-label)が表示されない (got count: ' + normalLabelCount + ')');

  const normalSensorText = await page.locator('.room-card-sensor').first().textContent();
  assert(/差\d+定\d+/.test(normalSensorText), '通常モードの感知器タブでは、部屋カードに差動式/定温式の個数(差◯定◯)は引き続き表示されている (got: ' + normalSensorText + ')');

  // ---- 「全体」モード ----
  await page.locator('#gridExpandToggle').click();
  await page.waitForTimeout(150);
  await page.locator('.grid-mode-option[data-mode="enlarged"]').click();
  await page.waitForTimeout(200);

  const enlargedLabelCount = await page.evaluate(() => document.querySelectorAll('.room-card-sensor .sched-label').length);
  assert(enlargedLabelCount === 0, '「全体」モードの感知器タブでも、部屋カードに点検希望時刻ラベルが表示されない (got count: ' + enlargedLabelCount + ')');

  const enlargedDetailVisible = await page.evaluate(() => {
    var el = document.querySelector('.room-card-sensor .room-detail');
    return el ? getComputedStyle(el).display !== 'none' : false;
  });
  assert(enlargedDetailVisible, '「全体」モードの感知器タブでは、前回修正した感知器個数表示(.room-detail)は引き続き表示されている(巻き添え変更なし)');

  // ---- 「全体拡大」モード ----
  await page.locator('#gridExpandToggle').click();
  await page.waitForTimeout(150);
  await page.locator('.grid-mode-option[data-mode="overview"]').click();
  await page.waitForTimeout(200);

  const overviewLabelCount = await page.evaluate(() => document.querySelectorAll('.room-card-sensor .sched-label').length);
  assert(overviewLabelCount === 0, '「全体拡大」モードの感知器タブでも、部屋カードに点検希望時刻ラベルが表示されない (got count: ' + overviewLabelCount + ')');

  const overviewDetailVisible = await page.evaluate(() => {
    var el = document.querySelector('.room-card-sensor .room-detail');
    return el ? getComputedStyle(el).display !== 'none' : false;
  });
  assert(overviewDetailVisible, '「全体拡大」モードの感知器タブでも、感知器個数表示は引き続き表示されている(巻き添え変更なし)');

  // ---- 標準モードに戻す ----
  await page.locator('#gridExpandToggle').click();
  await page.waitForTimeout(150);
  await page.locator('.grid-mode-option[data-mode="normal"]').click();
  await page.waitForTimeout(200);

  // ---- 巻き添え確認: 感知器タブ以外(通常の点検モード)では.sched-labelは今回の対象外、引き続き表示される ----
  await page.locator('#navHome').click();
  await page.waitForTimeout(200);
  const homeLabelCount = await page.evaluate(() => document.querySelectorAll('.room-card:not(.room-card-sensor) .sched-label').length);
  assert(homeLabelCount > 0, '感知器タブ以外(通常の点検モード)の部屋カードでは、点検希望時刻ラベル(.sched-label)が引き続き表示されている(今回の変更の対象外、巻き添えなし) (got count: ' + homeLabelCount + ')');

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'Not implemented', 'exitFullscreen', 'requestFullscreen', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL SENSOR-TAB NO-SCHEDLABEL ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
