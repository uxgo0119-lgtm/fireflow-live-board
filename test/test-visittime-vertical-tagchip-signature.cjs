// 2026-07-17 訪問時間の縦表示・タグタップ時の反転配色・サイン全画面時のボケ改善 の回帰テスト。
// ①「訪問時間 ○○:○○ ○○:○○ 縦にして下さい」→ 部屋カードの訪問時刻表示(直近2回まで)を、
//   「、」区切りの横並びから<br>による縦並びに変更した。あわせて.room-detailのmin-heightを
//   1行分(1.4em)から2行分(2.8em)に引き上げ、部屋カードの高さの均一性を維持している。
// ②「写真一覧をタグをタップすると塗り潰しの青に白文字に切り替わる」→ 写真一覧のタグ絞り込み
//   トグルの選択中(タップ後)の状態を、白地・青文字から青塗りつぶし・白文字に変更した
//   (未選択は引き続き白地・青枠・青文字のまま)。
// ③「サインを画面いっぱいに書いた場合、サインがボケてる」→ 全画面表示時、canvasの実解像度が
//   常に600×240のままCSSで大きく引き伸ばされていたためボケていた。表示サイズ×
//   devicePixelRatio分まで実解像度を引き上げ、既に描かれている内容も保持したまま描き直す
//   ようにして改善した。
const { chromium } = require('playwright');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

function rgbToHex(rgb) {
  var m = rgb.match(/\d+/g);
  if (!m) return rgb;
  return '#' + m.slice(0, 3).map(function (n) { return Number(n).toString(16).padStart(2, '0'); }).join('').toUpperCase();
}

const BLUE = '#007AFE';

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 420, height: 800 }, deviceScaleFactor: 3 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(fileUrl);
  await page.waitForSelector('.room-card', { timeout: 10000 });

  // ---- ① 部屋カードの訪問時刻: 縦並び(<br>)・カード高さの均一性を維持 ----
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
  await addVisit('14:00');
  await page.locator('#closePanel').click();
  await page.waitForTimeout(200);

  const detailHTML = await page.evaluate(() => document.querySelector('.room-card[data-room="817"] .room-detail').innerHTML);
  assert(detailHTML.indexOf('<br>') !== -1, '部屋カードの訪問時刻が<br>で改行され縦に並んでいる (got: "' + detailHTML + '")');
  assert(detailHTML.indexOf('09:00') === -1, '部屋カードには最初(1回目)の訪問時刻(09:00)は表示されていない (got: "' + detailHTML + '")');
  assert(detailHTML.indexOf('11:00') !== -1 && detailHTML.indexOf('14:00') !== -1,
    '部屋カードには直近2回(11:00・14:00)が表示されている (got: "' + detailHTML + '")');

  const heights = await page.evaluate(() => Array.from(document.querySelectorAll('.room-card:not(.room-card-sensor)')).map((el) => Math.round(el.getBoundingClientRect().height)));
  const uniqueHeights = Array.from(new Set(heights));
  assert(heights.length > 50, '十分な数の部屋カードが検証対象になっている (got: ' + heights.length + ')');
  assert(uniqueHeights.length === 1,
    '訪問時刻が2行になった部屋があっても、全ての部屋カードの高さが引き続き揃っている (got distinct heights: ' + JSON.stringify(uniqueHeights) + ')');

  // ---- ② 写真一覧のタグ絞り込みトグル: タップすると塗り潰しの青・白文字に切り替わる ----
  await page.locator('#navPhotos').click();
  await page.waitForTimeout(300);
  const inactiveChip = page.locator('#albumTagFilter .tag-chip').nth(1);
  const beforeClickStyle = await inactiveChip.evaluate((el) => {
    var cs = getComputedStyle(el);
    return { active: el.getAttribute('data-active'), bg: cs.backgroundColor, color: cs.color };
  });
  assert(beforeClickStyle.active === 'false', 'タップ前は未選択状態になっている');
  assert(rgbToHex(beforeClickStyle.bg) === '#FFFFFF', 'タップ前(未選択)は背景が白 (got: ' + beforeClickStyle.bg + ')');
  assert(rgbToHex(beforeClickStyle.color) === BLUE, 'タップ前(未選択)は文字が青 (got: ' + beforeClickStyle.color + ')');

  await inactiveChip.click();
  await page.waitForTimeout(300);
  const afterClickStyle = await page.evaluate(() => {
    var el = document.querySelector('#albumTagFilter .tag-chip[data-active="true"]');
    var cs = el ? getComputedStyle(el) : null;
    return cs ? { bg: cs.backgroundColor, color: cs.color } : null;
  });
  assert(afterClickStyle !== null, 'タップ後、選択中のトグルが見つかった');
  assert(rgbToHex(afterClickStyle.bg) === BLUE, 'タップ後(選択中)は背景が青塗りつぶしに切り替わる (got: ' + afterClickStyle.bg + ')');
  assert(rgbToHex(afterClickStyle.color) === '#FFFFFF', 'タップ後(選択中)は文字が白に切り替わる (got: ' + afterClickStyle.color + ')');

  // 他の(未選択の)トグルは引き続き白地・青文字のまま
  const otherChipStyle = await page.evaluate(() => {
    var chips = Array.from(document.querySelectorAll('#albumTagFilter .tag-chip[data-active="false"]'));
    if (!chips.length) return null;
    var cs = getComputedStyle(chips[0]);
    return { bg: cs.backgroundColor, color: cs.color };
  });
  assert(otherChipStyle !== null, '他の未選択トグルが見つかった');
  assert(rgbToHex(otherChipStyle.bg) === '#FFFFFF', '未選択の他のトグルは引き続き背景が白のまま (got: ' + otherChipStyle.bg + ')');
  assert(rgbToHex(otherChipStyle.color) === BLUE, '未選択の他のトグルは引き続き文字が青のまま (got: ' + otherChipStyle.color + ')');

  // ---- ③ サイン全画面表示時の解像度(ボケ改善) ----
  await page.locator('#navHome').click();
  await page.waitForTimeout(200);
  await markUndoRoom('816');
  await page.locator('.room-card[data-room="816"]').click();
  await page.waitForTimeout(200);

  const beforeFullscreen = await page.evaluate(() => {
    var c = document.getElementById('sigCanvas');
    var rect = c.getBoundingClientRect();
    return { w: c.width, h: c.height, cssW: rect.width, cssH: rect.height };
  });

  // 全画面に入る前に何か描いておき、解像度変更後も内容が保持されることを確認する
  const box = await page.locator('#sigCanvas').boundingBox();
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + Math.min(80, box.width - 10), box.y + Math.min(40, box.height - 10));
  await page.mouse.up();
  await page.waitForTimeout(100);
  const hadContentBefore = await page.evaluate(() => {
    var c = document.getElementById('sigCanvas');
    var data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (var i = 3; i < data.length; i += 4) { if (data[i] > 0) return true; }
    return false;
  });
  assert(hadContentBefore, '全画面に入る前にサインを1本描いた(内容保持の検証のため)');

  await page.locator('#signFullscreenBtn').click();
  await page.waitForTimeout(400);

  const afterFullscreen = await page.evaluate(() => {
    var c = document.getElementById('sigCanvas');
    var rect = c.getBoundingClientRect();
    return { w: c.width, h: c.height, cssW: rect.width, cssH: rect.height, dpr: window.devicePixelRatio };
  });
  assert(afterFullscreen.w > beforeFullscreen.w && afterFullscreen.h > beforeFullscreen.h,
    '全画面表示に入ると、canvasの実解像度が通常時より引き上げられる(ボケ対策) (before: ' + JSON.stringify(beforeFullscreen) + ', after: ' + JSON.stringify(afterFullscreen) + ')');
  var expectedMinW = Math.round(afterFullscreen.cssW * afterFullscreen.dpr * 0.9);
  assert(afterFullscreen.w >= expectedMinW,
    '全画面表示時の実解像度が、表示サイズ×devicePixelRatioに見合った大きさになっている (got w: ' + afterFullscreen.w + ', expected at least: ' + expectedMinW + ')');

  const hasContentAfterResize = await page.evaluate(() => {
    var c = document.getElementById('sigCanvas');
    var data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (var i = 3; i < data.length; i += 4) { if (data[i] > 0) return true; }
    return false;
  });
  assert(hasContentAfterResize, '解像度を引き上げた後も、直前に描いていたサインの内容が消えずに残っている');

  // 全画面表示中も、実際にペンで線が引ける(座標のずれが無いことの確認)
  const fsBox = await page.locator('#sigCanvas').boundingBox();
  await page.mouse.move(fsBox.x + 30, fsBox.y + 30);
  await page.mouse.down();
  await page.mouse.move(fsBox.x + fsBox.width - 30, fsBox.y + fsBox.height - 30);
  await page.mouse.up();
  await page.waitForTimeout(100);
  const strokeCountAfterDraw = await page.evaluate(() => {
    var c = document.getElementById('sigCanvas');
    var data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    var count = 0;
    for (var i = 3; i < data.length; i += 4) { if (data[i] > 0) count++; }
    return count;
  });
  assert(strokeCountAfterDraw > 0, '全画面表示中も引き続きペンで線が描ける (got non-transparent px: ' + strokeCountAfterDraw + ')');

  await page.locator('#signFullscreenClose').click();
  await page.waitForTimeout(200);

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'Not implemented', 'exitFullscreen', 'requestFullscreen', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL VISIT-TIME-VERTICAL / TAG-CHIP-INVERT / SIGNATURE-BLUR ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
