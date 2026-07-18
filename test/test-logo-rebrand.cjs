// 2026-07-17 ロゴ修正の回帰テスト。
// ①「トップ画像のLBのアイコンを削除」→ .brand-badge(「LB」の正方形アイコン)をDOMから削除した。
// ②「Live Boardのフォントを添付のフォントに、文字の間隔も添付参照」→ .brand-nameのfont-familyに
//   'Poppins'(太字・幾何学的なサンセリフ)を指定し、字間を詰めた(letter-spacing: -1px)。
//   (オフラインでフォント読み込みに失敗した場合は自動的にシステムフォントへフォールバックする)
// ③「文字の色は青」→ .brand-nameの文字色をブランドブルー(var(--blue) = #007AFE)に変更した。
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

  // ---- ① 「LB」アイコンの削除 ----
  const badgeCount = await page.locator('.brand-badge').count();
  assert(badgeCount === 0, 'トップ画像の「LB」アイコン(.brand-badge)が削除されている (got count: ' + badgeCount + ')');

  // 「Live Board」のロゴ文字自体は引き続き表示されている(巻き添え削除されていない)
  const nameVisible = await page.locator('.brand-name').isVisible();
  const nameText = await page.locator('.brand-name').textContent();
  assert(nameVisible, '「Live Board」のロゴ文字は引き続き表示されている');
  assert(nameText.trim() === 'Live Board', '「Live Board」の表記自体は変更されていない (got: "' + nameText.trim() + '")');

  // ---- ②③ フォント・字間・文字色 ----
  const style = await page.evaluate(() => {
    var cs = getComputedStyle(document.querySelector('.brand-name'));
    return { fontFamily: cs.fontFamily, letterSpacing: cs.letterSpacing, color: cs.color, fontWeight: cs.fontWeight };
  });
  assert(style.fontFamily.toLowerCase().indexOf('poppins') !== -1,
    '「Live Board」に添付フォント相当(Poppins、太めのジオメトリックサンセリフ)が指定されている (got: ' + style.fontFamily + ')');
  assert(parseFloat(style.letterSpacing) < 0,
    '「Live Board」の字間が添付画像に合わせて詰められている (got letter-spacing: ' + style.letterSpacing + ')');
  assert(rgbToHex(style.color) === BLUE, '「Live Board」の文字色が青になっている (got: ' + style.color + ')');
  assert(parseInt(style.fontWeight, 10) >= 700, '「Live Board」の文字は太字のまま (got font-weight: ' + style.fontWeight + ')');

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'Not implemented', 'exitFullscreen', 'requestFullscreen', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL LOGO REBRAND ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
