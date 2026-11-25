# ダークテーマ改善 指示文（Web版のみ）

## 0. 前提と制約

対象フォルダ: `/Users/ren/Documents/VSCode/VSCode`（Web版のみ）

**やらないこと**
- iOS版・Android版のファイルは一切触らない
- `git push` / GitHub Pages へのデプロイはしない
- Firebase コンソール、スプレッドシート、GAS の設定変更はしない
- 無関係なファイルの整形・リネームはしない

**作業前に必ず**
```bash
cd /Users/ren/Documents/VSCode/VSCode
git status --short
git diff --stat
git switch -c dark-theme-fix     # 作業ブランチを切る
```
未コミットの変更が残っていたら、**先に報告して指示を待つこと**。既存の作業を上書きしない。

各作業ごとに1コミットにする。まとめて1コミットにしない（戻しやすくするため）。

---

## 1. なぜ直すのか（2つの構造的な原因）

### 原因A: `--ui-green` がテーマで明るさが反転する

`theme.css` のトークン定義:

| トークン | ライト | ダーク |
|---|---|---|
| `--ui-green` | `#254f3d`（**暗い**緑） | `#7dd3fc`（**明るい**水色） |
| `--ui-paper` | `#fffefb`（明るい） | `#1b2433`（暗い） |

つまり `--ui-green` は「背景にしたとき文字を白にすべき色」から「文字を黒にすべき色」へ**明暗が逆転する**。

だから次の2つは結果がまったく違う:

```css
background: var(--ui-green); color: #fff;          /* ライト 9.27:1 → ダーク 1.67:1 ✗ */
background: var(--ui-green); color: var(--ui-paper); /* ライト 9.27:1 → ダーク 9.35:1 ✓ */
```

**ルール: `--ui-green` を背景に使うときは、文字色に `#fff` を直接書かず必ず `var(--ui-paper)` を使う。**

（WCAG AA の基準は通常の文字で 4.5:1。1.67:1 はほぼ読めない。数値は実測値）

### 原因B: ダークの指定方法が2系統あり、片方にガードが無い

`ui.js:15-31` の `applyThemePreference()` は、設定が「自動」のとき `data-theme` 属性を**削除する**。
そのため CSS は次の2つを両方書く必要があり、実際ほぼ全部が二重に書かれている。

```css
html[data-theme="dark"] .foo { ... }                              /* 明示的にダークを選んだ人 */
@media (prefers-color-scheme: dark) {
  html:not([data-theme="light"]) .foo { ... }                     /* 自動の人 */
}
```

**`theme.css:767-786` のブロックだけ、この `html:not([data-theme="light"])` ガードが抜けている。**
中身は `.btn-attach` `.error` `.success` `.impersonate-bar` `.message-bubble.is-unsent` など15ルール。

実測した不具合（ブラウザで検証済み）:

| 状況 | 起きること | コントラスト |
|---|---|---|
| OSがダーク＋アプリで「ライト」を選択 | 明るい背景にダーク用の文字色が残る。成功メッセージ `#8fe3b0` | **1.51:1**（ほぼ不可視） |
| 〃 | エラーメッセージ `#ff9d9d` | **1.97:1** |
| OSがライト＋アプリで「ダーク」を選択 | `.impersonate-bar`（代理ログイン警告バー）の**背景が消える** | — |
| 〃 | エラーメッセージ `#ef4444` | 4.14:1（基準未満） |

代理ログイン中の警告バーが目立たなくなるのは、見た目だけでなく安全面の問題。

---

## 2. 作業1: `data-theme` を常に解決した値にする（これが土台）

### 目的
「自動」のときも `data-theme="light"` / `"dark"` のどちらかを必ず入れる。
こうすると CSS は `html[data-theme="dark"]` だけを見ればよくなり、二重管理と原因Bが同時に消える。

### なぜ安全か
`ui.js` は全ページで `<head>` 内に `defer` なしの同期スクリプトとして読まれており、
`applyThemePreference()` は本文の描画前に実行される。したがって**一瞬ライトが見えるちらつき（FOUC）は起きない**。
（確認済み: index.html:933, main.html:1364, ai-study.html:16, events.html:16, chat.html:559 — すべて `</head>` より前）

### 変更内容: `ui.js` の冒頭（1〜34行目あたり）

```js
const THEME_STORAGE_KEY = "heikoThemePreference";

// OSの配色設定を見るための仕組み。古い端末では使えないことがあるので存在を確認する
const darkMediaQuery = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

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

// 「自動」を、実際に使う色（light か dark）に変換する
function resolveTheme(preference) {
    if (preference === "light" || preference === "dark") return preference;
    return darkMediaQuery && darkMediaQuery.matches ? "dark" : "light";
}

function applyThemePreference(value, save = true) {
    const preference = normalizeThemePreference(value);

    // 「自動」でも必ず light / dark のどちらかを入れる。
    // これでCSS側は html[data-theme="dark"] だけを見ればよくなる
    document.documentElement.setAttribute("data-theme", resolveTheme(preference));

    // 利用者が選んだ設定そのもの（auto を含む）は別の属性に持っておく
    document.documentElement.setAttribute("data-theme-preference", preference);

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

// 「自動」を選んでいる間だけ、OS側の設定変更に追従する
if (darkMediaQuery) {
    const onSchemeChange = () => {
        if (readThemePreference() === "auto") applyThemePreference("auto", false);
    };
    if (typeof darkMediaQuery.addEventListener === "function") {
        darkMediaQuery.addEventListener("change", onSchemeChange);
    } else if (typeof darkMediaQuery.addListener === "function") {
        darkMediaQuery.addListener(onSchemeChange);   // 古いSafari向け
    }
}

window.applyThemePreference = applyThemePreference;
window.getThemePreference = readThemePreference;
```

### この変更で壊れる可能性があるもの（必ず確認する）

`data-theme` 属性を「利用者の選択」として読んでいるコードがあると、
これまで `null`（＝自動）だった場所に `"light"` が入るようになり、判定がずれる。

```bash
grep -rn "data-theme" --include=*.html --include=*.js . | grep -v node_modules | grep -v theme.css
```

ヒットした箇所をすべて確認し、「選択値が欲しい」場所は `readThemePreference()` か
新しい `data-theme-preference` 属性を読むように直すこと。
`theme.css` 内のセレクタとしての `data-theme` は直さなくてよい。

### 確認方法
1. 設定で「自動」を選び、`document.documentElement.dataset.theme` が `"light"` か `"dark"` になること
2. `document.documentElement.dataset.themePreference` が `"auto"` のままであること
3. macOS のシステム設定で外観を切り替えると、ページを再読み込みしなくても色が変わること
4. 「ライト」「ダーク」を選び直しても外観設定のセレクタが正しい値を表示していること
5. ページ再読み込み時に一瞬明るい画面が見えないこと

---

## 3. 作業2: `theme.css:767-786` のガードを付ける

作業1が済んでいれば、このブロックを `@media` から出して `html[data-theme="dark"]` を付けるだけでよい。

### 変更前（767行目から）
```css
@media (prefers-color-scheme: dark) {
 .btn-attach { background:#203a46!important; ... }
 .error { color:#ff9d9d!important; }
 ...
}
```

### 変更後
`@media (prefers-color-scheme: dark) { ... }` の囲みを外し、**中の15ルールすべての先頭に
`html[data-theme="dark"] ` を付ける**。セレクタがカンマ区切りの行は、各セレクタに付けること。

例:
```css
html[data-theme="dark"] .btn-attach { background:#203a46!important; color:#9fddf4!important; border-color:#37677a!important; }
html[data-theme="dark"] .btn-attach:hover { background:#2b4d5b!important; }
...
html[data-theme="dark"] body[data-page="terms"] h2,
html[data-theme="dark"] body[data-page="privacy"] h2 { ... }
```

`:is()` でまとめてもよい（その場合はセレクタの詳細度が変わらないか確認すること）。

### 確認方法
- OSをダークにしてアプリで「ライト」を選ぶ → 成功/エラーメッセージが**濃い色**になること
- OSをライトにしてアプリで「ダーク」を選ぶ → 代理ログインバーに**背景色が付く**こと
- 両方で `.btn-attach`（チャットの添付ボタン）が背景に対して読めること

---

## 4. 作業3: `--ui-green` の上の白文字を直す（6箇所）

### 4-1. 背景が単色のもの → 文字色をトークンに変える

| ファイル:行 | セレクタ | 変更 |
|---|---|---|
| `ai-study.html:48` | `.ai-bubble.user` | `color:#fff` → `color:var(--ui-paper)` |
| `ai-study.html:76` | `.ai-send` | `color:#fff` → `color:var(--ui-paper)` |
| `events.html:51` | `.ev-day.is-today .ev-date::after` | `color: #fff` → `color: var(--ui-paper)` |

`.ai-bubble.user` は **AI学習相談で利用者自身が送った吹き出し**。ここが一番影響が大きい。
ライトテーマでは見た目は変わらない（`--ui-paper` = `#fffefb` でほぼ白のため）。

### 4-2. 背景がグラデーションのもの → ダーク時は背景のほうを濃い色に差し替える

グラデーション `linear-gradient(135deg, var(--ui-green), var(--ui-green-deep))` は
ダークだと `#7dd3fc → #29415f`。片端が明るく片端が暗いので、**文字色をどちらにしても
どちらかの端が読めなくなる**。したがって背景側を直す。

`theme.css:954-957` のサイドバー（`.sidebar .mypage-area`）で既に同じ対処がされているので、**その書き方に合わせる**。

**(a) `theme.css:87` を編集**（既に `html[data-theme="dark"]` の中にあるルール）
```css
/* 変更前 */
html[data-theme="dark"] body[data-page="users"] .profile-card {
 background:linear-gradient(135deg,var(--ui-green),var(--ui-green-deep))!important; color:#fff!important;
}

/* 変更後: ダークでは明るい水色の上に白文字だと読めないので、濃いカードにしてアクセント色はふちに使う */
html[data-theme="dark"] body[data-page="users"] .profile-card {
 background:linear-gradient(135deg,#1d3550 0%,#12233a 100%)!important; color:#fff!important;
 border:1px solid color-mix(in srgb, var(--ui-green) 42%, transparent)!important;
}
```

**(b) `events.html` の `<style>` 内に追記**（`.ev-hero` の定義の直後）
```css
/* ダークでは --ui-green が明るい水色になるので、濃い背景に差し替えて白文字を保つ */
html[data-theme="dark"] .ev-hero {
    background: linear-gradient(135deg, #1d3550 0%, #12233a 100%);
    border: 1px solid color-mix(in srgb, var(--ui-green) 42%, transparent);
}
```

**(c) `ai-study.html` の `<style>` 内に追記**（`.ai-hero-copy` の定義の直後）
```css
html[data-theme="dark"] .ai-hero-copy {
    background: linear-gradient(135deg, #1d3550 0%, #12233a 100%);
}
```

`!important` は不要（`html[data-theme="dark"] .ev-hero` の詳細度 0,2,1 が `.ev-hero` の 0,1,0 に勝つ）。
もし効かなかったら、詳細度ではなく読み込み順の問題なので、`!important` を足す前に原因を確認すること。

### 確認方法
ダークテーマで AI学習相談ページを開き、
1. 自分の送信した吹き出しの文字が読めること
2. 送信ボタンの文字が読めること
3. 上部のヒーロー部分の白文字が読めること

学校行事ページで「今日」バッジの文字が読めること。

---

## 5. 作業4: ライトテーマ由来のアクセント色がダークに残っている

ログイン画面の左側（`.login-hero`）は、ダークでは背景だけ紺色に差し替わっているが、
**装飾と文字のアクセント色がライト用の黄緑 `#d8ef99` のまま**。
紺色の上に黄緑が乗るため、くすんだ色に見える（実際のダークのアクセントは水色 `#7dd3fc` と紫 `#c4b5fd`）。

`theme.css` の該当箇所:

| 行 | 現状 | 変更後 |
|---|---|---|
| 1380 | `rgba(216,239,153,.35)` | `color-mix(in srgb, var(--ui-lime) 35%, transparent)` |
| 1383 | `color:#d8ef99` | `color:var(--ui-lime)` |
| 1394 | `background:rgba(216,239,153,.18)` / `color:#d8ef99` | `color-mix(in srgb, var(--ui-lime) 18%, transparent)` / `var(--ui-lime)` |

`--ui-lime` はライトで `#d8ef99`、ダークで `#c4b5fd`。
**ライトテーマでは見た目がまったく変わらない**（同じ値）ので、安全な置き換え。

### 確認方法
- ライトテーマのログイン画面が変更前とピクセル単位で同じに見えること（スクリーンショット比較）
- ダークテーマで左側の装飾が紫系になり、紺色の背景になじむこと

---

## 6. 作業5: 重複した `@media (prefers-color-scheme)` ブロックを整理する

作業1〜2が完了し、動作確認が取れてから着手すること。**作業1の確認が済むまでやらない。**

`theme.css` には `@media (prefers-color-scheme: dark)` が8箇所ある（31, 111, 494, 513, 564, 767, 959, 1337行）。
作業1の後、このうち**コンポーネントを直接指定しているブロックは不要になる**。

### 判断基準
- **残す**: トークン（CSS変数）だけを定義しているブロック → 494行、564行
  理由: 万一 `ui.js` の読み込みに失敗しても、おおよその配色だけは保たれる保険になる
- **消す**: `.usage-intro-card` などコンポーネントを指定しているブロック → 31, 111, 513, 767（作業2で処理済み）, 959, 1337行
  これらは `html[data-theme="dark"]` 版が別に存在しているので、消しても挙動は変わらない

### 手順
1. 消す前に、各ブロックの中身と**同じ内容の `html[data-theme="dark"]` 版が本当に存在するか**を1つずつ照合する
2. 存在しないものがあれば、消さずに `html[data-theme="dark"]` 版を追加してから消す
3. `ui.js:633` の `@media (prefers-color-scheme: dark)` も同じ基準で確認する
4. 1ブロックずつ消して、そのたびに後述の検査スクリプトを流す

**これは見た目を変えない作業（リファクタリング）。見た目が変わったら、それは消しすぎている。**

削除後、`grep -c '!important' theme.css` が 679 から減っていれば効果が出ている。

---

## 7. 作業6: 残りのハードコード色の棚卸し（要調査）

ログインが必要なページは未検証のため、以下は**可能性の指摘であって確定ではない**。
ログインした状態で実際に確認してから直すこと。

静的に見つかっている気になる箇所:

| ファイル | 内容 | 懸念 |
|---|---|---|
| `profile.html` | `color: #262626` が8箇所 | 暗いカードの上だと読めない可能性 |
| `messages.html` | `color: #1e293b` が複数 | 同上 |
| `main.html` | 明るい固定背景が22箇所 | ダークで白い塊として浮く可能性 |
| `junior-meister.html` | 明るい固定背景が22箇所、固定色112個 | 同上。JM計算ページはトークン化がほぼ未着手 |
| `chat.html` | 明るい固定背景が11箇所 | 同上 |

子要素に直接 `color` が指定されていると、親カードの `color:var(--ui-ink)` は継承されないため、
`html[data-theme="dark"] .card { color:var(--ui-ink) }` があっても効かない。

### 進め方
下の検査スクリプトを各ページで流し、**実際に基準を下回った要素だけ**直す。
動いているものを予防的に書き換えない。見つかった件数と箇所を報告してから修正に入ること。

---

## 8. 検査スクリプト（各ページで流す）

ダークテーマでページを開き、ブラウザの開発者ツールのコンソールに貼り付ける。
基準を下回っている文字を一覧で返す。

```js
(() => {
  const parse = c => { const m = c.match(/[\d.]+/g); return m ? {r:+m[0],g:+m[1],b:+m[2],a:m[3]!==undefined?+m[3]:1} : null; };
  const lum = ({r,g,b}) => { const f=v=>{v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4);};
                             return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
  const over = (fg,bg) => ({r:fg.r*fg.a+bg.r*(1-fg.a), g:fg.g*fg.a+bg.g*(1-fg.a), b:fg.b*fg.a+bg.b*(1-fg.a), a:1});
  const ratio = (a,b) => { const L1=lum(a), L2=lum(b); return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05); };
  const effBg = el => {
    let n = el, acc = null;
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { acc = acc ? over(acc,c) : c; if (c.a >= 1) return acc; }
      n = n.parentElement;
    }
    const b = parse(getComputedStyle(document.body).backgroundColor) || {r:16,g:21,b:34,a:1};
    return acc ? over(acc,b) : b;
  };
  const out = [];
  document.querySelectorAll('body *').forEach(el => {
    const text = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim())
                                   .map(n => n.textContent.trim()).join(' ');
    if (!text) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const fg = parse(cs.color);
    if (!fg || fg.a === 0) return;                       // 非表示のチェックマーク等を除外
    const bg = effBg(el);
    const cr = ratio(over(fg,bg), bg);
    const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700;
    const need = (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5;   // WCAG AA
    if (cr < need) out.push({ 文字: text.slice(0,30), 比: +cr.toFixed(2), 必要: need,
                              色: cs.color, 背景: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`,
                              クラス: (el.className||'').toString().slice(0,40) });
  });
  console.table(out);
  return `${location.pathname.split('/').pop()}: ${out.length}件`;
})();
```

**注意: このスクリプトは万能ではない。** 画像の上の文字、グラデーション背景、
`background-image` で塗られた要素は正しく判定できない。
グラデーションの上の文字は目視でも確認すること。

### 検査するページと状態

| ページ | ログイン | 重点 |
|---|---|---|
| index.html | 不要 | ログインフォーム（検証済み・問題なし） |
| main.html | 要 | 募集カード一覧、学校行事ストリップ |
| ai-study.html | 要 | **自分の吹き出し・送信ボタン・ヒーロー** |
| events.html | 要 | **ヒーロー・今日バッジ**・行事の種類の色 |
| chat.html | 要 | 吹き出し、添付ボタン、メニュー |
| profile.html | 要 | 各種ボタン、顔認証まわり |
| junior-meister.html | 要 | 計算結果表示、進捗バー |
| messages.html | 要 | 相手一覧 |
| admin.html | 要(管理者) | 手入力フォーム、プレビュー |

各ページで **4通り**試す:
OS=ライト×アプリ=ダーク / OS=ダーク×アプリ=ダーク / OS=ダーク×アプリ=ライト / OS=ライト×アプリ=ライト

OSの配色は Chrome DevTools の「Rendering」パネル →
`Emulate CSS media feature prefers-color-scheme` で切り替えられる。

---

## 9. 仕上げ

### キャッシュ対策
`theme.css` と `ui.js` は `?v=...` を付けて読み込まれている。
変更したら**全HTMLのクエリ文字列を新しい値に更新する**（例: `?v=20261126dark`）。

```bash
grep -rn 'theme\.css?v=\|ui\.js?v=' --include=*.html . | grep -v node_modules
```
抜けがあると、一部の利用者に古いCSSが残る。

### 報告のしかた
次の順で報告すること。

1. **調査・変更した内容** — どの作業をどこまでやったか
2. **根拠となるファイルや処理** — 変更したファイル名と行、`git diff --stat`
3. **確認方法と結果** — 検査スクリプトの件数（前→後）、目視したページと状態の組み合わせ
4. **未確認の点、残るリスク** — ログインできず試せなかったページ、判定できなかった要素
5. **次に必要な作業**

### 気に入らなかったときの戻し方
作業ブランチを切っているので、
```bash
git switch main          # 元のブランチ名に合わせる
git branch -D dark-theme-fix
```
作業ごとにコミットしてあれば `git revert <コミット>` で一部だけ戻せる。

---

## 10. この指示文の根拠（検証済みの事実）

ブラウザ（`https://lqzayu.github.io/Heiko-Matching/index.html`）で実測した値:

- 白文字 on `--ui-green` ダーク(`#7dd3fc`) = **1.67:1**
- 白文字 on `--ui-green` ライト(`#254f3d`) = 9.27:1
- `var(--ui-paper)` on `--ui-green` ダーク = **9.35:1**（これが正しい形）
- OSダーク＋アプリでライト選択時、`.success`(`#8fe3b0`) on 明るい背景 = **1.51:1**
- OSダーク＋アプリでライト選択時、`.error`(`#ff9d9d`) on 明るい背景 = **1.97:1**
- OSライト＋アプリでダーク選択時、`.error`(`#ef4444`) on ダークカード = **4.14:1**
- OSライト＋アプリでダーク選択時、`.impersonate-bar` の背景が `rgba(0,0,0,0)` になる

未検証: ログインが必要なページ（作業6の対象）。
