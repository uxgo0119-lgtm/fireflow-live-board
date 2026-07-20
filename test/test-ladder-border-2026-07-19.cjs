// 2026-07-19 追加: 「全体で見た時にはしごの部屋がわかるように3パターンぐらいアイデア欲しい」
// のご指示への対応の回帰テスト。
//
// 背景: 通常モードでは、はしご設置部屋に「は」の文字バッジ(.ladder-badge)が表示されるが、
// 密なグリッドモード「全体」(body.enlarged、5列)・「全体拡大」(body.overview、7列)では、
// スペースの都合上この文字バッジ自体を表示しない設定になっていた(見た目上、はしご設置
// 部屋かどうかがこの2モードでは分からなくなっていた)。3パターン(コーナードット/左端カラー
// ボーダー/はしごアイコン)をモックアップで提示し、「B: 左端カラーボーダー」案を採用。
// 部屋カード(.room-card)に.ladder-roomクラスを付与し、全体/全体拡大モードでのみ、
// カード左端に太めのアンバー色(--ladder-accent)のラインを表示するようにした。
//
// 注記: LADDER_ROOMS自体は現状どの物件データでも常に空配列(この機能で実際に「は」バッジが
// 表示されている部屋はまだ存在しない、既存の仕様)。かつ内部のIIFEクロージャに閉じているため
// page.evaluateから直接値を注入することができない。そのため、このテストはCSSの仕組み自体
// (.ladder-roomクラスを持つ要素が各モードで正しい見た目になるか)を、既存の
// test_brandicon_bluegear_cubecard_softv2_2026-07-19.jsと同じ「ダミー要素を一時的に
// DOMへ追加して検証する」手法で確認する。
const { chromium } = require('playwright');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(fileUrl);
  await page.waitForSelector('.room-card', { timeout: 10000 });
  await page.waitForFunction(() => {
    var el = document.getElementById('appSplash');
    return !el || el.getAttribute('data-hidden') === 'true';
  }, { timeout: 5000 });
  await page.waitForTimeout(300);

  // ---- 実際のアプリ側の描画で、はしご対象外の部屋には.ladder-roomクラスが付かない ----
  // (LADDER_ROOMSが常に空のため、実DOM上のどの部屋カードも.ladder-roomを持たないはず)
  const anyLadderInDom = await page.evaluate(() => document.querySelectorAll('.room-card.ladder-room').length);
  assert(anyLadderInDom === 0, '現行のシードデータ(LADDER_ROOMSは常に空)では、実際の部屋カードに.ladder-roomは1つも付いていない');

  // ---- 通常モード: .ladder-roomクラスを持つカードのCSSは変化しない(通常モードは対象外) ----
  const normalModeCheck = await page.evaluate(() => {
    var el = document.createElement('div');
    el.className = 'room-card ladder-room';
    document.body.appendChild(el);
    var cs = getComputedStyle(el);
    var result = { shadow: cs.boxShadow };
    el.remove();
    return result;
  });
  assert(normalModeCheck.shadow.indexOf('245, 158, 11') === -1, '通常モードでは.ladder-roomが付いていてもアンバー色の左端ボーダーは表示されない(全体/全体拡大モード限定の見た目のため)');

  // ---- 「全体」モード: .ladder-roomクラスのカードに左端カラーボーダーが付く ----
  await page.locator('#gridExpandToggle').click();
  await page.waitForTimeout(150);
  await page.locator('.grid-mode-option[data-mode="enlarged"]').click();
  await page.waitForTimeout(200);

  const enlargedCheck = await page.evaluate(() => {
    var pending = document.createElement('div');
    pending.className = 'room-card ladder-room';
    document.body.appendChild(pending);
    var pendingShadow = getComputedStyle(pending).boxShadow;
    pending.remove();

    var done = document.createElement('div');
    done.className = 'room-card room-card-done ladder-room';
    document.body.appendChild(done);
    var doneShadow = getComputedStyle(done).boxShadow;
    done.remove();

    var nonLadder = document.createElement('div');
    nonLadder.className = 'room-card';
    document.body.appendChild(nonLadder);
    var nonLadderShadow = getComputedStyle(nonLadder).boxShadow;
    nonLadder.remove();

    return { pendingShadow, doneShadow, nonLadderShadow };
  });
  assert(enlargedCheck.pendingShadow.indexOf('245, 158, 11') !== -1, '「全体」モードで.ladder-room(未点検)カードにアンバー色のinset左端ボーダーが付いている (got: ' + enlargedCheck.pendingShadow + ')');
  assert(enlargedCheck.doneShadow.indexOf('245, 158, 11') !== -1, '「全体」モードで.ladder-room(点検済み)カードにもアンバー色のinset左端ボーダーが付いている (got: ' + enlargedCheck.doneShadow + ')');
  assert(enlargedCheck.nonLadderShadow.indexOf('245, 158, 11') === -1, '「全体」モードで.ladder-roomクラスの無い通常カードにはアンバー色のボーダーが付かない');

  // ---- 「全体拡大」モード: 同様に左端カラーボーダーが付く ----
  await page.locator('#gridExpandToggle').click();
  await page.waitForTimeout(150);
  await page.locator('.grid-mode-option[data-mode="overview"]').click();
  await page.waitForTimeout(200);

  const overviewCheck = await page.evaluate(() => {
    var pending = document.createElement('div');
    pending.className = 'room-card ladder-room';
    document.body.appendChild(pending);
    var pendingShadow = getComputedStyle(pending).boxShadow;
    pending.remove();

    var done = document.createElement('div');
    done.className = 'room-card room-card-done ladder-room';
    document.body.appendChild(done);
    var doneShadow = getComputedStyle(done).boxShadow;
    done.remove();

    return { pendingShadow, doneShadow };
  });
  assert(overviewCheck.pendingShadow.indexOf('245, 158, 11') !== -1, '「全体拡大」モードで.ladder-room(未点検)カードにアンバー色のinset左端ボーダーが付いている (got: ' + overviewCheck.pendingShadow + ')');
  assert(overviewCheck.doneShadow.indexOf('245, 158, 11') !== -1, '「全体拡大」モードで.ladder-room(点検済み)カードにもアンバー色のinset左端ボーダーが付いている (got: ' + overviewCheck.doneShadow + ')');

  // ---- 通常モードの.ladder-badge(「は」の文字)自体はこれまで通り存在し、機能に影響なし ----
  await page.locator('#gridExpandToggle').click();
  await page.waitForTimeout(150);
  await page.locator('.grid-mode-option[data-mode="normal"]').click();
  await page.waitForTimeout(200);
  assert(await page.locator('.room-card').first().isVisible(), '標準モードに戻しても部屋カードは正常に表示される');

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'Not implemented', 'exitFullscreen', 'requestFullscreen', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL LADDER-BORDER (grid-mode ladder-room indicator) ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
