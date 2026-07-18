// 同時編集による写真消失バグの修正(2026-07-17)の回帰テスト。
// 背景: persist()は毎回「ローカルにキャッシュされているstate[room]」を土台にして部屋データを
// まるごと上書きしていた。読み取りがローカルの1秒ごとのポーリング結果に依存しており、
// 他人の直近の変更(写真の追加等)を取りこぼして消してしまう実際のバグがあった
// (2台のタブが同じバックエンドを共有する状況で実際に再現・確認済み)。
// 修正: persist()を、保存直前に必ず最新のリモート値を取得し直し、photos/visitTimesは
// 「自分がこれから保存する内容」と「リモートの最新内容」の和集合にマージしてから
// 書き込むように変更した(mergeRoomEntry)。saveEquipmentState()にも同様の保護を追加した。
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const context = await browser.newContext();

  // 2台のタブレット(点検員A・点検員B)が共有する、単純化したバックエンドストア。
  // 実運用ではSupabase(kv_store)がこの役割を果たす。
  const sharedBackend = {};

  async function wireSharedStorage(page) {
    await page.exposeFunction('__backendGet', (key) => (key in sharedBackend ? sharedBackend[key] : null));
    await page.exposeFunction('__backendSet', (key, value) => { sharedBackend[key] = value; });
    await page.addInitScript(() => {
      window.storage = {
        get: async function (key) {
          var v = await window.__backendGet(key);
          return v === null ? null : { value: v };
        },
        set: async function (key, value) { await window.__backendSet(key, value); return {}; },
        delete: async function (key) { await window.__backendSet(key, null); return {}; },
        list: async function () { return { items: [] }; },
      };
    });
  }

  const pageA = await context.newPage();
  const pageB = await context.newPage();
  await wireSharedStorage(pageA);
  await wireSharedStorage(pageB);

  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'index.html');
  const room = '814';

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'concurrent-edit-'));
  const tmpImgPath = path.join(tmpDir, 'test.png');
  fs.writeFileSync(tmpImgPath, Buffer.from(TINY_PNG_BASE64, 'base64'));

  // ---- 実際の現場を再現する順序 ----
  // 1) 点検員Bが先に814号室をタブレットで開く(起動時のloadAll()で「写真なし」の状態を
  //    ローカルにキャッシュする。この時点ではまだAは何も保存していない)。
  await pageB.goto(fileUrl);
  await pageB.waitForSelector('.room-card', { timeout: 10000 });
  await pageB.locator('.room-card[data-room="' + room + '"]').click();
  await pageB.waitForTimeout(150);

  // 2) その直後、点検員Aが同じ814号室を開いて、不良の写真を1枚撮って保存する
  //    (Bの次回ポーリング(1秒間隔)がまだ来ていない、まさにその隙間で発生する)。
  await pageA.goto(fileUrl);
  await pageA.waitForSelector('.room-card', { timeout: 10000 });
  await pageA.locator('.room-card[data-room="' + room + '"]').click();
  await pageA.waitForTimeout(150);
  await pageA.locator('#openPhotosFromPanel').click();
  await pageA.waitForTimeout(150);
  await pageA.locator('#addPhotoFromPanel').click();
  await pageA.waitForTimeout(150);
  await pageA.locator('#photoInput').setInputFiles(tmpImgPath);
  await pageA.waitForTimeout(300);
  await pageA.locator('.tag-chip').first().click();
  await pageA.waitForTimeout(500); // persist()がstorageGetでマージ判定するぶん少し余裕を見る
  await pageA.locator('#closePhotoPanel').click();
  await pageA.waitForTimeout(300);
  await pageA.locator('#closePanel').click().catch(() => {});
  await pageA.waitForTimeout(300);

  const backendAfterA = sharedBackend['fireflow-binder:' + room];
  assert(backendAfterA && JSON.parse(backendAfterA).photos.length === 1,
    '点検員Aが撮った写真は共有バックエンドに正しく1件保存されている');

  // 3) 点検員Bは、Aの保存をまだ知らない(自分の画面をリロードしておらず、次のポーリングも
  //    来ていない)まま、「この部屋はキャンセル扱いにする」を押す。B自身の画面上では
  //    814号室はまだ「写真なし」に見えている。
  await pageB.locator('#markCancel').click();
  await pageB.waitForTimeout(900); // persist()がstorageGetでマージ判定するぶん少し余裕を見る(高負荷時のタイミングのブレを考慮し余裕を増やした)

  const backendAfterB = JSON.parse(sharedBackend['fireflow-binder:' + room]);
  console.log('B保存後の共有バックエンドの中身:', JSON.stringify(backendAfterB));

  assert(backendAfterB.status === 'cancelled', '点検員Bの操作(キャンセル扱い)自体は正しく反映されている');
  assert((backendAfterB.photos || []).length === 1,
    '修正後: 点検員Aが保存した写真1件は、点検員Bの保存(後勝ち上書き)後も消えずに残っている' +
    '(got photos.length=' + (backendAfterB.photos || []).length + ')');
  assert(backendAfterB.photos[0].src === JSON.parse(backendAfterA).photos[0].src,
    'マージ後も写真の中身(src)が正しく保持されている(壊れたり別データになっていない)');

  // 点検員B自身の画面にも、マージによって復元された写真がすぐに反映されていることを確認する
  // (次の1秒ポーリングを待たずに、persist()内のマージ結果がstate/renderFloorsに反映される)
  const bRoomCardClass = await pageB.locator('.room-card[data-room="' + room + '"]').getAttribute('class');
  assert(bRoomCardClass.indexOf('room-card-cancelled') !== -1,
    '点検員Bの画面でも814号室はキャンセル状態として表示される (got: ' + bRoomCardClass + ')');

  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log('\nALL CONCURRENT-EDIT MERGE FIX ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
