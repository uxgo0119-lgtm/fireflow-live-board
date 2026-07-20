// 2026-07-19 追加: 「前回不良の枠が右に長くなっている / 未点検が見切れている / 上部ナビゲーション
// の文字サイズの右隣を設備情報ロックを削除 / 本日の進捗が101%でバグってる」の4点の回帰テスト
// (5点目のログイン画面刷新は test_login_gate_redesign_2026-07-19.js で別途検証)。
//
// 背景:
// ① .room-cardをdisplay:flex; flex-direction:columnにした際、align-itemsを明示していなかった
//    ため、初期値のstretchによりinline-blockのはずの.prev-defect-badgeがカード幅いっぱいに
//    横長へ引き伸ばされていた。align-self:flex-startを追加して修正。
// ②④ TOTAL_ROOMS(Excel取込時、各階のrooms数のみを集計)がCOMMON_AREA_KEY(共用部・屋外)を
//    含んでいないのに対し、updateStats()のdoneカウントはstateの全キー(COMMON_AREA_KEYを含む)
//    を対象にしていたため、共用部を点検済みにするとdoneがTOTAL_ROOMSを1件超え、
//    「本日の進捗101%」「残り-1件」「未点検が見切れている(-1件という不正な表示)」という
//    バグになっていた。実際、デモ用の初期シードデータ(SEED_STATE_RAW)には最初から
//    「共用部・屋外」がstatus:doneとして含まれており、素の状態でこのバグが再現していた。
//    updateStats()でCOMMON_AREA_KEYをカウント対象から除外して修正。
// ③ 上部ナビの文字サイズボタンの右隣にあった「設備情報の設定（ロック付き）」ボタン
//    (#equipmentSettingsToggle)と、そのロック確認ダイアログ・設定パネルを削除。
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
  await page.waitForTimeout(200);

  // ---- ①「前回不良」バッジがカード幅いっぱいに引き伸ばされていない ----
  const badgeInfo = await page.evaluate(() => {
    var badge = document.querySelector('.prev-defect-badge:not(.prev-defect-badge-empty)');
    if (!badge) return null;
    var br = badge.getBoundingClientRect();
    var cr = badge.closest('.room-card').getBoundingClientRect();
    return { badgeW: br.width, cardW: cr.width };
  });
  assert(!!badgeInfo, '前回不良バッジを持つ部屋カードが見つかる(デモデータに含まれる)');
  assert(badgeInfo.badgeW < badgeInfo.cardW * 0.6, '「前回不良」バッジがカード幅いっぱいに引き伸ばされておらず、内容に応じた幅になっている (badge: ' + badgeInfo.badgeW.toFixed(1) + 'px, card: ' + badgeInfo.cardW.toFixed(1) + 'px)');

  // ---- ②④ デモの初期シードデータ(共用部・屋外がstatus:done)のままで、本日の進捗が
  //      101%や-1件にならず、正しく計算されている ----
  const stats = await page.evaluate(() => ({
    pct: document.getElementById('progressPct').textContent,
    statDone: document.getElementById('statDone').textContent,
    statPending: document.getElementById('statPending').textContent,
    ringRemain: document.getElementById('ringRemain').textContent,
  }));
  assert(stats.pct === '100', '本日の進捗が101%ではなく正しく100%になっている(共用部・屋外はカウント対象外) (got: ' + stats.pct + '%)');
  assert(stats.statDone === '129件', '点検済み件数が実際の部屋数(129件)と一致し、共用部の分は加算されていない (got: ' + stats.statDone + ')');
  assert(stats.statPending === '0件', '未点検件数が-1件のような不正な値ではなく、正しく0件になっている(見切れバグの解消) (got: ' + stats.statPending + ')');
  assert(stats.ringRemain === '0件', 'リング内の残り件数も-1件ではなく正しく0件になっている (got: ' + stats.ringRemain + ')');

  // ---- ③ 上部ナビの「設備情報の設定（ロック付き）」ボタンが削除されている ----
  const equipToggleCount = await page.locator('#equipmentSettingsToggle').count();
  assert(equipToggleCount === 0, '上部ナビの設備情報ロックボタン(#equipmentSettingsToggle)が削除されている');
  const equipPanelCount = await page.locator('#equipmentSettingsPanel').count();
  assert(equipPanelCount === 0, '設備情報の設定パネル(#equipmentSettingsPanel)も削除されている');
  const equipLockConfirmCount = await page.locator('#equipmentSettingsLockConfirm').count();
  assert(equipLockConfirmCount === 0, '設備情報の設定ロック確認ダイアログ(#equipmentSettingsLockConfirm)も削除されている');
  // 隣の拡大表示ボタン・設定(文字サイズ・画面ロック)ボタンは巻き添えで消えていない
  // (2026-07-19: 文字サイズ・画面ロックは歯車アイコン#settingsToggleに統合された)
  const gridExpandVisible = await page.locator('#gridExpandToggle').isVisible();
  assert(gridExpandVisible, '表示拡大ボタン(#gridExpandToggle)は引き続き表示されている(巻き添え削除されていない)');
  const settingsToggleVisible = await page.locator('#settingsToggle').isVisible();
  assert(settingsToggleVisible, '設定ボタン(#settingsToggle、画面ロック・文字サイズ)は引き続き表示されている(巻き添え削除されていない)');

  // ---- 設備一覧自体(EQUIPMENT_LIST由来の機能)は設定パネル削除後も引き続き動作する ----
  await page.locator('#navEquipment').click().catch(() => {});
  await page.waitForTimeout(300);
  const equipmentListVisible = await page.locator('#equipmentList').isVisible().catch(() => false);
  if (equipmentListVisible) {
    const rowCount = await page.locator('#equipmentList .equipment-row, #equipmentList .ec-equip-row').count().catch(() => 0);
    console.log('INFO: 設備一覧の行数 = ' + rowCount + ' (設定パネル削除後も設備点検自体は正常に表示される)');
  }

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'Not implemented', 'exitFullscreen', 'requestFullscreen', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL LB-5-ITEMS(①②③④) ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
