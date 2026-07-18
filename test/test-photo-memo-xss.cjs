// 写真・設備メモ欄の保存型XSS修正(2026-07-17)の回帰テスト。
// 背景: escapeHtml()は他の場所(引継ぎメモ欄など)では正しく使われていたが、
// 写真パネルのテキストエリア(.photo-memo)とアルバム画面の写真メモ表示(.album-memo-label)
// では、photo.memoが未エスケープのままinnerHTML/要素内容に挿入されており、
// <img src=x onerror=...>のようなペイロードで実際にJavaScriptを実行できる状態だった
// (実際のUI操作で再現・確認済み)。メモは共有ストレージ経由で他の点検員・管理者の画面にも
// 同期されるため、保存型(Stored)XSSとして影響範囲は自分の画面に留まらない。
// 3箇所にescapeHtml()を追加して修正した。このテストは、修正後に実際にJSが実行されない
// ことと、画面上には安全な文字列としてそのまま表示されることの両方を確認する。
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const PAYLOAD = '<img src=x onerror="window.__xssFired=(window.__xssFired||0)+1; window.__xssSource=\'album-memo-label\'">';

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(fileUrl);
  await page.waitForSelector('.room-card', { timeout: 10000 });

  await page.evaluate(() => { window.__xssFired = 0; });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xss-regress-'));
  const tmpImgPath = path.join(tmpDir, 'test.png');
  fs.writeFileSync(tmpImgPath, Buffer.from(TINY_PNG_BASE64, 'base64'));

  // 実際のUI操作: 部屋を開く → 写真・不良を記録する → 写真を1枚追加 → タグを選ぶ
  await page.locator('.room-card').first().click();
  await page.waitForTimeout(150);
  await page.locator('#openPhotosFromPanel').click();
  await page.waitForTimeout(150);
  await page.locator('#addPhotoFromPanel').click();
  await page.waitForTimeout(150);
  await page.locator('#photoInput').setInputFiles(tmpImgPath);
  await page.waitForTimeout(300);
  await page.locator('.tag-chip').first().click();
  await page.waitForTimeout(300);

  // 写真パネルの.photo-memoテキストエリアにペイロードを入力する時点でもJSは実行されない
  // (textarea内は<があってもテキストとして扱われるのが本来のブラウザの挙動だが、
  // escapeHtml前は</textarea>を含む入力で描画自体を壊せた。ここでは実行有無だけでなく
  // テキストエリアの実際の値も、入力した文字列と一致することを確認する)
  const memoBox = page.locator('.photo-memo').first();
  await memoBox.fill(PAYLOAD);
  await page.waitForTimeout(500);
  const firedAfterTyping = await page.evaluate(() => window.__xssFired || 0);
  assert(firedAfterTyping === 0, 'メモ欄にペイロードを入力しただけではJSは実行されない (got: ' + firedAfterTyping + ')');
  const textareaValue = await memoBox.inputValue();
  assert(textareaValue === PAYLOAD, 'テキストエリアの値は入力した文字列そのまま保持される(表示が壊れていない) (got: ' + textareaValue + ')');

  await page.locator('#closePhotoPanel').click();
  await page.waitForTimeout(200);
  // 2026-07-17変更(①1室操作時間短縮): #openPhotosFromPanel経由で開いた写真パネルを閉じると
  // #panel(サインパネル)に戻るようになったため、ナビタブを操作する前に明示的に#panelも閉じる。
  await page.locator('#closePanel').click();
  await page.waitForTimeout(200);

  // アルバム(写真一覧)画面を開く。修正前はここで.album-memo-labelにescapeHtml無しで
  // 挿入され、onerrorが実行されていた。
  await page.locator('#navPhotos').click();
  await page.waitForTimeout(400);

  const fired = await page.evaluate(() => window.__xssFired || 0);
  assert(fired === 0, 'アルバム画面(#albumList)を開いても、修正後はペイロードのJSが実行されない (got: fired=' + fired + ')');

  // 画面上には「安全な文字列」としてそのまま(エスケープされて)表示されていることも確認する
  const memoLabelText = await page.locator('.album-memo-label').first().textContent();
  assert(memoLabelText.includes('<img src=x onerror='),
    'アルバム画面には、ペイロードの文字列自体はエスケープされたテキストとして表示される (got: ' + memoLabelText + ')');

  const rawHtml = await page.evaluate(() => document.getElementById('albumList').innerHTML);
  assert(rawHtml.includes('&lt;img'), 'albumListのinnerHTMLでは<がエスケープされて&lt;になっている(実行可能なHTMLとして混入していない)');
  assert(!/<img[^&]*src=x onerror=/.test(rawHtml), 'albumListのinnerHTMLに、実行可能な生のonerror属性は含まれていない');

  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log('\nALL PHOTO-MEMO XSS FIX ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
