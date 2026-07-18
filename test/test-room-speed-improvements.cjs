// 「1室あたりの操作時間短縮」①〜⑤(2026-07-17)の検証。
// 背景: 新機能追加ではなく、既存の点検フロー(部屋パネル操作)の無駄なタップ・画面遷移・
// 待ち時間を減らす5つの改善を実装した。
//   ① #panelの「写真・不良を記録する」から#photoPanelに入った場合、閉じたら#panelへ戻す
//      (在宅+不良ありのケースで部屋カードを2回タップする必要がなくなる)。
//      それ以外の入口(アルバム画面等)から開いた場合は従来通り。
//   ② サイン保存・キャンセル扱いは「終端アクション」のため、保存と同時にパネルを自動で閉じる
//      (これまでは保存後に必ず「戻る」を別タップする必要があった)。
//   ③ #panel内のブロック順を並べ替え、低頻度項目(点検希望時刻変更・訪問時刻記録)を折りたたみ
//      (<details>)にして、最頻出のサイン記入までのスクロール距離を減らす。
//   ④ タグ選択時のscrollIntoViewを'smooth'から'instant'にし、アニメーション待ちを無くす。
//   ⑤ サイン保存・キャンセル扱いで部屋を終えたら、同じ階にまだ未点検(pending)の部屋が
//      残っていれば自動でその部屋のパネルを開く(既に対応済みの部屋はスキップする)。
//      階をまたいでは移動しない。
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

  async function openRoom(room) {
    await page.locator('.room-card[data-room="' + room + '"]').click();
    await page.waitForTimeout(150);
  }
  async function closeIfPanelOpen() {
    if (await page.locator('#panel').isVisible()) {
      await page.locator('#closePanel').click();
      await page.waitForTimeout(150);
    }
  }
  // このindex.htmlはデモ用のリハーサル済みデータ(SEED_STATE_RAW)が埋め込まれており、
  // 起動直後は129室のほぼ全室が既に「完了」状態になっている。⑤(次の未点検の部屋へ自動遷移)を
  // 検証するには、対象の部屋を明示的に「未点検に戻す」(#markUndo)でpending状態にリセットする
  // 必要がある(これはUI操作なので実際の巻き戻し導線を使って検証していることになる)。
  async function resetToPending(room) {
    await openRoom(room);
    await page.locator('#markUndo').click();
    await page.waitForTimeout(150);
    await closeIfPanelOpen();
  }

  // ==================================================================
  // ① #panelの「写真・不良を記録する」から入った場合、閉じたら#panelへ戻る
  // ==================================================================
  await openRoom('817');
  await page.locator('#openPhotosFromPanel').click();
  await page.waitForTimeout(150);
  await page.locator('#addTagOnly').click();
  await page.waitForTimeout(150);
  await page.locator('.tag-chip[data-tag="消火器"]').click();
  await page.waitForTimeout(150);
  await page.locator('#closePhotoPanel').click();
  await page.waitForTimeout(150);

  const panelVisibleAfter1 = await page.locator('#panel').isVisible();
  assert(panelVisibleAfter1, '①: #openPhotosFromPanel経由で開いた写真パネルを閉じると#panelに戻る');
  const panelRoomAfter1 = await page.locator('#panelRoom').textContent();
  assert(panelRoomAfter1 === '817', '①: #panelに戻った際、部屋番号は817のまま (got: ' + panelRoomAfter1 + ')');
  await closeIfPanelOpen();

  // ①の裏取り: #panelを経由しない入口(アルバム画面)から開いた場合は、閉じても#panelへ戻らない
  await page.locator('#navPhotos').click();
  await page.waitForTimeout(200);
  const albumCardCount = await page.locator('.album-room-card[data-room="817"]').count();
  assert(albumCardCount === 1, '①裏取り: 817号室の記録がアルバム画面にも表示される');
  await page.locator('.album-room-card[data-room="817"]').click();
  await page.waitForTimeout(150);
  const photoPanelVisibleFromAlbum = await page.locator('#photoPanel').isVisible();
  assert(photoPanelVisibleFromAlbum, '①裏取り: アルバム画面からも#photoPanelが開く');
  await page.locator('#closePhotoPanel').click();
  await page.waitForTimeout(150);
  const panelVisibleAfterAlbum = await page.locator('#panel').isVisible();
  assert(!panelVisibleAfterAlbum, '①裏取り: アルバム画面から開いた写真パネルを閉じても#panelには戻らない(意図しない画面遷移を防ぐ)');
  await page.locator('#navHome').click();
  await page.waitForTimeout(150);

  // ==================================================================
  // ② サイン保存・キャンセル扱いで自動的にパネルが閉じる(1F最終部屋 102号室で検証。
  //    102号室は1階リストの最後のため、⑤の「次の部屋へ自動遷移」は発火せず、
  //    ②の「自動クローズ」だけを切り分けて確認できる)
  // ==================================================================
  await openRoom('102');
  await page.locator('#saveSign').click();
  await page.waitForTimeout(150);

  const toastTextAfterSave = await page.locator('#toast').textContent();
  assert(toastTextAfterSave.indexOf('102号室を保存しました') !== -1,
    '②: サイン保存でトーストに「102号室を保存しました」が表示される (got: ' + toastTextAfterSave + ')');
  const panelVisibleAfterSave = await page.locator('#panel').isVisible();
  assert(!panelVisibleAfterSave, '②: サイン保存後、#closePanelを別タップしなくても自動でパネルが閉じる');
  const room102Class = await page.locator('.room-card[data-room="102"]').getAttribute('class');
  assert(room102Class.indexOf('room-card-done') !== -1, '②: 102号室が保存直後に完了状態になっている (got: ' + room102Class + ')');

  // ==================================================================
  // ⑤ 同じ階に未点検の部屋が残っていれば自動で次の部屋のパネルを開く(816→815)
  // ==================================================================
  await resetToPending('815'); // デモデータでは815号室も既に「完了」のため、検証用にpendingへ戻す
  await openRoom('816');
  await page.locator('#saveSign').click();
  await page.waitForTimeout(200);

  const toastTextAdvance = await page.locator('#toast').textContent();
  assert(toastTextAdvance.indexOf('816号室を保存しました') !== -1 && toastTextAdvance.indexOf('続けて815号室へ') !== -1,
    '⑤: トーストに「816号室を保存しました → 続けて815号室へ」が表示される (got: ' + toastTextAdvance + ')');
  const panelVisibleAfterAdvance = await page.locator('#panel').isVisible();
  assert(panelVisibleAfterAdvance, '⑤: 保存後、一覧に戻らずそのまま次の未点検の部屋のパネルが開いたままになっている');
  const panelRoomAfterAdvance = await page.locator('#panelRoom').textContent();
  assert(panelRoomAfterAdvance === '815', '⑤: 自動的に815号室(同じ階の次の未点検の部屋)へ切り替わっている (got: ' + panelRoomAfterAdvance + ')');
  await closeIfPanelOpen(); // 815号室はここでは何もせず、未点検(pending)のまま残しておく

  // ⑤裏取り: 既に対応済みの部屋はスキップされること(814をキャンセル扱いにしてから815を保存すると、
  //          814ではなく813へ進む)
  await resetToPending('813'); // デモデータでは813号室も既に「完了」のため、検証用にpendingへ戻す
  await openRoom('814');
  await page.locator('#markCancel').click();
  await page.waitForTimeout(200);
  await closeIfPanelOpen(); // 814の次(813)が自動で開いてもここでは何もせず、pendingのまま残す

  await openRoom('815');
  await page.locator('#saveSign').click();
  await page.waitForTimeout(200);
  const panelRoomAfterSkip = await page.locator('#panelRoom').textContent();
  assert(panelRoomAfterSkip === '813',
    '⑤裏取り: 815号室の次にある814号室は既にキャンセル済みのためスキップされ、813号室へ進む (got: ' + panelRoomAfterSkip + ')');
  await closeIfPanelOpen();

  // ⑤裏取り: 階をまたいでは移動しない(8Fの最終部屋804を保存しても、7Fの717号室へは進まない)
  // 8Fの804より前の部屋は既にpending/done/cancelled入り混じっているが、
  // 804自身は未着手のはずなので、そのまま保存して直接確認する。
  await openRoom('804');
  await page.locator('#saveSign').click();
  await page.waitForTimeout(200);
  const panelVisibleAfter804 = await page.locator('#panel').isVisible();
  assert(!panelVisibleAfter804, '⑤裏取り: 8Fの最終部屋(804)を保存すると、7Fへは進まずに一覧へ戻る(階をまたいだ自動遷移はしない)');

  // ==================================================================
  // ③ #panel内のレイアウト並べ替え・低頻度項目の折りたたみ
  // ==================================================================
  await openRoom('811'); // 未着手・変更/訪問記録の無い部屋
  const panelIds = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('#panel [id]')).map((el) => el.id);
  });
  const sigIdx = panelIds.indexOf('sigCanvas');
  const scheduleIdx = panelIds.indexOf('scheduleOverrideDetails');
  const visitIdx = panelIds.indexOf('visitTimesDetails');
  assert(sigIdx !== -1 && scheduleIdx !== -1 && visitIdx !== -1, '③: サイン欄・希望時刻変更欄・訪問時刻欄が#panel内に存在する');
  assert(sigIdx < scheduleIdx && sigIdx < visitIdx,
    '③: サイン記入欄(#sigCanvas)が、低頻度項目(希望時刻変更・訪問時刻記録)より前(上)に配置されている');

  const scheduleOpenInitial = await page.locator('#scheduleOverrideDetails').evaluate((el) => el.open);
  assert(!scheduleOpenInitial, '③: 変更履歴の無い部屋では、点検希望時刻の変更欄は最初は折りたたまれている');
  const visitOpenInitial = await page.locator('#visitTimesDetails').evaluate((el) => el.open);
  assert(!visitOpenInitial, '③: 訪問記録の無い部屋では、訪問時刻欄は最初は折りたたまれている');

  // 中の入力欄はタップで展開しないと操作できない(=省スペース化が効いている)ことを確認しつつ、
  // 実際に時刻変更・訪問時刻を記録し、既存データがある場合は次回開いたときに自動で展開されることを確認する
  await page.locator('#scheduleOverrideDetails summary').click();
  await page.waitForTimeout(100);
  await page.locator('#scheduleOverrideInput').fill('13:00');
  await page.locator('#saveScheduleOverride').click();
  await page.waitForTimeout(150);

  await page.locator('#visitTimesDetails summary').click();
  await page.waitForTimeout(100);
  await page.locator('#visitTimeInput').fill('10:15');
  await page.locator('#addVisitTime').click();
  await page.waitForTimeout(150);

  await closeIfPanelOpen();
  await openRoom('811'); // 開き直して、既存データがある場合の自動展開を確認する
  const scheduleOpenAfterData = await page.locator('#scheduleOverrideDetails').evaluate((el) => el.open);
  assert(scheduleOpenAfterData, '③: 変更済みの希望時刻がある部屋を開き直すと、見落とし防止のため自動的に展開されている');
  const visitOpenAfterData = await page.locator('#visitTimesDetails').evaluate((el) => el.open);
  assert(visitOpenAfterData, '③: 訪問時刻の記録がある部屋を開き直すと、見落とし防止のため自動的に展開されている');
  await closeIfPanelOpen();

  // ==================================================================
  // ④ タグ選択時のscrollIntoViewが'instant'になっている(アニメーション待ちを削減)
  // ==================================================================
  await page.evaluate(() => {
    window.__scrollCalls = [];
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (opts) {
      window.__scrollCalls.push(opts);
      return orig.call(this, opts);
    };
  });
  await openRoom('810');
  await page.locator('#openPhotosFromPanel').click();
  await page.waitForTimeout(100);
  await page.locator('#addTagOnly').click();
  await page.waitForTimeout(100);
  const scrollCalls = await page.evaluate(() => window.__scrollCalls);
  assert(scrollCalls.length >= 1, '④: タグピッカー表示時にscrollIntoViewが呼ばれている');
  assert(scrollCalls[scrollCalls.length - 1].behavior === 'instant',
    '④: scrollIntoViewのbehaviorが"instant"になっている(以前は"smooth"でアニメーション待ちがあった) (got: ' + JSON.stringify(scrollCalls[scrollCalls.length - 1]) + ')');
  await page.locator('.tag-chip').first().click();
  await page.waitForTimeout(100);
  await page.locator('#closePhotoPanel').click();
  await page.waitForTimeout(100);
  await closeIfPanelOpen();

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL ROOM-SPEED-IMPROVEMENT (①〜⑤) ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
