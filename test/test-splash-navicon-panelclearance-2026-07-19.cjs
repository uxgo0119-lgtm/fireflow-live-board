// 2026-07-19 追加: 「上部ナビゲーションはもう少し太くする」「各ナビゲーションの間隔を
// 縮める」「ログイン前にロゴを現れるようにしたい」「やはり未点検が見切れる(→実際には
// 部屋パネル内の「未点検に戻す」ボタンが下部ナビゲーションの裏に隠れていた)」の4点の
// 回帰テスト。
//
// 背景:
// ①② 上部ナビの3アイコン(画面ロック・表示モード・文字サイズ)のstroke-widthを前回の
//    値からさらに太くし(例: 画面ロック2.6→3.2、+ボタン3.2→3.8、文字サイズ2.3/1.8→
//    2.8/2.2)、.topbar-rightのgapを10px→2pxに詰めた。
//    [2026-07-19再修正] 画面ロック・文字サイズの2アイコンは、後日「⚙マークを1番右に
//    追加し、そこにロック画面や文字サイズ変更を入れる」のご指示により、歯車アイコン
//    (#settingsToggle)に統合された。そのためこのテストのstroke-widthの検証は、現存する
//    #gridExpandToggleと#settingsToggleの2つに対して行っている。
// ③ ページを開いた瞬間に表示される起動スプラッシュ画面(#appSplash、index.html内に直接
//    埋め込み、supabase-integration.jsの読み込みを待たない)を追加した。ログインゲートの
//    セッション確認が終わった時点でhideAppSplash()が呼ばれてフェードアウトする。CDNが
//    使えない環境(このテスト環境を含む)でも1000ms後に自動的に隠れるフォールバックを持つ。
//    [2026-07-19再修正]「Live Board」の文字ロゴ(ワードマーク)は削除し、アイコンのみを
//    88px→150pxに拡大して表示するようにした。
// ④ ユーザーから「やはり未点検が見切れる。ボタンが多いのでしょうか？」との指摘があり、
//    添付画面から実際には部屋パネル(#panel)内の「未点検に戻す」ボタンが、下部ナビゲーション
//    (.bottom-nav、z-index:950)の裏に隠れていたことが判明(文字サイズを「特大」にすると
//    再現)。#panel含む中央配置の全モーダルのmax-heightをmin(86vh, calc(100vh - 200px))に
//    変更し、下部ナビの高さ分の余白を確保した。
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

  // ---- ③ 起動スプラッシュ画面が、ページを開いた直後から表示されている ----
  const splashVisibleImmediately = await page.locator('#appSplash').isVisible().catch(() => false);
  assert(splashVisibleImmediately, 'ページを開いた直後から起動スプラッシュ画面(#appSplash)が表示されている');
  const splashImgCount = await page.locator('#appSplash img').count();
  assert(splashImgCount === 1, 'スプラッシュ画面はアイコンのみ(ワードマークロゴ無し)の1画像になっている (got: ' + splashImgCount + ')');
  const splashIconWidth = await page.evaluate(() => getComputedStyle(document.querySelector('#appSplash img')).width);
  assert(parseFloat(splashIconWidth) >= 150, 'スプラッシュ画面のアイコンが大きく表示されている (got: ' + splashIconWidth + ')');
  const splashBg = await page.evaluate(() => getComputedStyle(document.getElementById('appSplash')).backgroundColor);
  assert(splashBg === 'rgb(255, 255, 255)', 'スプラッシュ画面の背景が白になっている (got: ' + splashBg + ')');

  // ---- ③ supabase-integration.jsが読み込めない環境でも、フォールバックで自動的に隠れる ----
  await page.waitForFunction(() => {
    var el = document.getElementById('appSplash');
    return !el || el.getAttribute('data-hidden') === 'true';
  }, { timeout: 3000 });
  assert(true, 'supabase-integration.jsが読み込めなくても、フォールバックでスプラッシュが自動的に隠れる(画面が固まらない)');

  await page.waitForSelector('.room-card', { timeout: 10000 });

  // ---- ①② 上部ナビのアイコン間隔が詰まっている、stroke-widthが前回よりさらに太い ----
  // (2026-07-19再修正: 画面ロック・文字サイズの2アイコンは歯車アイコン#settingsToggleに
  //  統合されたため、grid/settingsの2つを確認する)
  const topbarGap = await page.evaluate(() => getComputedStyle(document.querySelector('.topbar-right')).gap);
  assert(topbarGap === '2px', '上部ナビのアイコン間隔が2pxに詰まっている (got: ' + topbarGap + ')');
  const gridStrokeWidth = await page.evaluate(() => document.querySelector('#gridExpandToggle svg path').getAttribute('stroke-width'));
  assert(parseFloat(gridStrokeWidth) >= 3.8, '表示モードアイコンのstroke-widthが太くなっている (got: ' + gridStrokeWidth + ')');
  // 2026-07-19再修正:「歯車マークは添付を参照で色は青で」のご指示により、線画(stroke)の
  // 自作歯車から、塗りつぶし(fill)の標準的な歯車アイコンに変更したため、stroke-widthでは
  // なくfillで視認性を検証する。
  const settingsFill = await page.evaluate(() => document.querySelector('#settingsToggle svg').getAttribute('fill'));
  assert(settingsFill === 'currentColor', '設定(歯車)アイコンが塗りつぶし(fill=currentColor)で視認できる太さになっている (got: ' + settingsFill + ')');
  const settingsColor = await page.evaluate(() => getComputedStyle(document.querySelector('#settingsToggle')).color);
  assert(settingsColor === 'rgb(0, 122, 254)', '設定(歯車)アイコンの色が青になっている (got: ' + settingsColor + ')');

  // ---- ④ 文字サイズを「特大」にした状態で、部屋パネルの「未点検に戻す」ボタンが
  //      スクロールすれば下部ナビゲーションに隠れずに見えるようになっている ----
  // (2026-07-19再修正: 文字サイズ変更は歯車アイコン#settingsToggleを開いた先に移動した)
  await page.locator('#settingsToggle').click();
  await page.waitForTimeout(150);
  // 2026-07-19追記: 「全データをリセット」(#resetDataBtn)も歯車メニュー内に移動し、同じ
  // .font-size-optionクラスを共有するようになったため、文字サイズの選択肢を撃ち抜くには
  // data-scale属性で絞り込む必要がある(絞り込まないと.last()がリセットボタンを指してしまう)。
  await page.locator('.font-size-option[data-scale]').last().click();
  await page.waitForTimeout(150);

  await page.locator('.room-card').first().click();
  await page.waitForTimeout(300);

  const panelNavClearance = await page.evaluate(() => {
    var panel = document.getElementById('panel');
    var nav = document.querySelector('.bottom-nav');
    return panel.getBoundingClientRect().bottom <= nav.getBoundingClientRect().top;
  });
  assert(panelNavClearance, '文字サイズ「特大」でも、部屋パネル(#panel)自体の下端が下部ナビゲーションの上端より上に収まっている(重ならない)');

  await page.evaluate(() => {
    var panel = document.getElementById('panel');
    panel.scrollTop = panel.scrollHeight;
  });
  await page.waitForTimeout(150);
  const markUndoFullyVisible = await page.evaluate(() => {
    var markUndo = document.getElementById('markUndo');
    var nav = document.querySelector('.bottom-nav');
    var mr = markUndo.getBoundingClientRect();
    var nr = nav.getBoundingClientRect();
    return mr.bottom <= nr.top && mr.height > 0;
  });
  assert(markUndoFullyVisible, '文字サイズ「特大」でパネル最下部までスクロールしても、「未点検に戻す」ボタンが下部ナビゲーションに隠れずに全体が見える');

  // 標準の文字サイズに戻しておく
  await page.locator('#closePanel').click().catch(() => {});
  await page.waitForTimeout(150);
  await page.locator('#settingsToggle').click();
  await page.waitForTimeout(150);
  // 2026-07-19追記: #settingsMenuLockBtnも同じ.font-size-optionクラスを使っているため、
  // 「標準」を確実に選ぶにはdata-scale属性で絞り込む。
  await page.locator('.font-size-option[data-scale]').first().click();
  await page.waitForTimeout(150);

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'Not implemented', 'exitFullscreen', 'requestFullscreen', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL SPLASH / NAV-ICON-BOLD-SPACING / PANEL-BOTTOMNAV-CLEARANCE ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
