// ===== 新着メッセージの通知（全ページ共通。ui.js から読み込む） =====
// 1. サイトを開いている間：画面上の通知、タブ名の未読数、メニューの未読バッジ、通知音（設定でオンにした場合）
// 2. サイトを閉じていても：プッシュ通知（端末ごとにオンにする。送信は GAS が Firebase Cloud Messaging で行う）
(function () {
    "use strict";
    if (window.HeikoNotify) return;

    const GAS_URL = "https://script.google.com/macros/s/AKfycbyQgkizdGw9MiZjxtlxAHpfMXw5ehLfj9HkzDcR9YLRo1Cm11kfEp4cWYqnNBdDR96w/exec";
    const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/10.14.1/";
    const FIREBASE_CHAT_SRC = "firebase-chat.js?v=20261127u";
    const POLL_MS = 30000;
    const MIN_REFRESH_MS = 8000;
    const PUSH_KEY = "heiko-push";               // この端末で登録した通知先 {userId, token, at}
    const PUSH_WANTED = "heiko-push-wanted:";    // この端末で通知をオンにしたユーザー（再ログインしたら登録し直す）
    const SOUND_KEY = "heiko-notify-sound";

    const page = (document.body && document.body.dataset.page) || "";
    const userId = localStorage.getItem("userId") || localStorage.getItem("userEmail") || "";
    const loggedIn = Boolean(userId && localStorage.getItem("sessionToken"));

    const readJson = key => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (error) { return null; } };
    const write = (key, value) => { try { localStorage.setItem(key, value); } catch (error) { /* 保存できなくても通知は続ける */ } };
    const sameSession = () => (localStorage.getItem("userId") || localStorage.getItem("userEmail") || "") === userId && Boolean(localStorage.getItem("sessionToken"));

    async function postGas(payload, timeoutMs = 15000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(GAS_URL, {
                method: "POST",
                body: JSON.stringify({ ...payload, sessionToken: localStorage.getItem("sessionToken") || "" }),
                signal: controller.signal
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } finally {
            clearTimeout(timer);
        }
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            let script = Array.from(document.scripts).find(item => (item.getAttribute("src") || "") === src);
            if (script && script.dataset.loaded) return resolve();
            if (!script) {
                script = document.createElement("script");
                script.src = src;
                script.async = false;
                document.head.appendChild(script);
            }
            script.addEventListener("load", () => { script.dataset.loaded = "1"; resolve(); });
            script.addEventListener("error", () => { script.remove(); reject(new Error(`読み込めませんでした: ${src}`)); });
        });
    }

    // チャットとメッセージのページは自分で Firebase を読み込むので、ないものだけを読み込む
    let firebaseLoading = null;
    function loadFirebase() {
        if (firebaseLoading) return firebaseLoading;
        firebaseLoading = (async () => {
            if (!window.firebase) await loadScript(FIREBASE_SDK + "firebase-app-compat.js");
            if (!window.firebase.auth) await loadScript(FIREBASE_SDK + "firebase-auth-compat.js");
            if (!window.firebase.database) await loadScript(FIREBASE_SDK + "firebase-database-compat.js");
            if (!window.HeikoFirebaseChat) {
                window.HEIKO_FIREBASE_CHAT_ENABLED = true;
                await loadScript(FIREBASE_CHAT_SRC);
            }
        })();
        firebaseLoading.catch(() => { firebaseLoading = null; });
        return firebaseLoading;
    }

    // ---------- サイトを開いている間の通知 ----------
    const MARK_KEY = "heiko-notify-mark:" + userId; // どこまで知らせたか（ページを移っても同じ通知を出さない）
    let gasUnread = 0;
    let inbox = null;      // null = まだ受け取っていない
    let hidden = {};
    let blocked = new Set();
    let refreshing = null;
    let lastRefreshAt = 0;
    let pendingToast = null;
    const names = new Map();
    const baseTitle = () => document.title.replace(/^\(\d+\+?\) /, "");

    function unreadFirebaseMessages() {
        if (!inbox) return [];
        return inbox.filter(message => {
            if (message.to !== userId || message.isRead || message.isUnsent || blocked.has(message.from)) return false;
            const hiddenAt = Number(hidden[window.HeikoFirebaseChat.getFirebaseUid(message.from)] || 0);
            return !hiddenAt || !message.sentAt || message.sentAt > hiddenAt;
        });
    }

    let shownCount = -1;
    function renderCount() {
        const count = gasUnread + unreadFirebaseMessages().length;
        const label = count > 99 ? "99+" : String(count);
        const badge = document.getElementById("unread-badge");
        if (badge) {
            badge.textContent = label;
            badge.style.display = count > 0 ? "inline-grid" : "none";
            const link = badge.closest(".nav-item");
            if (link) link.classList.toggle("has-unread", count > 0);
            if (shownCount >= 0 && count > shownCount) {
                badge.classList.remove("heiko-bump");
                void badge.offsetWidth;
                badge.classList.add("heiko-bump");
            }
        }
        shownCount = count;
        const title = (count > 0 ? `(${label}) ` : "") + baseTitle();
        if (document.title !== title) document.title = title;
        if (navigator.setAppBadge) (count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(() => {});
    }

    // 前に知らせた時刻より新しい受信があれば true。初めて確認するときは記録だけする
    function advanceMark(source, newestAt) {
        const marks = readJson(MARK_KEY) || {};
        const previous = marks[source];
        const next = Math.max(Number(previous || 0), Number(newestAt || 0), 1);
        if (next !== previous) { marks[source] = next; write(MARK_KEY, JSON.stringify(marks)); }
        return previous !== undefined ? Number(previous) : null;
    }

    async function displayName(id) {
        if (names.has(id)) return names.get(id);
        try {
            const result = await postGas({ mode: "getUserProfiles", userId, targetUserIds: [id] }, 8000);
            const profile = result.status === "success" && Array.isArray(result.message) ? result.message[0] : null;
            if (profile && profile.name) { names.set(id, profile.name); return profile.name; }
        } catch (error) { /* 名前が取れないときは仮の名前で知らせる */ }
        return "ほかのユーザー";
    }

    async function announce(from, name, text) {
        if (!from || blocked.has(from) || !sameSession()) return;
        // いま開いているチャット相手のメッセージは、画面に出ているので知らせない
        if (page === "chat" && from === localStorage.getItem("chatTarget") && document.visibilityState === "visible") return;
        const sender = name || await displayName(from);
        playSound();
        present({
            title: `${sender} さんからメッセージ`,
            text: String(text || "画像が送信されました"),
            open() {
                localStorage.setItem("chatTarget", from);
                if (sender !== "ほかのユーザー") localStorage.setItem("chatTargetName", sender);
                else localStorage.removeItem("chatTargetName");
                location.href = "chat.html";
            }
        });
    }

    function present(info) {
        if (document.visibilityState === "visible") showToast(info);
        else pendingToast = info; // 画面に戻ったときに出す
    }

    // ---------- クイックリアクション（チャットとは別。サイト内の表示だけで知らせる） ----------
    let reactionUnread = 0;
    function renderReactionBadge() {
        const link = document.querySelector('.navbar [data-nav-key="home"]');
        if (!link) return;
        let badge = link.querySelector(".heiko-reaction-badge");
        if (!badge) {
            if (!reactionUnread) return;
            badge = document.createElement("span");
            badge.className = "unread-badge heiko-reaction-badge";
            link.appendChild(badge);
        }
        badge.textContent = reactionUnread > 99 ? "99+" : String(reactionUnread);
        badge.style.display = reactionUnread > 0 ? "inline-grid" : "none";
        badge.setAttribute("aria-label", `新しいリアクション ${reactionUnread}件`);
        link.classList.toggle("has-unread", reactionUnread > 0);
    }

    function setReactionCount(count) {
        reactionUnread = Math.max(0, Number(count) || 0);
        renderReactionBadge();
    }

    // summary がないときは GAS が古いので、何もしない
    function handleReactions(summary) {
        if (!summary) return;
        setReactionCount(summary.unread);
        window.dispatchEvent(new CustomEvent("heiko-reactions", { detail: summary }));
        const latest = summary.latest;
        const previous = advanceMark("reaction", latest && latest.time);
        if (!latest || previous === null || latest.time <= previous) return;
        present({
            title: `${latest.fromName} さんがリアクション`,
            text: `あなたの募集に「${latest.reaction}」`,
            open() {
                if (page === "main") window.dispatchEvent(new CustomEvent("heiko-show-reactions"));
                else location.href = "main.html#reactions";
            }
        });
    }

    let toast = null;
    let toastTimer = null;
    function hideToast() {
        clearTimeout(toastTimer);
        if (!toast) return;
        const leaving = toast;
        toast = null;
        leaving.classList.remove("is-in");
        setTimeout(() => leaving.remove(), 250);
    }

    // info: { title, text, open }（open は押したときの動き）
    function showToast(info) {
        hideToast();
        const box = document.createElement("div");
        box.className = "heiko-msg-toast";
        box.setAttribute("role", "status");
        const open = document.createElement("button");
        open.type = "button";
        open.className = "heiko-msg-toast-open";
        open.setAttribute("data-no-busy", "");
        const title = document.createElement("strong");
        title.textContent = info.title;
        const body = document.createElement("span");
        body.textContent = info.text;
        open.append(title, body);
        open.addEventListener("click", () => { hideToast(); info.open(); });
        const close = document.createElement("button");
        close.type = "button";
        close.className = "heiko-msg-toast-close";
        close.setAttribute("aria-label", "通知を閉じる");
        close.textContent = "×";
        close.addEventListener("click", hideToast);
        box.append(open, close);
        document.body.appendChild(box);
        toast = box;
        requestAnimationFrame(() => box.classList.add("is-in"));
        toastTimer = setTimeout(hideToast, 7000);
    }

    // 通知音：音声ファイルを使わず、短い2音を鳴らす。ブラウザの制限で、画面を一度も触っていないと鳴らない
    let audio = null;
    function unlockSound() {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        if (!audio) audio = new AudioContextClass();
        if (audio.state === "suspended") audio.resume().catch(() => {});
    }
    function playSound() {
        if (localStorage.getItem(SOUND_KEY) !== "1") return;
        if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate(120);
        if (!audio || audio.state !== "running") return;
        [[880, 0], [1175, 0.13]].forEach(([frequency, delay]) => {
            const oscillator = audio.createOscillator();
            const gain = audio.createGain();
            const start = audio.currentTime + delay;
            oscillator.frequency.value = frequency;
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
            oscillator.connect(gain).connect(audio.destination);
            oscillator.start(start);
            oscillator.stop(start + 0.24);
        });
    }

    // GAS 側（画像つきや予備の送信）の未読を確認する
    function refresh() {
        if (!loggedIn || !sameSession()) return Promise.resolve();
        if (refreshing) return refreshing;
        if (Date.now() - lastRefreshAt < MIN_REFRESH_MS) { renderCount(); return Promise.resolve(); }
        lastRefreshAt = Date.now();
        refreshing = (async () => {
            try {
                if (inbox && window.HeikoFirebaseChat) hidden = await window.HeikoFirebaseChat.readHidden(userId).catch(() => hidden);
                const result = await postGas({ mode: "getNotificationSummary", email: userId }, 20000);
                if (result.status !== "success" || !result.message) return;
                gasUnread = Number(result.message.unreadCount) || 0;
                renderCount();
                handleReactions(result.message.reactions);
                const latest = result.message.latestIncoming;
                const previous = advanceMark("gas", latest && latest.time);
                if (latest && previous !== null && latest.time > previous && gasUnread > 0) await announce(latest.fromEmail, latest.fromName, latest.text);
            } catch (error) {
                console.warn("新着の確認に失敗しました", error);
            } finally {
                refreshing = null;
            }
        })();
        return refreshing;
    }

    // Firebase の受信箱は、届いた瞬間に知らせてくれる
    let unsubscribeInbox = null;
    async function watchInbox() {
        if (unsubscribeInbox) return;
        try {
            await loadFirebase();
            const chat = window.HeikoFirebaseChat;
            if (!chat || !chat.enabled) return;
            if (!await chat.isSignedInAs(userId)) {
                const result = await postGas({ mode: "firebaseCustomToken", userId }, 10000);
                const token = result && result.message && result.message.token;
                if (!token || !await chat.signIn(token, userId)) return;
            }
            hidden = await chat.readHidden(userId).catch(() => ({}));
            if (!sameSession() || unsubscribeInbox) return;
            unsubscribeInbox = chat.subscribeInbox(userId, messages => {
                inbox = messages;
                renderCount();
                const incoming = messages.filter(message => message.to === userId && !message.isUnsent);
                const newest = incoming.reduce((max, message) => Math.max(max, message.sentAt || 0), 0);
                const previous = advanceMark("firebase", newest);
                if (previous === null) return;
                const fresh = unreadFirebaseMessages().filter(message => message.sentAt > previous).sort((a, b) => b.sentAt - a.sentAt);
                if (fresh.length) announce(fresh[0].from, "", fresh[0].text);
            }, error => console.warn("新着の受信を続けられません", error));
        } catch (error) {
            console.warn("すぐに知らせる機能を開始できませんでした（定期確認は続けます）", error);
        }
    }

    // ブロックした相手のメッセージは知らせない
    async function loadBlocked() {
        try {
            const result = await postGas({ mode: "getBlockedUsers", blockerId: userId }, 10000);
            if (result.status === "success" && Array.isArray(result.message)) blocked = new Set(result.message.map(item => String(item.userId)));
        } catch (error) {
            console.warn("ブロック一覧を取得できませんでした", error);
        }
    }

    // ---------- プッシュ通知 ----------
    const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isStandalone = () => window.navigator.standalone === true || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
    const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    let vapidKeyRequest = null;

    function getVapidKey() {
        if (!vapidKeyRequest) {
            vapidKeyRequest = postGas({ mode: "getPushConfig", userId })
                .then(result => (result.status === "success" && result.message && result.message.vapidKey) || "")
                .catch(() => { vapidKeyRequest = null; return ""; });
        }
        return vapidKeyRequest;
    }

    async function getMessaging() {
        await loadFirebase();
        if (!window.firebase.messaging) await loadScript(FIREBASE_SDK + "firebase-messaging-compat.js");
        const app = window.HeikoFirebaseChat.getApp();
        if (!app) throw new Error("通知の準備ができませんでした");
        return app.messaging();
    }

    async function registerThisDevice() {
        const vapidKey = await getVapidKey();
        if (!vapidKey) throw new Error("プッシュ通知は準備中です");
        const messaging = await getMessaging();
        await navigator.serviceWorker.register("sw.js");
        const registration = await navigator.serviceWorker.ready;
        const token = await messaging.getToken({ vapidKey, serviceWorkerRegistration: registration });
        if (!token) throw new Error("この端末の通知先を取得できませんでした");
        if (!sameSession()) return;
        const result = await postGas({ mode: "registerWebPush", userId, fcmToken: token, platform: isIos ? "ios-web" : "web" });
        if (result.status !== "success") throw new Error(result.message || "通知を登録できませんでした");
        write(PUSH_KEY, JSON.stringify({ userId, token, at: Date.now() }));
    }

    // 許可の確認は、ボタンを押した直後に出す必要がある（iPhone は先に通信すると出ない）
    async function enablePush() {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("通知が許可されませんでした。ブラウザや端末の設定で、このサイトの通知を許可してください");
        await registerThisDevice();
        write(PUSH_WANTED + userId, "1");
    }

    async function disablePush() {
        const saved = readJson(PUSH_KEY);
        if (saved && saved.token) {
            const result = await postGas({ mode: "unregisterWebPush", userId, fcmToken: saved.token });
            if (result.status !== "success") throw new Error(result.message || "通知を解除できませんでした");
        }
        localStorage.removeItem(PUSH_WANTED + userId);
        localStorage.removeItem(PUSH_KEY);
        await dropSubscription();
    }

    async function dropSubscription() {
        if (!("serviceWorker" in navigator)) return;
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = registration && registration.pushManager && await registration.pushManager.getSubscription();
        if (subscription) await subscription.unsubscribe();
    }

    const isPushOn = () => {
        const saved = readJson(PUSH_KEY);
        return Boolean(saved && saved.userId === userId && pushSupported() && Notification.permission === "granted");
    };

    // 通知先は変わることがあるので、1日に1回登録し直す。再ログインしたときもここで登録し直す
    async function keepPushFresh() {
        if (!pushSupported() || Notification.permission !== "granted" || localStorage.getItem(PUSH_WANTED + userId) !== "1") return;
        const saved = readJson(PUSH_KEY);
        if (saved && saved.userId === userId && Date.now() - saved.at < 86400000) return;
        try { await registerThisDevice(); } catch (error) { console.warn("通知の再登録に失敗しました", error); }
    }

    function pushStatusText(key) {
        if (isIos && !isStandalone()) return "iPhone・iPadでは、Safariの共有ボタンから「ホーム画面に追加」し、追加したアイコンから開くとオンにできます（iOS 16.4以降）。";
        if (!pushSupported()) return "このブラウザはプッシュ通知に対応していません。ChromeやSafariで開いてください。";
        if (!key) return "プッシュ通知は準備中です。";
        if (Notification.permission === "denied") return "このサイトの通知がブロックされています。ブラウザや端末の設定で許可してください。";
        if (isPushOn()) return "この端末はオンです。サイトを閉じていても、新しいメッセージが届くと知らせます。";
        return "オンにすると、サイトを閉じていても新しいメッセージが届くと知らせます。端末ごとの設定です。";
    }

    // ---------- プッシュ通知の設定のしかた（実際の画面を指しながら説明する） ----------
    function pushGuideSteps(key) {
        const settings = () => document.getElementById("heiko-notify-settings");
        const shown = (id, fallback = settings) => () => {
            const element = document.getElementById(id);
            return element && !element.hidden ? element : fallback();
        };
        const intro = { title: "プッシュ通知の設定", body: "サイトを閉じていても、メッセージが届くとスマホやパソコンに知らせが出るようにします。設定は端末ごとに行います。" };
        if (!key) return [intro, { target: settings, title: "いまは準備中です", body: "プッシュ通知はまだ使えません。使えるようになると、この欄にオンにするボタンが出ます。" }];

        if (isIos && !isStandalone()) {
            const homeCard = () => document.getElementById("heiko-pwa-install-card") || settings();
            return [
                intro,
                { target: homeCard, title: "① Safariでこのサイトを開く", body: "iPhone・iPadでは、先にサイトをホーム画面に追加します（iOS 16.4以降）。\nLINEなどのアプリの中で開いているときは、Safariで開き直してください。" },
                { title: "② 共有ボタンを押す", body: "Safariの共有ボタン（四角から上向きの矢印が出ているマーク）を押します。見当たらないときは「…」の中にあります。" },
                { title: "③ ホーム画面に追加する", body: "出てきたメニューを下にたどって「ホーム画面に追加」を押し、右上の「追加」を押します。" },
                { title: "④ 追加したアイコンから開く", body: "ホーム画面にできた「平工マッチング」を開きます。ログインを求められたらログインして、マイページに進みます。" },
                { target: settings, title: "⑤ 通知をオンにする", body: "この「通知設定」で「プッシュ通知をオンにする」を押し、確認が出たら「許可」を選びます。\n続きの案内は、同じ欄の「設定のしかたを見る」から見られます。" }
            ];
        }
        if (!pushSupported()) {
            return [intro, { target: settings, title: "このブラウザでは使えません", body: "Chrome、Edge、Safariなどで開き直してください。LINEなどのアプリの中で開く画面では使えません。" }];
        }
        if (Notification.permission === "denied") {
            return [
                intro,
                { target: settings, title: "通知がブロックされています", body: "先に、ブロックを解除します。\n・パソコンやAndroid：アドレス欄の左のマークを押し、「通知」を「許可」にします。\n・iPhone・iPad：「設定」アプリ →「通知」→「平工マッチング」で許可します。" },
                { target: settings, title: "ページを読み込み直す", body: "解除できたらページを読み込み直します。「プッシュ通知をオンにする」ボタンが出たら、押してください。" }
            ];
        }
        const trouble = { title: "届かないときは", body: "・端末の設定で、使っているブラウザ（またはホーム画面の「平工マッチング」）の通知がオフになっていないか確認します。\n・おやすみモードや集中モードを切ります。\n・ログアウトすると通知は止まります。再ログイン後にサイトを開くと、通知先を登録し直します。" };
        const sound = { target: () => { const input = document.getElementById("heiko-sound-toggle"); return input ? input.closest("label") : settings(); }, title: "通知音（好みで）", body: "チェックを入れると、サイトを開いている間に新しいメッセージが届いたとき、音を鳴らします。" };
        if (isPushOn()) {
            return [
                intro,
                { target: shown("heiko-push-status"), title: "この端末はオンです", body: "設定は完了しています。確かめるときは、このサイトを閉じてから、ほかの人にメッセージを送ってもらってください。" },
                { target: shown("heiko-push-button"), title: "やめたいとき", body: "このボタンを押すと、この端末への通知を止められます。" },
                sound,
                trouble
            ];
        }
        return [
            intro,
            { target: shown("heiko-push-button"), title: "① ボタンを押す", body: "この案内を閉じたあと、「プッシュ通知をオンにする」を押します。" },
            { title: "②「許可」を選ぶ", body: "通知を送ってよいかの確認が出たら、「許可」を選びます。「ブロック」を選ぶと通知は届きません。" },
            { target: shown("heiko-push-status"), title: "③ オンになったか確認する", body: "ここの文が「この端末はオンです」に変われば、設定は完了です。" },
            sound,
            trouble
        ];
    }

    async function startPushGuide() {
        const key = await getVapidKey();
        if (typeof window.startHeikoTour !== "function") await loadScript("tour.js?v=20261127p");
        window.startHeikoTour({ steps: pushGuideSteps(key), lastLabel: "閉じる",
            // 縦長の画面は、対象を上に寄せて下に吹き出しの場所を空ける
            scrollBlock: window.matchMedia("(max-aspect-ratio:1/1)").matches ? "start" : "center" });
    }

    function installProfileSettings() {
        const anchor = document.querySelector(".appearance-settings");
        if (!anchor || document.getElementById("heiko-notify-settings")) return;
        const section = document.createElement("section");
        section.id = "heiko-notify-settings";
        section.className = "heiko-notify-settings";
        section.setAttribute("aria-labelledby", "heiko-notify-title");
        section.innerHTML = `
            <h3 id="heiko-notify-title">通知設定</h3>
            <p class="heiko-notify-status" id="heiko-push-status" aria-live="polite">確認しています…</p>
            <button type="button" class="heiko-notify-button" id="heiko-push-button" data-no-busy hidden></button>
            <label class="heiko-notify-sound"><input type="checkbox" id="heiko-sound-toggle"> サイトを開いている間、通知音を鳴らす</label>
            <button type="button" class="heiko-notify-guide-button" id="heiko-push-guide-button" data-no-busy>設定のしかたを見る</button>`;
        anchor.insertAdjacentElement("afterend", section);
        const status = section.querySelector("#heiko-push-status");
        const button = section.querySelector("#heiko-push-button");
        const sound = section.querySelector("#heiko-sound-toggle");
        sound.checked = localStorage.getItem(SOUND_KEY) === "1";
        sound.addEventListener("change", () => {
            write(SOUND_KEY, sound.checked ? "1" : "0");
            if (sound.checked) { unlockSound(); setTimeout(playSound, 100); }
        });
        let key = "";
        const render = () => {
            status.textContent = pushStatusText(key);
            const usable = key && pushSupported() && !(isIos && !isStandalone()) && Notification.permission !== "denied";
            button.hidden = !usable;
            button.textContent = isPushOn() ? "プッシュ通知をオフにする" : "プッシュ通知をオンにする";
        };
        button.addEventListener("click", async () => {
            button.disabled = true;
            const turningOff = isPushOn();
            button.textContent = turningOff ? "解除中…" : "設定中…";
            try {
                await (turningOff ? disablePush() : enablePush());
                render();
            } catch (error) {
                render();
                status.textContent = error.message || "通知の設定に失敗しました";
            } finally {
                button.disabled = false;
            }
        });
        section.querySelector("#heiko-push-guide-button").addEventListener("click", () => {
            startPushGuide().catch(error => { status.textContent = error.message || "案内を開けませんでした"; });
        });
        getVapidKey().then(value => {
            key = value;
            render();
            // ほかの画面の「設定のしかた」から来たときは、そのまま案内を始める
            if (new URLSearchParams(location.search).get("pushguide") === "1") {
                history.replaceState(null, "", location.pathname);
                setTimeout(() => startPushGuide().catch(error => console.warn("案内を開けませんでした", error)), 600);
            }
        });
    }

    // メッセージ一覧で、まだ設定していない人にだけ案内を出す
    async function installMessagesPrompt() {
        const card = document.querySelector(".dm-card");
        const dismissedKey = "heiko-push-prompt-closed:" + userId;
        // iPhone の Safari はホーム画面に追加するまでオンにできないので、手順の案内だけを出す
        const needsHomeScreen = isIos && !isStandalone();
        if (!card || localStorage.getItem(dismissedKey) || (!needsHomeScreen && (!pushSupported() || Notification.permission !== "default"))) return;
        if (!await getVapidKey()) return;
        const box = document.createElement("div");
        box.className = "heiko-push-prompt";
        box.innerHTML = `<p><strong>通知をオンにしますか？</strong>サイトを閉じていても、新しいメッセージが届くと知らせます。</p>
            <div>${needsHomeScreen ? "" : '<button type="button" class="heiko-push-prompt-on" data-no-busy>オンにする</button>'}<a href="profile.html?pushguide=1">設定のしかた</a><button type="button" class="heiko-push-prompt-later" data-no-busy>あとで</button></div>`;
        card.insertAdjacentElement("beforebegin", box);
        box.querySelector(".heiko-push-prompt-later").addEventListener("click", () => { write(dismissedKey, "1"); box.remove(); });
        const onButton = box.querySelector(".heiko-push-prompt-on");
        if (onButton) onButton.addEventListener("click", async () => {
            onButton.disabled = true;
            onButton.textContent = "設定中…";
            try {
                await enablePush();
                box.querySelector("p").textContent = "通知をオンにしました。マイページでいつでもオフにできます。";
                box.querySelector("div").remove();
            } catch (error) {
                box.querySelector("p").textContent = error.message || "通知の設定に失敗しました";
                onButton.disabled = false;
                onButton.textContent = "もう一度";
            }
        });
    }

    window.HeikoNotify = { refresh, setReactionCount };

    // ログアウトしたままの端末や、別の人がログインした端末には、前の人の通知を残さない
    const savedPush = readJson(PUSH_KEY);
    if (savedPush && (!loggedIn || savedPush.userId !== userId)) {
        localStorage.removeItem(PUSH_KEY);
        dropSubscription().catch(() => {});
    }

    // 管理者が他のユーザーとして見ている間は、その人あての通知を受け取らない
    if (!loggedIn || page === "index" || page === "reset" || localStorage.getItem("isImpersonating") === "true") return;

    document.addEventListener("pointerdown", () => { if (localStorage.getItem(SOUND_KEY) === "1") unlockSound(); }, { passive: true });
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible") return;
        if (pendingToast) { showToast(pendingToast); pendingToast = null; }
        refresh();
    });
    window.addEventListener("pagehide", () => {
        if (unsubscribeInbox) unsubscribeInbox();
        unsubscribeInbox = null;
    });
    window.addEventListener("pageshow", event => { if (event.persisted) { watchInbox(); refresh(); } });
    // サイトを開いたまま日がたっても、通知先が古くならないようにする
    setInterval(() => { if (document.visibilityState === "visible") refresh(); }, POLL_MS);

    if (page === "profile") installProfileSettings();
    loadBlocked().finally(() => { refresh(); watchInbox(); });
    if (page === "messages") installMessagesPrompt();
    keepPushFresh();
})();
