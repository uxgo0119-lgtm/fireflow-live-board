// 2026-07-19 追加: 「上部ナビゲーションの➕は拡大表示を全体俯瞰にする（名称は全体）、
// 全体俯瞰を俯瞰のそのまま部屋カード全体が多くなる（名称は全体拡大）」「物件情報の
// Data Bridgeが取り込んだ...の文言は削除」「上部のナビゲーション、四角を無くして
// ロゴだけにする。その際色は青色にする（少し現状より太く）」の3点の回帰テスト
// (「最初のログイン時のアイコンアプリの白枠はいらない」はtest_login_gate_redesign_
// 2026-07-19.jsで別途検証)。
//
// 背景:
// ・表示モードは旧「標準/拡大表示(個々のカードを大きく)/全体俯瞰(密なグリッド)」の
//   3段階だったが、「拡大表示」は廃止し、旧「全体俯瞰」と同じ密なグリッドを「全体」に、
//   旧「全体俯瞰」自体はさらに部屋カードが多く収まるより密なグリッドにした上で
//   「全体拡大」に改名した(標準→全体→全体拡大の順で一望できる部屋数が増える)。
//   [2026-07-19再修正]「全体→部屋カードを横に5個表示、そこから5個づつ表示。全体拡大→
//   部屋カード横に8個表示、そこから8個づつ表示」のご指示により、画面幅で可変する
//   auto-fill(minmax)方式ではなく、常に横5列/横8列に固定するgrid-template-columns:
//   repeat(5, 1fr) / repeat(8, 1fr) に変更した。
//   [2026-07-19再々修正]「全体拡大モードを横に7つに変更」のご指示により、全体拡大は
//   8列→7列(repeat(7, 1fr))に変更した。
// ・上部ナビの3つのアイコンボタン(画面ロック・表示モード・文字サイズ)は、白い角丸四角の
//   背景・枠線・影を廃止し、アイコンのグリフだけを青色(ブランドブルー)で表示するように
//   変更。各SVGのstroke-widthも少し太くしている。
const { chromium } = require('playwright');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 500, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(fileUrl);
  await page.waitForSelector('.room-card', { timeout: 10000 });

  // ---- 上部ナビのアイコンボタン: 白い四角背景が無く、アイコンが青色になっている ----
  // (2026-07-19: 画面ロック・文字サイズの2アイコンは歯車アイコン#settingsToggleに統合された)
  const iconBtnStyles = await page.evaluate(() => {
    return ['uploadDataToggle', 'gridExpandToggle', 'settingsToggle'].map(function (id) {
      var cs = getComputedStyle(document.getElementById(id));
      return { id: id, bg: cs.backgroundColor, border: cs.borderStyle, color: cs.color, shadow: cs.boxShadow };
    });
  });
  iconBtnStyles.forEach(function (s) {
    assert(s.bg === 'rgba(0, 0, 0, 0)' || s.bg === 'transparent', '#' + s.id + ' の背景が透明(白い四角が無い) (got: ' + s.bg + ')');
    assert(s.border === 'none', '#' + s.id + ' の枠線が無い (got: ' + s.border + ')');
    assert(s.shadow === 'none', '#' + s.id + ' の影(box-shadow)が無い (got: ' + s.shadow + ')');
    assert(s.color === 'rgb(0, 122, 254)', '#' + s.id + ' のアイコン色が青(ブランドブルー)になっている (got: ' + s.color + ')');
  });

  // ---- 表示モードポップアップ: 標準/全体/全体拡大の3つに改名されている ----
  await page.locator('#gridExpandToggle').click();
  await page.waitForTimeout(150);
  const optionLabels = await page.evaluate(() => Array.from(document.querySelectorAll('.grid-mode-option')).map(function (b) { return b.textContent.replace('✓', '').trim(); }));
  assert(JSON.stringify(optionLabels) === JSON.stringify(['標準', '全体', '全体拡大']), '表示モードの選択肢が「標準」「全体」「全体拡大」の3つになっている (got: ' + JSON.stringify(optionLabels) + ')');

  // ---- 「全体」モードは密なグリッド(1行に複数の小さい部屋カード) ----
  await page.locator('.grid-mode-option[data-mode="enlarged"]').click();
  await page.waitForTimeout(200);
  const zentaiInfo = await page.evaluate(() => {
    var cards = Array.from(document.querySelectorAll('.room-card'));
    var firstCardTop = cards.length ? cards[0].getBoundingClientRect().top : null;
    var sameRowCount = cards.filter(function (c) { return Math.abs(c.getBoundingClientRect().top - firstCardTop) < 3; }).length;
    return { sameRowCount: sameRowCount, bodyHasEnlarged: document.body.classList.contains('enlarged') };
  });
  assert(zentaiInfo.bodyHasEnlarged, '「全体」選択でbody.enlargedクラスが付与される(内部クラス名は従来のenlargedを流用)');
  assert(zentaiInfo.sameRowCount === 5, '「全体」モードは画面幅によらず常に横5個(1行5枚)固定になっている (got: ' + zentaiInfo.sameRowCount + '枚/行)');

  // ---- 「全体拡大」モードは「全体」よりもさらに1行あたりの部屋カード数が多い ----
  await page.locator('#gridExpandToggle').click();
  await page.waitForTimeout(150);
  await page.locator('.grid-mode-option[data-mode="overview"]').click();
  await page.waitForTimeout(200);
  const zentaiKakudaiInfo = await page.evaluate(() => {
    var cards = Array.from(document.querySelectorAll('.room-card'));
    var firstCardTop = cards.length ? cards[0].getBoundingClientRect().top : null;
    var sameRowCount = cards.filter(function (c) { return Math.abs(c.getBoundingClientRect().top - firstCardTop) < 3; }).length;
    return { sameRowCount: sameRowCount, bodyHasOverview: document.body.classList.contains('overview') };
  });
  assert(zentaiKakudaiInfo.bodyHasOverview, '「全体拡大」選択でbody.overviewクラスが付与される(内部クラス名は従来のoverviewを流用)');
  assert(zentaiKakudaiInfo.sameRowCount === 7, '「全体拡大」モードは画面幅によらず常に横7個(1行7枚)固定になっている (got: ' + zentaiKakudaiInfo.sameRowCount + '枚/行)');

  // ---- 画面幅を変えても(auto-fillではなく固定列数のため)5列/7列が維持される ----
  await page.setViewportSize({ width: 375, height: 700 });
  await page.waitForTimeout(150);
  const kakudaiColsNarrow = await page.evaluate(() => {
    var cards = Array.from(document.querySelectorAll('.room-card'));
    var top0 = cards[0].getBoundingClientRect().top;
    return cards.filter(function (c) { return Math.abs(c.getBoundingClientRect().top - top0) < 3; }).length;
  });
  assert(kakudaiColsNarrow === 7, '「全体拡大」は画面幅を375pxに変えても引き続き横7個固定のまま (got: ' + kakudaiColsNarrow + '枚/行)');
  await page.setViewportSize({ width: 500, height: 900 });
  await page.waitForTimeout(150);

  // 標準モードに戻しておく
  await page.locator('#gridExpandToggle').click();
  await page.waitForTimeout(150);
  await page.locator('.grid-mode-option[data-mode="normal"]').click();
  await page.waitForTimeout(200);

  // ---- 物件情報タブの「Data Bridgeが取り込んだ...」の文言が削除されている ----
  await page.locator('#navList').click();
  await page.waitForTimeout(300);
  const dataBridgeTextCount = await page.locator('text=Data Bridgeが取り込んだ').count();
  assert(dataBridgeTextCount === 0, '物件情報タブの「Data Bridgeが取り込んだ、点検に必要な情報だけを表示しています。」の文言が削除されている');
  const propertyTitleVisible = await page.locator('.section-title:has-text("物件情報")').first().isVisible();
  assert(propertyTitleVisible, '「物件情報」の見出し自体は引き続き表示されている(巻き添え削除されていない)');

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'Not implemented', 'exitFullscreen', 'requestFullscreen', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL GRIDMODE / NAV-ICON / DATA-BRIDGE-TEXT ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
