// 2026-07-19 追加: 「Live Boardのロゴを上部の左に表示、ロゴの右横にLive Boardのフォントを
// 小さく表示」「部屋カードを添付のように立方体にしたい」「上部ナビゲーションを最初の頃に
// あった白の四角に囲んでその上にロゴを表示して下さい」の3点の回帰テスト。
//
// 背景:
// ① 上部ナビの左端にキューブアイコン(#brand-icon、ログイン画面・起動スプラッシュと同じ
//    正式アプリアイコン画像を再利用)を新設し、その右横に既存の「Live Board」ワードマーク
//    ロゴ(.brand-name)を、以前よりも小さいサイズ(27px→18px)で表示するようにした。
// ② 部屋カード(.room-card)に、立方体風の立体感(角丸を大きく、下端に少し濃い影を付けて
//    側面のように見せる)を追加した。点検済み(.room-card-done)は単色塗りつぶしから、上が
//    明るく下が濃いグラデーション+濃いめの下端の影に変更し、キューブのような陰影を出している。
// ③ .topbar全体(ロゴ+アイコン群)を、白背景・角丸・軽いシャドウのカードで囲んだ(以前は
//    背景無しでページの地の色がそのまま透けていた)。
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

  // ---- ① ロゴ(キューブアイコン)が.brandの中で一番左、その右横にワードマークがある ----
  const brandChildren = await page.evaluate(() => Array.from(document.querySelector('.brand').children).map((el) => el.className));
  assert(brandChildren[0] === 'brand-icon', 'キューブアイコン(.brand-icon)が.brand内の一番左(最初の子要素)にある (got: ' + JSON.stringify(brandChildren) + ')');
  assert(brandChildren[1] === 'brand-name', 'ワードマークロゴ(.brand-name)がキューブアイコンの右隣にある (got: ' + JSON.stringify(brandChildren) + ')');

  const iconRect = await page.evaluate(() => document.querySelector('.brand-icon').getBoundingClientRect());
  const nameRect = await page.evaluate(() => document.querySelector('.brand-name').getBoundingClientRect());
  assert(iconRect.left < nameRect.left, 'キューブアイコンがワードマークより左側に表示されている (icon left: ' + iconRect.left + ', name left: ' + nameRect.left + ')');
  assert(iconRect.x > 0 && iconRect.x < 60, 'キューブアイコンが画面の左端付近にある (got x: ' + iconRect.x + ')');

  // ワードマークが前回(27px)より小さくなっている
  const nameHeight = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.brand-name')).height));
  assert(nameHeight < 27, '「Live Board」ワードマークの高さが前回(27px)より小さくなっている (got: ' + nameHeight + ')');
  assert(nameHeight > 0, 'ワードマーク自体は非表示になっていない (got: ' + nameHeight + ')');

  // ---- ③ .topbarが白背景・角丸のカードになっている ----
  const topbarStyle = await page.evaluate(() => {
    var cs = getComputedStyle(document.querySelector('.topbar'));
    return { bg: cs.backgroundColor, radius: cs.borderRadius, shadow: cs.boxShadow };
  });
  assert(topbarStyle.bg === 'rgb(255, 255, 255)', '.topbarの背景が白になっている (got: ' + topbarStyle.bg + ')');
  assert(parseFloat(topbarStyle.radius) > 0, '.topbarに角丸が付いている (got: ' + topbarStyle.radius + ')');
  assert(topbarStyle.shadow !== 'none', '.topbarに軽いシャドウが付いている(カードとして浮き上がって見える) (got: ' + topbarStyle.shadow + ')');

  // ---- ② 部屋カードが立方体風(角丸+下端の影)になっている ----
  const roomCardStyle = await page.evaluate(() => {
    var cs = getComputedStyle(document.querySelector('.room-card'));
    return { radius: cs.borderRadius, shadow: cs.boxShadow };
  });
  assert(parseFloat(roomCardStyle.radius) >= 16, '部屋カードの角丸が大きめ(立方体風)になっている (got: ' + roomCardStyle.radius + ')');
  assert(roomCardStyle.shadow.indexOf('0px 3px 0px') !== -1 || roomCardStyle.shadow.split(',').length >= 2,
    '部屋カードに立方体の側面のような下端の影が付いている (got: ' + roomCardStyle.shadow + ')');

  const doneCardStyle = await page.evaluate(() => {
    var card = document.querySelector('.room-card-done');
    var cs = getComputedStyle(card);
    return { bgImage: cs.backgroundImage, shadow: cs.boxShadow };
  });
  assert(doneCardStyle.bgImage.indexOf('gradient') !== -1, '点検済み(塗りつぶし)カードがグラデーション背景で立体感を出している (got: ' + doneCardStyle.bgImage + ')');
  assert(doneCardStyle.shadow.split(',').length >= 2, '点検済みカードにも立方体風の下端の影が付いている (got: ' + doneCardStyle.shadow + ')');

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'Not implemented', 'exitFullscreen', 'requestFullscreen', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL LOGO-LEFT / WORDMARK-SMALL / CUBE-ROOMCARDS / TOPBAR-WHITECARD ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
