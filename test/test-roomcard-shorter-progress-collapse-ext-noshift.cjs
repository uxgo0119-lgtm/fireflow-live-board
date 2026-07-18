// 2026-07-17 部屋カードのさらなる短縮・本日の進捗(点検済み内訳)の折りたたみ集約・
// 消火器点検済みトグルのラグ対策(品番が動かないようにする) の回帰テスト。
// ①「部屋カードがまだ縦長なのでもう少し短くする」→ .room-cardの上下パディング・行間・
//   余白をさらに詰め、高さを166px→約154pxまで短縮した。全カードの高さが揃う仕組みは維持。
// ②「本日の進捗の明細が点検済みの部屋が多いので纏める」→ 本日の進捗詳細パネルの
//   「点検済み（N件）」セクションに、もう一段の折りたたみ(既定で折りたたみ、タップで
//   フロアごとの内訳を表示)を追加し、既定では件数だけが見えるようにした。
// ③「消火器点検の点検済み/点検済みにするで品番が移動するのでラグが起こってやりずらい」→
//   トグルボタンのラベル文字を常に「点検済み」の一定文字にし(以前は「点検済みにする」⇔
//   「点検済み」で文字数が変わり、ボタン幅が変わって右隣の品番の位置がずれていた)、
//   状態の違いは塗りつぶし色だけで表すようにした。
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

  // ---- ① 部屋カードのさらなる短縮・高さの均一性維持 ----
  const cardHeights = await page.evaluate(() => Array.from(document.querySelectorAll('.room-card:not(.room-card-sensor)')).map((el) => Math.round(el.getBoundingClientRect().height)));
  const uniqueCardHeights = Array.from(new Set(cardHeights));
  assert(cardHeights.length > 50, '十分な数の部屋カードが検証対象になっている (got: ' + cardHeights.length + ')');
  assert(uniqueCardHeights.length === 1, '部屋カードの高さは引き続き全て揃っている (got distinct heights: ' + JSON.stringify(uniqueCardHeights) + ')');
  assert(uniqueCardHeights[0] <= 158, '部屋カードの高さが前回(166px)よりさらに短くなっている (got: ' + uniqueCardHeights[0] + 'px)');
  assert(uniqueCardHeights[0] >= 140, '部屋カードの高さが詰めすぎて内容が入らなくなるほど小さくはなっていない (got: ' + uniqueCardHeights[0] + 'px)');

  // 特大文字時でも、はしごバッジ等と部屋詳細テキストが重ならないことを確認する
  await page.locator('#fontSizeToggle').click();
  await page.waitForTimeout(150);
  await page.locator('.font-size-option[data-scale="1.3"]').click();
  await page.waitForTimeout(200);
  async function markUndoRoom(room) {
    await page.locator('.room-card[data-room="' + room + '"]').click();
    await page.waitForTimeout(150);
    await page.locator('#markUndo').click().catch(() => {});
    await page.waitForTimeout(150);
    if (await page.locator('#panel').isVisible()) {
      await page.locator('#closePanel').click();
      await page.waitForTimeout(150);
    }
  }
  await markUndoRoom('817');
  await page.locator('.room-card[data-room="817"]').click();
  await page.waitForTimeout(150);
  await page.locator('#visitTimesDetails summary').click();
  await page.waitForTimeout(150);
  async function addVisit(t) {
    await page.locator('#visitTimeInput').fill(t);
    await page.locator('#addVisitTime').click();
    await page.waitForTimeout(150);
  }
  await addVisit('09:00');
  await addVisit('11:00');
  await page.locator('#closePanel').click();
  await page.waitForTimeout(200);
  const overlapCheck = await page.evaluate(() => {
    var card = document.querySelector('.room-card[data-room="817"]');
    var detail = card.querySelector('.room-detail');
    var ha = card.querySelector('.ha-badge');
    if (!ha) return { hasHa: false };
    var detailRect = detail.getBoundingClientRect();
    var haRect = ha.getBoundingClientRect();
    return { hasHa: true, gap: haRect.top - detailRect.bottom };
  });
  assert(overlapCheck.hasHa, '検証対象の817号室に、はしごバッジ(は)を持つ避難器具の記録がある');
  assert(overlapCheck.gap >= 0, '特大文字(font-scale 1.3)でも、部屋詳細テキストとはしごバッジが重ならない (got gap: ' + overlapCheck.gap + 'px)');
  // 標準文字に戻す
  await page.locator('#fontSizeToggle').click();
  await page.waitForTimeout(150);
  await page.locator('.font-size-option[data-scale="1"]').click();
  await page.waitForTimeout(200);

  // ---- ② 本日の進捗詳細: 「点検済み」内訳セクションが既定で折りたたまれている ----
  await page.locator('.progress-card').click();
  await page.waitForTimeout(300);
  const doneListVisibleBefore = await page.evaluate(() => getComputedStyle(document.getElementById('progressDoneList')).display);
  assert(doneListVisibleBefore === 'none', '「点検済み」セクションの内訳(フロアごとの一覧)は、既定では折りたたまれて非表示になっている (got: ' + doneListVisibleBefore + ')');
  const doneCountVisible = await page.evaluate(() => document.getElementById('progressDoneCount').textContent);
  assert(doneCountVisible !== '', '折りたたんでいても件数(N件)自体は見える (got: "' + doneCountVisible + '")');
  const chevronBefore = await page.evaluate(() => document.getElementById('progressDoneChevron').textContent);
  assert(chevronBefore === '▼', '折りたたみ中はシェブロンが▼になっている (got: "' + chevronBefore + '")');

  await page.locator('#progressDoneToggle').click();
  await page.waitForTimeout(200);
  const doneListVisibleAfter = await page.evaluate(() => getComputedStyle(document.getElementById('progressDoneList')).display);
  assert(doneListVisibleAfter !== 'none', '「点検済み」の見出しをタップすると、フロアごとの内訳が展開される (got: ' + doneListVisibleAfter + ')');
  const chevronAfter = await page.evaluate(() => document.getElementById('progressDoneChevron').textContent);
  assert(chevronAfter === '▲', '展開中はシェブロンが▲になっている (got: "' + chevronAfter + '")');

  // 再度タップすると折りたたまれる
  await page.locator('#progressDoneToggle').click();
  await page.waitForTimeout(200);
  const doneListVisibleAfter2 = await page.evaluate(() => getComputedStyle(document.getElementById('progressDoneList')).display);
  assert(doneListVisibleAfter2 === 'none', 'もう一度タップすると再び折りたたまれる (got: ' + doneListVisibleAfter2 + ')');

  await page.locator('#closeProgressDetail').click();
  await page.waitForTimeout(150);

  // ---- ③ 消火器点検済みトグル: タップしてもラベル文字・ボタン幅・品番の位置が変わらない ----
  await page.locator('#navList').click();
  await page.waitForTimeout(350);
  await page.locator('.equipment-row[data-name="消火器具"]').click();
  await page.waitForTimeout(200);
  await page.waitForSelector('.ext-card', { timeout: 10000 });
  const card = page.locator('.ext-card').nth(3);
  const toggleBtn = card.locator('.ext-check-toggle');
  const serial = card.locator('.ext-serial');

  const beforeLabel = await toggleBtn.textContent();
  const beforeWidth = await toggleBtn.evaluate((el) => el.getBoundingClientRect().width);
  const beforeSerialLeft = await serial.evaluate((el) => el.getBoundingClientRect().left);

  await toggleBtn.click();
  await page.waitForTimeout(150);

  const afterLabel = await toggleBtn.textContent();
  const afterWidth = await toggleBtn.evaluate((el) => el.getBoundingClientRect().width);
  const afterSerialLeft = await serial.evaluate((el) => el.getBoundingClientRect().left);

  assert(beforeLabel.trim() === '点検済み' && afterLabel.trim() === '点検済み', 'タップの前後でボタンのラベル文字は「点検済み」のまま変わらない (before: "' + beforeLabel.trim() + '", after: "' + afterLabel.trim() + '")');
  assert(beforeWidth === afterWidth, 'タップの前後でボタンの幅が変わらない (before: ' + beforeWidth + ', after: ' + afterWidth + ')');
  assert(beforeSerialLeft === afterSerialLeft, 'ボタン幅が変わらないため、右隣の品番の位置もタップの前後でずれない (before: ' + beforeSerialLeft + ', after: ' + afterSerialLeft + ')');

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'Not implemented', 'exitFullscreen', 'requestFullscreen', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL ROOMCARD-SHORTER / PROGRESS-COLLAPSE / EXT-NOSHIFT ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
