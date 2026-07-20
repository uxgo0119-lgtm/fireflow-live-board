// 2026-07-19 追加: 「Live Boardのアイコンもっと大きく」「歯車マークは添付を参照で色は青で」
// 「部屋カードを立体的なボタンをもっと綺麗に出来ますか？3パターンぐらいデザインを下さい」
// の3点の回帰テスト。
//
// 背景:
// ① 上部ナビ左端のキューブアイコン(.brand-icon)のheightを26px→36pxに拡大した。
// ② 設定(歯車)アイコン(#settingsToggle)を、線画(stroke)の自作パスから、添付の参考画像に
//    近い塗りつぶし(fill)の標準的な歯車アイコン(8枚の歯+中央の丸い穴)に変更した。
//    fill="currentColor"で.icon-btnの色(var(--blue)、ブランドブルー)を継承するため、常に
//    青色で表示される。
// ③ 部屋カード(.room-card)の立体感について、3案(A:ソフトキューブ/B:光沢ボタン/
//    C:ベベルキーキャップ)を提示し、「A: ソフトキューブ」案を採用した。角丸をさらに
//    大きくし(18px→20px)、上端の内側ハイライト(box-shadowのinset)と下端の複数段の影を
//    重ねることで、以前の単一のオフセット影よりもやわらかく上品な立体感にした。カードの
//    高さ(140px)は変わっていない。
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

  // ---- ① Live Boardアイコン(.brand-icon)が以前(26px)より大きくなっている ----
  const brandIconHeight = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.brand-icon')).height));
  assert(brandIconHeight > 26, 'Live Boardアイコン(.brand-icon)の高さが以前(26px)より大きくなっている (got: ' + brandIconHeight + ')');
  assert(brandIconHeight >= 34, 'Live Boardアイコンが十分に大きく表示されている (got: ' + brandIconHeight + ')');

  // ---- ② 歯車アイコンが塗りつぶし(fill)スタイルになっており、色が青である ----
  const gear = await page.evaluate(() => {
    var svg = document.querySelector('#settingsToggle svg');
    var path0 = svg.querySelector('path');
    return {
      svgFill: svg.getAttribute('fill'),
      pathHasStroke: path0.hasAttribute('stroke'),
      color: getComputedStyle(document.querySelector('#settingsToggle')).color,
    };
  });
  assert(gear.svgFill === 'currentColor', '歯車アイコンが塗りつぶし(fill=currentColor)の標準的なスタイルになっている (got: ' + gear.svgFill + ')');
  assert(!gear.pathHasStroke, '歯車アイコンはstroke(線画)ではなくfill(塗りつぶし)で描画されている');
  assert(gear.color === 'rgb(0, 122, 254)', '歯車アイコンの色が青(ブランドブルー)になっている (got: ' + gear.color + ')');

  // 歯車アイコンの機能自体(タップでメニューが開く)が引き続き動作する
  await page.locator('#settingsToggle').click();
  await page.waitForTimeout(150);
  assert(await page.locator('#settingsMenuPopup').isVisible(), '歯車アイコンをタップすると引き続き#settingsMenuPopupが開く');
  await page.locator('#settingsMenuCancelBtn').click();
  await page.waitForTimeout(150);

  // ---- ③ 部屋カードが「ソフトキューブ」パターンA(角丸20px以上、内側ハイライト+複数段の影)になっている ----
  const roomCardStyle = await page.evaluate(() => {
    // このデータセットは初期状態で全室点検済み(100%)のため、実DOM上に.room-card-doneを
    // 持たないカードが存在しない。未点検(白背景)側の基本スタイルを検証するため、一時的な
    // ダミー要素(.room-cardのみ、.room-card-doneは付けない)を作って検証する。
    var el = document.createElement('div');
    el.className = 'room-card';
    document.body.appendChild(el);
    var cs = getComputedStyle(el);
    var result = { radius: cs.borderRadius, shadow: cs.boxShadow };
    el.remove();
    return result;
  });
  assert(parseFloat(roomCardStyle.radius) >= 20, '部屋カードの角丸がさらに大きく(20px以上)なっている (got: ' + roomCardStyle.radius + ')');
  assert(roomCardStyle.shadow.indexOf('inset') !== -1, '部屋カードに内側ハイライト(inset)が付いており、やわらかい立体感になっている (got: ' + roomCardStyle.shadow + ')');
  const roomCardShadowLayers = (roomCardStyle.shadow.match(/rgba?\(/g) || []).length;
  assert(roomCardShadowLayers >= 3, '部屋カードの影が複数段になっている (got layers: ' + roomCardShadowLayers + ', shadow: ' + roomCardStyle.shadow + ')');

  const doneCardStyle = await page.evaluate(() => {
    var card = document.querySelector('.room-card-done');
    var cs = getComputedStyle(card);
    return { bgImage: cs.backgroundImage, shadow: cs.boxShadow };
  });
  assert(doneCardStyle.bgImage.indexOf('gradient') !== -1, '点検済みカードが引き続きグラデーション背景になっている (got: ' + doneCardStyle.bgImage + ')');
  assert(doneCardStyle.bgImage.indexOf('rgb(0, 122, 254)') !== -1, '点検済みカードのグラデーションにブランドブルーが含まれている (got: ' + doneCardStyle.bgImage + ')');
  assert(doneCardStyle.shadow.indexOf('inset') !== -1, '点検済みカードにも内側ハイライトが付いている (got: ' + doneCardStyle.shadow + ')');

  // カードの高さは変わらず140pxのまま(見た目の調整のみで高さは変化していない)
  const cardHeights = await page.evaluate(() => Array.from(document.querySelectorAll('.room-card:not(.room-card-sensor)')).map((el) => Math.round(el.getBoundingClientRect().height)));
  const uniqHeights = [...new Set(cardHeights)];
  assert(uniqHeights.length === 1, '全部屋カードの高さが引き続き揃っている (got: ' + JSON.stringify(uniqHeights) + ')');
  assert(uniqHeights[0] === 140, '部屋カードの高さは見た目の変更後も引き続き140pxのまま (got: ' + uniqHeights[0] + ')');

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'Not implemented', 'exitFullscreen', 'requestFullscreen', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL BRAND-ICON-BIGGER / BLUE-FILLED-GEAR / SOFTCUBE-ROOMCARD-V2 ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
