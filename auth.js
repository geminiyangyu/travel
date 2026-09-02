/* ==========================================================================
 * auth.js — 旅遊手冊的「帳號密碼關卡」與加密行程檔載入器
 * ==========================================================================
 *
 * 設計重點（給未來的自己 / 其他人看的說明）：
 *
 * 1. 電腦本機不受限制
 *    直接用瀏覽器開啟本機的 index.html（網址列是 file:// 開頭），或是用
 *    localhost 測試時，完全不會出現登入畫面，行為跟以前一模一樣，可以自由
 *    編輯、切換手冊。關卡只在「網址是 http/https 的線上版」才會生效。
 *
 * 2. 一個帳號 = data/ 資料夾裡的一個檔案
 *    帳號 tokyo  → 讀取 data/tokyo.json
 *    帳號 osaka  → 讀取 data/osaka.json
 *    要新增一個行程，就是在 App 裡用「🔒 匯出加密行程檔」產生檔案，放進
 *    data/ 資料夾再上傳 GitHub，不需要改任何程式碼。
 *
 * 3. 密碼就是解密金鑰，沒有另外存密碼
 *    行程檔是用 AES-GCM 加密後才放進 repo 的，金鑰由密碼經 PBKDF2 推導。
 *    程式裡沒有存密碼、也沒有存密碼雜湊——「能不能解密成功」本身就是驗證。
 *    所以就算 repo 是公開的，別人抓到 data/tokyo.json 也只是一團亂碼。
 *
 *    ⚠️ 但請記得：保護強度完全等於密碼強度。像 "2026" 這種四位數密碼，
 *       電腦幾乎瞬間就能試完，只擋得住路人、擋不住有心人。正式出發前
 *       建議改成長一點的密碼（例如 tokyo2026felix），重新匯出檔案即可。
 *
 * 4. 登入後會記在這台裝置上，而且可離線使用
 *    解密後的行程會存進這支瀏覽器的 localStorage，之後開啟捷徑不用再輸入
 *    帳密，出國沒網路也能看。要換行程或清掉，用畫面上方的「🔒 登出」。
 * ========================================================================== */

(function () {
    'use strict';

    // --- 常數 ---------------------------------------------------------------
    var SESSION_KEY = 'travel_web_session';   // 記住登入狀態用
    var HANDBOOKS_KEY = 'travel_handbooks';   // app.js 讀取行程的地方
    var ACTIVE_KEY = 'active_handbook_id';
    var PBKDF2_ITERATIONS = 250000;

    // --- 判斷現在是「本機模式」還是「線上模式」 --------------------------------
    // 只有「直接用瀏覽器打開本機檔案」（file://）才算本機模式。
    // 用本機網頁伺服器預覽（localhost）時會照常出現登入畫面，
    // 這樣你在電腦上就能先確認手機看到的樣子是否正確。
    var isLocal = (location.protocol === 'file:');

    if (isLocal) {
        // 本機開啟：完全不設關卡，app.js 會自己啟動。
        // 但仍然掛上匯出功能，讓你可以在電腦上把行程加密匯出。
        window.__TRAVEL_GATE = false;
        document.addEventListener('DOMContentLoaded', installExportButton);
        return;
    }

    // 線上模式：註冊離線快取，並先擋住 app.js，等驗證通過再放行。
    if ('serviceWorker' in navigator) {
        // 開頁當下有沒有舊的 Service Worker 在管事。有的話，等新版接手之後
        // 重新載入一次，否則畫面上跑的還是舊的 app.js／styles.css ——
        // 也就是「明明改好了，手機上看起來卻沒變」的成因。
        var hadController = !!navigator.serviceWorker.controller;
        var reloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', function () {
            if (!hadController || reloading) return;   // 第一次安裝不需要重載
            reloading = true;
            location.reload();
        });
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('sw.js').then(function (reg) {
                if (reg && typeof reg.update === 'function') reg.update();
            }).catch(function () { });
        });
    }
    window.__TRAVEL_GATE = true;

    document.addEventListener('DOMContentLoaded', function () {
        var session = readSession();
        var cached = localStorage.getItem(HANDBOOKS_KEY);

        if (session && cached && (session.user || session.source === 'file')) {
            // 這台裝置已經登入（或載入過檔案），行程還在本機快取裡 → 直接進去（可離線）。
            startApp(session);
            return;
        }
        showLogin();
    });

    // --- 登入畫面 -----------------------------------------------------------
    function showLogin(prefillUser) {
        injectStyles();

        var overlay = document.createElement('div');
        overlay.className = 'tv-gate';
        overlay.innerHTML =
            '<form class="tv-gate-card" autocomplete="on">' +
            '  <div class="tv-gate-icon">🧳</div>' +
            '  <h1>旅遊手冊</h1>' +
            '  <p class="tv-gate-sub">請輸入這趟行程的帳號與密碼</p>' +
            '  <label for="tv-user">帳號</label>' +
            '  <input id="tv-user" name="username" type="text" inputmode="latin" autocapitalize="none" ' +
            '         autocorrect="off" spellcheck="false" autocomplete="username" placeholder="例如 tokyo" required>' +
            '  <label for="tv-pass">密碼</label>' +
            '  <input id="tv-pass" name="password" type="password" autocomplete="current-password" required>' +
            '  <button type="submit" class="tv-gate-btn">開啟手冊</button>' +
            '  <p class="tv-gate-msg" role="alert"></p>' +
            '  <div class="tv-gate-or"><span>或</span></div>' +
            '  <button type="button" class="tv-gate-file">📂 從檔案載入行程</button>' +
            '  <p class="tv-gate-hint">選擇手機或電腦上的行程檔（.json）。' +
            '     資料只會存在這台裝置的瀏覽器裡，不會上傳到任何地方。</p>' +
            '  <input type="file" class="tv-gate-fileinput" accept=".json,application/json" hidden>' +
            '</form>';
        document.body.appendChild(overlay);
        document.body.classList.add('tv-gate-open');

        var form = overlay.querySelector('form');
        var userEl = overlay.querySelector('#tv-user');
        var passEl = overlay.querySelector('#tv-pass');
        var btn = overlay.querySelector('.tv-gate-btn');
        var msg = overlay.querySelector('.tv-gate-msg');

        if (prefillUser) userEl.value = prefillUser;

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var user = (userEl.value || '').trim().toLowerCase();
            var pass = passEl.value || '';
            if (!user || !pass) return;

            btn.disabled = true;
            btn.textContent = '解鎖中…';
            msg.textContent = '';

            loadHandbook(user, pass).then(function (books) {
                localStorage.setItem(HANDBOOKS_KEY, JSON.stringify(books));
                localStorage.setItem(ACTIVE_KEY, books[0] && books[0].id ? books[0].id : '');
                writeSession({ user: user });
                overlay.remove();
                document.body.classList.remove('tv-gate-open');
                startApp({ user: user });
                prefetchOffline(books);
            }).catch(function (err) {
                btn.disabled = false;
                btn.textContent = '開啟手冊';
                msg.textContent = err && err.message ? err.message : '帳號或密碼錯誤';
                passEl.select();
            });
        });

        // --- 從檔案載入 ---
        var fileBtn = overlay.querySelector('.tv-gate-file');
        var fileInput = overlay.querySelector('.tv-gate-fileinput');

        fileBtn.addEventListener('click', function () {
            msg.textContent = '';
            fileInput.click();
        });

        fileInput.addEventListener('change', function () {
            var file = fileInput.files && fileInput.files[0];
            if (!file) return;

            fileBtn.disabled = true;
            fileBtn.textContent = '讀取中…';
            msg.textContent = '';

            readFileAsText(file).then(function (text) {
                return booksFromText(text, file.name);
            }).then(function (books) {
                localStorage.setItem(HANDBOOKS_KEY, JSON.stringify(books));
                localStorage.setItem(ACTIVE_KEY, books[0].id);
                writeSession({ source: 'file', name: file.name });
                overlay.remove();
                document.body.classList.remove('tv-gate-open');
                startApp({ source: 'file', name: file.name });
                prefetchOffline(books);
            }).catch(function (err) {
                fileBtn.disabled = false;
                fileBtn.textContent = '📂 從檔案載入行程';
                fileInput.value = '';
                msg.textContent = err && err.message ? err.message : '這個檔案讀不出行程資料';
            });
        });

        setTimeout(function () { (prefillUser ? passEl : userEl).focus(); }, 60);
    }

    // --- 讀檔與解析 ---------------------------------------------------------
    // 支援兩種檔案：
    //   (a) 本 App「🔒 匯出加密行程檔」產生的加密檔 → 會再問一次密碼
    //   (b) 未加密的原始行程 JSON（例如 Gemini 生成的）→ 直接載入
    function readFileAsText(file) {
        return new Promise(function (resolve, reject) {
            if (file.size > 20 * 1024 * 1024) {
                reject(new Error('檔案太大了（超過 20MB），請確認選到的是行程檔'));
                return;
            }
            var reader = new FileReader();
            reader.onload = function () { resolve(String(reader.result || '')); };
            reader.onerror = function () { reject(new Error('讀取檔案失敗，請再試一次')); };
            reader.readAsText(file, 'utf-8');
        });
    }

    function booksFromText(text, filename) {
        var data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error('這不是有效的 JSON 檔案');
        }

        // (a) 加密檔
        if (data && data.v === 1 && data.salt && data.iv && data.ct) {
            var pass = prompt('「' + filename + '」是加密過的行程檔。\n請輸入它的密碼：');
            if (!pass) throw new Error('已取消');
            return decryptPayload(data, pass).catch(function () {
                // decryptPayload 的錯誤訊息是為登入畫面寫的（「帳號或密碼錯誤」），
                // 但這條路徑沒有帳號可言，換成貼合情境的說法。
                throw new Error('密碼不對，這個檔案打不開');
            }).then(function (plain) {
                var inner;
                try { inner = JSON.parse(plain); }
                catch (e) { throw new Error('解開後的內容格式不正確'); }
                return normalizeBooks(inner);
            });
        }

        // (b) 未加密的原始行程
        return Promise.resolve(normalizeBooks(data));
    }

    // 把外來的 JSON 補齊成 App 需要的結構，避免缺欄位造成畫面壞掉。
    function normalizeBooks(data) {
        var books = Array.isArray(data) ? data : [data];
        books = books.filter(function (b) { return b && typeof b === 'object' && !Array.isArray(b); });
        if (!books.length) throw new Error('這個檔案裡找不到行程資料');

        books.forEach(function (b, i) {
            if (!b.id) b.id = 'imported-' + Date.now() + '-' + i;
            if (!b.title) b.title = '匯入的行程 ' + (i + 1);
            if (typeof b.subtitle !== 'string') b.subtitle = '';
            if (typeof b.dates !== 'string') b.dates = '';
            if (typeof b.flightInfo !== 'string') b.flightInfo = '';
            if (typeof b.countdownDate !== 'string') b.countdownDate = '';
            if (typeof b.badgeText !== 'string') b.badgeText = 'TRAVEL';
            if (!b.mascot) b.mascot = 'dog';
            if (!b.template) b.template = 'compact';
            if (!b.flights) {
                b.flights = {
                    depTime: '', depArrTime: '', depAirport: '', depAirline: '', depFlight: '',
                    retTime: '', retArrTime: '', retAirport: '', retAirline: '', retFlight: ''
                };
            }
            if (!Array.isArray(b.hotels)) b.hotels = [];
            if (!Array.isArray(b.packing)) b.packing = [];
            if (!Array.isArray(b.customPages)) b.customPages = [];
            if (!b.cards || typeof b.cards !== 'object') b.cards = {};
            if (!Array.isArray(b.cards.card1Perks)) b.cards.card1Perks = [];
            if (!Array.isArray(b.cards.card2Perks)) b.cards.card2Perks = [];
            if (!Array.isArray(b.days)) b.days = [];
            b.days.forEach(function (d) {
                if (!d || typeof d !== 'object') return;
                if (!Array.isArray(d.transport)) d.transport = [];
                if (!Array.isArray(d.tips)) d.tips = [];
                if (!Array.isArray(d.timeline)) d.timeline = [];
            });
        });
        return books;
    }

    // --- 抓取並解密行程檔 -----------------------------------------------------
    function loadHandbook(user, password) {
        if (!/^[a-z0-9_-]{1,40}$/.test(user)) {
            return Promise.reject(new Error('帳號或密碼錯誤'));
        }
        if (!window.crypto || !crypto.subtle) {
            return Promise.reject(new Error('這個瀏覽器不支援解密功能，請改用 Safari 或 Chrome 最新版'));
        }

        return fetch('data/' + user + '.json', { cache: 'no-store' })
            .then(function (res) {
                if (!res.ok) throw new Error('帳號或密碼錯誤');
                return res.json();
            })
            .then(function (payload) {
                return decryptPayload(payload, password);
            })
            .then(function (text) {
                var data = JSON.parse(text);
                var books = Array.isArray(data) ? data : [data];
                if (!books.length) throw new Error('這個行程檔是空的');
                return books;
            })
            .catch(function (err) {
                if (err && err.name === 'TypeError') {
                    throw new Error('連不上網路，請確認連線後再試一次');
                }
                throw new Error(err && err.message ? err.message : '帳號或密碼錯誤');
            });
    }

    function decryptPayload(payload, password) {
        if (!payload || payload.v !== 1 || !payload.salt || !payload.iv || !payload.ct) {
            return Promise.reject(new Error('行程檔格式不正確'));
        }
        var salt = b64ToBytes(payload.salt);
        var iv = b64ToBytes(payload.iv);
        var ct = b64ToBytes(payload.ct);
        var iterations = payload.iter || PBKDF2_ITERATIONS;

        return deriveKey(password, salt, iterations).then(function (key) {
            return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
        }).then(function (buf) {
            return new TextDecoder().decode(buf);
        }).catch(function () {
            throw new Error('帳號或密碼錯誤');
        });
    }

    function deriveKey(password, salt, iterations) {
        return crypto.subtle.importKey(
            'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
        ).then(function (baseKey) {
            return crypto.subtle.deriveKey(
                { name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
                baseKey,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
        });
    }

    // --- 啟動 App，並補上登出／重新下載按鈕 ------------------------------------
    function startApp(session) {
        if (typeof window.__travelAppMain === 'function') {
            window.__travelAppMain();
        }
        installSessionBar(session);
        // 匯出功能只在電腦本機（file://）出現，手機線上版不需要，避免介面雜亂。
    }

    // 登入後在背景把這本手冊會用到的照片抓下來存進離線快取，
    // 這樣出國沒網路時，每天的行程圖也看得到。抓失敗就算了，不影響使用。
    function prefetchOffline(books) {
        if (!('serviceWorker' in navigator)) return;

        var urls = {};
        books.forEach(function (b) {
            var mascot = b.mascot || 'dog';
            urls['assets/cover_' + mascot + '.jpg'] = 1;
            urls['assets/' + mascot + '_cover.jpg'] = 1;
            urls['assetsnew/' + mascot + '_cover.jpg'] = 1;
            (b.days || []).forEach(function (d, i) {
                urls['assetsnew/' + mascot + '_day' + (i + 1) + '.jpg'] = 1;
                if (d && d.image) urls[d.image] = 1;
            });
        });

        var list = Object.keys(urls);
        var idx = 0;
        (function next() {
            if (idx >= list.length) return;
            var u = list[idx++];
            fetch(u, { cache: 'no-cache' }).catch(function () { }).then(next);
        })();
    }

    function installSessionBar(session) {
        var manager = document.querySelector('.handbook-manager');
        if (!manager || document.getElementById('tv-logout')) return;

        var user = session && session.user;

        var sep = document.createElement('span');
        sep.className = 'nav-separator';
        sep.textContent = '|';

        var refresh = document.createElement('button');
        refresh.className = 'action-btn';
        refresh.id = 'tv-refresh';
        refresh.title = '從網站重新下載最新版行程（會覆蓋這台裝置上的修改，例如打勾過的行李清單）';
        refresh.textContent = '🔄 更新行程';
        refresh.addEventListener('click', function () {
            var ok = confirm('要重新下載最新版行程嗎？\n\n這台裝置上的修改（例如行李清單打勾、編輯過的文字）會被覆蓋。');
            if (!ok) return;
            var pass = prompt('請再輸入一次「' + user + '」的密碼：');
            if (!pass) return;
            loadHandbook(user, pass).then(function (books) {
                localStorage.setItem(HANDBOOKS_KEY, JSON.stringify(books));
                localStorage.setItem(ACTIVE_KEY, books[0] && books[0].id ? books[0].id : '');
                location.reload();
            }).catch(function (err) {
                alert(err.message || '更新失敗');
            });
        });

        var logout = document.createElement('button');
        logout.className = 'action-btn danger';
        logout.id = 'tv-logout';
        logout.title = '登出並清除這台裝置上的行程資料';
        logout.textContent = '🔒 登出';
        logout.addEventListener('click', function () {
            var ok = confirm('要登出嗎？\n\n這台裝置上快取的行程會被清除，下次要重新輸入帳號密碼。');
            if (!ok) return;
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem(HANDBOOKS_KEY);
            localStorage.removeItem(ACTIVE_KEY);
            location.reload();
        });

        manager.appendChild(sep);
        if (user) manager.appendChild(refresh);
        manager.appendChild(logout);
    }

    // --- 匯出加密行程檔（主要在電腦上使用） -------------------------------------
    function installExportButton() {
        var manager = document.querySelector('.handbook-manager');
        if (!manager || document.getElementById('tv-export')) return;

        var btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.id = 'tv-export';
        btn.title = '把目前這本手冊加密成檔案，放進 data/ 資料夾後上傳，手機才看得到';
        btn.textContent = '🔒 匯出加密行程檔';
        btn.addEventListener('click', exportEncrypted);
        manager.appendChild(btn);
    }

    function exportEncrypted() {
        if (!window.crypto || !crypto.subtle) {
            alert('這個瀏覽器不支援加密功能，請改用最新版的 Chrome 或 Safari。');
            return;
        }

        var raw = localStorage.getItem(HANDBOOKS_KEY);
        if (!raw) { alert('目前沒有任何手冊資料可以匯出。'); return; }

        var books;
        try { books = JSON.parse(raw); } catch (e) { alert('手冊資料讀取失敗。'); return; }
        if (!books.length) { alert('目前沒有任何手冊資料可以匯出。'); return; }

        var activeId = localStorage.getItem(ACTIVE_KEY);
        var current = books.filter(function (b) { return b.id === activeId; });
        var scope = books.length > 1
            ? confirm('要把「全部 ' + books.length + ' 本手冊」都放進這個檔案嗎？\n\n按「確定」＝全部匯出\n按「取消」＝只匯出目前這一本')
            : true;
        var payloadBooks = scope ? books : (current.length ? current : [books[0]]);

        var user = prompt('這個行程要用的「帳號」是什麼？\n（只能用英文小寫、數字、- 或 _，例如 tokyo）', 'tokyo');
        if (!user) return;
        user = user.trim().toLowerCase();
        if (!/^[a-z0-9_-]{1,40}$/.test(user)) {
            alert('帳號只能包含英文小寫、數字、減號或底線。');
            return;
        }

        var pass = prompt('請設定這個行程的「密碼」：\n\n提醒：密碼越長越安全。行程檔會用這組密碼加密，\n就算檔案被別人拿到，沒有密碼也只是一團亂碼。');
        if (!pass) return;
        var pass2 = prompt('請再輸入一次密碼確認：');
        if (pass !== pass2) { alert('兩次輸入的密碼不一樣，已取消。'); return; }

        if (pass.length < 8) {
            var go = confirm('這組密碼只有 ' + pass.length + ' 個字元，很容易被電腦試出來。\n\n確定要繼續嗎？（之後隨時可以改長一點再重新匯出）');
            if (!go) return;
        }

        var salt = crypto.getRandomValues(new Uint8Array(16));
        var iv = crypto.getRandomValues(new Uint8Array(12));
        var plaintext = new TextEncoder().encode(JSON.stringify(payloadBooks));

        deriveKey(pass, salt, PBKDF2_ITERATIONS).then(function (key) {
            return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, plaintext);
        }).then(function (ctBuf) {
            var payload = {
                v: 1,
                iter: PBKDF2_ITERATIONS,
                salt: bytesToB64(salt),
                iv: bytesToB64(iv),
                ct: bytesToB64(new Uint8Array(ctBuf))
            };
            downloadFile(user + '.json', JSON.stringify(payload));
            alert('已匯出「' + user + '.json」。\n\n接下來：\n1. 把這個檔案放進專案的 data/ 資料夾\n2. 用 GitHub Desktop commit 並 push\n3. 手機上用帳號「' + user + '」和剛剛設定的密碼登入');
        }).catch(function (err) {
            alert('加密失敗：' + (err && err.message ? err.message : err));
        });
    }

    function downloadFile(filename, text) {
        var blob = new Blob([text], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    // --- 小工具 -------------------------------------------------------------
    function readSession() {
        try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
        catch (e) { return null; }
    }

    function writeSession(user) {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ user: user }));
    }

    function b64ToBytes(b64) {
        var bin = atob(b64);
        var out = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    function bytesToB64(bytes) {
        var bin = '';
        for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    }

    // --- 登入畫面樣式（獨立於 styles.css，避免互相影響） -------------------------
    function injectStyles() {
        if (document.getElementById('tv-gate-style')) return;
        var css =
            '.tv-gate-open{overflow:hidden}' +
            '.tv-gate{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;' +
            'padding:24px;background:linear-gradient(160deg,#1f2933 0%,#3c4a5e 100%);' +
            'font-family:"Noto Sans TC",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
            'padding-top:calc(24px + env(safe-area-inset-top));padding-bottom:calc(24px + env(safe-area-inset-bottom))}' +
            '.tv-gate-card{width:100%;max-width:340px;background:#fff;border-radius:18px;padding:32px 26px 26px;' +
            'box-shadow:0 24px 60px rgba(0,0,0,.35);display:flex;flex-direction:column}' +
            '.tv-gate-icon{font-size:40px;text-align:center;line-height:1}' +
            '.tv-gate h1{margin:12px 0 4px;font-size:22px;font-weight:700;text-align:center;color:#1f2933}' +
            '.tv-gate-sub{margin:0 0 22px;font-size:13px;text-align:center;color:#7b8794}' +
            '.tv-gate label{font-size:12px;font-weight:600;color:#52606d;margin-bottom:6px}' +
            '.tv-gate input{width:100%;box-sizing:border-box;font-size:16px;padding:12px 14px;margin-bottom:16px;' +
            'border:1.5px solid #d8dee6;border-radius:10px;background:#fbfcfd;color:#1f2933;-webkit-appearance:none}' +
            '.tv-gate input:focus{outline:none;border-color:#e2b76a;background:#fff}' +
            '.tv-gate-btn{width:100%;font-size:16px;font-weight:700;padding:13px;border:0;border-radius:10px;' +
            'background:#1f2933;color:#fff;cursor:pointer;margin-top:4px;-webkit-appearance:none}' +
            '.tv-gate-btn:disabled{opacity:.6;cursor:default}' +
            '.tv-gate-msg{min-height:18px;margin:12px 0 0;font-size:13px;text-align:center;color:#c0392b}' +
            '.tv-gate-or{display:flex;align-items:center;gap:10px;margin:18px 0 14px;color:#9aa5b1;font-size:12px}' +
            '.tv-gate-or::before,.tv-gate-or::after{content:"";flex:1;height:1px;background:#e4e9ee}' +
            '.tv-gate-file{width:100%;font-size:15px;font-weight:600;padding:11px;border:1.5px solid #d8dee6;' +
            'border-radius:10px;background:#fff;color:#1f2933;cursor:pointer;-webkit-appearance:none}' +
            '.tv-gate-file:disabled{opacity:.6;cursor:default}' +
            '.tv-gate-hint{margin:10px 2px 0;font-size:11.5px;line-height:1.6;color:#9aa5b1;text-align:center}';
        var el = document.createElement('style');
        el.id = 'tv-gate-style';
        el.textContent = css;
        document.head.appendChild(el);
    }
})();
