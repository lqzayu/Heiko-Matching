// ===== はじめての人向けのチュートリアル（ホーム画面） =====
// 実際の画面の部品を光らせ、吹き出しと矢印で説明する。「次へ」「戻る」「スキップ」で進める。
// ログイン後に初めてホームを開いたときだけ自動で出す（ユーザーごとに記録）。使い方の画面からもう一度見られる。
(function () {
    const DONE_KEY = () => "heiko-tour-done:" + (localStorage.getItem("userId") || "guest");
    const isTabBar = () => window.matchMedia("not all and (min-width:769px) and (min-aspect-ratio:1/1)").matches;
    const nav = key => document.querySelector(`.navbar [data-nav-key="${key}"]`);
    const visible = el => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";

    const STEPS = [
        { title: "平工マッチングへようこそ！", body: "いっしょに勉強する仲間を探せるサービスです。主な使い方を1分で紹介します。" },
        { target: () => nav("home"), title: "仲間を探す", body: "ほかの人の「募集」が一覧で見られます。気になる募集があれば、カードから話しかけられます。" },
        { target: () => document.getElementById("search-input"), title: "キーワードで絞り込む", body: "教科やタグ（例：数学、1年）を入れると、合う募集だけが表示されます。" },
        { target: () => nav("recruit"), title: "自分で募集を出す", body: "「こんな人と勉強したい」を投稿すると、ほかの人から声がかかります。" },
        { target: () => nav("messages"), title: "メッセージ", body: "やり取りはここにまとまります。新しいメッセージが届くと数字が出ます。" },
        { target: () => nav("events"), title: "学校行事", body: "テストや行事の予定をカレンダーで確認できます。ホーム画面にも、これから1か月の行事が表示されます。" },
        { target: () => nav("ai"), title: "AI学習相談", body: "教科や困っていることを伝えると、AIがあなたに合った勉強方法を提案します。" },
        { target: () => nav("jm"), title: "JM計算", body: "持っている資格を選ぶと、ジュニアマイスターの点数と、次のランクに必要なおすすめの資格がわかります。" },
        { target: () => nav("profile"), title: "まずはマイページへ", body: "学年・学科とプロフィール画像を設定しましょう。募集を出すときに学年・学科が使われます。" },
        { target: () => nav("feedback"), title: "意見箱", body: "使いにくいところや欲しい機能、エラーが起きたときは、ここから気軽に教えてください。Googleフォームが開きます。" },
        { target: () => nav("guide"), title: "困ったときは", body: "「使い方」からいつでも説明を見られます。このチュートリアルもそこからもう一度見られます。" }
    ];

    let index = 0, root, spot, pop, arrow, current;

    function build() {
        root = document.createElement("div");
        root.className = "heiko-tour";
        root.innerHTML = `
            <div class="heiko-tour-spot"></div>
            <div class="heiko-tour-pop" role="dialog" aria-modal="true" aria-labelledby="heiko-tour-title">
                <div class="heiko-tour-arrow"></div>
                <p class="heiko-tour-count"></p>
                <h3 id="heiko-tour-title"></h3>
                <p class="heiko-tour-body"></p>
                <div class="heiko-tour-actions">
                    <button type="button" class="heiko-tour-skip">スキップ</button>
                    <span class="heiko-tour-spacer"></span>
                    <button type="button" class="heiko-tour-back">戻る</button>
                    <button type="button" class="heiko-tour-next">次へ</button>
                </div>
            </div>`;
        document.body.appendChild(root);
        spot = root.querySelector(".heiko-tour-spot");
        pop = root.querySelector(".heiko-tour-pop");
        arrow = root.querySelector(".heiko-tour-arrow");
        root.querySelector(".heiko-tour-skip").onclick = () => finish();
        root.querySelector(".heiko-tour-back").onclick = () => go(index - 1);
        root.querySelector(".heiko-tour-next").onclick = () => (index >= steps().length - 1 ? finish() : go(index + 1));
        document.addEventListener("keydown", onKey);
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, { passive: true });
    }

    // 画面にない部品（狭い画面で隠れている等）の手順は飛ばす
    function steps() { return STEPS.filter(step => !step.target || visible(step.target())); }

    function onKey(event) {
        if (!root) return;
        if (event.key === "Escape") finish();
        if (event.key === "ArrowRight" || event.key === "Enter") { event.preventDefault(); root.querySelector(".heiko-tour-next").click(); }
        if (event.key === "ArrowLeft" && index > 0) go(index - 1);
    }

    function go(next) {
        const list = steps();
        index = Math.max(0, Math.min(next, list.length - 1));
        const step = list[index];
        current = step.target ? step.target() : null;
        root.querySelector(".heiko-tour-count").textContent = `${index + 1} / ${list.length}`;
        root.querySelector("#heiko-tour-title").textContent = step.title;
        root.querySelector(".heiko-tour-body").textContent = step.body;
        root.querySelector(".heiko-tour-back").hidden = index === 0;
        root.querySelector(".heiko-tour-next").textContent = index === list.length - 1 ? "はじめる" : "次へ";
        if (current) current.scrollIntoView({ block: "nearest", behavior: "smooth" });
        pop.classList.remove("is-in"); void pop.offsetWidth; pop.classList.add("is-in");
        place();
        setTimeout(place, 350);
        root.querySelector(".heiko-tour-next").focus({ preventScroll: true });
    }

    function place() {
        if (!root) return;
        const vw = window.innerWidth, vh = window.innerHeight, gap = 14, pad = 8;
        const pw = Math.min(340, vw - 32);
        pop.style.width = pw + "px";
        if (!current) {
            spot.style.cssText = `left:${vw / 2}px; top:${vh / 2}px; width:0; height:0;`;
            pop.style.left = (vw - pw) / 2 + "px";
            pop.style.top = Math.max(16, (vh - pop.offsetHeight) / 2) + "px";
            arrow.hidden = true;
            return;
        }
        const r = current.getBoundingClientRect();
        spot.style.cssText = `left:${r.left - pad}px; top:${r.top - pad}px; width:${r.width + pad * 2}px; height:${r.height + pad * 2}px;`;
        const ph = pop.offsetHeight;
        // 置き場所：右 → 下 → 上 の順に、収まるところ
        let side, left, top;
        if (r.right + pad + gap + pw <= vw - 12 && !isTabBar()) { side = "right"; left = r.right + pad + gap; top = r.top + r.height / 2 - ph / 2; }
        else if (r.bottom + pad + gap + ph <= vh - 12) { side = "bottom"; top = r.bottom + pad + gap; left = r.left + r.width / 2 - pw / 2; }
        else { side = "top"; top = r.top - pad - gap - ph; left = r.left + r.width / 2 - pw / 2; }
        left = Math.max(12, Math.min(left, vw - pw - 12));
        top = Math.max(12, Math.min(top, vh - ph - 12));
        pop.style.left = left + "px";
        pop.style.top = top + "px";
        arrow.hidden = false;
        arrow.dataset.side = side;
        if (side === "right") { arrow.style.left = "-8px"; arrow.style.top = Math.max(16, Math.min(r.top + r.height / 2 - top - 8, ph - 32)) + "px"; }
        else { arrow.style.top = side === "bottom" ? "-8px" : (ph - 8) + "px"; arrow.style.left = Math.max(16, Math.min(r.left + r.width / 2 - left - 8, pw - 32)) + "px"; }
    }

    function finish() {
        try { localStorage.setItem(DONE_KEY(), "1"); } catch (error) { /* 保存できなくても閉じる */ }
        document.removeEventListener("keydown", onKey);
        window.removeEventListener("resize", place);
        window.removeEventListener("scroll", place);
        if (root) { root.classList.add("is-out"); const el = root; setTimeout(() => el.remove(), 250); }
        root = null;
    }

    window.startHeikoTour = function () {
        if (root) return;
        if (typeof window.closeUsageGuide === "function") { try { window.closeUsageGuide(); } catch (error) { /* 開いていなければ何もしない */ } }
        build();
        go(0);
    };

    document.addEventListener("DOMContentLoaded", () => {
        if (!document.body || document.body.dataset.page !== "main" || !localStorage.getItem("sessionToken")) return;
        let done = false;
        try { done = localStorage.getItem(DONE_KEY()) === "1"; } catch (error) { done = true; }
        if (done || new URLSearchParams(location.search).has("guide")) return;
        setTimeout(window.startHeikoTour, 900); // メニューのアイコンなどが整ってから出す
    });
})();
