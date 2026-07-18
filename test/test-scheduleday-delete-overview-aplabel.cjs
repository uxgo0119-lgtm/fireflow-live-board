// 2026-07-17 点検日程の×(削除)が機能しない不具合の修正・俯瞰モードの部屋一覧をA/P表示に変更 の回帰テスト。
// ①「添付の点検日程の✖️が機能しない」→ window.confirm()を使った削除確認は、環境によっては
//   ダイアログ自体が表示されずタップしても反応が無いように見えることがあるため、
//   アプリ内で完結する独自の確認ダイアログ(#scheduleDayDeleteConfirm)に置き換えた。
// ②「添付の部屋一覧で部屋番号の下にA・P時間指定をつけてほしい。その際、現在ある
//   チェックマークや✖️は削除」→ 俯瞰モード(＋を2回タップ)の部屋カードについて、点検状況を
//   表すチェック/✖/○アイコン(.room-status-icon)を非表示にし、代わりに点検希望時刻の
//   A(午前)/P(午後)等のラベル(.sched-label)を部屋番号の下に表示するようにした。
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
  // window.confirm()が呼ばれたら、これは今回使わなくなったはずのAPIなので検知できるようにする
  let nativeConfirmCalled = false;
  page.on('dialog', async (dialog) => { nativeConfirmCalled = true; await dialog.dismiss(); });

  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(fileUrl);
  await page.waitForSelector('.room-card', { timeout: 10000 });

  // ---- ① 点検日程の削除: 独自ダイアログで確認・削除できる ----
  await page.locator('#navList').click();
  await page.waitForTimeout(350);
  await page.locator('#addScheduleDayBtn').click();
  await page.waitForTimeout(150);
  await page.locator('#addScheduleDayBtn').click();
  await page.waitForTimeout(150);
  const daysBefore = await page.evaluate(() => document.querySelectorAll('.schedule-day-card').length);
  assert(daysBefore === 3, '事前準備として点検日程を3日分にした (got: ' + daysBefore + ')');

  const dialogVisibleBefore = await page.evaluate(() => getComputedStyle(document.getElementById('scheduleDayDeleteConfirm')).display);
  assert(dialogVisibleBefore === 'none', '削除確認ダイアログは、×タップ前は非表示になっている (got: ' + dialogVisibleBefore + ')');

  await page.locator('.schedule-day-delete-btn').nth(1).click();
  await page.waitForTimeout(150);
  const dialogVisibleAfter = await page.evaluate(() => getComputedStyle(document.getElementById('scheduleDayDeleteConfirm')).display);
  assert(dialogVisibleAfter === 'block', '×タップ後、アプリ内の削除確認ダイアログが表示される(window.confirm()を使わない) (got: ' + dialogVisibleAfter + ')');
  const dialogBody = await page.evaluate(() => document.getElementById('scheduleDayDeleteConfirmBody').textContent);
  assert(dialogBody.indexOf('2日目') !== -1, '削除確認ダイアログに対象の日程(2日目)が表示されている (got: "' + dialogBody + '")');

  // キャンセルすると削除されない
  await page.locator('#scheduleDayDeleteCancel').click();
  await page.waitForTimeout(150);
  const daysAfterCancel = await page.evaluate(() => document.querySelectorAll('.schedule-day-card').length);
  assert(daysAfterCancel === 3, 'キャンセルした場合は日程が削除されない (got: ' + daysAfterCancel + ')');
  const dialogHiddenAfterCancel = await page.evaluate(() => getComputedStyle(document.getElementById('scheduleDayDeleteConfirm')).display);
  assert(dialogHiddenAfterCancel === 'none', 'キャンセル後、ダイアログは再び非表示になる (got: ' + dialogHiddenAfterCancel + ')');

  // 削除するとその日程が消える
  await page.locator('.schedule-day-delete-btn').nth(1).click();
  await page.waitForTimeout(150);
  await page.locator('#scheduleDayDeleteConfirmBtn').click();
  await page.waitForTimeout(150);
  const daysAfterDelete = await page.evaluate(() => document.querySelectorAll('.schedule-day-card').length);
  assert(daysAfterDelete === 2, '削除するボタンをタップすると、実際に日程が1件削除される (got: ' + daysAfterDelete + ')');

  assert(!nativeConfirmCalled, 'window.confirm()(ブラウザ標準ダイアログ)はもう使われていない');

  // ---- ② 俯瞰モード: チェック/✖アイコンが消え、代わりにA/P等のラベルが部屋番号の下に出る ----
  await page.locator('#navHome').click();
  await page.waitForTimeout(350);
  await page.locator('#gridExpandToggle').click(); // normal -> enlarged
  await page.waitForTimeout(150);
  await page.locator('#gridExpandToggle').click(); // enlarged -> overview
  await page.waitForTimeout(200);
  const isOverview = await page.evaluate(() => document.body.classList.contains('overview'));
  assert(isOverview, '俯瞰モードに切り替わっている');

  const iconVisible = await page.evaluate(() => {
    var icon = document.querySelector('.room-card:not(.room-card-sensor) .room-status-icon');
    return icon ? getComputedStyle(icon).display : null;
  });
  assert(iconVisible === 'none', '俯瞰モードでは、点検状況のチェック/✖/○アイコンが非表示になっている (got: ' + iconVisible + ')');

  const labelInfo = await page.evaluate(() => {
    var cards = Array.from(document.querySelectorAll('.room-card:not(.room-card-sensor)'));
    var withLabel = cards.filter(function(c) {
      var label = c.querySelector('.sched-label');
      return label && getComputedStyle(label).display !== 'none' && label.textContent.trim();
    });
    return {
      totalCards: cards.length,
      withLabelCount: withLabel.length,
      sampleTexts: withLabel.slice(0, 5).map(function(c) { return c.querySelector('.sched-label').textContent.trim(); }),
    };
  });
  assert(labelInfo.totalCards > 50, '十分な数の部屋カードが検証対象になっている (got: ' + labelInfo.totalCards + ')');
  assert(labelInfo.withLabelCount > 0, '俯瞰モードで、部屋番号の下にA/P等の時間指定ラベルが表示されている部屋がある (got count: ' + labelInfo.withLabelCount + ', samples: ' + JSON.stringify(labelInfo.sampleTexts) + ')');

  // ラベルが部屋番号の「下」に来ている(縦並び)ことも確認する
  const stackedVertically = await page.evaluate(() => {
    var card = Array.from(document.querySelectorAll('.room-card:not(.room-card-sensor)')).filter(function(c) {
      var label = c.querySelector('.sched-label');
      return label && label.textContent.trim();
    })[0];
    if (!card) return null;
    var numRect = card.querySelector('.room-num').getBoundingClientRect();
    var labelRect = card.querySelector('.sched-label').getBoundingClientRect();
    return labelRect.top >= numRect.bottom - 2; // ラベルの上端が部屋番号の下端以降にある
  });
  assert(stackedVertically === true, '時間指定ラベルは部屋番号の下に縦並びで表示されている');

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'Not implemented', 'exitFullscreen', 'requestFullscreen', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL SCHEDULE-DAY-DELETE / OVERVIEW-AP-LABEL ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
