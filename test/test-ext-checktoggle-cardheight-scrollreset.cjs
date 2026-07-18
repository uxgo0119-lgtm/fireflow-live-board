// 2026-07-17 消火器点検の点検済みトグル・部屋カード高さ短縮・スクロール連動の追加対応 の回帰テスト。
// ①「写真を撮らずに点検を行う前提にします。不良があれば写真を撮影する。トグルボタンをタップで
//   塗り潰し青(白文字)に変更で点検済みとする。標識不鮮明は変更なし」→ 消火器1本ごとに新しい
//   「点検済み」トグルボタンを追加し、これをタップした本数が完了本数としてカウントされるように
//   変更した(以前は写真を撮った本数でカウントしていた)。写真ボタン・標識不鮮明バッジの見た目・
//   挙動自体は変更していないことも確認する。
// ②「部屋カードが縦に長いので少し短くする」→ .room-cardの上部パディングや行間を詰めて、
//   全体の高さを少し縮めた。高さの均一性(全カード同じ高さ)は引き続き維持されていることを確認する。
// ③「ホームから物件情報のスクロール連動がやはりやりづらさを感じる」→ タブ切替時、
//   window.scrollTo(0,0)に加えてdocumentElement/bodyのscrollTopも明示的に0にリセットし、
//   次の描画フレームでも再度0に戻すようにした。ホームで下までスクロールした状態から
//   物件情報タブに切り替えた直後、スクロール位置が確実に0になっていることを確認する。
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
  const page = await browser.newPage({ viewport: { width: 420, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(fileUrl);
  await page.waitForSelector('.room-card', { timeout: 10000 });

  // ---- ① 消火器点検: 点検済みトグル ----
  await page.locator('#navList').click();
  await page.waitForTimeout(200);
  await page.locator('.equipment-row[data-name="消火器具"]').click();
  await page.waitForTimeout(200);
  await page.waitForSelector('.ext-card', { timeout: 10000 });

  const firstCard = page.locator('.ext-card').first();
  const checkBtn = firstCard.locator('.ext-check-toggle');
  await assert((await checkBtn.count()) === 1, '各消火器カードに「点検済み」トグルボタンが1つある');

  const beforeStyle = await checkBtn.evaluate((el) => {
    var cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, color: cs.color, text: el.textContent.trim(), width: el.getBoundingClientRect().width };
  });
  assert(rgbToHex(beforeStyle.bg) === '#FFFFFF', 'タップ前(未点検)は背景が白 (got: ' + beforeStyle.bg + ')');
  assert(rgbToHex(beforeStyle.color) === BLUE, 'タップ前(未点検)は文字が青 (got: ' + beforeStyle.color + ')');
  assert(beforeStyle.text === '点検済み', 'タップ前も、ボタンのラベルは「点検済み」の一定文字になっている(以前の「点検済みにする」からラベル変更) (got: "' + beforeStyle.text + '")');

  // 2026-07-17再修正: 「点検済み/点検済みにするで品番が移動するのでラグが起こってやりずらい」
  // への対応。タップ前後でラベル文字を変えず、塗りつぶし色だけを切り替えるようにしたことで、
  // ボタン幅・右隣の品番の位置がタップしても変わらないことを確認する。
  const serialBefore = await firstCard.locator('.ext-serial').evaluate((el) => el.getBoundingClientRect().left);

  await checkBtn.click();
  await page.waitForTimeout(200);

  const afterStyle = await checkBtn.evaluate((el) => {
    var cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, color: cs.color, text: el.textContent.trim(), width: el.getBoundingClientRect().width };
  });
  assert(rgbToHex(afterStyle.bg) === BLUE, 'タップ後(点検済み)は背景が青塗りつぶしに切り替わる (got: ' + afterStyle.bg + ')');
  assert(rgbToHex(afterStyle.color) === '#FFFFFF', 'タップ後(点検済み)は文字が白に切り替わる (got: ' + afterStyle.color + ')');
  assert(afterStyle.text === '点検済み', 'タップ後も、ボタンのラベルは引き続き「点検済み」のまま(文字は変わらない) (got: "' + afterStyle.text + '")');
  assert(afterStyle.width === beforeStyle.width, 'タップの前後でボタンの幅が変わらない(ラグ対策) (before: ' + beforeStyle.width + ', after: ' + afterStyle.width + ')');

  const serialAfter = await firstCard.locator('.ext-serial').evaluate((el) => el.getBoundingClientRect().left);
  assert(serialAfter === serialBefore, 'ボタン幅が変わらないため、右隣の品番の位置もタップの前後でずれない (before: ' + serialBefore + ', after: ' + serialAfter + ')');

  // 物件情報の設備一覧に戻ったとき、写真を撮っていなくても点検済みトグルの分が進捗にカウントされ、
  // 表記も「撮影済み」ではなく「点検済み」になっている
  await page.locator('#extBack').click();
  await page.waitForTimeout(200);
  const equipLabel = await page.evaluate(() => document.querySelector('.equipment-row[data-name="消火器具"] .equipment-row-status').textContent.trim());
  assert(equipLabel.indexOf('撮影済み') === -1, '設備一覧の消火器具の進捗表記に「撮影済み」という古い文言が残っていない (got: "' + equipLabel + '")');
  assert(/84本中1本\s*点検済み/.test(equipLabel), '写真を撮っていなくても、点検済みトグルをタップした1本分が進捗(84本中1本 点検済み)にカウントされる (got: "' + equipLabel + '")');

  // 標識不鮮明バッジ・写真ボタンの挙動は変更していないことの確認
  await page.locator('.equipment-row[data-name="消火器具"]').click();
  await page.waitForTimeout(200);
  const secondCard = page.locator('.ext-card').nth(1);
  const unclearBadge = secondCard.locator('.ext-unclear-badge');
  const unclearBefore = await unclearBadge.evaluate((el) => el.classList.contains('active'));
  await unclearBadge.click();
  await page.waitForTimeout(150);
  const unclearAfter = await unclearBadge.evaluate((el) => el.classList.contains('active'));
  assert(unclearBefore !== unclearAfter, '標識不鮮明バッジは引き続きタップで状態が切り替わる(変更なし)');
  const photoBtn = secondCard.locator('.ext-photo-btn');
  assert((await photoBtn.count()) === 1, '写真ボタンは引き続き存在する(変更なし)');

  // ---- ② 部屋カードの高さ短縮・均一性の維持 ----
  await page.locator('#navHome').click();
  // タブ切替直後の260ms間は、慣性スクロール対策で一時的にoverflow:hiddenになっており
  // (③で検証)、その間はJSからのscrollTo()も効かないため、以降で手動スクロールする前に
  // ロックが解除されるまで待つ。
  await page.waitForTimeout(350);
  const cardHeights = await page.evaluate(() => Array.from(document.querySelectorAll('.room-card:not(.room-card-sensor)')).map((el) => Math.round(el.getBoundingClientRect().height)));
  const uniqueCardHeights = Array.from(new Set(cardHeights));
  assert(cardHeights.length > 50, '十分な数の部屋カードが検証対象になっている (got: ' + cardHeights.length + ')');
  assert(uniqueCardHeights.length === 1, '部屋カードの高さは引き続き全て揃っている (got distinct heights: ' + JSON.stringify(uniqueCardHeights) + ')');
  // 2026-07-17再修正: 「まだ縦長なのでもう少し短くする」への追加対応で166px→約154pxまで
  // さらに短縮した。
  assert(uniqueCardHeights[0] < 160, '部屋カードの高さが前回(166px)よりさらに短くなっている (got: ' + uniqueCardHeights[0] + 'px)');

  // ---- ③ ホーム→物件情報のスクロール位置リセット ----
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(150);
  const scrolledY = await page.evaluate(() => window.scrollY);
  assert(scrolledY > 100, 'ホームで下までスクロールしている (got scrollY: ' + scrolledY + ')');

  await page.locator('#navList').click();
  const afterNavScrollY = await page.evaluate(() => ({
    win: window.scrollY,
    docEl: document.documentElement.scrollTop,
    body: document.body.scrollTop,
    htmlOverflow: getComputedStyle(document.documentElement).overflow,
    bodyOverflow: getComputedStyle(document.body).overflow,
  }));
  assert(afterNavScrollY.win === 0, '物件情報タブに切り替えた直後、window.scrollYが0にリセットされている (got: ' + afterNavScrollY.win + ')');
  assert(afterNavScrollY.docEl === 0, '物件情報タブに切り替えた直後、documentElement.scrollTopが0にリセットされている (got: ' + afterNavScrollY.docEl + ')');
  assert(afterNavScrollY.body === 0, '物件情報タブに切り替えた直後、body.scrollTopが0にリセットされている (got: ' + afterNavScrollY.body + ')');
  // 2026-07-17再修正: 実機(スマートフォン)で「感知器・写真・物件情報が常にトップから
  // 中途半端な位置までスクロールされる」という不具合が続いていたのは、フリック操作後の
  // 慣性スクロールがrAFでの2回程度のリセットでは追いつかないほど長く(数百ミリ秒)残る
  // ことがあったため。タブ切替の瞬間だけhtml/bodyのoverflowを一時的にhiddenにして
  // スクロールそのものを強制停止し、慣性スクロールを打ち切るようにした。切替直後は
  // このoverflow:hiddenが効いていることを確認する。
  assert(afterNavScrollY.htmlOverflow === 'hidden', 'タブ切替直後は慣性スクロールを打ち切るため一時的にhtmlのoverflowがhiddenになっている (got: ' + afterNavScrollY.htmlOverflow + ')');
  assert(afterNavScrollY.bodyOverflow === 'hidden', 'タブ切替直後は慣性スクロールを打ち切るため一時的にbodyのoverflowがhiddenになっている (got: ' + afterNavScrollY.bodyOverflow + ')');

  // overflow:hiddenでスクロールを止めている間に、慣性スクロールの残り(スクロール位置の
  // ずれ)を模して強制的にscrollTopをずらしてみても、ロック解除時の最終リセットで
  // 確実に0へ戻ることを確認する。
  await page.evaluate(() => { window.scrollTo(0, 400); });
  await page.waitForTimeout(400);
  const afterUnlockScrollY = await page.evaluate(() => ({
    win: window.scrollY,
    htmlOverflow: document.documentElement.style.overflow,
    bodyOverflow: document.body.style.overflow,
  }));
  assert(afterUnlockScrollY.win === 0, 'ロック解除後の最終リセットにより、慣性スクロールの残りを模した強制ずらしがあっても最終的にscrollYが0になる (got: ' + afterUnlockScrollY.win + ')');
  assert(afterUnlockScrollY.htmlOverflow === '', 'ロック解除後はhtmlのinline overflowが元通り(未指定)に戻っている (got: "' + afterUnlockScrollY.htmlOverflow + '")');
  assert(afterUnlockScrollY.bodyOverflow === '', 'ロック解除後はbodyのinline overflowが元通り(未指定)に戻っている (got: "' + afterUnlockScrollY.bodyOverflow + '")');

  // ロック解除後は通常通りスクロールできる(操作不能になっていないことの確認)
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.waitForTimeout(100);
  const scrollableAfterUnlock = await page.evaluate(() => window.scrollY);
  assert(scrollableAfterUnlock > 0, 'ロック解除後は通常通りスクロールできる (got scrollY: ' + scrollableAfterUnlock + ')');

  // 感知器タブ(ホームと同じ#homeViewを共有するケース)でも同様にリセットされる
  await page.locator('#navHome').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(150);
  await page.locator('#navDetector').click();
  const sensorScrollY = await page.evaluate(() => window.scrollY);
  assert(sensorScrollY === 0, '感知器タブ(ホームと同じ#homeViewを共有)に切り替えた直後もscrollYが0にリセットされている (got: ' + sensorScrollY + ')');
  await page.waitForTimeout(350);
  const sensorScrollYAfterUnlock = await page.evaluate(() => window.scrollY);
  assert(sensorScrollYAfterUnlock === 0, '感知器タブでもロック解除後まで含めてscrollYが0のまま維持されている (got: ' + sensorScrollYAfterUnlock + ')');

  // 写真タブでも同様
  await page.locator('#navHome').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(150);
  await page.locator('#navPhotos').click();
  const photosScrollY = await page.evaluate(() => window.scrollY);
  assert(photosScrollY === 0, '写真タブに切り替えた直後もscrollYが0にリセットされている (got: ' + photosScrollY + ')');
  await page.waitForTimeout(350);
  const photosScrollYAfterUnlock = await page.evaluate(() => window.scrollY);
  assert(photosScrollYAfterUnlock === 0, '写真タブでもロック解除後まで含めてscrollYが0のまま維持されている (got: ' + photosScrollYAfterUnlock + ')');

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'Not implemented', 'exitFullscreen', 'requestFullscreen', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL EXT-CHECKTOGGLE / CARD-HEIGHT / SCROLL-RESET ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
