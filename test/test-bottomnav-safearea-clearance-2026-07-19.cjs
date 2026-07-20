// 2026-07-19 追加: 「102が見切れている」のご指摘への対応の回帰テスト。
//
// 背景: bodyのpadding-bottomが固定値84pxのみで、下部ナビゲーション(.bottom-nav、
// position:fixed)自身が持つenv(safe-area-inset-bottom)分の余白(ホームインジケーターの
// あるiPhone等では実質90px超になりうる)を考慮していなかったため、部屋一覧を一番下まで
// スクロールすると、最後の部屋カード(例: 102号室)が下部ナビゲーションの裏に隠れてしまう
// ことがあった。.bottom-nav自身の余白計算と同じ考え方で、bodyのpadding-bottomにも
// env(safe-area-inset-bottom)を加算するようにした。
const { chromium } = require('playwright');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
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

  // ---- bodyのpadding-bottomがenv(safe-area-inset-bottom)を加味した計算式になっている ----
  const cssCheck = await page.evaluate(() => {
    for (var s of document.styleSheets) {
      try {
        for (var r of s.cssRules) {
          if (r.selectorText === 'body' && r.style.paddingBottom && r.style.paddingBottom.indexOf('safe-area-inset-bottom') !== -1) {
            return { found: true, value: r.style.paddingBottom };
          }
        }
      } catch (e) {}
    }
    return { found: false };
  });
  assert(cssCheck.found, 'bodyのpadding-bottomがenv(safe-area-inset-bottom)を含む計算式になっている (got: ' + JSON.stringify(cssCheck) + ')');
  assert(cssCheck.value.indexOf('84px') !== -1, '従来通り基本の余白84pxはそのまま維持されている (got: ' + cssCheck.value + ')');

  // ---- 一覧を一番下までスクロールしても、最後の部屋カードが下部ナビゲーションと重ならない ----
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  const overlapCheck = await page.evaluate(() => {
    var cards = document.querySelectorAll('.room-card:not(.room-card-sensor)');
    var last = cards[cards.length - 1];
    var nav = document.querySelector('.bottom-nav');
    var lastRect = last.getBoundingClientRect();
    var navRect = nav.getBoundingClientRect();
    return { lastBottom: lastRect.bottom, navTop: navRect.top, room: last.getAttribute('data-room') };
  });
  assert(overlapCheck.lastBottom <= overlapCheck.navTop, '一覧を一番下までスクロールしても、最後の部屋カード(' + overlapCheck.room + '号室)の下端が下部ナビゲーションの上端より上に収まっている (card bottom: ' + overlapCheck.lastBottom + ', nav top: ' + overlapCheck.navTop + ')');

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'Not implemented', 'exitFullscreen', 'requestFullscreen', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL BOTTOM-NAV SAFE-AREA CLEARANCE ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
