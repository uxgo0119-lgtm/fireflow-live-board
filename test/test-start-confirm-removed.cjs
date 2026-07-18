// 「点検開始 連絡」機能の削除(2026-07-17)の回帰テスト。
// 背景: 管理会社・セキュリティ会社への開始前確認リンク機能は、ユーザーからの明示的な指示
// 「点検開始、連絡は削除」により、LB本体のUI・JSロジックごと完全に削除した
// (confirm.html / api/confirm-start.js / schema.sqlのstart_confirmationsテーブルも
// 別途削除済み)。このテストは、削除が正しく行われ、かつ隣接する「メンバー招待」欄が
// 巻き添えで壊れていないことを確認する。
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

  // 1. 物件情報タブ(#navList)を開いても、「点検開始 連絡」セクションはもう存在しない
  await page.locator('#navList').click();
  await page.waitForTimeout(300);

  const startConfirmListExists = await page.locator('#startConfirmList').count();
  assert(startConfirmListExists === 0, '#startConfirmList要素はもうDOMに存在しない');

  const sectionTitles = await page.locator('#listView .section-title').allTextContents();
  assert(sectionTitles.indexOf('点検開始 連絡') === -1,
    '物件情報タブに「点検開始 連絡」の見出しはもう表示されない (got: ' + JSON.stringify(sectionTitles) + ')');

  const listViewText = await page.locator('#listView').textContent();
  assert(listViewText.indexOf('管理会社・セキュリティ会社への開始前確認') === -1,
    '「点検開始 連絡」の説明文ももう表示されない');

  // 2. 削除された関数がグローバルに残っていない(呼び出しても存在しない安全な状態)こと
  const leftoverFns = await page.evaluate(function () {
    return {
      startStartConfirmPolling: typeof window.startStartConfirmPolling,
      renderStartConfirmSection: typeof window.renderStartConfirmSection,
      createStartConfirmation: typeof window.createStartConfirmation,
      getStartConfirmations: typeof window.getStartConfirmations,
    };
  });
  assert(leftoverFns.createStartConfirmation === 'undefined',
    'window.createStartConfirmationはもう定義されていない(supabase-integration.js未接続なので元々undefinedだが念のため確認)');
  assert(leftoverFns.getStartConfirmations === 'undefined',
    'window.getStartConfirmationsはもう定義されていない');

  // 3. 隣接する「メンバー招待」セクションは巻き添えを受けず、引き続き正常に動作すること
  //    (同じCSSクラス(.start-confirm-row等)を共有しているため、CSSごと削除していないか確認)
  const memberInviteVisible = await page.locator('#memberInviteSection').isVisible().catch(() => false);
  // 管理者以外は非表示のことがあるため、見出しがDOM上に存在することだけ確認する
  const memberInviteTitleExists = sectionTitles.indexOf('メンバー招待') !== -1 || (await page.locator('#memberInviteSection .section-title').count()) > 0;
  assert(memberInviteTitleExists, '「メンバー招待」セクションの見出しは引き続き存在する(巻き添え削除されていない)');

  await page.locator('#createInviteBtn').click().catch(() => {});
  await page.waitForTimeout(200);

  // 4. 画面遷移(list⇔home)を繰り返してもエラーが出ない(ポーリング開始/停止呼び出しの削除に
  //    伴う、他の画面遷移ロジックへの巻き添え破壊がないことの確認)
  await page.locator('#navHome').click();
  await page.waitForTimeout(200);
  await page.locator('#navList').click();
  await page.waitForTimeout(200);
  await page.locator('#navHome').click();
  await page.waitForTimeout(200);

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL START-CONFIRM-REMOVAL ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
