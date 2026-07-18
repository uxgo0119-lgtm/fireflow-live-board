// FireFlow Live Board — 招待リンクの受け入れ（物件への新規参加）用サーバーサイド関数。
//
// なぜこれが必要か（2026-07-17 追加）：
// 物件(property)への参加(property_membersへのinsert)は、以前は「ログインさえしていれば
// 誰でも自分をどの物件にも追加できる」という緩いRLSポリシーで許可されていましたが、
// これは property_id さえ分かれば他社の物件データにも勝手に参加できてしまう、
// 商品化（複数の顧客企業への展開）を考えると重大な情報漏洩リスクでした
// （詳細は schema.sql の property_members / property_invites セクションのコメント参照）。
// 今回、クライアントから直接 property_members へ insert する経路を廃止し、
// 「有効な招待(property_invites)のIDを知っている人だけが、この関数を経由して参加できる」
// という設計に変更しました。この関数だけが Service Role Key（RLSを無視できる強い権限の鍵）
// を使い、招待の有効性（失効していないか・期限切れでないか・利用上限に達していないか）と
// 本人確認（ログイントークンの検証）をサーバー側で行ってから、対象ユーザーを
// property_membersに追加します。
//
// 対応リクエスト:
//   GET  /api/accept-invite?id=xxx
//     → ログイン前でも見られる、招待の確認用の最小限の情報を返す。
//       { result: { propertyName, role, roleLabel, valid, reason } }
//   POST /api/accept-invite   body: {}    ヘッダ: Authorization: Bearer <ユーザーのアクセストークン>
//     → クエリ文字列 ?id=xxx （またはbody.id）で対象の招待を指定。
//       トークンをSupabase Auth APIで検証し、本人確認できたユーザーだけを
//       対象物件のproperty_membersに追加する（既にメンバーの場合は何もせず成功扱い）。
//     → { result: { propertyId, propertyName, role, roleLabel, alreadyMember } }
//
// 失敗時: { error: '日本語のエラーメッセージ' }（HTTPステータスも合わせて確認してください）

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://trtivspdgekofiglfyls.supabase.co';

const ROLE_LABEL = { inspector: '点検員', admin: '管理者' };

const INVITE_SELECT_FIELDS =
  'id,property_id,role,expires_at,revoked_at,max_uses,use_count,properties(name)';

function isUuid(s) {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

async function fetchInvite(serviceKey, id) {
  const url = SUPABASE_URL + '/rest/v1/property_invites?id=eq.' + encodeURIComponent(id) + '&select=' + INVITE_SELECT_FIELDS;
  const r = await fetch(url, {
    headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey },
  });
  if (!r.ok) throw new Error('Supabaseへの問い合わせに失敗しました（HTTP ' + r.status + '）');
  const rows = await r.json();
  return rows[0] || null;
}

// 招待の有効性を判定する。有効な場合は reason が null。
function checkValidity(invite) {
  if (invite.revoked_at) {
    return 'この招待リンクは発行者によって無効化されています。新しいリンクを発行してもらってください。';
  }
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    return 'この招待リンクの有効期限が切れています。新しいリンクを発行してもらってください。';
  }
  if (invite.max_uses != null && invite.use_count >= invite.max_uses) {
    return 'この招待リンクは利用回数の上限に達しています。新しいリンクを発行してもらってください。';
  }
  return null;
}

function toInfoShape(invite) {
  const reason = checkValidity(invite);
  return {
    propertyName: (invite.properties && invite.properties.name) || null,
    role: invite.role,
    roleLabel: ROLE_LABEL[invite.role] || invite.role,
    valid: !reason,
    reason: reason,
  };
}

export default async function handler(req, res) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    res.status(500).json({
      error: 'サーバー側に SUPABASE_SERVICE_ROLE_KEY が設定されていません。Vercelのプロジェクト設定 → ' +
        'Environment Variables で設定し、再デプロイしてください。',
    });
    return;
  }

  const id = (req.query && req.query.id) || (req.body && req.body.id);

  if (req.method === 'GET') {
    if (!isUuid(id)) {
      res.status(400).json({ error: '招待リンクが正しくありません（idが指定されていないか、形式が不正です）。' });
      return;
    }
    try {
      const invite = await fetchInvite(serviceKey, id);
      if (!invite) {
        res.status(404).json({ error: 'この招待リンクは見つかりませんでした。リンクが正しいかご確認ください。' });
        return;
      }
      res.status(200).json({ result: toInfoShape(invite) });
    } catch (err) {
      res.status(500).json({ error: err && err.message ? err.message : String(err) });
    }
    return;
  }

  if (req.method === 'POST') {
    if (!isUuid(id)) {
      res.status(400).json({ error: '招待リンクが正しくありません（idが指定されていないか、形式が不正です）。' });
      return;
    }

    const authHeader = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
    const m = /^Bearer\s+(.+)$/i.exec(authHeader);
    const accessToken = m && m[1];
    if (!accessToken) {
      res.status(401).json({ error: 'ログインが必要です。ログイン後にもう一度お試しください。' });
      return;
    }

    try {
      // 本人確認：クライアントが送ってきたuser_idを信用せず、アクセストークン自体を
      // Supabase Auth APIに問い合わせて検証する（トークンが本物かつ有効な場合のみ、
      // 対応するユーザーIDが返る）。
      const authRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
        headers: { apikey: serviceKey, Authorization: 'Bearer ' + accessToken },
      });
      if (!authRes.ok) {
        res.status(401).json({ error: 'ログイン情報の確認に失敗しました。お手数ですが、もう一度ログインし直してからリンクを開いてください。' });
        return;
      }
      const authUser = await authRes.json();
      const userId = authUser && authUser.id;
      if (!userId) {
        res.status(401).json({ error: 'ログイン情報の確認に失敗しました。お手数ですが、もう一度ログインし直してからリンクを開いてください。' });
        return;
      }

      const invite = await fetchInvite(serviceKey, id);
      if (!invite) {
        res.status(404).json({ error: 'この招待リンクは見つかりませんでした。リンクが正しいかご確認ください。' });
        return;
      }
      const reason = checkValidity(invite);
      if (reason) {
        res.status(400).json({ error: reason });
        return;
      }

      const propertyName = (invite.properties && invite.properties.name) || null;

      // 既にそのユーザーがメンバーかどうか確認（重複参加・二重タップ対策）
      const memberCheckUrl = SUPABASE_URL + '/rest/v1/property_members?property_id=eq.' +
        encodeURIComponent(invite.property_id) + '&user_id=eq.' + encodeURIComponent(userId) + '&select=role';
      const memberCheckRes = await fetch(memberCheckUrl, {
        headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey },
      });
      if (!memberCheckRes.ok) throw new Error('Supabaseへの問い合わせに失敗しました（HTTP ' + memberCheckRes.status + '）');
      const existingRows = await memberCheckRes.json();

      if (existingRows.length > 0) {
        res.status(200).json({
          result: {
            propertyId: invite.property_id,
            propertyName: propertyName,
            role: existingRows[0].role,
            roleLabel: ROLE_LABEL[existingRows[0].role] || existingRows[0].role,
            alreadyMember: true,
          },
        });
        return;
      }

      const insertRes = await fetch(SUPABASE_URL + '/rest/v1/property_members', {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: 'Bearer ' + serviceKey,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ property_id: invite.property_id, user_id: userId, role: invite.role }),
      });
      if (!insertRes.ok) throw new Error('参加処理に失敗しました（HTTP ' + insertRes.status + '）');

      // 利用回数を1件加算する（読み取り→加算のため、ごく僅かな競合の可能性はあるが、
      // これはあくまで目安のカウンタであり、実際のセキュリティ境界は招待IDの推測不可能性・
      // 失効フラグ・有効期限で担保しているため許容している）。
      await fetch(SUPABASE_URL + '/rest/v1/property_invites?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: {
          apikey: serviceKey,
          Authorization: 'Bearer ' + serviceKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ use_count: invite.use_count + 1 }),
      }).catch(() => {}); // カウンタ更新の失敗は参加自体の成否には影響させない

      res.status(200).json({
        result: {
          propertyId: invite.property_id,
          propertyName: propertyName,
          role: invite.role,
          roleLabel: ROLE_LABEL[invite.role] || invite.role,
          alreadyMember: false,
        },
      });
    } catch (err) {
      res.status(500).json({ error: err && err.message ? err.message : String(err) });
    }
    return;
  }

  res.status(405).json({ error: 'このエンドポイントはGETとPOSTのみ対応しています。' });
}
