// 文字サイズ・UI見ため改善(2026-07-17追加)の検証。
// 背景: ①--text-lo(#9CA3AF)がWCAG AAのコントラスト基準(4.5:1)を満たさない(実測2.54:1)まま
// キャンセルボタン・注記・削除ボタン等の「機能的なテキスト」に使われていた ②.icon-btn(34px)や
// 閉じるボタンなどApple HIGの推奨タップ領域(44x44pt)を下回るボタンが複数あった ③文字サイズが
// 全てpx固定でOSのテキストサイズ設定にもアプリ内設定にも連動しなかった、という3点を修正した。
const { chromium } = require('playwright');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

function parseRgb(str) {
  const m = str.match(/rgba?\(([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)/);
  if (!m) return null;
  return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(fileUrl);
  await page.waitForSelector('.room-card', { timeout: 10000 });

  // ---- ①コントラスト修正の検証: 機能的なテキスト/ボタンの色がtext-lo(#9CA3AF)から
  //      text-mid(#6B7280)に変わっていること ----
  {
    const textMid = [107, 114, 128]; // #6B7280
    const textLo = [156, 163, 175]; // #9CA3AF

    const color = await page.evaluate(() => {
      const el = document.querySelector('.filter-clear');
      return getComputedStyle(el).color;
    });
    const rgb = parseRgb(color);
    assert(rgb[0] === textMid[0] && rgb[1] === textMid[1] && rgb[2] === textMid[2],
      '.filter-clear の文字色がtext-mid(#6B7280)になっている (got: ' + color + ')');

    const noteColor = await page.evaluate(() => {
      // .sheet-noteはDOM上に静的な要素が無い場合があるため、一時的にテスト用要素を作って検証
      const el = document.createElement('div');
      el.className = 'sheet-note';
      document.body.appendChild(el);
      const c = getComputedStyle(el).color;
      el.remove();
      return c;
    });
    const noteRgb = parseRgb(noteColor);
    assert(noteRgb[0] === textMid[0] && noteRgb[1] === textMid[1] && noteRgb[2] === textMid[2],
      '.sheet-note の文字色がtext-mid(#6B7280)になっている (got: ' + noteColor + ')');

    // 装飾用のシェブロン(.list-row-chevron)は意図的にtext-loのまま(変更していないことを確認)
    const chevronColor = await page.evaluate(() => {
      const el = document.createElement('span');
      el.className = 'list-row-chevron';
      document.body.appendChild(el);
      const c = getComputedStyle(el).color;
      el.remove();
      return c;
    });
    const chevronRgb = parseRgb(chevronColor);
    assert(chevronRgb[0] === textLo[0] && chevronRgb[1] === textLo[1] && chevronRgb[2] === textLo[2],
      '装飾用の.list-row-chevronは意図的にtext-lo(#9CA3AF)のまま変更されていない (got: ' + chevronColor + ')');
  }

  // ---- ②タップ領域拡大の検証: 主要な操作ボタンが44x44px以上になっていること ----
  {
    const iconBtnBox = await page.locator('#gridExpandToggle').boundingBox();
    assert(iconBtnBox.width >= 44 && iconBtnBox.height >= 44,
      '.icon-btn(#gridExpandToggle)が44x44px以上 (got: ' + iconBtnBox.width + 'x' + iconBtnBox.height + ')');

    // 部屋パネルを開いて.back-arrow-btnと.panel-buttons buttonを検証
    await page.locator('.room-card').first().click();
    await page.waitForTimeout(150);
    const backBtnBox = await page.locator('#closePanel').boundingBox();
    assert(backBtnBox.width >= 44 && backBtnBox.height >= 44,
      '.back-arrow-btn(#closePanel)が44x44px以上 (got: ' + backBtnBox.width + 'x' + backBtnBox.height + ')');

    const markCancelBox = await page.locator('#markCancel').boundingBox();
    assert(markCancelBox.height >= 44,
      '.panel-buttons button(#markCancel)の高さが44px以上 (got: ' + markCancelBox.height + ')');

    await page.locator('#openPhotosFromPanel').click();
    await page.waitForTimeout(150);
    const closePhotoBox = await page.locator('#closePhotoPanel').boundingBox();
    assert(closePhotoBox.width >= 44 && closePhotoBox.height >= 44,
      '閉じるボタン(#closePhotoPanel, .close-x-btn)が44x44px以上 (got: ' + closePhotoBox.width + 'x' + closePhotoBox.height + ')');

    await page.locator('#addTagOnly').click();
    await page.waitForTimeout(150);
    const tagChipBox = await page.locator('.tag-chip').first().boundingBox();
    assert(tagChipBox.height >= 44,
      '.tag-chipの高さが44px以上 (got: ' + tagChipBox.height + ')');
    await page.locator('#skipTag').click();
    await page.waitForTimeout(150);
    await page.locator('#closePhotoPanel').click();
    await page.waitForTimeout(150);
    // 2026-07-17変更(①1室操作時間短縮): #openPhotosFromPanel経由で開いた写真パネルを
    // 閉じると#panel(サインパネル)に戻るようになったため、ヘッダーのアイコン(この後の
    // 文字サイズ切替ボタン等)を操作する前に、明示的に#panelも閉じてグリッドへ戻る。
    await page.locator('#closePanel').click();
    await page.waitForTimeout(150);
  }

  // ---- ③文字サイズ切替の検証 ----
  {
    const scaleBefore = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim());
    assert(scaleBefore === '1', '初期状態では--font-scaleが1 (got: ' + scaleBefore + ')');

    // 2026-07-19四訂: .brand-nameはテキストのdivから画像ロゴの<img>に変更されたため、
    // font-sizeではなくheight(var(--font-scale)連動)で拡大率を検証する。
    // [2026-07-19再修正]「文字を大、特大にしたら上部のナビゲーションの位置が変わる」との
    // ご指摘への対応で、ロゴの高さは文字サイズに連動しない固定値に変更した。以下の
    // アサーションも、ロゴの高さが「変わらない」ことを確認する内容に更新している。
    // [2026-07-19再々修正]「ロゴの右横にLive Boardのフォントを小さく表示」のご指示により、
    // ワードマークの高さ自体も27px→18pxに縮小された。
    const brandHeightBefore = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.brand-name')).height));
    assert(Math.abs(brandHeightBefore - 18) < 0.5, '標準時、.brand-nameロゴ画像のheightは18px (got: ' + brandHeightBefore + ')');

    // 2026-07-19変更: 「文字サイズ」単独のアイコン(#fontSizeToggle)は画面ロックとまとめて
    // 歯車アイコン(#settingsToggle)に統合され、ポップアップも#settingsMenuPopupになった。
    await page.locator('#settingsToggle').click();
    await page.waitForTimeout(100);
    const popupVisible = await page.locator('#settingsMenuPopup').isVisible();
    assert(popupVisible, '#settingsToggleをタップすると#settingsMenuPopupが表示される');

    await page.locator('.font-size-option[data-scale="1.3"]').click();
    await page.waitForTimeout(100);
    const popupHidden = !(await page.locator('#settingsMenuPopup').isVisible());
    assert(popupHidden, '「特大」を選ぶとポップアップが閉じる');

    const scaleAfter = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim());
    assert(scaleAfter === '1.3', '「特大」選択後、--font-scaleが1.3になる (got: ' + scaleAfter + ')');

    const brandHeightAfter = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.brand-name')).height));
    assert(Math.abs(brandHeightAfter - 18) < 0.5,
      '「特大」選択後も、.brand-nameロゴ画像のheightは18pxのまま変わらない(上部ナビの位置が動かないための固定化) (got: ' + brandHeightAfter + ')');

    // localStorageに保存され、リロード後も復元されること
    const saved = await page.evaluate(() => window.localStorage.getItem('lb_font_scale'));
    assert(saved === '1.3', '選択した文字サイズがlocalStorageに保存される (got: ' + saved + ')');

    await page.reload();
    await page.waitForSelector('.room-card', { timeout: 10000 });
    const scaleAfterReload = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim());
    assert(scaleAfterReload === '1.3', 'リロード後も文字サイズ設定(1.3)が復元される (got: ' + scaleAfterReload + ')');
    const activeOption = await page.evaluate(() => document.querySelector('.font-size-option[data-active="true"]').getAttribute('data-scale'));
    assert(activeOption === '1.3', 'リロード後、ポップアップ内でも「特大」が選択済み表示になる (got: ' + activeOption + ')');

    // 標準に戻す
    await page.locator('#settingsToggle').click();
    await page.waitForTimeout(100);
    await page.locator('.font-size-option[data-scale="1"]').click();
    await page.waitForTimeout(100);
    const scaleReset = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim());
    assert(scaleReset === '1', '「標準」に戻すと--font-scaleが1に戻る (got: ' + scaleReset + ')');
  }

  assert(errors.length === 0, 'ページ読み込み・操作中にJSエラーが発生していない (got: ' + JSON.stringify(errors) + ')');

  // スクリーンショットで見た目の崩れがないか目視確認用に保存
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.resolve(__dirname, '_a11y_screenshot_list.png') });
  await page.locator('.room-card').first().click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.resolve(__dirname, '_a11y_screenshot_panel.png') });

  console.log('\nALL A11Y(コントラスト・タップ領域・文字サイズ) ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
