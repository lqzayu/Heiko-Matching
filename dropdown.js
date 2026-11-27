// ===== アプリ独自のプルダウン（全ページ共通。ui.js から読み込む） =====
// ブラウザやOSで見た目が変わらないように、<select> の一覧を自分で描く。
// 元の <select> は画面から見えない形で残して値を持たせるので、各ページは今まで通り
// select.value の読み書き・選択肢の入れ替え・change イベントがそのまま使える。
// 置き換えたくない欄には data-no-custom を付ける。
(function () {
    "use strict";
    if (window.HeikoDropdown) return;

    const SEARCH_FROM = 12;   // 選択肢がこの数以上なら、一覧の上に絞り込み欄を出す
    const nativeValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
    const nativeIndex = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "selectedIndex");
    const isTouch = () => window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    let serial = 0;
    let open = null;          // 開いている一覧 { item, panel, list, search, rows, active }

    // ラベルの文字（欄を包んでいる <label> は、中の選択肢の文字を除いて取り出す）
    function labelText(select, wrapper) {
        const aria = select.getAttribute("aria-label");
        if (aria) return aria;
        const label = (select.id && document.querySelector(`label[for="${CSS.escape(select.id)}"]`)) || wrapper.closest("label");
        if (!label) return "";
        const copy = label.cloneNode(true);
        copy.querySelectorAll(".hs, select, input, textarea").forEach(element => element.remove());
        return copy.textContent.trim();
    }

    function enhance(select) {
        if (select.heikoTrigger || select.multiple || select.size > 1 || select.hasAttribute("data-no-custom")) return;
        const wrapper = document.createElement("span");
        wrapper.className = "hs";
        ["marginTop", "marginRight", "marginBottom", "marginLeft"].forEach(side => { wrapper.style[side] = select.style[side]; });
        const trigger = document.createElement("button");
        trigger.type = "button";
        trigger.className = "hs-trigger";
        trigger.id = `hs-trigger-${++serial}`;
        trigger.setAttribute("role", "combobox");
        trigger.setAttribute("aria-haspopup", "listbox");
        trigger.setAttribute("aria-expanded", "false");
        trigger.setAttribute("data-no-busy", "");
        const text = document.createElement("span");
        text.className = "hs-value";
        trigger.appendChild(text);
        select.parentNode.insertBefore(wrapper, select);
        wrapper.append(trigger, select);
        select.classList.add("hs-native");
        select.tabIndex = -1;
        select.setAttribute("aria-hidden", "true");
        const item = { select, wrapper, trigger, text };
        select.heikoTrigger = trigger;

        const sync = () => {
            const option = select.options[nativeIndex.get.call(select)];
            const label = option ? option.textContent.trim() : "";
            if (text.textContent !== label) text.textContent = label || "選んでください";
            trigger.classList.toggle("is-placeholder", !option || option.value === "");
            trigger.disabled = select.disabled;
            wrapper.hidden = select.hidden || select.style.display === "none";
            const invalid = select.getAttribute("aria-invalid");
            if (invalid) trigger.setAttribute("aria-invalid", invalid); else trigger.removeAttribute("aria-invalid");
            const name = labelText(select, wrapper);
            trigger.setAttribute("aria-label", name ? `${name}：${text.textContent}` : text.textContent);
            if (select.title) trigger.title = select.title;
        };
        item.sync = sync;

        // コードから値を変えたときは change が起きないので、表示だけを合わせる
        [["value", nativeValue], ["selectedIndex", nativeIndex]].forEach(([key, descriptor]) => {
            Object.defineProperty(select, key, {
                configurable: true,
                get() { return descriptor.get.call(this); },
                set(next) { descriptor.set.call(this, next); sync(); }
            });
        });
        new MutationObserver(() => {
            sync();
            if (open && open.item === item) renderRows(open.search ? open.search.value : "");
        }).observe(select, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["disabled", "hidden", "style", "aria-invalid", "selected", "label"] });
        select.addEventListener("change", () => { wrapper.classList.remove("has-error"); sync(); });
        // ページ側が select.focus() したときや、ラベルを押したときは、見えているボタンに移す
        select.addEventListener("focus", () => trigger.focus());
        // 必須の欄が空のまま送信されたときは、ブラウザの吹き出しの代わりに欄の下へ出す
        select.addEventListener("invalid", event => {
            event.preventDefault();
            wrapper.classList.add("has-error");
            const form = select.form;
            if (!form || form.querySelector(":invalid") === select) trigger.focus();
        });

        trigger.addEventListener("click", () => (open && open.item === item ? close() : show(item)));
        trigger.addEventListener("keydown", event => onKey(event, item));
        trigger.addEventListener("keyup", event => { if (event.key === " ") event.preventDefault(); });
        sync();
    }

    // ---------- 一覧 ----------
    function show(item) {
        close();
        if (item.trigger.disabled) return;
        const panel = document.createElement("div");
        panel.className = "hs-panel";
        const count = item.select.options.length;
        let search = null;
        if (count >= SEARCH_FROM) {
            search = document.createElement("input");
            search.type = "text";
            search.className = "hs-search";
            search.placeholder = "候補を絞り込む";
            search.autocomplete = "off";
            search.setAttribute("aria-label", "候補を絞り込む");
            search.addEventListener("input", () => { renderRows(search.value); place(); });
            // 絞り込み欄の入力で、ページ側の input / change の処理が動かないようにする
            ["input", "change"].forEach(type => panel.addEventListener(type, event => event.stopPropagation()));
            search.addEventListener("keydown", event => onKey(event, item));
            panel.appendChild(search);
        }
        const list = document.createElement("div");
        list.className = "hs-list";
        list.id = `${item.trigger.id}-list`;
        list.setAttribute("role", "listbox");
        panel.appendChild(list);
        // ダイアログの中の欄は、ダイアログの中に出さないと押せない
        (item.trigger.closest("dialog") || document.body).appendChild(panel);
        if (typeof panel.showPopover === "function") {
            panel.setAttribute("popover", "manual");
            panel.showPopover();
        }
        open = { item, panel, list, search, rows: [], active: -1 };
        item.trigger.setAttribute("aria-expanded", "true");
        item.trigger.setAttribute("aria-controls", list.id);
        item.wrapper.classList.add("is-open");
        renderRows("");
        place();
        panel.classList.add("is-in");
        setActive(open.rows.findIndex(row => row.index === nativeIndex.get.call(item.select)), true);
        // スマホではキーボードが一覧を隠すので、絞り込み欄は押されるまで選ばない
        if (search && !isTouch()) search.focus({ preventScroll: true });
        else item.trigger.focus({ preventScroll: true });
    }

    function renderRows(query) {
        if (!open) return;
        const { select } = open.item;
        const words = String(query || "").trim().toLowerCase();
        const selected = nativeIndex.get.call(select);
        open.list.textContent = "";
        open.rows = [];
        let group = null;
        Array.from(select.options).forEach((option, index) => {
            if (option.hidden || (words && !option.textContent.toLowerCase().includes(words))) return;
            const parent = option.parentElement.tagName === "OPTGROUP" ? option.parentElement : null;
            if (parent && parent !== group) {
                const heading = document.createElement("div");
                heading.className = "hs-group";
                heading.textContent = parent.label;
                open.list.appendChild(heading);
            }
            group = parent;
            const element = document.createElement("div");
            element.className = "hs-option";
            element.id = `${open.list.id}-${index}`;
            element.setAttribute("role", "option");
            element.setAttribute("aria-selected", String(index === selected));
            element.textContent = option.textContent.trim();
            const disabled = option.disabled || Boolean(parent && parent.disabled);
            if (disabled) element.setAttribute("aria-disabled", "true");
            const row = { element, index, disabled };
            element.addEventListener("click", () => choose(row));
            element.addEventListener("pointermove", () => setActive(open.rows.indexOf(row), false));
            // 一覧を押しても、キー操作中の欄からフォーカスを移さない
            element.addEventListener("mousedown", event => event.preventDefault());
            open.list.appendChild(element);
            open.rows.push(row);
        });
        if (!open.rows.length) {
            const empty = document.createElement("div");
            empty.className = "hs-empty";
            empty.textContent = "当てはまる項目がありません";
            open.list.appendChild(empty);
        }
        open.active = -1;
        if (words) setActive(open.rows.findIndex(row => !row.disabled), true);
    }

    function setActive(position, scroll) {
        if (!open) return;
        const focusTarget = open.search && document.activeElement === open.search ? open.search : open.item.trigger;
        open.rows.forEach((row, index) => row.element.classList.toggle("is-active", index === position));
        open.active = position;
        const row = open.rows[position];
        if (!row) { focusTarget.removeAttribute("aria-activedescendant"); return; }
        focusTarget.setAttribute("aria-activedescendant", row.element.id);
        if (!scroll) return;
        // ページは動かさず、一覧の中だけをスクロールする
        const top = row.element.offsetTop, bottom = top + row.element.offsetHeight;
        if (top < open.list.scrollTop) open.list.scrollTop = top - 4;
        else if (bottom > open.list.scrollTop + open.list.clientHeight) open.list.scrollTop = bottom - open.list.clientHeight + 4;
    }

    function move(step, from) {
        if (!open || !open.rows.length) return;
        let position = from === undefined ? open.active : from;
        for (let i = 0; i < open.rows.length; i++) {
            position = Math.max(0, Math.min(open.rows.length - 1, position + step));
            if (!open.rows[position].disabled) { setActive(position, true); return; }
        }
    }

    function commit(item, index) {
        if (index === nativeIndex.get.call(item.select)) return;
        item.select.selectedIndex = index;
        item.select.dispatchEvent(new Event("input", { bubbles: true }));
        item.select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function choose(row) {
        if (!open || !row || row.disabled) return;
        const item = open.item;
        close();
        item.trigger.focus({ preventScroll: true });
        commit(item, row.index);
    }

    function close() {
        if (!open) return;
        const { item, panel } = open;
        open = null;
        item.trigger.setAttribute("aria-expanded", "false");
        item.trigger.removeAttribute("aria-activedescendant");
        item.wrapper.classList.remove("is-open");
        panel.remove();
    }

    function onKey(event, item) {
        const key = event.key;
        if (event.isComposing) return;
        if (!open || open.item !== item) {
            if (["ArrowDown", "ArrowUp", "Enter", " "].includes(key)) { event.preventDefault(); show(item); }
            return;
        }
        const inSearch = event.target === open.search;
        if (key === "ArrowDown") { event.preventDefault(); move(1); }
        else if (key === "ArrowUp") { event.preventDefault(); move(-1); }
        else if (key === "PageDown") { event.preventDefault(); move(1, Math.min(open.rows.length - 1, open.active + 7)); }
        else if (key === "PageUp") { event.preventDefault(); move(-1, Math.max(0, open.active - 7)); }
        else if (key === "Home" && !inSearch) { event.preventDefault(); move(1, -1); }
        else if (key === "End" && !inSearch) { event.preventDefault(); move(-1, open.rows.length); }
        else if (key === "Enter" || (key === " " && !inSearch)) { event.preventDefault(); choose(open.rows[open.active]); }
        else if (key === "Escape") {
            // 一覧だけを閉じ、後ろのダイアログは閉じない
            event.preventDefault();
            event.stopPropagation();
            close();
            item.trigger.focus();
        } else if (key === "Tab") {
            close();
            item.trigger.focus();
        } else if (!inSearch && key.length === 1 && !event.ctrlKey && !event.metaKey) {
            // 文字を打つと、その文字で始まる次の項目へ移る
            const letter = key.toLowerCase();
            const order = open.rows.map((row, index) => (open.active + 1 + index) % open.rows.length);
            const found = order.find(position => !open.rows[position].disabled && open.rows[position].element.textContent.toLowerCase().startsWith(letter));
            if (found !== undefined) setActive(found, true);
        }
    }

    // ボタンの下に出し、場所が足りなければ上に出す。画面下のタブバーには重ねない
    function place() {
        if (!open) return;
        const { item, panel, list } = open;
        if (!item.trigger.isConnected) return close();
        const rect = item.trigger.getBoundingClientRect();
        const viewport = window.visualViewport;
        const viewTop = viewport ? viewport.offsetTop : 0;
        const viewHeight = viewport ? viewport.height : window.innerHeight;
        const viewWidth = document.documentElement.clientWidth;
        // 絞り込み中はキーボードで欄が隠れることがあるので閉じずに、一覧を画面の中に収める
        const typing = Boolean(open.search) && document.activeElement === open.search;
        if (rect.width === 0 || (!typing && (rect.bottom < viewTop || rect.top > viewTop + viewHeight))) return close();
        let viewBottom = viewTop + viewHeight;
        const tabs = document.querySelector(".navbar .nav-links");
        if (tabs && getComputedStyle(tabs).position === "fixed" && !item.trigger.closest("dialog")) {
            const bar = tabs.getBoundingClientRect();
            if (bar.width >= viewWidth - 2 && bar.height < 120 && bar.top > viewHeight / 2) viewBottom = Math.min(viewBottom, bar.top);
        }
        const gap = 6, edge = 8;
        const width = Math.min(Math.max(rect.width, 220), viewWidth - edge * 2);
        panel.style.width = `${width}px`;
        panel.style.left = `${Math.max(edge, Math.min(rect.left, viewWidth - width - edge))}px`;
        const below = viewBottom - rect.bottom - gap - edge;
        const above = Math.min(rect.top, viewBottom) - viewTop - gap - edge;
        const extra = open.search ? open.search.offsetHeight + 6 : 0;
        const wanted = Math.min(list.scrollHeight + extra + 14, 340);
        const upward = below < wanted && above > below;
        const height = Math.max(120, Math.min(wanted, upward ? above : below));
        panel.style.maxHeight = `${height}px`;
        panel.classList.toggle("is-upward", upward);
        const shownHeight = Math.min(panel.offsetHeight, height);
        const top = upward ? Math.min(rect.top, viewBottom) - gap - shownHeight : rect.bottom + gap;
        panel.style.top = `${Math.max(viewTop + edge, Math.min(top, viewBottom - shownHeight - edge))}px`;
    }

    document.addEventListener("pointerdown", event => {
        if (open && !open.panel.contains(event.target) && !open.item.wrapper.contains(event.target)) close();
    }, true);
    document.addEventListener("focusin", event => {
        if (open && !open.panel.contains(event.target) && !open.item.wrapper.contains(event.target)) close();
    });
    document.addEventListener("scroll", event => { if (open && !open.panel.contains(event.target)) place(); }, true);
    window.addEventListener("resize", () => place());
    if (window.visualViewport) window.visualViewport.addEventListener("resize", () => place());
    window.addEventListener("pagehide", close);
    // form.reset() は値を戻すだけで change が起きないので、戻ったあとに表示を合わせる
    document.addEventListener("reset", event => setTimeout(() => {
        event.target.querySelectorAll("select.hs-native").forEach(select => { select.value = nativeValue.get.call(select); });
    }, 0), true);

    function enhanceAll(root) {
        if (root.matches && root.matches("select")) enhance(root);
        if (root.querySelectorAll) root.querySelectorAll("select").forEach(enhance);
    }
    enhanceAll(document.body);
    new MutationObserver(mutations => {
        mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1 && !node.classList.contains("hs") && !node.classList.contains("hs-panel")) enhanceAll(node);
        }));
        if (open && !open.item.trigger.isConnected) close();
    }).observe(document.body, { childList: true, subtree: true });

    window.HeikoDropdown = { close };
})();
