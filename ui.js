const THEME_STORAGE_KEY = "heikoThemePreference";

function normalizeThemePreference(value) {
    return value === "light" || value === "dark" ? value : "auto";
}

function readThemePreference() {
    try {
        return normalizeThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
    } catch (error) {
        return "auto";
    }
}

function applyThemePreference(value, save = true) {
    const preference = normalizeThemePreference(value);
    if (preference === "auto") {
        document.documentElement.removeAttribute("data-theme");
    } else {
        document.documentElement.setAttribute("data-theme", preference);
    }
    if (save) {
        try {
            localStorage.setItem(THEME_STORAGE_KEY, preference);
        } catch (error) {
            console.warn("外観設定を保存できませんでした。", error);
        }
    }
    const selector = document.getElementById("theme-preference");
    if (selector) selector.value = preference;
    return preference;
}

applyThemePreference(readThemePreference(), false);
window.applyThemePreference = applyThemePreference;
window.getThemePreference = readThemePreference;
let heikoDeferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    heikoDeferredInstallPrompt = event;
    updateHeikoPwaInstallButton();
});
window.addEventListener("appinstalled", () => {
    heikoDeferredInstallPrompt = null;
    updateHeikoPwaInstallButton(true);
});

function isHeikoPwaStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function updateHeikoPwaInstallButton(installed = false) {
    const button = document.getElementById("heiko-pwa-install-button");
    const hint = document.getElementById("heiko-pwa-install-hint");
    if (!button) return;
    if (installed || isHeikoPwaStandalone()) {
        button.disabled = true;
        button.textContent = "ホーム画面に追加済み";
        if (hint) hint.textContent = "このサービスはアプリとして起動できます。";
        return;
    }
    button.disabled = false;
    button.textContent = "ホーム画面に追加";
    if (hint && heikoDeferredInstallPrompt) hint.textContent = "この端末のホーム画面からすぐに開けます。";
}

function showHeikoPwaInstallDialog(kind) {
    let dialog = document.getElementById("heiko-pwa-install-dialog");
    if (!dialog) {
        dialog = document.createElement("dialog");
        dialog.id = "heiko-pwa-install-dialog";
        dialog.className = "heiko-pwa-install-dialog";
        dialog.addEventListener("click", event => {
            if (event.target === dialog) dialog.close();
        });
        document.body.appendChild(dialog);
    }

    const isAppleMobile = kind === "apple-mobile";
    const isSafariDesktop = kind === "safari-desktop";
    const title = isAppleMobile ? "ホーム画面に追加" : isSafariDesktop ? "Dockに追加" : "アプリとして追加";
    const description = isAppleMobile
        ? "Safariでは安全上の仕様により、この画面から直接追加を確定できません。共有メニューを開いたら「ホーム画面に追加」を選んでください。"
        : isSafariDesktop
            ? "Safariでは安全上の仕様により、この画面から直接追加を確定できません。メニューバーの「ファイル」から「Dockに追加」を選んでください。"
            : "このブラウザでは、メニューから「ホーム画面に追加」または「アプリをインストール」を選ぶと追加できます。";

    dialog.innerHTML = `<section class="heiko-pwa-install-dialog-content" aria-labelledby="heiko-pwa-dialog-title"><span class="heiko-pwa-dialog-icon" aria-hidden="true">⌂</span><h3 id="heiko-pwa-dialog-title">${title}</h3><p>${description}</p><button type="button" class="heiko-pwa-dialog-close">わかった</button></section>`;
    dialog.querySelector(".heiko-pwa-dialog-close").addEventListener("click", () => dialog.close());
    if (typeof dialog.showModal === "function") dialog.showModal();
    else window.alert(`${title}\n\n${description}`);
}

async function openHeikoAppleShareMenu() {
    if (!navigator.share) return false;
    try {
        await navigator.share({ title: document.title, url: window.location.href });
        return true;
    } catch (error) {
        return error && error.name === "AbortError";
    }
}

async function requestHeikoPwaInstall() {
    if (isHeikoPwaStandalone()) return;
    if (heikoDeferredInstallPrompt) {
        heikoDeferredInstallPrompt.prompt();
        await heikoDeferredInstallPrompt.userChoice;
        heikoDeferredInstallPrompt = null;
        updateHeikoPwaInstallButton();
        return;
    }
    const isAppleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isAppleMobile && await openHeikoAppleShareMenu()) return;
    showHeikoPwaInstallDialog(isAppleMobile ? "apple-mobile" : isSafari ? "safari-desktop" : "other");
}

function installHeikoPwaSupport() {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(error => console.warn("PWA準備に失敗しました。", error));
    if (!document.body || document.body.dataset.page !== "profile") return;
    if (document.getElementById("heiko-pwa-install-card")) return;
    const appearance = document.querySelector(".appearance-settings");
    if (!appearance) return;
    const card = document.createElement("section");
    card.id = "heiko-pwa-install-card";
    card.className = "heiko-pwa-install-card";
    card.setAttribute("aria-labelledby", "heiko-pwa-install-title");
    card.innerHTML = "<div><span class=\"heiko-pwa-kicker\">QUICK ACCESS</span><h3 id=\"heiko-pwa-install-title\">ホーム画面からすぐに開く</h3><p id=\"heiko-pwa-install-hint\">スマホのホーム画面に追加すると、アプリのように使えます。</p></div><button type=\"button\" id=\"heiko-pwa-install-button\" onclick=\"requestHeikoPwaInstall()\">ホーム画面に追加</button>";
    appearance.insertAdjacentElement("afterend", card);
    updateHeikoPwaInstallButton();
}

function installHeikoFooterNavigation() {
    const footerLinks = document.querySelector(".footer-links");
    if (!footerLinks) return;
    // フッターは利用規約とプライバシーポリシーだけにする（ページ間の移動はヘッダーのメニューで行う）
    footerLinks.innerHTML = `<a href="terms.html">利用規約</a><a href="privacy.html">プライバシーポリシー</a>`;
}
const HEIKO_SESSION_KEYS = ["userId", "userEmail", "userName", "profileImage", "userGrade", "userDept", "sessionToken", "adminSessionToken", "adminToken", "isImpersonating", "chatTarget", "chatTargetName"];
const HEIKO_REMEMBER_UNTIL_KEY = "heikoRememberUntil";
const HEIKO_SESSION_ONLY_KEY = "heikoSessionOnly";
const HEIKO_SESSION_ACTIVE_KEY = "heikoSessionActive";
const HEIKO_SESSION_UNTIL_KEY = "heikoSessionUntil";
const HEIKO_REMEMBER_DAYS = 30;
// 「ログイン情報を保存する」にチェックしない場合も、この時間はログインを保つ。
// スマホのアプリ内ブラウザ（LINEなど）やプライベートブラウズでは、ページを移るたびに sessionStorage が消えたり
// 書き込めなかったりするため、sessionStorage だけで判定するとログイン直後に追い出されてログイン画面に戻り続けてしまう
const HEIKO_SESSION_HOURS = 12;

// ログアウトした端末に通知が届き続けないよう、この端末の通知先を解除する
function releaseHeikoPush() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem("heiko-push") || "null"); } catch (error) { saved = null; }
    if (!saved) return;
    localStorage.removeItem("heiko-push");
    const sessionToken = localStorage.getItem("sessionToken");
    if (sessionToken && saved.token) {
        fetch("https://script.google.com/macros/s/AKfycbyQgkizdGw9MiZjxtlxAHpfMXw5ehLfj9HkzDcR9YLRo1Cm11kfEp4cWYqnNBdDR96w/exec", {
            method: "POST",
            body: JSON.stringify({ mode: "unregisterWebPush", userId: saved.userId, fcmToken: saved.token, sessionToken }),
            keepalive: true
        }).catch(() => {});
    }
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistration()
            .then(registration => registration && registration.pushManager && registration.pushManager.getSubscription())
            .then(subscription => subscription && subscription.unsubscribe())
            .catch(() => {});
    }
}

// 選択欄のプルダウンを、ブラウザやOSによらない独自の見た目にする
function installHeikoDropdown() {
    if (document.getElementById("heiko-dropdown-script")) return;
    const script = document.createElement("script");
    script.id = "heiko-dropdown-script";
    script.src = "dropdown.js?v=20261127r";
    document.body.appendChild(script);
}

function installHeikoNotify() {
    if (document.getElementById("heiko-notify-script")) return;
    const script = document.createElement("script");
    script.id = "heiko-notify-script";
    script.src = "notify.js?v=20261128a";
    document.body.appendChild(script);
}

function clearHeikoSession() {
    releaseHeikoPush();
    HEIKO_SESSION_KEYS.forEach(key => localStorage.removeItem(key));
    localStorage.removeItem(HEIKO_REMEMBER_UNTIL_KEY);
    localStorage.removeItem(HEIKO_SESSION_ONLY_KEY);
    localStorage.removeItem(HEIKO_SESSION_UNTIL_KEY);
    try {
        // チャット画面の一時保存（すぐ表示するための控え）も消す
        Object.keys(sessionStorage).filter(key => key.startsWith("heiko-chat-cache:")).forEach(key => sessionStorage.removeItem(key));
        sessionStorage.removeItem(HEIKO_SESSION_ACTIVE_KEY);
    } catch (error) {
        console.warn("一時ログイン情報を削除できませんでした。", error);
    }
}

function hasHeikoAuthCredentials() {
    return Boolean(localStorage.getItem("sessionToken") && (localStorage.getItem("userId") || localStorage.getItem("userEmail")));
}

function isHeikoAuthSessionActive() {
    if (!hasHeikoAuthCredentials()) return false;
    const rememberUntilText = localStorage.getItem(HEIKO_REMEMBER_UNTIL_KEY);
    if (rememberUntilText) {
        const rememberUntil = Number(rememberUntilText);
        if (Number.isFinite(rememberUntil) && rememberUntil > Date.now()) return true;
        clearHeikoSession();
        return false;
    }
    if (localStorage.getItem(HEIKO_SESSION_ONLY_KEY) === "1") {
        try {
            if (sessionStorage.getItem(HEIKO_SESSION_ACTIVE_KEY) === "1") return true;
        } catch (error) { /* sessionStorage が使えない環境では、下の時間で判定する */ }
        const sessionUntil = Number(localStorage.getItem(HEIKO_SESSION_UNTIL_KEY));
        if (Number.isFinite(sessionUntil) && sessionUntil > Date.now()) {
            try { sessionStorage.setItem(HEIKO_SESSION_ACTIVE_KEY, "1"); } catch (error) { /* 書き込めなくても続ける */ }
            return true;
        }
        clearHeikoSession();
        return false;
    }
    return true;
}

function saveHeikoAuthSession(authResult, remember) {
    if (!authResult || !authResult.email || !authResult.sessionToken) return false;
    localStorage.setItem("userEmail", authResult.email);
    localStorage.setItem("userId", authResult.userId || authResult.email);
    localStorage.setItem("userName", authResult.name || "");
    localStorage.setItem("profileImage", authResult.profileImage || "");
    localStorage.setItem("sessionToken", authResult.sessionToken);
    if (authResult.adminToken) localStorage.setItem("adminToken", authResult.adminToken);
    else localStorage.removeItem("adminToken");
    try {
        sessionStorage.setItem(HEIKO_SESSION_ACTIVE_KEY, "1");
    } catch (error) {
        console.warn("一時ログイン状態を保存できませんでした。", error);
    }
    if (remember) {
        localStorage.setItem(HEIKO_REMEMBER_UNTIL_KEY, String(Date.now() + HEIKO_REMEMBER_DAYS * 24 * 60 * 60 * 1000));
        localStorage.removeItem(HEIKO_SESSION_ONLY_KEY);
    } else {
        localStorage.removeItem(HEIKO_REMEMBER_UNTIL_KEY);
        localStorage.setItem(HEIKO_SESSION_ONLY_KEY, "1");
        localStorage.setItem(HEIKO_SESSION_UNTIL_KEY, String(Date.now() + HEIKO_SESSION_HOURS * 60 * 60 * 1000));
    }
    return true;
}

window.saveHeikoAuthSession = saveHeikoAuthSession;
window.isHeikoAuthSessionActive = isHeikoAuthSessionActive;
isHeikoAuthSessionActive();
const isHeikoLoginPage = /\/index\.html$/.test(window.location.pathname) || /\/$/.test(window.location.pathname);
if (isHeikoLoginPage && isHeikoAuthSessionActive()) window.location.replace("main.html");
window.clearHeikoSession = clearHeikoSession;
function handleHeikoSessionResponse(result) {
    const message = result && result.status === "error" ? String(result.message || "") : "";
    if (!message.includes("ログインの有効期限")) return false;
    clearHeikoSession();
    window.location.replace("index.html");
    return true;
}
window.handleHeikoSessionResponse = handleHeikoSessionResponse;

function getHeaderActionStack() {
    const navbar = document.querySelector(".navbar");
    if (!navbar) return null;

    let stack = document.getElementById("heiko-header-actions");
    if (stack) return stack;

    stack = document.createElement("div");
    stack.id = "heiko-header-actions";
    stack.className = "heiko-header-actions";
    const menuButton = navbar.querySelector(".hamburger-btn");
    const navigation = navbar.querySelector(".nav-links");
    navbar.insertBefore(stack, menuButton || navigation || null);
    return stack;
}

function installPageRefreshButton() {
    // 管理者ページは独自の「データを更新」ボタンがあるため、更新ボタンと QUICK MATCH 欄を出さない
    if (!document.body || ["index", "admin"].includes(document.body.dataset.page) || document.getElementById("heiko-page-refresh")) return;

    const stack = getHeaderActionStack();
    const button = document.createElement("button");
    button.id = "heiko-page-refresh";
    button.type = "button";
    button.className = "heiko-page-refresh";
    if (!stack) button.classList.add("is-floating");
    button.setAttribute("aria-label", "ページを更新");
    button.innerHTML = "<span aria-hidden=\"true\">↻</span><span>更新</span>";
    button.addEventListener("click", () => {
        button.disabled = true;
        button.classList.add("is-loading");
        button.querySelector("span").textContent = "⟳";
        window.location.reload();
    });
    (stack || document.body).appendChild(button);
}

function installRecruitmentPostButton() {
    // QUICK MATCH カード（募集投稿への導線）はホーム画面だけに出す。ほかのページでは本来の内容を最上部に表示する
    if (!document.body || document.body.dataset.page !== "main" || document.getElementById("heiko-recruit-post-panel")) return;
    const navbar = document.querySelector(".navbar");
    const refreshButton = document.getElementById("heiko-page-refresh");
    if (!navbar || !refreshButton) return;

    const panel = document.createElement("section");
    panel.id = "heiko-recruit-post-panel";
    panel.className = "heiko-recruit-post-panel";
    const currentRecruitment = document.getElementById("my-post-area");
    if (currentRecruitment) {
        panel.classList.add("is-sidebar-action");
        currentRecruitment.insertAdjacentElement("afterend", panel);
    } else {
        const main = document.querySelector("main");
        if (!main) return;
        panel.classList.add("is-page-action");
        main.insertAdjacentElement("beforebegin", panel);
    }

    const copy = document.createElement("div");
    copy.className = "heiko-recruit-post-copy";
    copy.innerHTML = "<span>QUICK MATCH</span><strong>いっしょに勉強する仲間を探そう</strong><small>学年・学科はマイページの設定が使われます</small>";
    const actions = document.createElement("div");
    actions.className = "heiko-recruit-post-actions";
    const button = document.createElement("a");
    button.id = "heiko-recruit-post";
    button.className = "heiko-recruit-post";
    button.href = "main.html?tab=recruit";
    button.setAttribute("aria-label", "募集を投稿する");
    button.innerHTML = "<span class=\"heiko-recruit-post-icon\" aria-hidden=\"true\">＋</span><span>募集を投稿する</span><span class=\"heiko-recruit-post-arrow\" aria-hidden=\"true\">→</span>";
    panel.appendChild(copy);
    actions.appendChild(button);
    actions.appendChild(refreshButton);
    panel.appendChild(actions);

    if (document.body.dataset.page !== "junior-meister") {
        const promo = document.createElement("div");
        promo.className = "heiko-jm-promo";
        promo.innerHTML = "<p>ジュニアマイスターを計算してみませんか？<span class=\"jm-beta-badge\">β版</span></p><a class=\"heiko-jm-promo-link\" href=\"junior-meister.html\"><span>点数を計算する</span><span class=\"heiko-recruit-post-arrow\" aria-hidden=\"true\">→</span></a>";
        panel.appendChild(promo);
    }

    const headerActions = document.getElementById("heiko-header-actions");
    if (headerActions && !headerActions.children.length) headerActions.remove();
}

function prefetchHeikoPages() {
    if (!document.body || document.body.dataset.page !== "main") return;

    const pages = [
        "messages.html",
        "chat.html",
        "profile.html",
        "ai-study.html",
        "admin.html",
        "privacy.html",
        "terms.html"
    ];

    const cacheKey = "heiko-prefetched-pages-v20260930";
    try {
        if (sessionStorage.getItem(cacheKey) === "1") return;
        sessionStorage.setItem(cacheKey, "1");
    } catch (error) {
        console.warn("ページ先読み状態を保存できませんでした。", error);
    }

    Promise.allSettled(pages.map(page => {
        return fetch(page, { cache: "force-cache", credentials: "same-origin" }).then(response => {
            if (!response.ok) throw new Error(`${page}: HTTP ${response.status}`);
            return response.text();
        });
    })).then(results => {
        const failed = results.filter(result => result.status === "rejected").length;
        if (failed > 0) console.info(`ページ先読み: ${pages.length - failed}/${pages.length}件完了`);
    });
}

function installHeikoSharedStyles() {
    if (document.getElementById("heiko-shared-ui-style")) return;

    const style = document.createElement("style");
    style.id = "heiko-shared-ui-style";
    style.textContent = `
        .navbar > .heiko-header-actions {
            display: flex;
            flex: 0 0 auto;
            flex-direction: column;
            align-items: stretch;
            gap: 6px;
            min-width: 150px;
            margin-left: 8px;
        }
        .navbar > .nav-links {
            margin-left: auto;
            justify-content: flex-end;
        }
        .navbar .nav-guide-button {
            font-family: inherit;
            line-height: inherit;
        }
        .navbar .nav-item#nav-admin-btn,
        [data-page="admin"] .navbar .nav-item.active {
            color: #dc2626 !important;
        }
        .navbar .nav-item#nav-admin-btn:hover,
        [data-page="admin"] .navbar .nav-item.active:hover {
            color: #b91c1c !important;
        }
        .footer-links {
            align-items: center;
            gap: 10px 18px !important;
        }
        .footer-links a,
        .footer-links button {
            box-sizing: border-box;
            font-family: inherit;
            font-size: 13px;
            font-weight: 700;
            line-height: 1.4;
        }
        .footer-links .heiko-footer-admin {
            color: #dc2626 !important;
        }
        .footer-links .heiko-footer-admin:hover {
            color: #b91c1c !important;
        }
        .heiko-footer-logout {
            appearance: none;
            border: 0;
            border-radius: 8px;
            padding: 4px 8px;
            background: transparent;
            color: var(--ui-muted, #64748b);
            cursor: pointer;
        }
        .heiko-footer-logout:hover {
            color: var(--ui-green, #07828a);
            background: var(--ui-soft, rgba(28, 189, 197, .08));
        }
        .heiko-pwa-install-card {
            display: grid;
            gap: 14px;
            margin-top: 20px;
            padding: 18px;
            border: 1px solid var(--ui-line, rgba(28, 189, 197, .2));
            border-radius: 18px;
            background: linear-gradient(135deg, var(--glass-surface-strong, rgba(255, 255, 255, .82)), var(--glass-surface, rgba(255, 254, 251, .66)));
            box-shadow: var(--glass-shadow, 0 12px 30px rgba(36, 60, 50, .08));
            text-align: left;
        }
        .heiko-pwa-kicker {
            display: block;
            margin-bottom: 5px;
            color: var(--ui-green, #07828a);
            font-size: 10px;
            font-weight: 900;
            letter-spacing: .14em;
        }
        .heiko-pwa-install-card h3 {
            margin: 0 0 5px;
            color: var(--ui-ink, #243c32);
            font-size: 16px;
        }
        .heiko-pwa-install-card p {
            margin: 0;
            color: var(--ui-muted, #66736a);
            font-size: 12px;
            line-height: 1.6;
        }
        #heiko-pwa-install-button {
            min-height: 44px;
            border: 1px solid rgba(125, 211, 252, .48);
            border-radius: 12px;
            background: linear-gradient(135deg, #1689b5, #355fca);
            color: #fff;
            font: inherit;
            font-weight: 800;
            cursor: pointer;
            box-shadow: 0 9px 18px rgba(9, 27, 70, .2);
        }
        #heiko-pwa-install-button:hover {
            transform: translateY(-1px);
            filter: brightness(1.06);
        }
        #heiko-pwa-install-button:disabled {
            opacity: .7;
            cursor: default;
        }
        .heiko-pwa-install-dialog {
            width: min(420px, calc(100vw - 32px));
            margin: auto;
            padding: 0;
            border: 1px solid var(--ui-line, rgba(28, 189, 197, .3));
            border-radius: 20px;
            color: var(--ui-ink, #243c32);
            background: var(--ui-paper, #ffffff);
            box-shadow: 0 24px 64px rgba(11, 33, 52, .28);
        }
        .heiko-pwa-install-dialog::backdrop {
            background: rgba(10, 24, 39, .52);
            backdrop-filter: blur(4px);
        }
        .heiko-pwa-install-dialog-content {
            padding: 26px;
            text-align: center;
        }
        .heiko-pwa-dialog-icon {
            display: grid;
            width: 48px;
            height: 48px;
            place-items: center;
            margin: 0 auto 12px;
            border-radius: 15px;
            color: #ffffff;
            background: linear-gradient(135deg, #1689b5, #355fca);
            font-size: 30px;
            font-weight: 900;
            box-shadow: 0 10px 20px rgba(9, 27, 70, .2);
        }
        .heiko-pwa-install-dialog h3 {
            margin: 0 0 9px;
            font-size: 19px;
        }
        .heiko-pwa-install-dialog p {
            margin: 0;
            color: var(--ui-muted, #66736a);
            font-size: 14px;
            font-weight: 650;
            line-height: 1.75;
        }
        .heiko-pwa-dialog-close {
            min-width: 140px;
            min-height: 43px;
            margin-top: 20px;
            border: 0;
            border-radius: 12px;
            color: #ffffff;
            background: linear-gradient(135deg, #1689b5, #355fca);
            font: inherit;
            font-weight: 800;
            cursor: pointer;
        }
        .navbar > .hamburger-btn {
            align-self: center;
        }
        .heiko-page-refresh {
            display: inline-flex;
            width: 100%;
            align-items: center;
            justify-content: center;
            gap: 5px;
            min-height: 36px;
            padding: 7px 11px;
            margin: 0;
            border: 1px solid var(--ui-line, rgba(28, 189, 197, .25));
            border-radius: 10px;
            background: var(--ui-paper, rgba(255, 255, 255, .86));
            color: var(--ui-ink, #164e63);
            font: inherit;
            font-size: 12px;
            font-weight: 800;
            line-height: 1;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(15, 78, 88, .08);
            transition: transform .2s ease, box-shadow .2s ease, opacity .2s ease;
            white-space: nowrap;
        }
        .heiko-page-refresh:hover {
            transform: translateY(-1px);
            box-shadow: 0 7px 16px rgba(15, 78, 88, .13);
        }
        .heiko-page-refresh:focus-visible {
            outline: 3px solid rgba(28, 189, 197, .28);
            outline-offset: 2px;
        }
        .heiko-page-refresh span:first-child {
            display: inline-block;
            font-size: 18px;
            line-height: 12px;
        }
        .heiko-page-refresh.is-loading span:first-child {
            animation: heiko-refresh-spin .8s linear infinite;
        }
        .heiko-page-refresh:disabled {
            opacity: .7;
            cursor: wait;
        }
        .heiko-page-refresh.is-floating {
            position: fixed;
            top: 16px;
            right: 16px;
            z-index: 1000;
        }
        .heiko-recruit-post {
            display: inline-flex;
            width: 100%;
            box-sizing: border-box;
            align-items: center;
            justify-content: center;
            gap: 6px;
            min-height: 44px;
            padding: 9px 16px;
            margin: 0;
            border: 1px solid rgba(12, 122, 128, .16);
            border-radius: 12px;
            background: linear-gradient(135deg, #129fa6 0%, #0b7782 100%);
            color: #ffffff;
            font: inherit;
            font-size: 14px;
            font-weight: 800;
            line-height: 1;
            letter-spacing: .02em;
            text-decoration: none;
            box-shadow: 0 8px 18px rgba(11, 119, 130, .24);
            transition: transform .2s ease, box-shadow .2s ease, filter .2s ease;
            white-space: nowrap;
        }
        .heiko-recruit-post:hover {
            transform: translateY(-1px);
            filter: brightness(1.05);
            box-shadow: 0 11px 22px rgba(11, 119, 130, .3);
        }
        .heiko-recruit-post:focus-visible {
            outline: 3px solid rgba(28, 189, 197, .35);
            outline-offset: 2px;
        }
        .heiko-recruit-post span:first-child {
            font-size: 19px;
            line-height: 12px;
        }
        :root {
            --heiko-recruit-panel-bg: radial-gradient(circle at 94% 7%, rgba(61, 212, 219, .2), transparent 36%), linear-gradient(135deg, rgba(245, 255, 255, .96), rgba(232, 250, 250, .9));
            --heiko-recruit-panel-border: rgba(23, 165, 171, .22);
            --heiko-recruit-panel-shadow: 0 14px 30px rgba(13, 88, 96, .1);
            --heiko-recruit-orb: rgba(25, 166, 172, .2);
            --heiko-recruit-label: #07828a;
            --heiko-recruit-title: var(--ui-ink, #12384a);
            --heiko-recruit-muted: var(--ui-muted, #5d7782);
            --heiko-recruit-button-bg: linear-gradient(135deg, #11a7ad 0%, #087a85 100%);
            --heiko-recruit-button-border: rgba(7, 110, 117, .18);
            --heiko-recruit-button-shadow: 0 10px 20px rgba(5, 119, 130, .26);
            --heiko-recruit-button-hover-shadow: 0 14px 26px rgba(5, 119, 130, .32);
            --heiko-recruit-refresh-bg: rgba(255, 255, 255, .64);
            --heiko-recruit-refresh-hover: rgba(255, 255, 255, .92);
            --heiko-recruit-refresh-border: rgba(18, 137, 145, .2);
        }
        :root[data-theme="dark"] {
            --heiko-recruit-panel-bg: radial-gradient(circle at 94% 7%, rgba(125, 211, 252, .23), transparent 39%), linear-gradient(135deg, rgba(22, 33, 54, .97), rgba(31, 43, 70, .95));
            --heiko-recruit-panel-border: rgba(147, 197, 253, .36);
            --heiko-recruit-panel-shadow: 0 18px 34px rgba(0, 0, 0, .3);
            --heiko-recruit-orb: rgba(167, 214, 255, .34);
            --heiko-recruit-label: #8bdcff;
            --heiko-recruit-title: #f2f6ff;
            --heiko-recruit-muted: #bdcbe0;
            --heiko-recruit-button-bg: linear-gradient(135deg, #1689b5 0%, #355fca 100%);
            --heiko-recruit-button-border: rgba(191, 219, 254, .48);
            --heiko-recruit-button-shadow: 0 11px 23px rgba(9, 27, 70, .42);
            --heiko-recruit-button-hover-shadow: 0 15px 30px rgba(9, 27, 70, .56);
            --heiko-recruit-refresh-bg: rgba(12, 22, 40, .78);
            --heiko-recruit-refresh-hover: rgba(31, 49, 80, .94);
            --heiko-recruit-refresh-border: rgba(147, 197, 253, .38);
        }
        @media (prefers-color-scheme: dark) {
            :root:not([data-theme="light"]) {
                --heiko-recruit-panel-bg: radial-gradient(circle at 94% 7%, rgba(125, 211, 252, .23), transparent 39%), linear-gradient(135deg, rgba(22, 33, 54, .97), rgba(31, 43, 70, .95));
                --heiko-recruit-panel-border: rgba(147, 197, 253, .36);
                --heiko-recruit-panel-shadow: 0 18px 34px rgba(0, 0, 0, .3);
                --heiko-recruit-orb: rgba(167, 214, 255, .34);
                --heiko-recruit-label: #8bdcff;
                --heiko-recruit-title: #f2f6ff;
                --heiko-recruit-muted: #bdcbe0;
                --heiko-recruit-button-bg: linear-gradient(135deg, #1689b5 0%, #355fca 100%);
                --heiko-recruit-button-border: rgba(191, 219, 254, .48);
                --heiko-recruit-button-shadow: 0 11px 23px rgba(9, 27, 70, .42);
                --heiko-recruit-button-hover-shadow: 0 15px 30px rgba(9, 27, 70, .56);
                --heiko-recruit-refresh-bg: rgba(12, 22, 40, .78);
                --heiko-recruit-refresh-hover: rgba(31, 49, 80, .94);
                --heiko-recruit-refresh-border: rgba(147, 197, 253, .38);
            }
        }
        .heiko-recruit-post-panel {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 18px;
            box-sizing: border-box;
            overflow: hidden;
            padding: 18px;
            border: 1px solid var(--heiko-recruit-panel-border);
            border-radius: 20px;
            background: var(--heiko-recruit-panel-bg);
            box-shadow: var(--heiko-recruit-panel-shadow);
        }
        .heiko-recruit-post-panel::before {
            position: absolute;
            top: -44px;
            right: -34px;
            width: 110px;
            height: 110px;
            border: 1px solid var(--heiko-recruit-orb);
            border-radius: 50%;
            content: "";
            pointer-events: none;
        }
        .heiko-recruit-post-copy {
            position: relative;
            z-index: 1;
            display: grid;
            gap: 4px;
            min-width: 0;
            color: var(--ui-ink, #164e63);
        }
        .heiko-recruit-post-copy span {
            color: var(--heiko-recruit-label);
            font-size: 10px;
            font-weight: 900;
            letter-spacing: .14em;
        }
        .heiko-recruit-post-copy strong {
            color: var(--heiko-recruit-title);
            font-size: 15px;
            line-height: 1.45;
        }
        .heiko-recruit-post-copy small {
            color: var(--heiko-recruit-muted);
            font-size: 11px;
            line-height: 1.45;
        }
        .heiko-recruit-post-actions {
            position: relative;
            z-index: 1;
            display: grid;
            flex: 0 0 218px;
            gap: 8px;
        }
        .heiko-recruit-post-panel.is-sidebar-action {
            width: 100%;
            padding: 17px;
        }
        .heiko-recruit-post-panel.is-sidebar-action .heiko-recruit-post-copy strong {
            font-size: 14px;
        }
        .heiko-recruit-post-panel.is-sidebar-action .heiko-recruit-post-actions {
            flex-basis: auto;
            width: 100%;
        }
        .heiko-recruit-post-panel.is-sidebar-action {
            display: grid;
        }
        .heiko-recruit-post-panel.is-page-action {
            width: min(calc(100% - 32px), 1080px);
            margin: 20px auto 0;
            flex-wrap: wrap;
        }
        .heiko-jm-promo {
            position: relative;
            z-index: 1;
            flex: 1 0 100%;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding-top: 14px;
            border-top: 1px dashed var(--heiko-recruit-panel-border);
        }
        .heiko-jm-promo p {
            margin: 0;
            color: var(--heiko-recruit-title);
            font-size: 13px;
            font-weight: 800;
            line-height: 1.5;
        }
        .heiko-jm-promo-link {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            min-height: 40px;
            padding: 8px 14px;
            box-sizing: border-box;
            border: 1px solid var(--heiko-recruit-refresh-border);
            border-radius: 12px;
            background: var(--heiko-recruit-refresh-bg);
            color: var(--heiko-recruit-label);
            font-size: 13px;
            font-weight: 800;
            text-decoration: none;
            white-space: nowrap;
            transition: transform .2s ease, background .2s ease, box-shadow .2s ease;
        }
        .heiko-jm-promo-link:hover {
            transform: translateY(-1px);
            background: var(--heiko-recruit-refresh-hover);
            box-shadow: 0 7px 15px rgba(13, 88, 96, .1);
        }
        .heiko-jm-promo-link:hover .heiko-recruit-post-arrow {
            transform: translateX(3px);
        }
        .heiko-jm-promo-link:focus-visible {
            outline: 3px solid rgba(28, 189, 197, .35);
            outline-offset: 2px;
        }
        .heiko-recruit-post-panel.is-sidebar-action .heiko-jm-promo {
            display: grid;
            gap: 10px;
        }
        .heiko-recruit-post-panel.is-sidebar-action .heiko-jm-promo-link {
            width: 100%;
        }
        .heiko-recruit-post-panel .heiko-recruit-post {
            min-height: 50px;
            padding: 11px 15px;
            border: 1px solid var(--heiko-recruit-button-border);
            border-radius: 14px;
            background: var(--heiko-recruit-button-bg);
            box-shadow: var(--heiko-recruit-button-shadow);
        }
        .heiko-recruit-post-panel .heiko-recruit-post:hover {
            transform: translateY(-2px);
            box-shadow: var(--heiko-recruit-button-hover-shadow);
        }
        .heiko-recruit-post-icon {
            display: inline-grid;
            width: 22px;
            height: 22px;
            place-items: center;
            border-radius: 8px;
            background: rgba(255, 255, 255, .2);
            font-size: 19px !important;
            line-height: 1 !important;
        }
        .heiko-recruit-post-arrow {
            margin-left: auto;
            font-size: 18px;
            line-height: 1;
            transition: transform .2s ease;
        }
        .heiko-recruit-post:hover .heiko-recruit-post-arrow {
            transform: translateX(3px);
        }
        .heiko-recruit-post-actions .heiko-page-refresh {
            min-height: 36px;
            border-color: var(--heiko-recruit-refresh-border);
            border-radius: 12px;
            background: var(--heiko-recruit-refresh-bg);
            color: var(--heiko-recruit-title);
            box-shadow: none;
        }
        .heiko-recruit-post-actions .heiko-page-refresh:hover {
            background: var(--heiko-recruit-refresh-hover);
            box-shadow: 0 7px 15px rgba(13, 88, 96, .1);
        }
        @keyframes heiko-refresh-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        @media (max-width: 768px) {
            .navbar {
                flex-wrap: nowrap !important;
                align-items: center !important;
            }
            .navbar > .heiko-header-actions {
                min-width: 124px;
                gap: 4px;
                margin-left: 4px;
            }
            .navbar > .hamburger-btn {
                display: flex !important;
                flex-shrink: 0;
                margin-left: auto !important;
                align-self: center;
            }
            .heiko-page-refresh {
                min-height: 32px;
                padding: 6px 9px;
                border-radius: 11px;
            }
            .heiko-recruit-post {
                min-height: 38px;
                padding: 8px 9px;
                border-radius: 11px;
                font-size: 12px;
            }
            .heiko-recruit-post-panel,
            .heiko-recruit-post-panel.is-page-action {
                width: calc(100% - 24px);
                margin: 14px auto 0;
                padding: 15px;
                border-radius: 18px;
            }
            .heiko-recruit-post-panel {
                display: grid;
                gap: 14px;
            }
            .heiko-recruit-post-actions {
                width: 100%;
                flex-basis: auto;
            }
            .heiko-recruit-post-panel .heiko-recruit-post {
                min-height: 48px;
                font-size: 14px;
            }
            .heiko-jm-promo {
                display: grid;
                gap: 10px;
            }
            .heiko-jm-promo-link {
                width: 100%;
            }
        }
        @media (max-width: 380px) {
            .navbar > .heiko-header-actions {
                min-width: 112px;
            }
            .heiko-recruit-post {
                font-size: 11px;
            }
            .heiko-recruit-post span:first-child {
                font-size: 16px;
            }
        }
        @media (max-aspect-ratio: 4/5) {
            .navbar > .hamburger-btn {
                margin-left: auto !important;
                align-self: center;
            }
        }
    `;
    document.head.appendChild(style);
}

(function installUsageLogging() {
    const nativeFetch = window.fetch.bind(window);
    const ignoredModes = new Set(["recordUsageLog", "recordUsageLogs", "heartbeat", "login", "register", "verifyEmail", "resendVerificationCode", "forgotPassword", "resetPassword", "verify_face_1toN", "verify_face_for_user", "firebaseCustomToken", "getMessages", "getUnreadCount", "getNotificationSummary", "getLatestIncomingMessage", "markAsRead", "getBlockedUsers", "getPushConfig", "registerWebPush", "unregisterWebPush", "getReactions", "markReactionsRead", "getAnnouncements", "markAnnouncementsRead", "changePassword", "changeUserId"]);
    const usageLogQueue = [];
    let usageLogTimer = null;
    let usageLogUrl = "";

    function parsePayload(body) {
        if (typeof body !== "string") return null;
        try {
            const payload = JSON.parse(body);
            return payload && typeof payload === "object" ? payload : null;
        } catch (error) {
            return null;
        }
    }

    function getRequestUrl(input) {
        return typeof input === "string" ? input : input && input.url ? input.url : "";
    }

    function flushUsageLogs() {
        const sessionToken = localStorage.getItem("sessionToken") || "";
        const userId = localStorage.getItem("userId") || localStorage.getItem("userEmail") || "";
        if (!sessionToken || !userId || usageLogQueue.length === 0) return;
        if (usageLogTimer) clearTimeout(usageLogTimer);
        usageLogTimer = null;
        const events = usageLogQueue.splice(0, 20);
        const logPayload = {
            mode: "recordUsageLogs",
            userId: String(userId).slice(0, 64),
            events: events,
            sessionToken: sessionToken
        };
        nativeFetch(usageLogUrl || window.HEIKO_GAS_URL || "https://script.google.com/macros/s/AKfycbyQgkizdGw9MiZjxtlxAHpfMXw5ehLfj9HkzDcR9YLRo1Cm11kfEp4cWYqnNBdDR96w/exec", {
            method: "POST",
            body: JSON.stringify(logPayload),
            keepalive: true
        }).catch(() => {});
        if (usageLogQueue.length > 0) usageLogTimer = setTimeout(flushUsageLogs, 1500);
    }

    function queueUsageLog(url, payload, result, durationMs, errorMessage) {
        if (!payload || payload.adminToken) return;
        if (url) usageLogUrl = url;
        usageLogQueue.push({
            sourceMode: String(payload.mode || "unknown").slice(0, 80),
            result: result,
            durationMs: Math.round(durationMs),
            errorMessage: String(errorMessage || "").slice(0, 300)
        });
        if (usageLogQueue.length >= 10 || result === "error") {
            flushUsageLogs();
        } else if (!usageLogTimer) {
            usageLogTimer = setTimeout(flushUsageLogs, 20000);
        }
    }

    window.fetch = async function (input, init = {}) {
        const url = getRequestUrl(input);
        const payload = parsePayload(init.body);
        const shouldLog = Boolean(payload && payload.mode && url.includes("script.google.com/macros/") && !ignoredModes.has(payload.mode) && !payload.adminToken);
        const startedAt = performance.now();

        try {
            const response = await nativeFetch(input, init);
            if (shouldLog) {
                const copy = response.clone();
                copy.json().then(result => {
                    const status = result && result.status === "success" ? "success" : "error";
                    queueUsageLog(url, payload, status, performance.now() - startedAt, status === "error" ? result.message : "");
                }).catch(error => queueUsageLog(url, payload, "error", performance.now() - startedAt, error.message));
            }
            return response;
        } catch (error) {
            if (shouldLog) queueUsageLog(url, payload, "error", performance.now() - startedAt, error.message);
            throw error;
        }
    };

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flushUsageLogs();
    });
})();

// =====================================================================
// ボタンを押したあとの「処理中」表示と二重クリック防止（全ページ共通）
// ボタンを押した直後にサーバー（GAS）への通信が始まったら、その通信が終わるまで
// ボタンに「保存中…」などを重ねて表示し、もう一度押せないようにする。
// ページ側のボタンの文字や disabled はさわらない（上に重ねて表示するだけ）
// =====================================================================
(function () {
    if (window.__heikoBusyInstalled) return;
    window.__heikoBusyInstalled = true;
    const CLICK_WINDOW_MS = 400;     // 押してからこの時間内に始まった通信を、そのボタンの処理とみなす
    const SHOW_DELAY_MS = 120;       // すぐ終わる処理では表示がチラつかないよう、少し待ってから出す
    const SKIP = ".hamburger-btn, .page-help-button, .heiko-tour button, .toggle-password-btn, .toggle-confirm-btn, .usage-guide-close, .chat-back-btn, [data-no-busy], .nav-links *, .nav-secondary *";
    let lastButton = null, lastClickAt = 0;

    function labelFor(button) {
        if (button.dataset.busyLabel) return button.dataset.busyLabel;
        const text = (button.textContent || button.value || "").replace(/\s+/g, "");
        if (/ログイン/.test(text)) return "ログイン中…";
        if (/保存|設定を|登録/.test(text)) return "保存中…";
        if (/送信|投稿|相談|コード/.test(text)) return "送信中…";
        if (/削除|解除|ブロック/.test(text)) return "処理中…";
        if (/更新|読み込|再取得|同期|取得/.test(text)) return "読み込み中…";
        return "処理中…";
    }

    function start(button) {
        const count = Number(button.dataset.heikoBusyCount || 0) + 1;
        button.dataset.heikoBusyCount = String(count);
        if (count > 1) return;
        button.setAttribute("aria-busy", "true");
        button.classList.add("is-heiko-locked");
        button._heikoBusyTimer = setTimeout(() => {
            if (!button.dataset.heikoBusyCount) return;
            const label = document.createElement("span");
            label.className = "heiko-busy-label";
            label.setAttribute("aria-hidden", "true");
            label.innerHTML = '<span class="heiko-busy-spinner"></span><span></span>';
            label.lastChild.textContent = labelFor(button);
            button.appendChild(label);
            button.classList.add("is-heiko-busy");
        }, SHOW_DELAY_MS);
    }

    function end(button) {
        const count = Number(button.dataset.heikoBusyCount || 0) - 1;
        if (count > 0) { button.dataset.heikoBusyCount = String(count); return; }
        delete button.dataset.heikoBusyCount;
        clearTimeout(button._heikoBusyTimer);
        button.removeAttribute("aria-busy");
        button.classList.remove("is-heiko-locked", "is-heiko-busy");
        button.querySelectorAll(":scope > .heiko-busy-label").forEach(el => el.remove());
    }

    function remember(button) {
        if (!button || button.matches(SKIP)) return;
        lastButton = button;
        lastClickAt = performance.now();
    }

    // 処理中のボタンは押せないようにする（キャプチャ段階で止める）
    document.addEventListener("click", event => {
        const button = event.target.closest && event.target.closest("button, input[type='submit'], input[type='button']");
        if (!button) return;
        if (button.dataset.heikoBusyCount) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }
        remember(button);
    }, true);
    // Enter キーでフォームを送った場合も、そのフォームの送信ボタンを対象にする
    document.addEventListener("submit", event => {
        const form = event.target;
        const button = event.submitter || (form.querySelector && form.querySelector("button[type='submit'], button:not([type]), input[type='submit']"));
        if (button && button.dataset.heikoBusyCount) { event.preventDefault(); event.stopImmediatePropagation(); return; }
        if (button && performance.now() - lastClickAt > CLICK_WINDOW_MS) remember(button);
    }, true);

    const innerFetch = window.fetch;
    window.fetch = function (input, init) {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        const method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
        let button = null;
        if (lastButton && method !== "GET" && url.includes("script.google.com/") && performance.now() - lastClickAt <= CLICK_WINDOW_MS && document.contains(lastButton)) {
            button = lastButton;
            start(button);
        }
        const promise = innerFetch.apply(this, arguments);
        if (!button) return promise;
        // 応答の本文を読み終わるまで待つと遅くなるため、応答が返った時点で戻す
        return promise.then(response => { end(button); return response; }, error => { end(button); throw error; });
    };
})();

// メニューボタンの開閉状態を読み上げソフトに伝える（各ページの toggleMenu はクラスを切り替えるだけなので、クラスの変化に追従する）
// =====================================================================
// UI / UX アニメーション（全ページ共通）
// =====================================================================
const HEIKO_REDUCED_MOTION = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// 画面に入ったときにふわっと出す要素（後から追加されるカードにも自動で付ける）
const HEIKO_REVEAL_SELECTOR = [
    ".sidebar > *", ".user-card", ".se-strip", ".ev-card", ".partner-item", ".panel",
    ".jm-score-box", ".jm-rec-details", ".jm-card:not(.jm-rec-card)", ".sidebar-form",
    ".ai-profile", ".ai-chat-card", ".profile-card", ".dm-header", ".usage-step-card",
    ".page-heading", ".page-title-bar"
].join(",");

function installHeikoMotion() {
    if (window.__heikoMotionInstalled || HEIKO_REDUCED_MOTION || !("IntersectionObserver" in window)) return;
    window.__heikoMotionInstalled = true;
    document.documentElement.classList.add("heiko-motion");

    let batch = 0;
    let batchTimer = null;
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const el = entry.target;
            observer.unobserve(el);
            // 同時に画面に入った要素は、少しずつずらして順番に出す
            el.style.setProperty("--reveal-delay", `${Math.min(batch, 8) * 55}ms`);
            batch++;
            clearTimeout(batchTimer);
            batchTimer = setTimeout(() => { batch = 0; }, 120);
            requestAnimationFrame(() => el.classList.add("is-visible"));
            // 出し終わったら専用のクラスを外し、ホバーで浮く動きなど元の見た目に戻す
            setTimeout(() => {
                el.classList.remove("heiko-reveal", "is-visible", "heiko-reveal-done");
                el.style.removeProperty("--reveal-delay");
            }, 1100);
        });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });

    const prepare = root => {
        const nodes = [];
        if (root.matches && root.matches(HEIKO_REVEAL_SELECTOR)) nodes.push(root);
        if (root.querySelectorAll) nodes.push(...root.querySelectorAll(HEIKO_REVEAL_SELECTOR));
        nodes.forEach(el => {
            if (el.dataset.heikoRevealed || el.closest(".sk-wrap")) return;
            el.dataset.heikoRevealed = "1";
            el.classList.add("heiko-reveal");
            observer.observe(el);
        });
    };
    prepare(document.body);
    new MutationObserver(mutations => {
        mutations.forEach(m => m.addedNodes.forEach(node => { if (node.nodeType === 1) prepare(node); }));
    }).observe(document.body, { childList: true, subtree: true });
    // 念のため：何かの理由で画面に入った判定が来なくても、2.5秒後には必ず表示する
    setTimeout(() => document.querySelectorAll(".heiko-reveal:not(.is-visible)").forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.top < innerHeight && r.bottom > 0) el.classList.add("is-visible");
    }), 2500);
}

// ボタンの波紋（押した位置から広がる）
const HEIKO_RIPPLE_SELECTOR = "button:not(.hs-trigger):not(.hamburger-btn):not(.page-help-button):not(.ev-day):not(.chat-back-btn):not(.jm-rec-summary-action), .btn-search, .btn-match, .btn-reload, .heiko-recruit-post, .list-post-button, .usage-intro-button, .usage-guide-primary-link, .jm-kubun-link";
// 他のユーザーのアイコンを element に表示する。画像がない・読み込めないときは、もとの表示（頭文字）のまま
function heikoApplyAvatar(element, source) {
    const value = String(source || "").trim();
    if (!element || !value || value.includes("avatar-default")) return;
    if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+\/=\r\n]+$/i.test(value) && !/^https:\/\//i.test(value)) return;
    const image = document.createElement("img");
    image.className = "heiko-avatar-img";
    image.alt = "";
    image.draggable = false;
    image.addEventListener("load", () => element.classList.add("has-image"));
    image.addEventListener("error", () => image.remove());
    image.src = value;
    element.appendChild(image);
}

function installHeikoPress() {
    if (window.__heikoPressInstalled) return;
    window.__heikoPressInstalled = true;
    document.addEventListener("pointerdown", event => {
        const el = event.target.closest && event.target.closest(HEIKO_RIPPLE_SELECTOR);
        if (!el || el.disabled) return;
        el.classList.add("heiko-press");
        if (HEIKO_REDUCED_MOTION) return;
        const style = getComputedStyle(el);
        if (style.display === "inline" || el.closest(".nav-links")) return;
        el.classList.add("heiko-ripple-host");
        // もともと absolute などで配置しているボタン（パスワードの「表示」や画像の×）の位置は変えない
        if (style.position === "static") el.classList.add("heiko-ripple-static");
        const rect = el.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 2.2;
        const ripple = document.createElement("span");
        ripple.className = "heiko-ripple";
        ripple.setAttribute("aria-hidden", "true");
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
        ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
        el.appendChild(ripple);
        setTimeout(() => ripple.remove(), 650);
    }, { passive: true });
}

// ヘッダー：スクロールしたら影をつける
function installHeikoHeaderShadow() {
    const navbar = document.querySelector(".navbar");
    if (!navbar) return;
    const update = () => navbar.classList.toggle("is-scrolled", window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
}

// ===== 画面左のサイドメニュー：各項目にアイコンを付け、よく使う順に並べる =====
const HEIKO_NAV_ICON_PATHS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
    recruit: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/>',
    messages: '<path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.5-5.6A8.5 8.5 0 1 1 21 12Z"/>',
    events: '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
    ai: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z"/>',
    jm: '<circle cx="12" cy="9" r="6"/><path d="M8.5 13.8 7 22l5-3 5 3-1.5-8.2"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    admin: '<path d="M12 3 4 6v5c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6Z"/><path d="m9 12 2 2 4-4"/>',
    guide: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7"/><path d="M12 17h.01"/>',
    feedback: '<path d="M4 5h16v11H8l-4 4Z"/><path d="M8 9.5h8M8 12.5h5"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'
};
// 並び順：上がよく使うページ、下（区切りのあと）が補助的な項目
const HEIKO_NAV_ORDER = { home: 1, recruit: 2, messages: 3, events: 4, ai: 5, jm: 6, profile: 7, admin: 8, guide: 20, feedback: 21, logout: 22 };

function heikoNavKey(item) {
    const href = item.getAttribute("href") || "";
    if (item.classList.contains("btn-logout")) return "logout";
    if (item.classList.contains("nav-guide-button") || /guide=1/.test(href)) return "guide";
    if (item.classList.contains("nav-external") || href.includes("docs.google.com/forms")) return "feedback";
    if (item.id === "nav-admin-btn" || href.startsWith("admin.html")) return "admin";
    if (item.id === "nav-recruit-link" || href.includes("tab=recruit")) return "recruit";
    if (href.startsWith("main.html") || href === "index.html") return "home";
    if (href.startsWith("messages.html")) return "messages";
    if (href.startsWith("events.html")) return "events";
    if (href.startsWith("ai-study.html")) return "ai";
    if (href.startsWith("junior-meister.html")) return "jm";
    if (href.startsWith("profile.html")) return "profile";
    return "";
}

function heikoNavIcon(key) {
    return `<span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${HEIKO_NAV_ICON_PATHS[key]}</svg></span>`;
}

function installHeikoSideNav() {
    const navbar = document.querySelector(".navbar");
    const links = navbar && navbar.querySelector(".nav-links");
    if (!links || links.dataset.sideNav === "1") return;
    links.dataset.sideNav = "1";
    document.documentElement.classList.add("heiko-side-nav");
    const page = (location.pathname.split("/").pop() || "main.html").toLowerCase();

    links.querySelectorAll(":scope > .nav-item, :scope > .btn-logout").forEach(item => {
        const key = heikoNavKey(item);
        if (!key) return;
        item.dataset.navKey = key;
        item.style.order = String(HEIKO_NAV_ORDER[key] || 10);
        // 文字だけを .nav-label で包む（未読バッジや読み上げ用の文字はそのまま）
        const label = document.createElement("span");
        label.className = "nav-label";
        [...item.childNodes].forEach(node => {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                label.textContent += node.textContent.trim();
                node.remove();
            }
        });
        if (!label.textContent) return;
        if (!item.title) item.title = label.textContent;
        item.insertAdjacentHTML("afterbegin", heikoNavIcon(key));
        item.querySelector(".nav-icon").after(label);
        // ほかのページでは、いま開いているページの項目を強調する
        if (!links.querySelector(".nav-item.active") && key !== "home" && key !== "recruit") {
            const href = (item.getAttribute("href") || "").split("?")[0].toLowerCase();
            if (href && href === page) { item.classList.add("active"); item.setAttribute("aria-current", "page"); }
        }
    });

    // 使い方・意見箱・管理者・ログアウトは別のまとまりにする
    // （横長：サイドメニューの一番下、縦長：上のヘッダー右側の小さなアイコン）
    let secondary = navbar.querySelector(".nav-secondary");
    if (!secondary) {
        secondary = document.createElement("div");
        secondary.className = "nav-secondary";
        secondary.setAttribute("role", "group");
        secondary.setAttribute("aria-label", "その他のメニュー");
        navbar.appendChild(secondary);
    }
    ["admin", "guide", "feedback", "logout"].forEach(key => {
        const item = links.querySelector(`:scope > [data-nav-key="${key}"]`);
        if (item) { item.style.order = ""; secondary.appendChild(item); }
    });

    // 「更新」ボタン（ヘッダーに置かれている場合）もサイドメニューの見た目にそろえる
    const refresh = navbar.querySelector(".heiko-header-actions .heiko-page-refresh");
    if (refresh && !refresh.querySelector(".nav-icon")) {
        refresh.classList.add("is-side-nav");
        refresh.innerHTML = heikoNavIcon("refresh") + '<span class="nav-label">更新</span>';
        refresh.title = "ページを更新";
    }
}

// 数字をなめらかに増減させる（JM計算の合計点など）
function heikoCountUp(el, to, duration = 600) {
    if (!el) return;
    const target = Number(to) || 0;
    const from = Number(el.dataset.countValue ?? el.textContent) || 0;
    el.dataset.countValue = String(target);
    if (HEIKO_REDUCED_MOTION || from === target) { el.textContent = String(target); return; }
    const start = performance.now();
    const step = now => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = String(Math.round(from + (target - from) * eased));
        if (t < 1) requestAnimationFrame(step);
        else { el.classList.remove("heiko-bump"); void el.offsetWidth; el.classList.add("heiko-bump"); }
    };
    requestAnimationFrame(step);
}
window.heikoCountUp = heikoCountUp;

// スケルトンスクリーンのHTMLを作る（読み込み中だけ表示し、データが届いたら差し替える）
const heikoSkeleton = {
    wrap(inner, label = "読み込み中") {
        return `<div class="sk-wrap" role="status" aria-live="polite" aria-label="${label}">${inner}</div>`;
    },
    // 募集カードの形
    cards(count = 3) {
        return this.wrap(Array.from({ length: count }, () => `
            <div class="sk-card" aria-hidden="true">
                <div class="sk-card-head"><span class="sk sk-pill"></span><span class="sk sk-pill"></span></div>
                <span class="sk sk-title"></span>
                <span class="sk sk-line w90"></span><span class="sk sk-line w70"></span>
                <span class="sk sk-button"></span>
            </div>`).join(""));
    },
    // アイコン＋2行の一覧（メッセージ一覧など）
    list(count = 4) {
        return this.wrap(Array.from({ length: count }, () => `
            <div class="sk-list-item" aria-hidden="true">
                <span class="sk sk-circle"></span>
                <div class="sk-list-text"><span class="sk sk-line w30"></span><span class="sk sk-line w70"></span></div>
            </div>`).join(""));
    },
    // テキスト行だけ
    lines(count = 3) {
        const widths = ["w90", "w70", "w50"];
        return this.wrap(Array.from({ length: count }, (_, i) => `<span class="sk sk-line ${widths[i % widths.length]}" aria-hidden="true"></span>`).join(""));
    },
    // チャットの吹き出し
    chat(count = 4) {
        return this.wrap(Array.from({ length: count }, (_, i) => `<span class="sk sk-bubble ${i % 2 ? "right" : "left"}" aria-hidden="true"></span>`).join(""), "メッセージを読み込み中");
    },
    // 表の行（tbody に入れる）
    rows(count, columns) {
        return Array.from({ length: count }, (_, r) => `<tr class="sk-row" aria-hidden="true">${Array.from({ length: columns }, (_, c) => `<td><span class="sk sk-line ${["w70", "w90", "w50"][(r + c) % 3]}"></span></td>`).join("")}</tr>`).join("");
    }
};
window.heikoSkeleton = heikoSkeleton;

// サイドバーのプロフィールカードに「学年・学科」を出す（未設定なら設定を促す）
function updateMypageSub() {
    const el = document.getElementById("mypage-sub");
    if (!el) return;
    const grade = localStorage.getItem("userGrade") || "";
    const dept = localStorage.getItem("userDept") || "";
    el.textContent = grade || dept ? [grade, dept].filter(Boolean).join(" ・ ") : "学年・学科を設定する";
}
window.updateMypageSub = updateMypageSub;

// HTMLに data-skeleton="cards|list|lines|chat|rows" を書いた場所へ、最初のスケルトンを入れる
function fillSkeletonPlaceholders() {
    document.querySelectorAll("[data-skeleton]").forEach(el => {
        const type = el.dataset.skeleton;
        const count = Number(el.dataset.count) || 3;
        if (typeof heikoSkeleton[type] !== "function") return;
        el.innerHTML = type === "rows" ? heikoSkeleton.rows(count, Number(el.dataset.columns) || 3) : heikoSkeleton[type](count);
        el.removeAttribute("data-skeleton");
    });
}

// ページ見出しの「？」ボタン：押すと説明を開き、外側を押すか Esc で閉じる
function installPageHelp() {
    if (window.__heikoPageHelpInstalled) return;
    window.__heikoPageHelpInstalled = true;
    const closeAll = except => {
        document.querySelectorAll(".page-help-button[aria-expanded=\"true\"]").forEach(button => {
            if (button === except) return;
            button.setAttribute("aria-expanded", "false");
            const pop = document.getElementById(button.getAttribute("aria-controls"));
            if (pop) pop.hidden = true;
        });
    };
    document.addEventListener("click", event => {
        const button = event.target.closest && event.target.closest(".page-help-button");
        if (button) {
            const pop = document.getElementById(button.getAttribute("aria-controls"));
            const open = button.getAttribute("aria-expanded") !== "true";
            closeAll(button);
            button.setAttribute("aria-expanded", String(open));
            if (pop) pop.hidden = !open;
            return;
        }
        if (!(event.target.closest && event.target.closest(".page-help-pop"))) closeAll(null);
    });
    document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;
        const openButton = document.querySelector(".page-help-button[aria-expanded=\"true\"]");
        if (!openButton) return;
        closeAll(null);
        openButton.focus();
    });
}

function installMenuButtonAccessibility() {
    const button = document.getElementById("hud-menu-btn");
    if (!button || button.dataset.ariaSync === "1") return;
    button.dataset.ariaSync = "1";
    const sync = () => {
        const open = button.classList.contains("open");
        button.setAttribute("aria-expanded", open ? "true" : "false");
        button.setAttribute("aria-label", open ? "メニューを閉じる" : "メニューを開く");
    };
    new MutationObserver(sync).observe(button, { attributes: true, attributeFilter: ["class"] });
    sync();
}

document.addEventListener("DOMContentLoaded", () => {
    installHeikoDropdown();
    fillSkeletonPlaceholders();
    updateMypageSub();
    installHeikoMotion();
    installHeikoPress();
    installHeikoHeaderShadow();
    if (document.body && document.body.dataset.page === "index" && isHeikoAuthSessionActive()) {
        window.location.replace("main.html");
        return;
    }
    const selector = document.getElementById("theme-preference");
    if (selector) selector.value = readThemePreference();
    installHeikoSharedStyles();
    installMenuButtonAccessibility();
    installPageHelp();
    installPageRefreshButton();
    installRecruitmentPostButton();
    installHeikoSideNav();
    installHeikoPwaSupport();
    installHeikoFooterNavigation();
    installHeikoNotify();
    if (document.body && document.body.dataset.page === "main") {
        if ("requestIdleCallback" in window) {
            window.requestIdleCallback(prefetchHeikoPages, { timeout: 3000 });
        } else {
            window.setTimeout(prefetchHeikoPages, 1800);
        }
    }
});

(function () {
    function getNoticeType(message) {
        const text = String(message || "");
        if (/失敗|エラー|通信|不足|見つかりません|入力してください|必要です|無効|権限|間違|ありません/.test(text)) {
            return "error";
        }
        if (/完了|保存|削除|受け付け|成功|送りました|しました|更新/.test(text)) {
            return "success";
        }
        return "info";
    }

    function getRoot() {
        let root = document.getElementById("ui-notice-root");
        if (!root) {
            root = document.createElement("div");
            root.id = "ui-notice-root";
            root.setAttribute("aria-live", "polite");
            root.setAttribute("aria-atomic", "true");
            document.body.appendChild(root);
        }
        return root;
    }

    function showNotice(message, type) {
        const root = getRoot();
        const notice = document.createElement("div");
        const noticeType = type || getNoticeType(message);
        const icon = noticeType === "success" ? "✓" : noticeType === "error" ? "!" : "i";

        notice.className = `ui-notice ui-notice-${noticeType}`;
        notice.setAttribute("role", noticeType === "error" ? "alert" : "status");
        notice.innerHTML = `
            <span class="ui-notice-icon">${icon}</span>
            <span class="ui-notice-message"></span>
            <button type="button" class="ui-notice-close" aria-label="通知を閉じる">×</button>
        `;
        notice.querySelector(".ui-notice-message").textContent = String(message || "");
        notice.querySelector(".ui-notice-close").addEventListener("click", () => removeNotice(notice));
        root.appendChild(notice);

        requestAnimationFrame(() => notice.classList.add("is-visible"));
        const duration = noticeType === "error" ? 5200 : 3600;
        let timer = setTimeout(() => removeNotice(notice), duration);
        notice.addEventListener("mouseenter", () => clearTimeout(timer));
        notice.addEventListener("mouseleave", () => {
            timer = setTimeout(() => removeNotice(notice), duration);
        });
    }

    function removeNotice(notice) {
        if (!notice || notice.classList.contains("is-leaving")) return;
        notice.classList.remove("is-visible");
        notice.classList.add("is-leaving");
        setTimeout(() => notice.remove(), 220);
    }

    window.showNotice = showNotice;
    window.alert = message => showNotice(message);
})();
