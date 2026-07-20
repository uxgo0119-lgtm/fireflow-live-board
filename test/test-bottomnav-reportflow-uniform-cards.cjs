// 2026-07-17 3点の使い勝手修正の回帰テスト。
// ①「物件情報のReport Flowを1番下にして下さい」→ Report Flow欄を物件情報タブの一番下(設定情報の
//    さらに下)へ移動した。
// ②「次の部屋へ自動遷移するので他の感知器、写真、物件情報にタップした時におかしい動きになって
//    使いづらい」→ #modalBackdrop(z-index:900、全画面を覆う)がボトムナビより手前にあったため、
//    1室操作時間短縮の自動遷移で次の部屋のパネルが開いたまま(=バックドロップ表示中)の状態で
//    下部ナビをタップすると、タップがバックドロップに吸われてタブが切り替わらなかった。
//    ボトムナビのz-indexをバックドロップ・各種パネル(900〜903)より高くすることで解消した。
// ③「部屋カードの縦の大きさを均一に」→ 点検済みカードは.room-status-textがdisplay:noneで
//    行ごと消えており、また前回不良バッジは前回不良がある部屋にしか描画されていなかったため、
//    部屋の状態次第でカードの高さがバラついていた。どちらも「見えないが領域は確保する
//    (visibility:hidden)」方式に変え、常に同じ内容構成になるようにして高さを揃えた。
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

  // ---- ① Report Flowが物件情報タブの一番下にある ----
  // [2026-07-19再修正] 「REPORT FLOWのアイコンアプリ」に続くご指示で、Report Flowの
  // 直前にあった「設定情報」欄自体が撤去された(読み込みは上部ナビ、リセットは歯車メニューへ
  // 一本化)。そのためReport Flowは「設定情報」ではなく「設備点検」の直後・タブの一番下に
  // なる。
  await page.locator('#navList').click();
  await page.waitForTimeout(300);
  const sectionTitles = await page.locator('#listView .section-title').allTextContents();
  const reportFlowIdx = sectionTitles.indexOf('Report Flow');
  assert(sectionTitles.indexOf('設定情報') === -1, '「設定情報」の見出しはもう存在しない(欄自体が撤去された)');
  assert(reportFlowIdx !== -1, '「Report Flow」の見出しが存在する');
  assert(reportFlowIdx === sectionTitles.length - 1, 'Report Flowが物件情報タブの一番下のセクションになっている (got order: ' + JSON.stringify(sectionTitles) + ')');

  // Report Flowのボタン自体は移動後も引き続き機能すること
  const exportBtnVisible = await page.locator('#exportReportFlowBtn').isVisible();
  assert(exportBtnVisible, '移動後も「点検後データを書き出す」ボタンは表示されている');

  // ---- ② 自動遷移で開いたパネル(バックドロップ表示中)でも、下部ナビのタップが正しく機能する ----
  await page.locator('#navHome').click();
  await page.waitForTimeout(200);

  // 同じ階の隣接2部屋を未点検に戻し、1件目を完了させると自動的に2件目のパネルが開く状態を作る。
  async function markUndoRoom(room) {
    await page.locator('.room-card[data-room="' + room + '"]').click();
    await page.waitForTimeout(150);
    await page.locator('#markUndo').click();
    await page.waitForTimeout(150);
    if (await page.locator('#panel').isVisible()) {
      await page.locator('#closePanel').click();
      await page.waitForTimeout(150);
    }
  }
  await markUndoRoom('817');
  await markUndoRoom('816');

  await page.locator('.room-card[data-room="817"]').click();
  await page.waitForTimeout(150);
  await page.locator('#markCancel').click();
  await page.waitForTimeout(300);

  const panelRoomAfterAdvance = await page.locator('#panelRoom').textContent();
  assert(panelRoomAfterAdvance === '816', '817号室を完了させると、自動的に同じ階の次の未点検部屋(816)のパネルが開く');
  assert(await page.locator('#panel').isVisible(), 'パネルが開いている(=バックドロップも表示中)');
  const backdropShown = await page.evaluate(() => getComputedStyle(document.getElementById('modalBackdrop')).display !== 'none');
  assert(backdropShown, 'バックドロップも表示されている(以前はこの状態で下部ナビのタップが効かなかった)');

  // この状態で「感知器」タブをタップ → 以前はタップがバックドロップに奪われて切り替わらなかった
  await page.locator('#navDetector').click();
  await page.waitForTimeout(300);
  assert(await page.evaluate(() => document.getElementById('navDetector').classList.contains('active')),
    'パネルが自動的に開いた状態でも「感知器」タブへの切り替えが正しく機能する');
  assert(!(await page.locator('#panel').isVisible()), 'タブ切り替え後、パネルは正しく閉じている');

  // 同様に「写真」「物件情報」タブについても確認(再度パネルを自動遷移で開かせてから検証)
  await page.locator('#navHome').click();
  await page.waitForTimeout(200);
  await markUndoRoom('815');
  await markUndoRoom('814');
  await page.locator('.room-card[data-room="815"]').click();
  await page.waitForTimeout(150);
  await page.locator('#markCancel').click();
  await page.waitForTimeout(300);
  assert(await page.locator('#panel').isVisible(), '815号室完了後、自動遷移でパネルが開いている');

  await page.locator('#navPhotos').click();
  await page.waitForTimeout(300);
  assert(await page.evaluate(() => document.getElementById('navPhotos').classList.contains('active')),
    'パネルが自動的に開いた状態でも「写真」タブへの切り替えが正しく機能する');
  assert(!(await page.locator('#panel').isVisible()), '「写真」タブ切り替え後、パネルは正しく閉じている');

  await page.locator('#navHome').click();
  await page.waitForTimeout(200);
  await markUndoRoom('813');
  await markUndoRoom('812');
  await page.locator('.room-card[data-room="813"]').click();
  await page.waitForTimeout(150);
  await page.locator('#markCancel').click();
  await page.waitForTimeout(300);
  assert(await page.locator('#panel').isVisible(), '813号室完了後、自動遷移でパネルが開いている');

  await page.locator('#navList').click();
  await page.waitForTimeout(300);
  assert(await page.evaluate(() => document.getElementById('navList').classList.contains('active')),
    'パネルが自動的に開いた状態でも「物件情報」タブへの切り替えが正しく機能する');
  assert(!(await page.locator('#panel').isVisible()), '「物件情報」タブ切り替え後、パネルは正しく閉じている');

  // ---- ③ 部屋カードの縦の大きさが均一 ----
  await page.locator('#navHome').click();
  await page.waitForTimeout(200);
  const heights = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.room-card:not(.room-card-sensor)')).map(function (el) {
      return Math.round(el.getBoundingClientRect().height);
    });
  });
  const uniqueHeights = Array.from(new Set(heights));
  assert(heights.length > 50, '十分な数の部屋カードが検証対象になっている (got: ' + heights.length + ')');
  assert(uniqueHeights.length === 1,
    '前回不良の有無・点検ステータス(点検済み/未点検/不在/キャンセル)に関わらず、全ての部屋カードの高さが揃っている (got distinct heights: ' + JSON.stringify(uniqueHeights) + ')');

  // 前回不良バッジが「ある」部屋・「ない」部屋の両方で高さが同じであることも明示的に確認
  const withDefectHeight = await page.evaluate(() => {
    var el = document.querySelector('.room-card[data-room="717"]');
    return el ? Math.round(el.getBoundingClientRect().height) : null;
  });
  const withoutDefectHeight = await page.evaluate(() => {
    var el = document.querySelector('.room-card[data-room="716"]');
    return el ? Math.round(el.getBoundingClientRect().height) : null;
  });
  assert(withDefectHeight !== null && withoutDefectHeight !== null, '前回不良あり/なしの部屋カードが両方とも見つかった');
  assert(withDefectHeight === withoutDefectHeight,
    '前回不良バッジがある部屋(717)と無い部屋(716)で高さが同じ (got: ' + withDefectHeight + ' vs ' + withoutDefectHeight + ')');

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'Not implemented', 'exitFullscreen', 'requestFullscreen'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL BOTTOM-NAV / REPORT-FLOW-ORDER / UNIFORM-CARD-HEIGHT ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
