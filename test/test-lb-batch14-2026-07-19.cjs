// 2026-07-19 実装分14項目の統合回帰テスト。
// 背景: 下記14項目はいずれも実装済みで、実装時に /tmp/smoke_test1.js 〜 /tmp/smoke_test7.js の
// 使い捨てPlaywrightスクリプトで個別に検証済み(全て合格)。本ファイルはそれらの要点を
// 1本の恒久回帰テストとしてまとめたもの(他の test_*.js と同じ形式・置き場所)。
//   ①  ロゴを丸みのあるワードマーク画像(base64インラインPNG)に変更(ブランドブルー)。
//       [2026-07-19四訂] Poppins→Fredoka→M PLUS Rounded 1cとWebフォントを重ねても
//       納得いただけなかったため、ユーザー選定の画像ロゴをそのまま<img>として埋め込む方式に転換。
//   ②  部屋カードの高さを140pxちょうどに短縮(.room-card-footerの通常フローレイアウト化)。
//       特大文字表示(1.3倍)でも要素の重なりが無いことを含めて確認。
//   ③  上部ナビの＋ボタンをタップ式の順送りから、文字サイズボタンと同じポップアップ選択方式
//       (#gridModePopup > .grid-mode-option[data-mode])に変更。
//   ④  サイン欄の線の太さを4.5→7に変更(ソース上の ctx.lineWidth = 7 を確認)。
//   ⑤  部屋カードの訪問時刻表示の1行目も他の行と同様に縦並びに変更(「訪問済 」接頭辞を削除)。
//   ⑥  物件情報の経過記録の削除確認を window.confirm() から独自ダイアログ
//       (#progressLogDeleteConfirm)に変更(window.confirmが無反応になる不具合の修正)。
//   ⑦  消火器点検: 上部の一括「点検済み」トグルと個別チェックの双方向同期。
//   ⑧  物件情報の設備一覧の行(.equipment-row.done)を、行全体を青塗りつぶし・白文字に変更。
//   ⑨  上部ナビに新しい設備設定ボタン(#equipmentSettingsToggle、歯車アイコン)を追加。
//       誤タップ防止のロック確認ダイアログ(#equipmentSettingsLockConfirm)を経由してから
//       #equipmentSettingsPanelが開く。追加・削除(消火器具は削除不可)が可能。
//   ⑩  「点検後データを書き出す」タップ時に即書き出しをせず、確認画面(#exportConfirmPanel)を
//       表示するように変更。物件情報・点検日・点検種別・現場責任者・点検日程・設備点検を表示し、
//       未点検の設備があれば警告(#exportConfirmWarning)を出す。
//   ⑪  写真一覧で、点検報告の対象設備の写真を部屋写真より先頭に表示するよう並び替え。
//   ⑫  「点検希望時刻を変更する」の▶(.panel-collapsible-summary-accent)を大きく・青色に変更。
//       アプリ全体の▶シェブロン(.property-value-chevron)も同様に大きく・太字にする変更を実施。
//   ⑬  本日の進捗の不良トグル一覧を、部屋ごとに1行へ集約(.progress-detail-tags内に複数の
//       .progress-detail-tag)。行タップで該当部屋の写真一覧へ遷移しハイライトする
//       (openPhotoAlbumForRoom、.album-room-card-highlightは1.6秒で自動解除)。
//   ⑭  「は」バッジタップ後の降下障害／写真を追加ボタンにタップ時のフィードバック
//       (.panel-buttons button:active が青系配色に変化)を追加。
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
  await page.waitForTimeout(400);

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
  async function markUndoRoom(room) {
    await openRoom(room);
    await page.locator('#markUndo').click().catch(() => {});
    await page.waitForTimeout(150);
    await closeIfPanelOpen();
  }

  // ==================================================================
  // ① ロゴ画像 (2026-07-19四訂: Webフォント(Poppins→Fredoka→M PLUS Rounded 1c)での再現を
  //    重ねても「まだ違う」との指摘が続いたため、ユーザー選定の丸みのあるワードマーク画像を
  //    base64インラインPNGの<img>として埋め込む方式に変更)
  // ==================================================================
  const logoInfo = await page.evaluate(() => {
    var el = document.querySelector('.brand-name');
    return {
      tag: el.tagName,
      srcIsDataPng: (el.getAttribute('src') || '').indexOf('data:image/png;base64,') === 0,
      alt: el.getAttribute('alt'),
    };
  });
  assert(logoInfo.tag === 'IMG', 'ロゴが<img>タグ(base64インライン画像)として表示されている (got: ' + logoInfo.tag + ')');
  assert(logoInfo.srcIsDataPng, 'ロゴ画像がbase64インラインPNGとして埋め込まれている');
  assert(logoInfo.alt === 'Live Board', 'ロゴ画像のaltが「Live Board」になっている (got: "' + logoInfo.alt + '")');

  // ==================================================================
  // ② 部屋カード140px化(通常時+特大文字時に重なりが無いこと)
  // ==================================================================
  const cardHeights = await page.evaluate(() => Array.from(document.querySelectorAll('.room-card:not(.room-card-sensor)')).map((el) => Math.round(el.getBoundingClientRect().height)));
  const uniqHeights = [...new Set(cardHeights)];
  assert(uniqHeights.length === 1, '全部屋カードの高さが揃っている (got: ' + JSON.stringify(uniqHeights) + ')');
  assert(uniqHeights[0] === 140, '部屋カードの高さがちょうど140px (got: ' + uniqHeights[0] + ')');

  // 特大文字(1.3倍)でも #817 の room-detail と room-card-footer が重ならないこと
  await page.locator('#settingsToggle').click();
  await page.waitForTimeout(150);
  await page.locator('.font-size-option[data-scale="1.3"]').click();
  await page.waitForTimeout(200);
  await markUndoRoom('817');
  await openRoom('817');
  await page.locator('#visitTimesDetails summary').click();
  await page.waitForTimeout(150);
  async function addVisit(t) {
    await page.locator('#visitTimeInput').fill(t);
    await page.locator('#addVisitTime').click();
    await page.waitForTimeout(150);
  }
  await addVisit('09:00');
  await addVisit('11:00');
  await closeIfPanelOpen();
  const overlapCheck = await page.evaluate(() => {
    var card = document.querySelector('.room-card[data-room="817"]');
    var detail = card.querySelector('.room-detail');
    var footer = card.querySelector('.room-card-footer');
    var detailRect = detail.getBoundingClientRect();
    var footerRect = footer.getBoundingClientRect();
    return { gap: footerRect.top - detailRect.bottom };
  });
  assert(overlapCheck.gap >= 0, '特大文字表示でも room-detail と room-card-footer が重ならない (gap: ' + overlapCheck.gap + 'px)');

  // ⑤ 訪問時刻の縦並び(「訪問済 」接頭辞が無い)もここで併せて確認
  const visitDetailHtml = await page.evaluate(() => document.querySelector('.room-card[data-room="817"] .room-detail').innerHTML);
  assert(visitDetailHtml.indexOf('訪問済') === -1, '訪問時刻表示に「訪問済」接頭辞が無い (got: ' + visitDetailHtml + ')');
  assert(visitDetailHtml.indexOf('09:00') !== -1 && visitDetailHtml.indexOf('11:00') !== -1, '複数の訪問時刻が両方とも表示されている');

  // 文字サイズを標準に戻す
  await page.locator('#settingsToggle').click();
  await page.waitForTimeout(150);
  await page.locator('.font-size-option[data-scale="1"]').click();
  await page.waitForTimeout(200);

  // ==================================================================
  // ③ 上部ナビ＋ボタン: ポップアップ選択方式
  // ==================================================================
  await page.locator('#gridExpandToggle').click();
  await page.waitForTimeout(200);
  const gridPopupVisible = await page.evaluate(() => getComputedStyle(document.getElementById('gridModePopup')).display !== 'none');
  assert(gridPopupVisible, 'グリッドモードのポップアップがタップで開く');
  await page.locator('.grid-mode-option[data-mode="enlarged"]').click();
  await page.waitForTimeout(200);
  assert(await page.evaluate(() => document.body.classList.contains('enlarged')), 'ポップアップから選択したモード(拡大表示)が適用される');
  await page.locator('#gridExpandToggle').click();
  await page.waitForTimeout(150);
  await page.locator('.grid-mode-option[data-mode="normal"]').click();
  await page.waitForTimeout(150);
  assert(!(await page.evaluate(() => document.body.classList.contains('enlarged'))), '標準モードに戻せる');

  // ==================================================================
  // ④ サイン欄の線の太さ (ctx.lineWidth = 7)
  // ==================================================================
  const pageSource = await page.content();
  assert(pageSource.indexOf('ctx.lineWidth = 7') !== -1, 'サイン欄の ctx.lineWidth が 7 に変更されている');

  // ==================================================================
  // ⑥ 経過記録の削除確認: window.confirm ではなく独自ダイアログ
  // ==================================================================
  let nativeDialogFired = false;
  page.on('dialog', (d) => { nativeDialogFired = true; d.dismiss(); });
  await page.locator('#navList').click();
  await page.waitForTimeout(300);
  await page.locator('#openBuildingOverview').click();
  await page.waitForTimeout(300);
  const firstLogRow = page.locator('.pl-log-row').first();
  const hasLogRow = (await firstLogRow.count()) > 0;
  if (hasLogRow) {
    await firstLogRow.click();
    await page.waitForTimeout(250);
    await page.locator('#plDeleteBtn').click();
    await page.waitForTimeout(250);
    const customDialogVisible = await page.evaluate(() => getComputedStyle(document.getElementById('progressLogDeleteConfirm')).display !== 'none');
    assert(customDialogVisible, '経過記録の削除は独自ダイアログ(#progressLogDeleteConfirm)で確認される');
    assert(!nativeDialogFired, 'window.confirm() は発火していない');
    const beforeCount = await page.evaluate(() => document.querySelectorAll('.pl-log-row').length);
    await page.locator('#progressLogDeleteConfirmBtn').click();
    await page.waitForTimeout(250);
    const afterCount = await page.evaluate(() => document.querySelectorAll('.pl-log-row').length);
    assert(afterCount === beforeCount - 1, '確認後に実際に1件削除される (before: ' + beforeCount + ', after: ' + afterCount + ')');
  } else {
    console.log('WARN: 経過記録が無いためテスト⑥の削除確認はスキップ(パネルの存在のみ確認)');
    assert(await page.locator('#progressLogDeleteConfirm').count() > 0, '#progressLogDeleteConfirm 要素自体は存在する');
  }
  const buildingOverviewPanel = page.locator('#buildingOverviewPanel, .panel');
  await page.keyboard.press('Escape').catch(() => {});

  // ==================================================================
  // ⑦ 消火器点検: 一括トグルと個別チェックの双方向同期
  // ==================================================================
  await page.locator('#navList').click();
  await page.waitForTimeout(300);
  await page.locator('.equipment-row[data-name="消火器具"]').click();
  await page.waitForTimeout(250);
  const extTotal = await page.locator('.ext-check-toggle').count();
  for (let i = 0; i < extTotal; i++) {
    await page.locator('.ext-check-toggle').nth(i).click();
  }
  await page.waitForTimeout(300);
  assert((await page.locator('#extStatusToggle').textContent()).trim() === '点検済み',
    '個別を全てチェックすると一括トグルが「点検済み」になる');
  await page.locator('.ext-check-toggle').nth(0).click();
  await page.waitForTimeout(250);
  assert((await page.locator('#extStatusToggle').textContent()).trim() === '点検済みにする',
    '個別を1つ外すと一括トグルが「点検済みにする」に戻る');
  await page.locator('#extStatusToggle').click();
  await page.waitForTimeout(300);
  const extCheckedCount = await page.evaluate(() => document.querySelectorAll('.ext-check-toggle.checked').length);
  assert(extCheckedCount === extTotal, '一括トグルをタップすると個別が全てチェックされる (' + extCheckedCount + '/' + extTotal + ')');
  await page.locator('#extBack').click().catch(() => {});
  await page.waitForTimeout(250);

  // ==================================================================
  // ⑧ 設備一覧の行全体が青塗りつぶし
  // ==================================================================
  await page.locator('.equipment-row[data-name="避難器具"]').click();
  await page.waitForTimeout(250);
  await page.locator('#equipmentStatusToggle').click();
  await page.waitForTimeout(250);
  await page.locator('#closeEquipmentPanel').click().catch(() => {});
  await page.waitForTimeout(250);
  const equipRowBg = await page.evaluate(() => getComputedStyle(document.querySelector('.equipment-row[data-name="避難器具"]')).backgroundColor);
  assert(equipRowBg === 'rgb(0, 122, 254)', '点検済みの設備行が行全体で青塗りつぶしになる (got: ' + equipRowBg + ')');
  const equipRowLabelColor = await page.evaluate(() => getComputedStyle(document.querySelector('.equipment-row[data-name="避難器具"] .equipment-row-label')).color);
  assert(equipRowLabelColor === 'rgb(255, 255, 255)', '点検済みの設備行の文字が白になる (got: ' + equipRowLabelColor + ')');

  // ==================================================================
  // ⑨ 設備設定ボタン(ロック付き) → 2026-07-19に「上部ナビゲーションの文字サイズの
  //    右隣を設備情報ロックを削除」のご指示により撤去された。このテストは撤去済みで
  //    あることの確認に置き換える(test_lb_5items_2026-07-19.jsでも重複して検証済み)。
  // ==================================================================
  assert(await page.locator('#equipmentSettingsToggle').count() === 0, '設備設定ボタン(#equipmentSettingsToggle)は2026-07-19の指示により削除されている');
  assert(await page.locator('#equipmentSettingsPanel').count() === 0, '設備設定パネル(#equipmentSettingsPanel)も削除されている');
  assert(await page.locator('#equipmentSettingsLockConfirm').count() === 0, 'ロック確認ダイアログ(#equipmentSettingsLockConfirm)も削除されている');

  // ==================================================================
  // ⑩ 書き出し確認画面
  // ==================================================================
  await page.locator('#navList').click();
  await page.waitForTimeout(300);
  await page.locator('#exportReportFlowBtn').scrollIntoViewIfNeeded();
  await page.locator('#exportReportFlowBtn').click();
  await page.waitForTimeout(300);
  assert(await page.evaluate(() => getComputedStyle(document.getElementById('exportConfirmPanel')).display !== 'none'),
    'エクスポート確認パネルがタップで表示される');
  const exportBody = await page.evaluate(() => document.getElementById('exportConfirmBody').textContent);
  ['物件情報', '点検日', '点検種別', '現場責任者', '点検日程', '設備点検'].forEach((label) => {
    assert(exportBody.indexOf(label) !== -1, 'エクスポート確認に「' + label + '」が含まれる');
  });
  await page.locator('#exportConfirmCancelBtn').click();
  await page.waitForTimeout(200);
  assert(await page.evaluate(() => getComputedStyle(document.getElementById('exportConfirmPanel')).display === 'none'),
    'キャンセルでエクスポート確認パネルが閉じる(実際の書き出しは行われない)');

  // ==================================================================
  // ⑪ 写真一覧の並び順(点検対象設備が先頭)
  // ==================================================================
  await page.locator('.equipment-row[data-name="避難器具"]').click();
  await page.waitForTimeout(200);
  await page.locator('#equipmentPhotoInput').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') });
  await page.waitForTimeout(300);
  await page.locator('#closeEquipmentPanel').click().catch(() => {});
  await page.waitForTimeout(200);
  await page.locator('#navPhotos').click();
  await page.waitForTimeout(300);
  const firstAlbumCardIsEquip = await page.evaluate(() => {
    var first = document.querySelector('.album-room-card');
    return first ? first.hasAttribute('data-equip') : false;
  });
  assert(firstAlbumCardIsEquip, '写真一覧の先頭に設備写真カードが表示される(部屋写真より優先)');

  // ==================================================================
  // ⑫ ▶シェブロンの拡大・太字・青色
  // ==================================================================
  const accentChevronStyle = await page.evaluate(() => {
    var el = document.querySelector('.panel-collapsible-summary-accent');
    var cs = el ? getComputedStyle(el) : null;
    return cs ? { color: cs.color } : null;
  });
  assert(accentChevronStyle && accentChevronStyle.color === 'rgb(0, 122, 254)',
    '「点検希望時刻を変更する」の▶が青色 (got: ' + JSON.stringify(accentChevronStyle) + ')');
  const propertyChevronStyle = await page.evaluate(() => {
    var el = document.querySelector('.property-value-chevron');
    var cs = el ? getComputedStyle(el) : null;
    return cs ? { fontWeight: cs.fontWeight, fontSize: cs.fontSize } : null;
  });
  assert(propertyChevronStyle !== null, 'アプリ内に .property-value-chevron が存在する');
  assert(Number(propertyChevronStyle.fontWeight) >= 700, '▶シェブロンが太字になっている (got: ' + propertyChevronStyle.fontWeight + ')');

  // ==================================================================
  // ⑬ 本日の進捗: 不良トグルの部屋単位集約 + 遷移
  // ==================================================================
  await page.locator('#navHome').click();
  await page.waitForTimeout(200);
  await openRoom('805');
  await page.locator('#openPhotosFromPanel').click();
  await page.waitForTimeout(200);
  await page.locator('#addTagOnly').click();
  await page.waitForTimeout(200);
  await page.locator('#tagPicker .tag-chip[data-tag="降下障害"]').click();
  await page.waitForTimeout(200);
  await page.locator('#addTagOnly').click();
  await page.waitForTimeout(200);
  await page.locator('#tagPicker .tag-chip[data-tag="その他"]').click();
  await page.waitForTimeout(200);
  await page.locator('#closePhotoPanel').click().catch(() => {});
  await page.waitForTimeout(150);
  await closeIfPanelOpen();

  await page.locator('#navHome').click();
  await page.waitForTimeout(300);
  await page.locator('.progress-card').click();
  await page.waitForTimeout(300);
  const defect805RowCount = await page.evaluate(() => document.querySelectorAll('#progressDefectList [data-defect-room="805"]').length);
  assert(defect805RowCount === 1, '805号室の不良が1行に集約されている (got: ' + defect805RowCount + ' 行)');
  const defect805TagCount = await page.evaluate(() => {
    var row = document.querySelector('#progressDefectList [data-defect-room="805"]');
    return row ? row.querySelectorAll('.progress-detail-tag').length : 0;
  });
  assert(defect805TagCount === 2, '805号室の行に両方の不良タグが表示されている (got: ' + defect805TagCount + ')');
  await page.locator('[data-defect-room="805"]').click();
  await page.waitForTimeout(500);
  assert(await page.evaluate(() => getComputedStyle(document.getElementById('photoAlbumView')).display !== 'none'),
    '不良行タップで写真一覧に遷移する');
  const highlightedClass = await page.evaluate(() => {
    var card = document.querySelector('.album-room-card[data-room="805"]');
    return card ? card.className : null;
  });
  assert(highlightedClass && highlightedClass.indexOf('album-room-card-highlight') !== -1,
    '遷移後、805号室の写真カードがハイライトされる (class: ' + highlightedClass + ')');
  await page.waitForTimeout(1700);
  const highlightRemoved = await page.evaluate(() => {
    var card = document.querySelector('.album-room-card[data-room="805"]');
    return card ? card.className.indexOf('album-room-card-highlight') === -1 : true;
  });
  assert(highlightRemoved, 'ハイライトは1.6秒後に自動解除される');

  // ==================================================================
  // ⑭ タップフィードバックCSS(.panel-buttons button:active)
  // ==================================================================
  const activeStyleExists = await page.evaluate(() => {
    var sheets = Array.from(document.styleSheets);
    for (var i = 0; i < sheets.length; i++) {
      try {
        var rules = sheets[i].cssRules;
        for (var j = 0; j < rules.length; j++) {
          if (rules[j].selectorText && rules[j].selectorText.indexOf('.panel-buttons button:active') !== -1) return true;
        }
      } catch (e) {}
    }
    return false;
  });
  assert(activeStyleExists, '.panel-buttons button:active のタップフィードバックCSSルールが存在する');

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'Not implemented', 'exitFullscreen', 'requestFullscreen', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL LB BATCH14 (2026-07-19) ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
