// 2026-07-17 UI配色・表記修正9点の回帰テスト(2026-07-17再修正版)。
// ①「点検後データを書き出す」ボタン: 「全データをリセット」ボタンと全く同じ見た目(白地・青枠・
//    濃いめの青文字)に。その下の「ダウンロードできない場合はこちら」も同じ濃いめの青文字に。
// ②「前回の不良（引き継ぎ事項）」の茶色文字を黒文字に変更。
// ③ 部屋カードの「キャンセル」「キャンセル済み」の重複表記を解消(status-textの「キャンセル」のみ残す)。
// ④ 写真一覧の不良タグラベル(例: 共同住宅用自動火災報知設備)を青塗りつぶし・白文字に変更
//    (再修正: 白地・青文字だと写真カードの白背景に馴染んで見えづらいとのご指摘により変更)。
// ⑤ 写真一覧のタグ絞り込みトグルは、未選択は常に青枠・白地・青文字に変更(以前は選択中のみ
//    青文字にしていたが、未選択のボタンの枠がグレーのままで「トグルボタン」として分かり
//    にくいとのご指摘により、全ボタンに適用するよう変更)。
//    2026-07-17さらに再修正:「タグをタップすると塗り潰しの青に白文字に切り替わる」との
//    ご指摘により、選択中(タップ後)だけは青塗りつぶし・白文字に反転するよう変更した
//    (詳細な検証はtest_visittime_vertical_tagchip_signature.jsで行う。ここでは選択中/
//    未選択で見た目が異なることの概要のみ確認)。
// ⑥ 部屋カードの「前回不良」バッジの青枠を削除(白地のまま)。
// ⑦ 部屋カードの「完了」表示に、時刻に加えて点検員の名字を表示。
// ⑧ サイン欄の「クリア」〜「未点検に戻す」までの操作ボタン群を白地・青枠・青文字に変更。
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');

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
const DARK_BLUE = '#00458F'; // var(--brand-orange-dark-text): 白地の上で使う、視認性重視の濃いめの青
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(fileUrl);
  await page.waitForSelector('.room-card', { timeout: 10000 });

  // ---- ① 点検後データを書き出す: 「全データをリセット」ボタンと同じ見た目 ----
  await page.locator('#navList').click();
  await page.waitForTimeout(300);
  const [exportBtnStyle, resetBtnStyle] = await Promise.all([
    page.evaluate(() => {
      var cs = getComputedStyle(document.getElementById('exportReportFlowBtn'));
      return { bg: cs.backgroundColor, borderColor: cs.borderColor, color: cs.color, height: cs.height, borderRadius: cs.borderRadius, fontWeight: cs.fontWeight };
    }),
    page.evaluate(() => {
      var cs = getComputedStyle(document.getElementById('resetDataBtn'));
      return { bg: cs.backgroundColor, borderColor: cs.borderColor, color: cs.color, height: cs.height, borderRadius: cs.borderRadius, fontWeight: cs.fontWeight };
    }),
  ]);
  assert(rgbToHex(exportBtnStyle.bg) === '#FFFFFF', '「点検後データを書き出す」ボタンの背景が白 (got: ' + exportBtnStyle.bg + ')');
  assert(rgbToHex(exportBtnStyle.borderColor) === BLUE, '「点検後データを書き出す」ボタンの枠が青 (got: ' + exportBtnStyle.borderColor + ')');
  assert(rgbToHex(exportBtnStyle.color) === DARK_BLUE, '「点検後データを書き出す」ボタンの文字が濃いめの青 (got: ' + exportBtnStyle.color + ')');
  assert(JSON.stringify(exportBtnStyle) === JSON.stringify(resetBtnStyle),
    '「点検後データを書き出す」ボタンは「全データをリセット」ボタンと完全に同じ見た目 (got export: ' + JSON.stringify(exportBtnStyle) + ' / reset: ' + JSON.stringify(resetBtnStyle) + ')');

  const fallbackColor = await page.evaluate(() => getComputedStyle(document.getElementById('openExportFallbackManual')).color);
  assert(rgbToHex(fallbackColor) === DARK_BLUE, '「ダウンロードできない場合はこちら」の文字が濃いめの青 (got: ' + fallbackColor + ')');

  // ---- ② 前回の不良（引き継ぎ事項）の茶色文字→黒文字 ----
  const prevDefectColors = await page.evaluate(() => {
    var eq = document.querySelector('.defect-equipment');
    var chip = document.querySelector('.defect-room-chip');
    return {
      eq: eq ? getComputedStyle(eq).color : null,
      chip: chip ? getComputedStyle(chip).color : null,
    };
  });
  assert(prevDefectColors.eq !== null, '前回の不良の設備名要素が存在する');
  assert(rgbToHex(prevDefectColors.eq) === '#000000', '前回の不良の設備名の文字が黒 (got: ' + prevDefectColors.eq + ')');
  assert(rgbToHex(prevDefectColors.chip) === '#000000', '前回の不良の号室チップの文字が黒 (got: ' + prevDefectColors.chip + ')');

  // ---- ⑥ 部屋カードの「前回不良」バッジの青枠を削除(白地のまま) ----
  await page.locator('#navHome').click();
  await page.waitForTimeout(200);
  const badgeStyle = await page.evaluate(() => {
    var el = document.querySelector('.room-card[data-room="717"] .prev-defect-badge');
    var cs = el ? getComputedStyle(el) : null;
    return cs ? { bg: cs.backgroundColor, borderWidth: cs.borderTopWidth, color: cs.color } : null;
  });
  assert(badgeStyle !== null, '前回不良バッジ(717号室)が見つかった');
  assert(rgbToHex(badgeStyle.bg) === '#FFFFFF', '前回不良バッジの背景は白のまま (got: ' + badgeStyle.bg + ')');
  assert(badgeStyle.borderWidth === '0px', '前回不良バッジの青枠が削除されている (got border-width: ' + badgeStyle.borderWidth + ')');

  // ---- ③ 部屋カードのキャンセル表記の重複解消 ----
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
  await page.locator('#markCancel').click();
  await page.waitForTimeout(300);
  if (await page.locator('#panel').isVisible()) {
    await page.locator('#closePanel').click();
    await page.waitForTimeout(150);
  }
  const cancelledTexts = await page.evaluate(() => {
    var card = document.querySelector('.room-card[data-room="817"]');
    return {
      statusText: card.querySelector('.room-status-text').textContent.trim(),
      detailText: card.querySelector('.room-detail').textContent.trim(),
    };
  });
  assert(cancelledTexts.statusText === 'キャンセル', 'キャンセル済み部屋のstatus-textは「キャンセル」 (got: ' + cancelledTexts.statusText + ')');
  assert(cancelledTexts.detailText === '', 'キャンセル済み部屋のroom-detailは重複表記なし(空) (got: "' + cancelledTexts.detailText + '")');

  // ---- ⑦ 部屋カードの「完了」表示に時刻+点検員の名字 ----
  const doneDetail = await page.evaluate(() => {
    var card = document.querySelector('.room-card[data-room="816"]');
    return card.querySelector('.room-detail').textContent.trim();
  });
  assert(/^完了 \d{2}:\d{2} 大塚$/.test(doneDetail), '完了カードに時刻+点検員の名字(大塚)が表示されている (got: "' + doneDetail + '")');

  // ---- ⑧ サイン欄クリア〜未点検に戻すまでのボタン群: 白地・青枠・青文字 ----
  await markUndoRoom('816');
  await page.locator('.room-card[data-room="816"]').click();
  await page.waitForTimeout(200);
  const panelBtnIds = ['clearSign', 'openPhotosFromPanel', 'markCancel', 'markUndo'];
  for (const id of panelBtnIds) {
    const st = await page.evaluate((elId) => {
      var el = document.getElementById(elId);
      var cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, borderColor: cs.borderColor, color: cs.color };
    }, id);
    assert(rgbToHex(st.bg) === '#FFFFFF', '#' + id + ' の背景が白 (got: ' + st.bg + ')');
    assert(rgbToHex(st.borderColor) === BLUE, '#' + id + ' の枠が青 (got: ' + st.borderColor + ')');
    assert(rgbToHex(st.color) === BLUE, '#' + id + ' の文字が青 (got: ' + st.color + ')');
  }

  // ---- ④ 写真一覧の不良タグラベル: 青塗りつぶし・白文字(実際に写真を1枚追加して検証) ----
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-colorfix-'));
  const tmpImgPath = path.join(tmpDir, 'test.png');
  fs.writeFileSync(tmpImgPath, Buffer.from(TINY_PNG_BASE64, 'base64'));
  await page.locator('#openPhotosFromPanel').click();
  await page.waitForTimeout(150);
  await page.locator('#addPhotoFromPanel').click();
  await page.waitForTimeout(150);
  await page.locator('#photoInput').setInputFiles(tmpImgPath);
  await page.waitForTimeout(300);
  await page.locator('.tag-chip', { hasText: '共同住宅用自動火災報知設備' }).first().click();
  await page.waitForTimeout(300);
  await page.locator('#closePhotoPanel').click();
  await page.waitForTimeout(200);
  await page.locator('#closePanel').click().catch(() => {});
  await page.waitForTimeout(150);
  fs.rmSync(tmpDir, { recursive: true, force: true });

  await page.locator('#navPhotos').click();
  await page.waitForTimeout(400);
  const photoTagLabelStyle = await page.evaluate(() => {
    var el = document.querySelector('.photo-tag-label');
    var cs = el ? getComputedStyle(el) : null;
    return cs ? { text: el.textContent, bg: cs.backgroundColor, color: cs.color } : null;
  });
  assert(photoTagLabelStyle !== null, '写真一覧に不良タグラベル(.photo-tag-label)を持つ写真が見つかった');
  assert(rgbToHex(photoTagLabelStyle.bg) === BLUE, '写真の不良タグラベルの背景が青塗りつぶし (got: ' + photoTagLabelStyle.bg + ')');
  assert(rgbToHex(photoTagLabelStyle.color) === '#FFFFFF', '写真の不良タグラベルの文字が白 (got: ' + photoTagLabelStyle.color + ')');

  // ---- ⑤ 写真一覧のタグ絞り込みトグル: 選択中/未選択どちらも青枠・白地・青文字 ----
  const chipStyles = await page.evaluate(() => {
    var chips = Array.from(document.querySelectorAll('#albumTagFilter .tag-chip'));
    return chips.slice(0, 4).map(function (el) {
      var cs = getComputedStyle(el);
      return { active: el.getAttribute('data-active'), bg: cs.backgroundColor, borderColor: cs.borderColor, color: cs.color };
    });
  });
  assert(chipStyles.length >= 2, '写真一覧のタグ絞り込みトグルが複数見つかった (got: ' + chipStyles.length + ')');
  const hasActive = chipStyles.some((s) => s.active === 'true');
  const hasInactive = chipStyles.some((s) => s.active === 'false');
  assert(hasActive, '選択中のトグルが含まれている');
  assert(hasInactive, '未選択のトグルも含まれている(選択中以外も検証するため)');
  chipStyles.forEach((s, i) => {
    assert(rgbToHex(s.borderColor) === BLUE, 'タグ絞り込みトグル[' + i + '](active=' + s.active + ')の枠が青 (got: ' + s.borderColor + ')(選択中/未選択どちらも青枠であること)');
    if (s.active === 'true') {
      // 選択中(タップ後)は青塗りつぶし・白文字に反転する
      assert(rgbToHex(s.bg) === BLUE, 'タグ絞り込みトグル[' + i + '](選択中)の背景が青塗りつぶしになっている (got: ' + s.bg + ')');
      assert(rgbToHex(s.color) === '#FFFFFF', 'タグ絞り込みトグル[' + i + '](選択中)の文字が白になっている (got: ' + s.color + ')');
    } else {
      assert(rgbToHex(s.bg) === '#FFFFFF', 'タグ絞り込みトグル[' + i + '](未選択)の背景が白 (got: ' + s.bg + ')');
      assert(rgbToHex(s.color) === BLUE, 'タグ絞り込みトグル[' + i + '](未選択)の文字が青 (got: ' + s.color + ')');
    }
  });

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'Not implemented', 'exitFullscreen', 'requestFullscreen', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL 9-ITEM UI COLOR/TEXT FIX ASSERTIONS PASSED (2026-07-17再修正版)');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
