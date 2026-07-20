// 2026-07-19 追加: 「左側にカラーが入っていない」のご指摘、および「点検報告書の避難器具の
// 設置場所にはしごの場所が記載されています」とのご説明への対応の回帰テスト。
//
// 背景: これまでLADDER_ROOMS(「全体」「全体拡大」モードでの左端カラーボーダー表示対象部屋)は
// どの物件データをアップロードしても常に空配列のままで、判定元データが存在しなかった。
// ユーザーからのご説明を受け、点検報告書(xlsx)の「避難器具」シートの「設置場所」欄
// (例:「2階～5階…1、4、17号室　　6階…2、4、17号室　　7階…3、4、17号室　　8階…4、17号室
// 　集会室」のような自由記述)を解析し、実在する部屋番号と突き合わせてLADDER_ROOMSを
// 算出するようにした(index.html内、parseExcelAndRebuild関数)。
//
// 注記: この解析ロジック(正規表現による「(開始階)階～(終了階)階…(号室番号、複数可)号室」の
// 展開、および実在する部屋番号との突き合わせ)は、実際の点検報告書サンプル
// (点検報告書例1.xlsx、避難器具シートB12「設置場所」ラベル・Q12の値)から抽出した正規の
// テキストで検証している。ただし、このロジックはindex.html内のparseExcelAndRebuild関数
// (ブラウザ上でxlsxファイルをアップロードした際に実行される)の一部であり、xlsx解析ライブラリ
// (SheetJS、https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js)を
// 外部CDNから読み込む必要があるため、外部ネットワークアクセスが遮断されているこの検証環境
// では、実際のファイルアップロード操作を経由したブラウザ上の統合テストが実行できない
// (試みたところ、CDN読み込み失敗によりXLSX.read自体が例外を投げ、try/catchで
// 静かに「読み込みに失敗しました」のトーストになるのみで、parseExcelAndRebuild関数自体が
// 呼ばれないことを確認した)。そのため、このテストはindex.htmlから該当ロジック(正規表現・
// 部屋番号候補生成部分)をそのまま複製し、Node.js単体で検証する形を取っている。
// index.html側のロジックを変更した場合は、このテスト内の複製コードも同期して更新すること。
function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

// index.html の parseExcelAndRebuild 内、LADDER_ROOMS算出部分の複製(2026-07-19時点)。
function parseLadderRooms(ladderLocationText, floorRoomLookup) {
  var newLadderRooms = [];
  var ladderSegRe = /(\d+)\s*階\s*(?:[~～\-]\s*(\d+)\s*階)?\s*[…:：]?\s*([\d、,，\s]+)号室/g;
  var ladderSegMatch;
  while ((ladderSegMatch = ladderSegRe.exec(ladderLocationText)) !== null) {
    var floorStart = parseInt(ladderSegMatch[1], 10);
    var floorEnd = ladderSegMatch[2] ? parseInt(ladderSegMatch[2], 10) : floorStart;
    var unitsRaw = ladderSegMatch[3].split(/[、,，\s]+/).map(function(u) { return u.trim(); }).filter(Boolean);
    for (var fl = floorStart; fl <= floorEnd; fl++) {
      var roomsOnFloor = floorRoomLookup[fl];
      if (!roomsOnFloor) continue;
      unitsRaw.forEach(function(u) {
        var candidates = [String(fl) + u, String(fl) + u.replace(/^0+(?=\d)/, '').padStart(2, '0'), String(fl) + u.padStart(3, '0')];
        for (var ci = 0; ci < candidates.length; ci++) {
          if (roomsOnFloor.indexOf(candidates[ci]) !== -1 && newLadderRooms.indexOf(candidates[ci]) === -1) {
            newLadderRooms.push(candidates[ci]);
            break;
          }
        }
      });
    }
  }
  return newLadderRooms;
}

// ---- index.htmlに実際に挿入されている複製元コードと文字列として一致していることを確認 ----
// (このテストの複製が古くなって実装と乖離するのを防ぐための同期チェック)
var fs = require('fs');
var path = require('path');
var indexHtml = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf-8');
var regexSourceInHtml = /var ladderSegRe = \/[^\n]+\/g;/.exec(indexHtml);
assert(!!regexSourceInHtml, 'index.html内にladderSegRe(はしご設置場所の解析用正規表現)が見つかる');
var expectedRegexLine = 'var ladderSegRe = /(\\d+)\\s*階\\s*(?:[~～\\-]\\s*(\\d+)\\s*階)?\\s*[…:：]?\\s*([\\d、,，\\s]+)号室/g;';
assert(regexSourceInHtml[0] === expectedRegexLine, 'index.html内の正規表現が、このテストの複製コードと完全に一致している(実装変更時はテストも同期更新すること)');

// ---- Test 1: 実際の点検報告書例1.xlsx(避難器具シート、設置場所欄)のテキストで検証 ----
var realText = '2階～5階…1、4、17号室　　6階…2、4、17号室　　7階…3、4、17号室　　8階…4、17号室  　集会室';
var floorRoomLookup = {};
[2, 3, 4, 5, 6, 7, 8].forEach(function(fl) {
  var rooms = [];
  for (var u = 1; u <= 17; u++) rooms.push(String(fl) + String(u).padStart(2, '0'));
  floorRoomLookup[fl] = rooms;
});
var result = parseLadderRooms(realText, floorRoomLookup);
var expected = ['201', '204', '217', '301', '304', '317', '401', '404', '417', '501', '504', '517', '602', '604', '617', '703', '704', '717', '804', '817'];
assert(result.length === expected.length, '実際の点検報告書の記載から正しい件数(' + expected.length + ')の「はしご」設置部屋が抽出できる (got: ' + result.length + ')');
expected.forEach(function(r) {
  assert(result.indexOf(r) !== -1, r + '号室が正しく「はしご」設置ありと判定される');
});
assert(result.indexOf('202') === -1, '対象外の202号室は含まれない');
assert(result.indexOf('816') === -1, '対象外の816号室は含まれない(8階はunit 4・17号室のみ記載)');
assert(result.indexOf('集会室') === -1 && result.every(function(r) { return /^\d+$/.test(r); }), '「集会室」のような部屋番号ではない記載は無視される');

// ---- Test 2: 単一階のみのパターン(階範囲の指定なし) ----
var singleFloorText = '3階…5、10号室';
var lookup2 = { 3: ['301', '305', '310', '315'] };
var result2 = parseLadderRooms(singleFloorText, lookup2);
assert(JSON.stringify(result2.sort()) === JSON.stringify(['305', '310']), '階範囲の指定がない単一階のみのパターンも正しく解析できる (got: ' + JSON.stringify(result2) + ')');

// ---- Test 3: 実在しない部屋番号・階の記載は安全に無視される ----
var invalidText = '9階…99号室';
var lookup3 = { 2: ['201', '202'] };
var result3 = parseLadderRooms(invalidText, lookup3);
assert(result3.length === 0, '物件データに存在しない階・部屋番号の記載は無視される(安全側の実装、got: ' + JSON.stringify(result3) + ')');

// ---- Test 4: 桁数の表記ゆれ(ゼロ埋めありなし)にもある程度対応できる ----
var paddedText = '4階…01、02号室'; // ゼロ埋め済みの表記
var lookup4 = { 4: ['401', '402', '403'] };
var result4 = parseLadderRooms(paddedText, lookup4);
assert(JSON.stringify(result4.sort()) === JSON.stringify(['401', '402']), 'ゼロ埋め済みの号室表記(01、02)でも正しく実在部屋と一致する (got: ' + JSON.stringify(result4) + ')');

console.log('\nALL LADDER-REPORT-PARSE-LOGIC ASSERTIONS PASSED');
