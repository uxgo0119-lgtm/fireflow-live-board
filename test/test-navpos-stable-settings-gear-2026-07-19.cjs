// 2026-07-19 追加: 「文字を大、特大にしたら上部のナビゲーションの位置が変わるので動かない
// ようにして下さい」「上部ナビゲーションに⚙️マークを1番右に追加する。その際にロック画面や
// 文字サイズ変更をそこに入れる」の2点の回帰テスト。
//
// 背景:
// ① 上部ナビの位置ずれの原因は2つあった。
//    (a) .brand-name(「Live Board」ロゴ画像)のheightがcalc(27px * var(--font-scale,1))
//        になっており、文字サイズ「大」「特大」を選ぶとロゴ自体が縦に大きくなっていた。
//    (b) .topbarがflex-wrap:wrapだったため、ロゴが大きくなる・アイコン数が多いなどで
//        1行に収まらなくなると、アイコン群(.topbar-right)が2段目に折り返され、位置が
//        大きくずれて見えた。
//    ロゴの高さを常に27px固定にし(ブランドマークは読み上げ対象の文章ではないため文字サイズ
//    設定の対象外とした)、.topbarをflex-wrap:nowrapに変更することで、文字サイズをどれに
//    変更しても上部ナビ(アイコン群)の横位置・折り返しが発生しないようにした。
// ② 上部ナビの「画面ロック」「文字サイズ」の2つの独立アイコンを廃止し、1番右に追加した
//    歯車アイコン(#settingsToggle)にまとめた。タップすると#settingsMenuPopupが開き、
//    「画面をロックする」ボタンと文字サイズの選択肢(標準/大/特大)がその中に入っている。
//    アイコン数が減ったことで①の折り返し対策にも寄与している。
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

  // ---- ② 上部ナビは「読み込み・拡大・設定(歯車)」の3アイコンで、歯車が一番右にある ----
  const topbarIds = await page.evaluate(() => Array.from(document.querySelectorAll('.topbar-right button')).map((b) => b.id));
  assert(JSON.stringify(topbarIds) === JSON.stringify(['uploadDataToggle', 'gridExpandToggle', 'settingsToggle']),
    '上部ナビは読み込み・拡大・設定(歯車)の3つで、歯車が一番右にある (got: ' + JSON.stringify(topbarIds) + ')');
  assert((await page.locator('#lockScreenBtn').count()) === 0, '独立した画面ロックアイコン(#lockScreenBtn)はもう存在しない');
  assert((await page.locator('#fontSizeToggle').count()) === 0, '独立した文字サイズアイコン(#fontSizeToggle)はもう存在しない');

  // ---- ① 標準時の上部ナビの位置を記録 ----
  const rectNormal = await page.evaluate(() => document.querySelector('.topbar-right').getBoundingClientRect());

  // ---- ② 歯車アイコンをタップすると、画面ロック・文字サイズがまとまったメニューが開く ----
  await page.locator('#settingsToggle').click();
  await page.waitForTimeout(150);
  assert(await page.locator('#settingsMenuPopup').isVisible(), '歯車アイコンをタップすると#settingsMenuPopupが開く');
  assert(await page.locator('#settingsMenuLockBtn').isVisible(), 'メニュー内に「画面をロックする」ボタンがある');
  const fontOptionLabels = await page.evaluate(() => Array.from(document.querySelectorAll('#settingsMenuPopup .font-size-option[data-scale]')).map((b) => b.textContent.replace('✓', '').trim()));
  assert(JSON.stringify(fontOptionLabels) === JSON.stringify(['標準', '大', '特大']), 'メニュー内に文字サイズの選択肢(標準/大/特大)がある (got: ' + JSON.stringify(fontOptionLabels) + ')');

  // ---- ① 「特大」を選んでも、上部ナビ(アイコン群)の横位置がずれない・折り返さない ----
  await page.locator('#settingsMenuPopup .font-size-option[data-scale]').last().click();
  await page.waitForTimeout(200);
  const scaleAfter = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim());
  assert(scaleAfter === '1.3', '「特大」選択後、--font-scaleが1.3になっている (got: ' + scaleAfter + ')');

  const rectHuge = await page.evaluate(() => document.querySelector('.topbar-right').getBoundingClientRect());
  assert(rectHuge.x === rectNormal.x, '「特大」選択後も、上部ナビアイコン群の横位置(x座標)が標準時と同じで動かない (normal x: ' + rectNormal.x + ', huge x: ' + rectHuge.x + ')');
  assert(rectHuge.width === rectNormal.width, '「特大」選択後も、上部ナビアイコン群の横幅が変わらない(折り返していない) (normal: ' + rectNormal.width + ', huge: ' + rectHuge.width + ')');

  // 2026-07-19追記: 「ロゴの右横にLive Boardのフォントを小さく表示」のご指示により、
  // ワードマークの固定高さ自体も27px→18pxに縮小された。
  const brandHeight = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.brand-name')).height));
  assert(Math.abs(brandHeight - 18) < 0.5, '「特大」選択後も、Live Boardロゴの高さは18px固定のまま変わらない (got: ' + brandHeight + ')');

  const topbarWrapped = await page.evaluate(() => getComputedStyle(document.querySelector('.topbar')).flexWrap);
  assert(topbarWrapped === 'nowrap', '.topbarがflex-wrap:nowrapになっており、折り返しが起きない設定になっている (got: ' + topbarWrapped + ')');

  // ---- ② 「画面をロックする」ボタンをタップすると、実際にロック画面が開く ----
  await page.locator('#settingsToggle').click();
  await page.waitForTimeout(150);
  await page.locator('#settingsMenuLockBtn').click();
  await page.waitForTimeout(150);
  assert(await page.locator('#lockOverlay').isVisible(), 'メニュー内の「画面をロックする」タップで、実際にロック画面が表示される');
  await page.locator('#lockOverlay').click();
  await page.waitForTimeout(150);
  assert(!(await page.locator('#lockOverlay').isVisible()), 'ロック画面をタップすると解除される');

  // 標準の文字サイズに戻しておく
  await page.locator('#settingsToggle').click();
  await page.waitForTimeout(150);
  await page.locator('#settingsMenuPopup .font-size-option[data-scale]').first().click();
  await page.waitForTimeout(150);

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'Not implemented', 'exitFullscreen', 'requestFullscreen', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL NAV-POSITION-STABLE / SETTINGS-GEAR-CONSOLIDATION ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
