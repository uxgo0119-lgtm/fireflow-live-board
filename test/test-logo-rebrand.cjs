// 2026-07-17 ロゴ修正の回帰テスト。
// ①「トップ画像のLBのアイコンを削除」→ .brand-badge(「LB」の正方形アイコン)をDOMから削除した。
// ②「Live Boardのフォントを添付のフォントに、文字の間隔も添付参照」→ .brand-nameのfont-familyに
//   'Poppins'(太字・幾何学的なサンセリフ)を指定し、字間を詰めた(letter-spacing: -1px)。
//   (オフラインでフォント読み込みに失敗した場合は自動的にシステムフォントへフォールバックする)
//   [2026-07-19追記] 「まだSUNTORY風フォントになっていない」との指摘を受け、Poppinsから
//   'Fredoka'(RFのロゴでも採用した丸みのある太字フォント)に変更。字間もletter-spacing: -0.5pxへ調整。
//   [2026-07-19再修正] 「Fredokaもまだ違う」との指摘を受け、ユーザーが選定した
//   'M PLUS Rounded 1c'(日本発の丸ゴシック体、最太ウェイト900)へ変更。letter-spacingは0に調整。
//   [2026-07-19四訂] Webフォントでの再現では何度指摘されても納得いただける見た目にならな
//   かったため方針転換。ユーザーに5種類のロゴ案(画像)を提示 → 気に入った方向性(丸みのある
//   太字ワードマーク)を選定 → 丸み量を3段階に調整した候補を再提示 → その中の
//   「logo_reduced_less_c(細めストローク・弱めの丸み)」を正式採用。この画像をそのまま
//   base64インラインPNGとして埋め込み、.brand-nameはテキストのdivから<img>タグに変更した
//   (フォント読み込みの成否に関係なく常に同じ見た目になる)。
// ③「文字の色は青」→ ロゴ画像の色をブランドブルー(#007AFE)で生成した。
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

  // ---- ① 「LB」アイコンの削除 ----
  const badgeCount = await page.locator('.brand-badge').count();
  assert(badgeCount === 0, 'トップ画像の「LB」アイコン(.brand-badge)が削除されている (got count: ' + badgeCount + ')');

  // ---- ロゴが<img>として表示されている(2026-07-19四訂: テキストから画像方式に変更) ----
  const logoInfo = await page.evaluate(() => {
    var el = document.querySelector('.brand-name');
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      alt: el.getAttribute('alt'),
      srcIsDataPng: (el.getAttribute('src') || '').indexOf('data:image/png;base64,') === 0,
      width: r.width,
      height: r.height,
      naturalWidth: el.naturalWidth,
      naturalHeight: el.naturalHeight,
    };
  });
  assert(!!logoInfo, '.brand-name 要素が存在する');
  assert(logoInfo.tag === 'IMG', '.brand-name は<img>タグになっている(テキストのdivではない) (got: ' + logoInfo.tag + ')');
  assert(logoInfo.alt === 'Live Board', 'ロゴ画像のalt属性が「Live Board」になっている(スクリーンリーダー対応、表記自体は維持) (got: "' + logoInfo.alt + '")');
  assert(logoInfo.srcIsDataPng, 'ロゴ画像はbase64インラインPNG(data:image/png;base64,...)として埋め込まれている(外部フォント読み込みに依存しない)');
  assert(logoInfo.naturalWidth > 0 && logoInfo.naturalHeight > 0, 'ロゴ画像が正常にデコードされ、実寸が取得できている (got: ' + logoInfo.naturalWidth + 'x' + logoInfo.naturalHeight + ')');
  assert(logoInfo.height > 0 && logoInfo.height < 60, 'ロゴ画像の表示高さがトップバーに収まる妥当な範囲になっている (got height: ' + logoInfo.height + 'px)');

  // 表示上の縦横比が、元のワードマーク画像(横長、幅:高さ ≒ 6:1)に近いこと
  const aspect = logoInfo.naturalWidth / logoInfo.naturalHeight;
  assert(aspect > 4.5 && aspect < 7.5, 'ロゴ画像の縦横比が横長のワードマークとして妥当な範囲 (got aspect: ' + aspect.toFixed(2) + ')');

  const EXPECTED_HARMLESS = ['supabase-integration.js', 'ERR_FILE_NOT_FOUND', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'Not implemented', 'exitFullscreen', 'requestFullscreen', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const relevantErrors = errors.filter((e) => !EXPECTED_HARMLESS.some((h) => e.indexOf(h) !== -1));
  if (relevantErrors.length) {
    console.log('--- unexpected console/page errors ---');
    relevantErrors.forEach((e) => console.log(e));
    throw new Error('Unexpected page errors captured');
  }

  console.log('\nALL LOGO REBRAND ASSERTIONS PASSED');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
