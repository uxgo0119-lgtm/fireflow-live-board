// FireFlow Live Board — 点検希望時間連絡票スキャン用サーバーサイドプロキシ
//
// これはVercelの「サーバーレス関数」です。ブラウザ（Live Board本体）は
// このURL（/api/scan-time-request）にだけリクエストを送り、実際のAnthropic
// APIキーはこのファイルの外（Vercelの環境変数 ANTHROPIC_API_KEY）にのみ
// 保管されます。ブラウザ側のJavaScriptにAPIキーが一切現れないため、
// 誰でも見られるフロントエンドのコードにキーが漏れる心配がありません。
//
// 対応リクエスト:
//   POST /api/scan-time-request
//   ヘッダ: Authorization: Bearer <ログイン中ユーザーのSupabaseアクセストークン>
//   body: { mode: 'single' | 'bulk', mediaType: 'image/jpeg'等, data: 'base64文字列' }
//
// 返却:
//   成功時: { result: {...} }  ※ mode:'single'ならオブジェクト、mode:'bulk'なら配列
//   失敗時: { error: '日本語のエラーメッセージ' }（HTTPステータスも合わせて確認してください）
//
// 2026-07-17 修正：以前はこのURLに認証チェックが一切無く、URLさえ分かれば誰でも
// （ログインすらしていない第三者でも）画像・PDFを送りつけてこの関数を叩けてしまい、
// サーバー側のAnthropic APIキー（＝サイト運営者の支払い）を無制限に消費させられる
// 状態だった（api/accept-invite.jsは既にトークン検証していたが、こちらは漏れていた）。
// 今回、api/accept-invite.jsと同じ方式（Supabase Authにアクセストークンを問い合わせて
// 検証する）で、ログイン済みユーザーからのリクエストだけを受け付けるようにした。
// あわせて、送信できる画像/PDFのサイズにも上限を設けた（青天井のリクエストを防ぐため）。
// 注：ログイン済みユーザーであれば誰でも呼べる状態のままであり、ユーザー単位の
// 呼び出し回数制限までは今回は実装していない（永続ストレージが必要になるため）。
// 悪用の懸念が強まった場合は、追加でレート制限の実装を検討してください。

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://trtivspdgekofiglfyls.supabase.co';
// Single(JPEG等): base64で最大約8MB(デコード後 約6MB)。Bulk(PDF複数ページ): 最大約30MB(デコード後 約22MB)。
const MAX_BASE64_LENGTH_SINGLE = 8 * 1000 * 1000;
const MAX_BASE64_LENGTH_BULK = 30 * 1000 * 1000;

const SINGLE_PROMPT =
  '添付の画像は、消防点検の希望時間を入居者が記入した連絡票です。' +
  '記載内容から、部屋番号・希望区分・希望時刻（範囲指定なら開始・終了時刻）・' +
  '手書きの補足メモ・お名前欄を読み取り、以下のJSON形式のみを出力してください。' +
  '説明文やコードブロックの記号は一切付けないでください。\n' +
  '{"room_number": "部屋番号（数字のみ。読み取れなければ空文字）", ' +
  '"symbol": "「午前中」にチェックがあれば\'A\'、「午後」にチェックがあれば\'P\'、' +
  '「今回は不要・立会いできません（キャンセル）」にチェックがあれば\'キャンセル\'。' +
  '「時間指定」にチェックがある場合や、どれにもチェックが無い場合は空文字。", ' +
  '"time": "「時間指定」にチェックがあり具体的な時刻が記入されていれば、その時刻' +
  '（「〜」で範囲指定されている場合は開始時刻）をHH:MM形式で。無ければ空文字。", ' +
  '"time_end": "「時間指定」の記入が「〜」で区切られた範囲指定になっている場合の' +
  '終了時刻をHH:MM形式で。範囲指定でなければ空文字。", ' +
  '"note": "チェック欄の近くに手書きの補足メモ（例：できるだけ早く）が書かれていれば' +
  'その文字列。無ければ空文字。", ' +
  '"name": "「お名前（任意）」欄に手書きの記入があればその文字列。空欄なら空文字。"}';

const BULK_PROMPT =
  '添付のPDFには、消防点検の希望時間を入居者が記入した連絡票が複数ページ含まれています' +
  '（1ページに1件、または複数件のことがあります）。すべてのページ・すべての記入から、' +
  '部屋番号・希望区分・希望時刻（範囲指定なら開始・終了時刻）・手書きの補足メモ・' +
  'お名前欄を読み取ってください。以下のJSON配列形式のみを出力してください。' +
  '説明文やコードブロックの記号は一切付けないでください。\n' +
  '[{"room_number": "部屋番号（数字のみ）", ' +
  '"symbol": "「午前中」にチェックがあれば\'A\'、「午後」にチェックがあれば\'P\'、' +
  '「今回は不要・立会いできません（キャンセル）」にチェックがあれば\'キャンセル\'。' +
  '「時間指定」にチェックがある場合や、どれにもチェックが無い場合は空文字。", ' +
  '"time": "「時間指定」にチェックがあり具体的な時刻が記入されていれば、その時刻' +
  '（「〜」で範囲指定されている場合は開始時刻）をHH:MM形式で。無ければ空文字。", ' +
  '"time_end": "「時間指定」の記入が「〜」で区切られた範囲指定になっている場合の' +
  '終了時刻をHH:MM形式で。範囲指定でなければ空文字。", ' +
  '"note": "チェック欄の近くに手書きの補足メモ（例：できるだけ早く）が書かれていれば' +
  'その文字列。無ければ空文字。", ' +
  '"name": "「お名前（任意）」欄に手書きの記入があればその文字列。空欄なら空文字。"}, ...]\n' +
  '読み取れた件数分すべてを配列に含めてください。部屋番号が読み取れない項目は含めないでください。';

// Authorizationヘッダのアクセストークンをaccept-invite.jsと同じ方式でSupabase Authに
// 問い合わせて検証する。有効なら{ok:true, userId}、無効・未ログインなら{ok:false, message}。
async function verifyAccessToken(req) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return { ok: false, status: 500, message: 'サーバー側に SUPABASE_SERVICE_ROLE_KEY が設定されていません。Vercelのプロジェクト設定 → Environment Variables で設定し、再デプロイしてください。' };
  }
  const authHeader = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  const accessToken = m && m[1];
  if (!accessToken) {
    return { ok: false, status: 401, message: 'ログインが必要です。ログイン後にもう一度お試しください。' };
  }
  try {
    const authRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + accessToken },
    });
    if (!authRes.ok) {
      return { ok: false, status: 401, message: 'ログイン情報の確認に失敗しました。お手数ですが、もう一度ログインし直してからお試しください。' };
    }
    const authUser = await authRes.json();
    if (!authUser || !authUser.id) {
      return { ok: false, status: 401, message: 'ログイン情報の確認に失敗しました。お手数ですが、もう一度ログインし直してからお試しください。' };
    }
    return { ok: true, userId: authUser.id };
  } catch (err) {
    return { ok: false, status: 401, message: 'ログイン情報の確認中にエラーが発生しました。もう一度お試しください。' };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'このエンドポイントはPOSTのみ対応しています。' });
    return;
  }

  const authCheck = await verifyAccessToken(req);
  if (!authCheck.ok) {
    res.status(authCheck.status).json({ error: authCheck.message });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: 'サーバー側に ANTHROPIC_API_KEY が設定されていません。Vercelのプロジェクト設定 → ' +
        'Environment Variables で設定し、再デプロイしてください。',
    });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      res.status(400).json({ error: 'リクエストの形式が不正です（JSONとして解析できません）。' });
      return;
    }
  }
  const mode = body && body.mode;
  const mediaType = body && body.mediaType;
  const data = body && body.data;

  if (mode !== 'single' && mode !== 'bulk') {
    res.status(400).json({ error: 'mode は "single" か "bulk" のいずれかを指定してください。' });
    return;
  }
  if (!mediaType || !data) {
    res.status(400).json({ error: 'mediaType と data は必須です。' });
    return;
  }

  const isBulk = mode === 'bulk';
  const maxLen = isBulk ? MAX_BASE64_LENGTH_BULK : MAX_BASE64_LENGTH_SINGLE;
  if (typeof data !== 'string' || data.length > maxLen) {
    res.status(413).json({ error: 'ファイルサイズが大きすぎます。' + (isBulk ? 'PDFのページ数を減らすか、' : '') + '別のファイルでお試しください。' });
    return;
  }
  const contentBlock = isBulk
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
  const promptText = isBulk ? BULK_PROMPT : SINGLE_PROMPT;

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: isBulk ? 16000 : 400,
        messages: [
          {
            role: 'user',
            content: [contentBlock, { type: 'text', text: promptText }],
          },
        ],
      }),
    });

    const anthropicData = await anthropicRes.json();

    if (!anthropicRes.ok || anthropicData.type === 'error') {
      const apiMsg =
        anthropicData.error && anthropicData.error.message
          ? anthropicData.error.message
          : 'HTTPエラー ' + anthropicRes.status;
      res.status(502).json({ error: 'Anthropic API: ' + apiMsg });
      return;
    }

    const textParts = (anthropicData.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text);
    const raw = textParts.join('').replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      res.status(502).json({ error: 'AIの返答をJSONとして解析できませんでした: ' + raw.slice(0, 300) });
      return;
    }

    if (isBulk && !Array.isArray(parsed)) {
      res.status(502).json({ error: '想定外の形式です（配列ではありません）: ' + raw.slice(0, 300) });
      return;
    }

    res.status(200).json({ result: parsed });
  } catch (err) {
    res.status(500).json({ error: err && err.message ? err.message : String(err) });
  }
}

// 実行時間の上限は vercel.json 側の functions.maxDuration で設定しています
// （このプロジェクトはNext.js等のフレームワークを使わない素のVercel Functionsのため、
// ここでのexport const configではなくvercel.jsonで指定するのが正しい方法です）。
