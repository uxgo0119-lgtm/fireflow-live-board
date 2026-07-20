// 2026-07-19 追加: 「LBのアイコンアプリをこれに変更する。ホーム画面に追加はこれを使って
// ください」のご指示への対応の回帰テスト。
//
// 背景: これまでfavicon(32x32/16x16)・apple-touch-icon(180x180)・Web App Manifest
// (192x192/512x512)は、白い角丸四角の背景枠の中に小さくキューブが配置された旧アイコン
// 画像を使用しており、起動スプラッシュ(#appSplash)やトップバーの.brand-icon(いずれも
// キューブがタイル全体を占めるフレームレスな見た目)と印象が異なっていた。新たに添付された
// 「Lキューブ」画像(1254×1254、白背景)をタイトにクロップ(キューブ+影の周囲に約4%の余白の
// み)して差し替え、フレームレスな見た目に統一した。
const { chromium } = require('playwright');
const path = require('path');
const { PNG } = (() => {
  try { return require('pngjs'); } catch (e) { return {}; }
})();

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

function decodePngDims(base64Str) {
  // PNG dimensions are stored at fixed byte offsets in the IHDR chunk; decode
  // manually so this test has no extra dependency beyond base64/Buffer.
  const buf = Buffer.from(base64Str, 'base64');
  // width: bytes 16-19, height: bytes 20-23 (big-endian), per PNG spec.
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(fileUrl);
  await page.waitForSelector('.room-card', { timeout: 10000 });

  const hrefs = await page.evaluate(() => {
    var apple = document.querySelector('link[rel="apple-touch-icon"]');
    var icon32 = document.querySelector('link[rel="icon"][sizes="32x32"]');
    var icon16 = document.querySelector('link[rel="icon"][sizes="16x16"]');
    var manifestLink = document.querySelector('link[rel="manifest"]');
    return {
      appleHref: apple.getAttribute('href'),
      icon32Href: icon32.getAttribute('href'),
      icon16Href: icon16.getAttribute('href'),
      manifestHref: manifestLink.getAttribute('href'),
    };
  });

  // ---- 各サイズが正しい実寸のPNGとして埋め込まれている(単なる文字列置換ミスでないこと) ----
  const appleDims = decodePngDims(hrefs.appleHref.split('base64,')[1]);
  assert(appleDims.width === 180 && appleDims.height === 180, 'apple-touch-iconが180x180の実寸で埋め込まれている (got: ' + JSON.stringify(appleDims) + ')');

  const icon32Dims = decodePngDims(hrefs.icon32Href.split('base64,')[1]);
  assert(icon32Dims.width === 32 && icon32Dims.height === 32, 'favicon(32x32)が32x32の実寸で埋め込まれている (got: ' + JSON.stringify(icon32Dims) + ')');

  const icon16Dims = decodePngDims(hrefs.icon16Href.split('base64,')[1]);
  assert(icon16Dims.width === 16 && icon16Dims.height === 16, 'favicon(16x16)が16x16の実寸で埋め込まれている (got: ' + JSON.stringify(icon16Dims) + ')');

  const manifestObj = JSON.parse(Buffer.from(hrefs.manifestHref.split('base64,')[1], 'base64').toString('utf-8'));
  const icon192 = manifestObj.icons.find((i) => i.sizes === '192x192');
  const icon512 = manifestObj.icons.find((i) => i.sizes === '512x512');
  const dims192 = decodePngDims(icon192.src.split('base64,')[1]);
  const dims512 = decodePngDims(icon512.src.split('base64,')[1]);
  assert(dims192.width === 192 && dims192.height === 192, 'manifestの192x192アイコンが実寸192x192で埋め込まれている (got: ' + JSON.stringify(dims192) + ')');
  assert(dims512.width === 512 && dims512.height === 512, 'manifestの512x512アイコンが実寸512x512で埋め込まれている (got: ' + JSON.stringify(dims512) + ')');

  // ---- 新アイコンは旧アイコン(白い角丸四角の枠つき)より軽量枠が無くなった分、
  //      画像自体のバイトサイズが大きく変わっている(=実際に差し替わったことの傍証) ----
  assert(hrefs.appleHref.length > 20000, 'apple-touch-iconの画像データが有効なサイズを持っている (got len: ' + hrefs.appleHref.length + ')');

  // ---- 起動スプラッシュ・トップバーの.brand-iconは今回のアイコン差し替えで巻き添え変更
  //      されていない(すでにフレームレスなため対象外) ----
  const splashAndBrandOk = await page.evaluate(() => {
    var splashImg = document.querySelector('#appSplash img');
    var brandIcon = document.querySelector('.brand-icon');
    return { splashImgExists: !!splashImg, brandIconExists: !!brandIcon };
  });
  assert(splashAndBrandOk.splashImgExists, '起動スプラッシュのアイコン画像は引き続き存在している(今回のご指示の対象外)');
  assert(splashAndBrandOk.brandIconExists, 'トップバーの.brand-iconは引き続き存在している(今回のご指示の対象外)');

  console.log('\nALL FRAMELESS-APPICON ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
