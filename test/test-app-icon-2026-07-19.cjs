// 2026-07-19 追加: 「Live Boardのアイコンです」として提供された正式アプリアイコン
// (青いキューブに白い「L」、iOSスタイルの角丸正方形)を、iOSの「ホーム画面に追加」用の
// apple-touch-iconと、ブラウザタブ用のfaviconとして設定したことの回帰テスト。
// 外部ファイルに依存しないよう、両方ともbase64インライン画像として<head>に埋め込んでいる
// (単一HTMLファイルのまま、どこに配置・共有しても正しくアイコンが表示される)。
// [2026-07-19追記]「アイコンアプリもこれにして下さい」のご指示を受け、favicon/apple-touch-icon
// だけでなくWeb App Manifest(PWAとして「ホーム画面に追加」した際の正式なアプリアイコン・
// アプリ名として使われる、192x192/512x512の2サイズ)にも同じ画像を設定。manifest自体も
// base64インラインのdata URIとして埋め込み、外部ファイルへの依存を避けている。
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

  const info = await page.evaluate(() => {
    var apple = document.querySelector('link[rel="apple-touch-icon"]');
    var icons = Array.from(document.querySelectorAll('link[rel="icon"]'));
    return {
      appleHref: apple ? apple.getAttribute('href') : null,
      iconCount: icons.length,
      iconSizes: icons.map(function (i) { return i.getAttribute('sizes'); }),
      iconHrefsOk: icons.every(function (i) { return (i.getAttribute('href') || '').indexOf('data:image/png;base64,') === 0; }),
    };
  });

  assert(!!info.appleHref, 'apple-touch-icon が設定されている');
  assert(info.appleHref.indexOf('data:image/png;base64,') === 0, 'apple-touch-icon がbase64インライン画像になっている(外部ファイルに依存しない)');
  assert(info.iconCount >= 2, 'favicon(rel="icon")が32x16の2サイズ以上設定されている (got count: ' + info.iconCount + ')');
  assert(info.iconSizes.indexOf('32x32') !== -1, 'favicon に 32x32 サイズが含まれている (got: ' + JSON.stringify(info.iconSizes) + ')');
  assert(info.iconSizes.indexOf('16x16') !== -1, 'favicon に 16x16 サイズが含まれている (got: ' + JSON.stringify(info.iconSizes) + ')');
  assert(info.iconHrefsOk, '全てのfaviconリンクがbase64インライン画像になっている');

  // ロゴ(.brand-name、Live Boardワードマーク)は今回のアイコン追加で巻き添え変更されていない
  const logoStillImg = await page.evaluate(() => document.querySelector('.brand-name').tagName);
  assert(logoStillImg === 'IMG', 'トップバーの「Live Board」ロゴ(.brand-name)は引き続き<img>のまま、影響を受けていない');

  // ---- Web App Manifest(PWAとしての正式アプリアイコン・アプリ名) ----
  const manifestInfo = await page.evaluate(async () => {
    var link = document.querySelector('link[rel="manifest"]');
    if (!link) return { ok: false, reason: 'no manifest link' };
    var href = link.getAttribute('href');
    if (href.indexOf('data:application/manifest+json;base64,') !== 0) {
      return { ok: false, reason: 'manifest href is not an inline base64 data URI' };
    }
    var res = await fetch(href);
    var json = await res.json();
    return {
      ok: true,
      name: json.name,
      shortName: json.short_name,
      display: json.display,
      themeColor: json.theme_color,
      iconSizes: (json.icons || []).map(function (i) { return i.sizes; }),
      iconSrcsOk: (json.icons || []).every(function (i) { return i.src.indexOf('data:image/png;base64,') === 0; }),
    };
  });
  assert(manifestInfo.ok, 'Web App Manifest(rel="manifest")がbase64インラインdata URIとして設定されている (got: ' + JSON.stringify(manifestInfo) + ')');
  assert(manifestInfo.name === 'Live Board', 'manifestのnameが「Live Board」になっている (got: ' + manifestInfo.name + ')');
  assert(manifestInfo.display === 'standalone', 'manifestのdisplayがstandalone(PWAとして起動)になっている (got: ' + manifestInfo.display + ')');
  assert(manifestInfo.iconSizes.indexOf('192x192') !== -1, 'manifestのiconsに192x192が含まれている (got: ' + JSON.stringify(manifestInfo.iconSizes) + ')');
  assert(manifestInfo.iconSizes.indexOf('512x512') !== -1, 'manifestのiconsに512x512が含まれている (got: ' + JSON.stringify(manifestInfo.iconSizes) + ')');
  assert(manifestInfo.iconSrcsOk, 'manifestの全アイコンがbase64インライン画像になっている(外部ファイルに依存しない)');

  const themeColorMeta = await page.evaluate(() => {
    var el = document.querySelector('meta[name="theme-color"]');
    return el ? el.getAttribute('content') : null;
  });
  assert(themeColorMeta === '#007AFE', 'theme-colorメタタグがブランドブルーになっている (got: ' + themeColorMeta + ')');

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'Not implemented', 'exitFullscreen', 'requestFullscreen', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL APP-ICON ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
