/* ============================================================================
   FireFlow Live Board × Supabase 統合レイヤー
   ----------------------------------------------------------------------------
   このファイルを Live Board の <head> 内、他のスクリプトより「前」に読み込むこと。
   使い方: Live Board の本体コードは今まで通り window.storage.get/set/list/delete
   を呼ぶだけでよい。ここで window.storage を Supabase 版に差し替える。

   事前準備（あなたが行うこと）:
     1. supabase/schema.sql を Supabase の SQL Editor で実行する
     2. 下の SUPABASE_URL / SUPABASE_ANON_KEY を、あなたのプロジェクトの値に置き換える
        （Supabaseダッシュボード → Project Settings → API で確認できます）
     3. Supabaseダッシュボード → Authentication → Providers で
        Email（パスワードでのログイン）を有効にする
     4. 物件（properties）を1件作成し、その物件IDを PROPERTY_ID に設定する
        （SQL Editorで: insert into properties (name) values ('物件名') returning id;）
============================================================================ */

const SUPABASE_URL = 'https://trtivspdgekofiglfyls.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hMU5PaVb113q-5iPkuPyxA_Gvbm1zPm';
const PROPERTY_ID = 'b6e18eed-f2f3-4674-812d-322732908616'; // コスモ六甲ガーデンフォート

(function () {
  'use strict';

  // supabase-js を読み込む（CDN経由）
  var script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
  // 【修正】以前は script.onload = initSupabaseIntegration; で直接呼んでいましたが、
  // このファイルは <head> 内（documentのbodyがまだ存在しないタイミング）で
  // 読み込まれる想定のため、CDNの読み込みが速いと document.body がまだ null の状態で
  // ログイン画面の document.body.appendChild(gate) が呼ばれてエラーになることがあります
  // （実機テストで発生を確認済み）。document.body ができてから実行するように変更しています。
  script.onload = function () { runWhenBodyReady(initSupabaseIntegration); };
  document.head.appendChild(script);

  function runWhenBodyReady(fn) {
    if (document.body) {
      fn();
    } else {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    }
  }

  var sb = null;
  var currentUser = null;
  var currentInspectionId = null; // その日の inspections.id（ログイン後に取得/作成）

  function initSupabaseIntegration() {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.__sb = sb; // デバッグ用に window からも見えるようにしておく

    showLoginGateIfNeeded();
  }

  /* ---------------------------------------------------------------------
     1. ログイン画面
     --------------------------------------------------------------------- */
  function buildLoginGateHTML() {
    var div = document.createElement('div');
    div.id = 'sbLoginGate';
    div.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#f4f5f7;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif;';
    div.innerHTML =
      '<div style="width:min(340px,88vw);background:#fff;border-radius:14px;padding:28px 24px;box-shadow:0 10px 40px rgba(0,0,0,0.12);">' +
      '  <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;">' +
      '    <div style="width:32px;height:32px;border-radius:8px;background:#3b6ef6;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;">LB</div>' +
      '    <div style="font-weight:800;font-size:19px;">Live Board</div>' +
      '  </div>' +
      '  <div id="sbLoginError" style="display:none;color:#d64545;font-size:13px;margin-bottom:10px;"></div>' +
      '  <label style="display:block;font-size:13px;color:#555;margin-bottom:4px;">メールアドレス</label>' +
      '  <input id="sbEmail" type="email" autocomplete="username" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:15px;margin-bottom:12px;">' +
      '  <label style="display:block;font-size:13px;color:#555;margin-bottom:4px;">パスワード</label>' +
      '  <input id="sbPassword" type="password" autocomplete="current-password" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:15px;margin-bottom:18px;">' +
      '  <button id="sbLoginBtn" style="width:100%;padding:12px;border:none;border-radius:8px;background:#3b6ef6;color:#fff;font-weight:700;font-size:15px;">ログイン</button>' +
      '  <div style="text-align:center;margin-top:14px;">' +
      '    <button id="sbSignupToggle" style="background:none;border:none;color:#3b6ef6;font-size:13px;">アカウントをお持ちでない方はこちら</button>' +
      '  </div>' +
      '</div>';
    return div;
  }

  async function showLoginGateIfNeeded() {
    var { data: { session } } = await sb.auth.getSession();
    if (session && session.user) {
      currentUser = session.user;
      await afterLogin();
      return;
    }
    var gate = buildLoginGateHTML();
    document.body.appendChild(gate);

    var isSignup = false;
    document.getElementById('sbSignupToggle').addEventListener('click', function () {
      isSignup = !isSignup;
      document.getElementById('sbLoginBtn').textContent = isSignup ? '新規登録' : 'ログイン';
      this.textContent = isSignup ? 'すでにアカウントをお持ちの方はこちら' : 'アカウントをお持ちでない方はこちら';
    });

    document.getElementById('sbLoginBtn').addEventListener('click', async function () {
      var email = document.getElementById('sbEmail').value.trim();
      var password = document.getElementById('sbPassword').value;
      var errEl = document.getElementById('sbLoginError');
      errEl.style.display = 'none';
      if (!email || !password) {
        errEl.textContent = 'メールアドレスとパスワードを入力してください。';
        errEl.style.display = 'block';
        return;
      }
      try {
        var result = isSignup
          ? await sb.auth.signUp({ email: email, password: password })
          : await sb.auth.signInWithPassword({ email: email, password: password });
        if (result.error) throw result.error;
        if (isSignup && !result.data.session) {
          // 【修正】Supabaseは「メール確認あり」設定の場合、既に登録済み・確認済みの
          // メールアドレスで signUp() を呼んでも、なりすまし防止のためエラーを返さず、
          // session:null の「見かけ上は成功」という応答を返す（新規登録の確認メール待ちと
          // 区別がつかない）。この場合は実際には確認メールが送られておらず、ユーザーは
          // 届かないメールを待ち続けて先に進めなくなる（2台目ブラウザで、1台目と同じ
          // メールアドレスのまま誤って「新規登録」を押した場合などに発生）。
          // 公式に推奨されている見分け方: result.data.user.identities が空配列なら
          // 「登録済みメールアドレスへの新規登録試行」、1件以上あれば「本当に新規登録」。
          var identities = (result.data.user && result.data.user.identities) || [];
          if (identities.length === 0) {
            errEl.style.color = '#d64545';
            errEl.textContent = 'このメールアドレスは既に登録されています。下の「ログイン」ボタンからログインしてください。';
            errEl.style.display = 'block';
            // ユーザーがそのまま迷わずログインできるよう、自動的にログインモードへ切り替える
            isSignup = false;
            document.getElementById('sbLoginBtn').textContent = 'ログイン';
            document.getElementById('sbSignupToggle').textContent = 'アカウントをお持ちでない方はこちら';
            return;
          }
          errEl.style.color = '#2a8a4a';
          errEl.textContent = '確認メールを送信しました。メール内のリンクを開いてから、ログインしてください。';
          errEl.style.display = 'block';
          return;
        }
        currentUser = result.data.user;
        gate.remove();
        await afterLogin();
      } catch (err) {
        errEl.style.color = '#d64545';
        errEl.textContent = 'ログインに失敗しました：' + (err.message || err);
        errEl.style.display = 'block';
      }
    });
  }

  async function afterLogin() {
    // 【2026-07-17変更・重要】以前はここで「物件に自分をmemberとして追加する」処理と
    // 「今日のinspectionsレコードを取得/作成する」処理という2つのネットワーク呼び出しを
    // 待ってから installStorageShim() を呼んでいた。これだとオフライン時(通信不可)には
    // window.storageがいつまでも定義されず、LB本体側のオフライン用ローカルキュー機構
    // （storageSet/storageGet、IndexedDBキャッシュ）が全く働かないという致命的な問題が
    // あった。kv_store（部屋の点検結果など、アプリの中核データ）は物件ID・ユーザーIDだけで
    // 動作しinspectionセッションを必要としないため、window.storageの利用開始はここで
    // 即座に行い、inspectionセッションの用意はバックグラウンドで別途リトライさせる。
    //
    // なお「物件に自分をmemberとして追加する」処理（property_members.upsert）は、
    // 2026-07-17の招待制御の追加により、クライアントから直接insertする経路自体を廃止した
    // （物件作成者は自動でadminになり、それ以外は招待リンク経由でのみ参加できる）ため、
    // この呼び出しは常にRLSで拒否されるだけの無駄な通信になっていた。削除した。
    installStorageShim();
    if (typeof window.onSupabaseReady === 'function') window.onSupabaseReady();
    document.dispatchEvent(new CustomEvent('supabase-ready'));

    ensureInspectionSession(); // fire-and-forget。内部でオフライン時は自動リトライする。
  }

  var inspectionSessionRetryTimer = null;
  async function ensureInspectionSession() {
    if (currentInspectionId) return; // 既に用意済み
    try {
      var today = new Date();
      var dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
      var { data: existing, error: selError } = await sb.from('inspections').select('id').eq('property_id', PROPERTY_ID).eq('inspection_date', dateStr).maybeSingle();
      if (selError) throw selError;
      if (existing) {
        currentInspectionId = existing.id;
      } else {
        var { data: created, error } = await sb.from('inspections').insert({ property_id: PROPERTY_ID, inspection_date: dateStr }).select('id').single();
        if (error) throw error;
        currentInspectionId = created.id;
      }
      installRealtimeSync(); // currentInspectionIdに依存するため、確定してから購読する
      document.dispatchEvent(new CustomEvent('inspection-session-ready'));
      if (inspectionSessionRetryTimer) { clearInterval(inspectionSessionRetryTimer); inspectionSessionRetryTimer = null; }
    } catch (err) {
      // オフライン等で失敗した場合、オンライン復帰時・一定間隔ごとに自動的に再試行する。
      // （この間、点検開始連絡やroom_resultsの直接保存など、inspectionセッションに依存する
      // 一部の機能は一時的に使えないが、LB本体の中核である部屋の点検結果の記録・保存
      // （kv_store経由）には影響しない。）
      if (!inspectionSessionRetryTimer) {
        inspectionSessionRetryTimer = setInterval(ensureInspectionSession, 5000);
      }
    }
  }
  window.addEventListener('online', ensureInspectionSession);

  /* ---------------------------------------------------------------------
     2. window.storage 互換シム（kv_store テーブルを裏で使う）
     --------------------------------------------------------------------- */
  function installStorageShim() {
    window.storage = {
      async get(key, shared) {
        var q = sb.from('kv_store').select('value').eq('property_id', PROPERTY_ID).eq('key', key).eq('shared', !!shared);
        q = shared ? q.is('owner_id', null) : q.eq('owner_id', currentUser.id);
        var { data, error } = await q.maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('key not found: ' + key);
        return { key: key, value: data.value, shared: !!shared };
      },
      async set(key, value, shared) {
        // 【修正】以前はupsert({onConflict:'...,owner_id'})を使っていましたが、
        // shared=trueの行はowner_idが常にNULLで、PostgreSQLはNULL同士を「一致」と
        // みなさないため、ON CONFLICTが一度も発火せず、保存するたびに行が増え続ける
        // バグがありました（2回目の保存以降、get()が「行が複数ヒットする」エラーで
        // 壊れます）。ここでは先にselectして、あれば更新・なければ新規作成する
        // 手動upsertに変更しています。
        var q = sb.from('kv_store').select('id').eq('property_id', PROPERTY_ID).eq('key', key).eq('shared', !!shared);
        q = shared ? q.is('owner_id', null) : q.eq('owner_id', currentUser.id);
        var { data: existing, error: selError } = await q.maybeSingle();
        if (selError) return null;

        if (existing) {
          var { error: updError } = await sb.from('kv_store')
            .update({ value: String(value), updated_at: new Date().toISOString() })
            .eq('id', existing.id);
          if (updError) return null;
        } else {
          var row = {
            property_id: PROPERTY_ID, key: key, value: String(value), shared: !!shared,
            owner_id: shared ? null : currentUser.id, updated_at: new Date().toISOString(),
          };
          var { error: insError } = await sb.from('kv_store').insert(row);
          if (insError) return null;
        }
        return { key: key, value: value, shared: !!shared };
      },
      async delete(key, shared) {
        var q = sb.from('kv_store').delete().eq('property_id', PROPERTY_ID).eq('key', key).eq('shared', !!shared);
        q = shared ? q.is('owner_id', null) : q.eq('owner_id', currentUser.id);
        var { error } = await q;
        if (error) return null;
        return { key: key, deleted: true, shared: !!shared };
      },
      async list(prefix, shared) {
        var q = sb.from('kv_store').select('key').eq('property_id', PROPERTY_ID).eq('shared', !!shared);
        if (prefix) q = q.like('key', prefix + '%');
        q = shared ? q.is('owner_id', null) : q.eq('owner_id', currentUser.id);
        var { data, error } = await q;
        if (error) return null;
        return { keys: (data || []).map(function (r) { return r.key; }), prefix: prefix, shared: !!shared };
      },
    };
  }

  /* ---------------------------------------------------------------------
     3. リアルタイム同期：他の点検員の更新を即座に画面へ反映
     --------------------------------------------------------------------- */
  function installRealtimeSync() {
    var channel = sb.channel('inspection-' + currentInspectionId);

    ['room_results', 'equipment_state', 'extinguisher_state', 'stamp_data'].forEach(function (table) {
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table: table, filter: 'inspection_id=eq.' + currentInspectionId },
        function (payload) {
          document.dispatchEvent(new CustomEvent('sb-realtime-update', { detail: { table: table, payload: payload } }));
          // Live Board本体側で、この画面に応じて再描画する（例: renderFloors(), renderPropertyInfo() など）
          if (typeof window.onRealtimeUpdate === 'function') window.onRealtimeUpdate(table, payload);
        }
      );
    });

    channel.on('postgres_changes',
      { event: '*', schema: 'public', table: 'kv_store', filter: 'property_id=eq.' + PROPERTY_ID },
      function (payload) {
        document.dispatchEvent(new CustomEvent('sb-realtime-update', { detail: { table: 'kv_store', payload: payload } }));
        if (typeof window.onRealtimeUpdate === 'function') window.onRealtimeUpdate('kv_store', payload);
      }
    );

    channel.subscribe();
    window.__sbChannel = channel;
  }

  /* ---------------------------------------------------------------------
     4. 写真アップロード（Supabase Storage）
     --------------------------------------------------------------------- */
  // dataUrl（base64画像）を受け取り、Storageにアップロードして公開URLの代わりに
  // 署名付きURL（1年間有効）を返す。photosテーブルへのメタデータ登録も行う。
  window.uploadInspectionPhoto = async function (dataUrl, meta) {
    // meta: { room, tag, memo, equipmentName, extinguisherNo }
    var blob = await (await fetch(dataUrl)).blob();
    var ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    var path = PROPERTY_ID + '/' + (meta.room || 'common') + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;

    var { error: uploadError } = await sb.storage.from('inspection-photos').upload(path, blob, { contentType: blob.type });
    if (uploadError) throw uploadError;

    var { data: signed, error: signError } = await sb.storage.from('inspection-photos').createSignedUrl(path, 60 * 60 * 24 * 365);
    if (signError) throw signError;

    await sb.from('photos').insert({
      inspection_id: currentInspectionId,
      storage_path: path,
      tag: meta.tag || null,
      memo: meta.memo || null,
      equipment_name: meta.equipmentName || null,
      extinguisher_no: meta.extinguisherNo || null,
      taken_by: currentUser.id,
    });

    return signed.signedUrl;
  };

  /* ---------------------------------------------------------------------
     5. 部屋の点検結果を room_results テーブルへ直接保存するヘルパー
        （Live Board本体の saveRoomState 相当の処理から呼び出す）
     --------------------------------------------------------------------- */
  window.saveRoomResultToSupabase = async function (room, entry) {
    var row = {
      inspection_id: currentInspectionId,
      room: room,
      status: entry.cancelled ? 'pending' : (entry.status || 'pending'),
      cancelled: !!entry.cancelled,
      signature: entry.signature || null,
      inspector: entry.inspector || null,
      inspected_at: entry.time ? new Date(entry.time).toISOString() : null,
      visit_times: entry.visitTimes || [],
      updated_by: currentUser.id,
      updated_at: new Date().toISOString(),
    };
    var { error } = await sb.from('room_results').upsert(row, { onConflict: 'inspection_id,room' });
    if (error) console.error('room_results保存失敗', error);
  };

  window.getCurrentInspectionId = function () { return currentInspectionId; };
  window.getCurrentSupabaseUser = function () { return currentUser; };

  // 2026-07-17追加：api/scan-time-request.js（点検希望時間連絡票のAIスキャン）が
  // 未認証で誰でも叩けてしまう問題を修正するにあたり、ログイン中ユーザーのアクセス
  // トークンをLB本体(index.html)側から取得できるようにする。サーバー側(api/scan-time-request.js)
  // はこのトークンをSupabase Authに問い合わせて検証し、ログイン済みユーザーからのリクエストだけを
  // 受け付ける。
  window.getAccessToken = async function () {
    if (!sb) return null;
    try {
      var result = await sb.auth.getSession();
      var session = result && result.data && result.data.session;
      return (session && session.access_token) || null;
    } catch (err) {
      return null;
    }
  };

  /* ---------------------------------------------------------------------
     6. (2026-07-17廃止) 点検開始前の確認連絡（管理会社・セキュリティ会社）機能
        LB本体側のUIごと削除した。confirm.html / api/confirm-start.js / schema.sql の
        start_confirmations テーブル定義も合わせて削除済み。
     --------------------------------------------------------------------- */

  /* ---------------------------------------------------------------------
     7. 物件への招待リンク（2026-07-17 追加）
        以前は「ログインさえしていれば誰でも自分をどの物件にも追加できる」設計だったが、
        商品化（複数の顧客企業への展開）を考えると、他社の物件に勝手に参加できてしまう
        重大なリスクだったため廃止した（詳細は schema.sql のコメント参照）。
        今後の新規参加は、管理者(admin)がここで発行した招待リンク(join.html?invite=...)
        経由でのみ可能。招待の発行・一覧・失効はRLSで管理者のみに許可されているため
        直接 supabase-js から呼べるが、実際の参加処理（property_membersへのinsert）は
        本人確認が必要なため、必ず /api/accept-invite （Service Role Key）を経由する
        （join.html がそれを行う）。
     --------------------------------------------------------------------- */
  window.getMyPropertyRole = async function () {
    if (!currentUser) return null;
    var { data, error } = await sb.from('property_members')
      .select('role').eq('property_id', PROPERTY_ID).eq('user_id', currentUser.id).maybeSingle();
    if (error || !data) return null;
    return data.role;
  };

  window.createPropertyInvite = async function (role, expiresInDays, maxUses) {
    if (!currentUser) throw new Error('ログインしていません。');
    var payload = {
      property_id: PROPERTY_ID,
      role: role || 'inspector',
      created_by: currentUser.id,
      expires_at: expiresInDays ? new Date(Date.now() + expiresInDays * 86400000).toISOString() : null,
      max_uses: maxUses || null,
    };
    var { data, error } = await sb.from('property_invites').insert(payload).select('id').single();
    if (error) throw error; // RLSで管理者(admin)以外は失敗する(is_property_admin()による保護)
    return { id: data.id, url: location.origin + '/join.html?invite=' + data.id };
  };

  window.listPropertyInvites = async function () {
    var { data, error } = await sb.from('property_invites')
      .select('id, role, created_at, expires_at, revoked_at, max_uses, use_count')
      .eq('property_id', PROPERTY_ID)
      .order('created_at', { ascending: false });
    if (error) return []; // 管理者でなければRLSにより空(=見えない)が正しい挙動
    return (data || []).map(function (row) {
      return Object.assign({}, row, { url: location.origin + '/join.html?invite=' + row.id });
    });
  };

  window.revokePropertyInvite = async function (inviteId) {
    var { error } = await sb.from('property_invites').update({ revoked_at: new Date().toISOString() }).eq('id', inviteId);
    if (error) throw error;
  };
})();
