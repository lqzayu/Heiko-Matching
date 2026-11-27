// ===== 運営からのお知らせ（ホーム画面） =====
// ベルのボタンで一覧を開く。配信後に初めてホームを開いたときは、チュートリアルと同じ吹き出しで表示する。
// どこまで読んだかはサーバーに保存するので、別の端末で開いても同じお知らせは出ない
(function () {
    "use strict";
    const GAS_URL = "https://script.google.com/macros/s/AKfycbyQgkizdGw9MiZjxtlxAHpfMXw5ehLfj9HkzDcR9YLRo1Cm11kfEp4cWYqnNBdDR96w/exec";
    const POPUP_LIMIT = 3;        // 一度に吹き出しで見せる件数
    const RELOAD_AFTER_MS = 60000;
    const WIDE_QUERY = "(min-width:769px) and (min-aspect-ratio:1/1)";
    const userId = () => localStorage.getItem("userId") || localStorage.getItem("userEmail") || "";

    let items = [];
    let loadedAt = 0;
    let loading = null;
    let popupTimer = null;
    const popped = new Set();   // このページで吹き出しに出したもの（既読の保存に失敗しても何度も出さない）
    let bell = null;
    let dialog = null;

    // GAS が古いと知らない操作は「ログインの有効期限」と返るため、自動ログアウトする共通の通信は使わない
    async function call(payload) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(GAS_URL, {
                method: "POST",
                body: JSON.stringify({ ...payload, userId: userId(), sessionToken: localStorage.getItem("sessionToken") || "" }),
                signal: controller.signal
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } finally {
            clearTimeout(timer);
        }
    }

    const formatDate = time => {
        const date = new Date(time);
        return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
    };
    const unreadItems = () => items.filter(item => item.unread);
    const senderLabel = item => item.audience === "先生" ? "運営から先生へのお知らせ" : "運営からのお知らせ";

    // ---------- ベル ----------
    function placeBell() {
        if (!bell) return;
        const navbar = document.querySelector(".navbar");
        const secondary = navbar && navbar.querySelector(".nav-secondary");
        // 横長はメニューのロゴの横、縦長は上のアイコンの並びの先頭
        if (window.matchMedia(WIDE_QUERY).matches || !secondary) {
            if (navbar && bell.parentElement !== navbar) navbar.appendChild(bell);
        } else if (secondary.firstElementChild !== bell) {
            secondary.prepend(bell);
        }
    }

    function installBell() {
        if (bell) return;
        bell = document.createElement("button");
        bell.type = "button";
        bell.className = "nav-item heiko-bell";
        bell.setAttribute("data-no-busy", "");
        bell.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.6 2.2H4.4L6 16ZM10 21a2.2 2.2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="heiko-bell-badge" hidden></span>';
        bell.addEventListener("click", openPanel);
        document.querySelector(".navbar").appendChild(bell);
        placeBell();
        window.matchMedia(WIDE_QUERY).addEventListener("change", placeBell);
    }

    function renderBell() {
        if (!bell) return;
        const count = unreadItems().length;
        const badge = bell.querySelector(".heiko-bell-badge");
        badge.hidden = count === 0;
        badge.textContent = count > 9 ? "9+" : String(count);
        const label = count ? `運営からのお知らせ（未読${count}件）` : "運営からのお知らせ";
        bell.setAttribute("aria-label", label);
        bell.title = label;
    }

    async function markRead(list) {
        const upTo = list.reduce((max, item) => Math.max(max, item.time), 0);
        if (!upTo) return;
        items.forEach(item => { if (item.time <= upTo) item.unread = false; });
        renderBell();
        try {
            await call({ mode: "markAnnouncementsRead", upTo });
        } catch (error) {
            console.warn("お知らせの既読を保存できませんでした", error);
        }
    }

    // ---------- 一覧（ベルを押したとき） ----------
    function openPanel() {
        if (dialog) return;
        dialog = document.createElement("dialog");
        dialog.className = "news-dialog";
        dialog.setAttribute("aria-labelledby", "news-title");
        dialog.innerHTML = '<div class="news-head"><h2 id="news-title">🔔 運営からのお知らせ</h2><button type="button" class="news-close" aria-label="閉じる" data-no-busy>×</button></div><ul class="news-list"></ul>';
        const list = dialog.querySelector(".news-list");
        if (!items.length) {
            const empty = document.createElement("li");
            empty.className = "news-empty";
            empty.textContent = "お知らせはまだありません。";
            list.appendChild(empty);
        }
        items.forEach(item => {
            const row = document.createElement("li");
            row.className = "news-item" + (item.unread ? " is-new" : "");
            const date = document.createElement("small");
            date.textContent = (item.unread ? "NEW・" : "") + formatDate(item.time) + (item.audience === "先生" ? "・先生向け" : "");
            const title = document.createElement("h3");
            title.textContent = item.title;
            const body = document.createElement("p");
            body.textContent = item.body;
            row.append(date, title, body);
            list.appendChild(row);
        });
        const close = () => {
            if (!dialog) return;
            const element = dialog;
            dialog = null;
            if (element.open && element.close) element.close();
            element.remove();
        };
        dialog.querySelector(".news-close").addEventListener("click", close);
        dialog.addEventListener("close", close);
        dialog.addEventListener("click", event => { if (event.target === dialog) close(); }); // 外側を押したら閉じる
        document.body.appendChild(dialog);
        if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
        markRead(unreadItems());
    }

    // ---------- 配信後に初めて開いたときの吹き出し ----------
    // ホームの案内や「使い方」、ほかの画面が出ている間は待つ
    function canShowPopup() {
        if (document.visibilityState !== "visible" || typeof window.startHeikoTour !== "function") return false;
        if (document.querySelector(".heiko-tour, dialog[open]")) return false;
        const guide = document.getElementById("usage-guide");
        if (guide && guide.getAttribute("aria-hidden") === "false") return false;
        // はじめての人には、先にホームの案内を出す
        const opensGuide = new URLSearchParams(location.search).has("guide");
        return opensGuide || localStorage.getItem("heiko-tour-done:" + (localStorage.getItem("userId") || "guest")) === "1";
    }

    function showPopup() {
        const unread = unreadItems();
        const fresh = unread.filter(item => !popped.has(item.id));
        if (!fresh.length) return;
        // 既読は「どの時刻まで読んだか」で保存するので、古いものから順に見せる（残りは次に開いたときに出る）
        const ordered = fresh.slice().sort((a, b) => a.time - b.time);
        const shown = ordered.slice(0, POPUP_LIMIT);
        const steps = shown.map(item => ({ title: `📢 ${item.title}`, body: `${formatDate(item.time)}　${senderLabel(item)}\n\n${item.body}` }));
        const rest = fresh.length - shown.length;
        steps.push({
            target: () => bell,
            title: "お知らせはここから",
            body: rest > 0 ? `ほかに${rest}件の新しいお知らせがあります。ベルを押すと、まとめて読めます。` : "ベルを押すと、お知らせをいつでも読み返せます。"
        });
        fresh.forEach(item => popped.add(item.id));
        // 見せきれなかった分は未読のままにして、ベルの数字で知らせる
        window.startHeikoTour({
            steps,
            lastLabel: "閉じる",
            onFinish: () => markRead(shown)
        });
    }

    function schedulePopup() {
        clearInterval(popupTimer);
        if (!unreadItems().some(item => !popped.has(item.id))) return;
        const attempt = () => {
            if (!canShowPopup()) return;
            clearInterval(popupTimer);
            showPopup();
        };
        // 開いた直後は、画面の部品やホームの案内が整うのを待つ
        popupTimer = setInterval(attempt, 1300);
    }

    async function load() {
        if (loading) return loading;
        loading = (async () => {
            try {
                const result = await call({ mode: "getAnnouncements" });
                if (result.status !== "success" || !Array.isArray(result.message)) return;
                loadedAt = Date.now();
                items = result.message;
                installBell();
                renderBell();
                schedulePopup();
            } catch (error) {
                console.warn("お知らせを取得できませんでした", error);
            } finally {
                loading = null;
            }
        })();
        return loading;
    }

    function start() {
        // 管理者が他の利用者の画面を見ている間は、その人の既読にしない
        if (!localStorage.getItem("sessionToken") || !userId() || localStorage.getItem("isImpersonating") === "true") return;
        load();
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible" && Date.now() - loadedAt > RELOAD_AFTER_MS) load();
        });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
})();
