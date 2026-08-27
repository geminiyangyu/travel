function __travelAppMain() {
    // ==========================================================================
    // 1. 預設空白手冊範本 (Blank handbook template — 不含任何真實行程資料)
    // ==========================================================================
    const DEFAULT_HANDBOOKS = [
        {
            id: "blank-handbook",
            title: "新的旅行手冊",
            subtitle: "",
            dates: "",
            flightInfo: "",
            countdownDate: "",
            badgeText: "TRAVEL",
            mascot: "dog",
            template: "compact",
            flights: {
                depTime: "",
                depArrTime: "",
                depAirport: "",
                depAirline: "",
                depFlight: "",
                retTime: "",
                retArrTime: "",
                retAirport: "",
                retAirline: "",
                retFlight: ""
            },
            hotels: [],
            cards: {
                card1Name: "信用卡 1",
                card1Perks: [],
                card2Name: "信用卡 2",
                card2Perks: []
            },
            packing: [],
            days: [],
            customPages: []
        }
    ];

    // ==========================================================================
    // 2. 多手冊數據管理器 (Data Manager & LocalStorage)
    // ==========================================================================
    let handbooks = [];
    let currentHandbookId = '';

    // 初始化載入數據
    function initData() {
        const savedHandbooks = localStorage.getItem('travel_handbooks');
        if (savedHandbooks) {
            try {
                handbooks = JSON.parse(savedHandbooks);
                // 數據結構移轉 (Migration): 補齊舊手冊可能缺少的欄位（一律補空值，不塞入任何範例行程）
                handbooks.forEach(h => {
                    if (!h.flights) {
                        h.flights = {
                            depTime: "",
                            depArrTime: "",
                            depAirport: "",
                            depAirline: "",
                            depFlight: "",
                            retTime: "",
                            retArrTime: "",
                            retAirport: "",
                            retAirline: "",
                            retFlight: ""
                        };
                    }
                    if (!h.hotels) {
                        h.hotels = [];
                    }
                    if (!h.template) {
                        h.template = "compact";
                    }
                    if (!h.customPages) {
                        h.customPages = [];
                    }
                });
            } catch (e) {
                console.error("載入 LocalStorage 失敗，改用預設資料", e);
                handbooks = JSON.parse(JSON.stringify(DEFAULT_HANDBOOKS));
            }
        } else {
            handbooks = JSON.parse(JSON.stringify(DEFAULT_HANDBOOKS));
            saveAllData();
        }

        const savedActiveId = localStorage.getItem('active_handbook_id');
        if (savedActiveId && handbooks.some(h => h.id === savedActiveId)) {
            currentHandbookId = savedActiveId;
        } else if (handbooks.length > 0) {
            currentHandbookId = handbooks[0].id;
        } else {
            currentHandbookId = '';
        }
    }

    function saveAllData() {
        localStorage.setItem('travel_handbooks', JSON.stringify(handbooks));
        localStorage.setItem('active_handbook_id', currentHandbookId);
    }

    function getCurrentHandbook() {
        return handbooks.find(h => h.id === currentHandbookId) || null;
    }

    // ==========================================================================
    // 3. UI 渲染引擎 (Dynamic Renderer)
    // ==========================================================================
    const dynamicDayNav = document.getElementById('dynamic-day-nav');
    const dynamicDayPages = document.getElementById('dynamic-day-pages');
    const handbookSelect = document.getElementById('handbook-select');

    // 重新渲染手冊切換下拉選單
    function renderHandbookSwitcher() {
        handbookSelect.innerHTML = '';
        handbooks.forEach(h => {
            const opt = document.createElement('option');
            opt.value = h.id;
            opt.textContent = `${h.title} (${h.dates || '未定'})`;
            if (h.id === currentHandbookId) {
                opt.selected = true;
            }
            handbookSelect.appendChild(opt);
        });
    }

    // 重新渲染整個手冊頁面內容
    function renderCurrentHandbook() {
        const book = getCurrentHandbook();
        if (!book) {
            alert("找不到目前手冊資料");
            return;
        }

        // 資訊頁資料（含每日餐食）必須在產生每日行程頁之前補齊 —— 行程頁會
        // 讀取 infoPages.meals，晚一步 seed 的話第一次渲染會拿到空物件，
        // 之後在餐食欄位打字也會因為路徑不存在而存不進去。
        ensureInfoPages(book);

        // --- 版型選擇器與 body class 同步 ---
        const activeTemplate = book.template || 'compact';
        const headerTemplateSelect = document.getElementById('template-select');
        const editTemplateSelect = document.getElementById('edit-template');
        if (headerTemplateSelect) headerTemplateSelect.value = activeTemplate;
        if (editTemplateSelect) editTemplateSelect.value = activeTemplate;
        
        document.body.classList.remove('template-compact', 'template-detailed', 'template-text-heavy', 'template-fourfold');
        document.body.classList.add(`template-${activeTemplate}`);

        // 動態調整列印方向與邊距 (Dynamic print orientation/margin)
        let printStyle = document.getElementById('print-page-style');
        if (!printStyle) {
            printStyle = document.createElement('style');
            printStyle.id = 'print-page-style';
            document.head.appendChild(printStyle);
        }
        if (activeTemplate === 'fourfold' || activeTemplate === 'detailed') {
            printStyle.innerHTML = `@media print { @page { size: A4 landscape !important; margin: 0 !important; } }`;
        } else {
            printStyle.innerHTML = `@media print { @page { size: A4 portrait !important; margin: 12mm 15mm !important; } }`;
        }

        // --- 封面頁更新 ---
        document.getElementById('cover-badge-text').textContent = book.badgeText || "TRAVEL 2026";
        document.getElementById('cover-main-title').textContent = book.title || "旅行手冊";
        const subTitleEl = document.getElementById('cover-sub-title');
        if (subTitleEl) subTitleEl.textContent = book.subtitle || "";
        document.getElementById('cover-dates').textContent = book.dates || "未定";
        const flightEl = document.getElementById('cover-flight');
        if (flightEl) flightEl.textContent = book.flightInfo || "未定";
        
        // --- 刷卡卡片更新 ---
        renderCardTitle('card1', book);
        renderCardPerks('card1', book);
        renderCardTitle('card2', book);
        renderCardPerks('card2', book);

        // --- 實際消費記錄表更新 ---
        renderExpenseTable(book);

        // --- 行李打包清單更新 ---
        renderPackingCategory('documents', book);
        renderPackingCategory('electronics', book);
        renderPackingCategory('clothing', book);
        renderPackingCategory('personal', book);
        updatePackingProgress();

        // --- 航班與住宿更新 ---
        if (book.flights) {
            document.getElementById('info-dep-time').textContent = `${book.flights.depTime || '--'} → ${book.flights.depArrTime || '--'}`;
            document.getElementById('info-dep-airport').textContent = book.flights.depAirport || '--';
            document.getElementById('info-dep-airline').textContent = book.flights.depAirline || '--';
            document.getElementById('info-dep-flight').textContent = book.flights.depFlight || '--';
            
            document.getElementById('info-ret-time').textContent = `${book.flights.retTime || '--'} → ${book.flights.retArrTime || '--'}`;
            document.getElementById('info-ret-airport').textContent = book.flights.retAirport || '--';
            document.getElementById('info-ret-airline').textContent = book.flights.retAirline || '--';
            document.getElementById('info-ret-flight').textContent = book.flights.retFlight || '--';
        }
        
        const hotelsList = document.getElementById('info-hotels-list');
        if (hotelsList) {
            hotelsList.innerHTML = '';
            (book.hotels || []).forEach(hotel => {
                const hotelRow = document.createElement('div');
                hotelRow.className = 'lodging-item';
                const match = hotel.match(/^([\d\/\-]+)\s*(.*)$/);
                if (match) {
                    hotelRow.innerHTML = `
                        <span class="hotel-dates">${match[1]}</span>
                        <span class="hotel-name">${match[2]}</span>
                    `;
                } else {
                    hotelRow.innerHTML = `
                        <span class="hotel-name">${hotel}</span>
                    `;
                }
                hotelsList.appendChild(hotelRow);
            });
        }

        // --- 每日行程動態生成 (D1 - D5) ---
        dynamicDayNav.innerHTML = '';
        dynamicDayPages.innerHTML = '';

        (book.days || []).forEach((day, index) => {
            const dayId = `day${index + 1}`;
            
            // 1. 生成側邊導覽連結
            const navLink = document.createElement('a');
            navLink.href = `#page-${dayId}-a`;
            navLink.className = 'nav-item';
            navLink.setAttribute('data-page', `${dayId}-a`);
            navLink.innerHTML = `
                <span class="day-badge">D${index + 1}</span>
                <span>${day.title || '每日行程'}</span>
            `;
            dynamicDayNav.appendChild(navLink);

            // 2. 生成每日詳細日程 Page
            const transportListHtml = (day.transport || []).map(t => `<li>${t}</li>`).join('');
            const tipsHtml = (day.tips || []).map(tip => `<p>${tip}</p>`).join('');
            
            // 車程時間標示（參考沖繩手帳：站與站之間標「🚗 38分」，自駕抓節奏用）
            const timelineHtml = (day.timeline || []).map((item, ti) => `
                <div class="timeline-item">
                    <div class="timeline-node"></div>
                    <div class="timeline-desc">
                        <h5>${item.title}</h5>
                        <p>${highlightKeywords(item.desc)}</p>
                    </div>
                </div>
                ${ti < (day.timeline || []).length - 1 ? `
                <div class="timeline-travel">
                    <span class="timeline-travel-badge info-edit" contenteditable="true" spellcheck="false"
                          data-book-path="days.${index}.timeline.${ti}.travel"
                          data-placeholder="🚗 --分">${escapeHtml(item.travel || '')}</span>
                </div>` : ''}
            `).join('');

            const mascotKey = book.mascot || 'dog';
            const dayImageSrc = day.customImage ? day.customImage : `assetsnew/${mascotKey}_day${index + 1}.jpg`;

            // 每日推薦照片牆。同一份資料，三種風格排法完全不同：
            //   日系圖鑑風 → 方格圖鑑牆   手帳風 → 圓形剪貼   灰藍風 → 扁平卡片
            // 排法差異全部在 CSS，這裡只負責產生語意一致的結構。
            const galleryItems = ((book.infoPages && book.infoPages.gallery) || [])[index] || [];
            const galleryHtml = `
                <div class="day-gallery">
                    <div class="day-gallery-title">🍜 今日推薦</div>
                    <div class="day-gallery-grid">
                        ${galleryItems.map((g, gi) => `
                            <figure class="gallery-tile" data-day-index="${index}" data-gallery-index="${gi}">
                                <div class="gallery-tile-img${g.img ? ' has-img' : ''}"${g.img ? ` style="background-image:url('${g.img}')"` : ''}></div>
                                <figcaption>
                                    <span class="gallery-tile-name info-edit" contenteditable="true" spellcheck="false" data-info-path="gallery.${index}.${gi}.name">${escapeHtml(g.name || '')}</span>
                                    <span class="gallery-tile-note info-edit" contenteditable="true" spellcheck="false" data-info-path="gallery.${index}.${gi}.note">${escapeHtml(g.note || '')}</span>
                                </figcaption>
                                <button type="button" class="gallery-tile-del no-print" data-day-index="${index}" data-gallery-index="${gi}" title="刪除這格">×</button>
                            </figure>`).join('')}
                    </div>
                    <button type="button" class="btn-add-gallery no-print" data-day-index="${index}">＋ 新增推薦</button>
                </div>`;

            // 每日餐食與時間表（參考旅行社手冊，排在該日最後一頁的底部）
            const meals = ((book.infoPages && book.infoPages.meals) || [])[index] || {};
            const mealsHtml = `
                <div class="day-meals">
                    <div class="day-meals-row day-meals-head">
                        <span>早餐</span><span>午餐</span><span>晚餐</span>
                    </div>
                    <div class="day-meals-row">
                        <span class="info-edit" contenteditable="true" spellcheck="false" data-info-path="meals.${index}.breakfast">${escapeHtml(meals.breakfast || '')}</span>
                        <span class="info-edit" contenteditable="true" spellcheck="false" data-info-path="meals.${index}.lunch">${escapeHtml(meals.lunch || '')}</span>
                        <span class="info-edit" contenteditable="true" spellcheck="false" data-info-path="meals.${index}.dinner">${escapeHtml(meals.dinner || '')}</span>
                    </div>
                    <div class="day-meals-row day-meals-head">
                        <span>晨喚時間</span><span>早餐時間</span><span>集合時間</span>
                    </div>
                    <div class="day-meals-row">
                        <span class="info-edit" contenteditable="true" spellcheck="false" data-info-path="meals.${index}.wakeup">${escapeHtml(meals.wakeup || '')}</span>
                        <span class="info-edit" contenteditable="true" spellcheck="false" data-info-path="meals.${index}.mealTime">${escapeHtml(meals.mealTime || '')}</span>
                        <span class="info-edit" contenteditable="true" spellcheck="false" data-info-path="meals.${index}.gather">${escapeHtml(meals.gather || '')}</span>
                    </div>
                </div>`;

            if (activeTemplate === 'detailed') {
                // 雙頁詳細版 - Page A: 標題、大照與交通
                const pageA = document.createElement('section');
                pageA.id = `page-${dayId}-a`;
                pageA.className = 'book-page day-page-detailed-a';
                pageA.innerHTML = `
                    <div class="day-layout">
                        <div class="day-header">
                            <div class="day-date">
                                <span class="day-num">${day.dayNum || 'DAY'}</span>
                                <span class="day-calendar">${day.dateText || ''}</span>
                            </div>
                            <h2 class="day-title">${day.title || ''}</h2>
                        </div>

                        <div class="day-top-grid">
                            <div class="day-hero-image">
                                <div class="washi-tape"></div>
                                <img src="${dayImageSrc}" alt="${day.title}" class="day-art" data-day-index="${index}" onerror="${day.customImage ? '' : `handleDayImgError(this, '${mascotKey}', ${index})`}">
                            </div>

                            <div class="day-sidebar">
                                <div class="info-card">
                                    <h4>🚇 今日交通與說明</h4>
                                    <ul class="info-list">
                                        ${transportListHtml}
                                    </ul>
                                </div>
                                
                                ${tipsHtml ? `
                                <div class="info-card warning">
                                    <h4>💡 漫遊小貼士</h4>
                                    ${tipsHtml}
                                </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;
                dynamicDayPages.appendChild(pageA);

                // 雙頁詳細版 - Page B: 詳細行程
                const pageB = document.createElement('section');
                pageB.id = `page-${dayId}-b`;
                pageB.className = 'book-page day-page-detailed-b';
                pageB.innerHTML = `
                    <div class="day-layout">
                        <div class="day-header">
                            <div class="day-date">
                                <span class="day-num">${day.dayNum || 'DAY'}</span>
                                <span class="day-calendar">${day.dateText || ''}</span>
                            </div>
                            <h2 class="day-title">${day.title || ''} (景點行程)</h2>
                        </div>

                        <div class="day-bottom-timeline">
                            <div class="day-timeline no-time">
                                <div class="timeline-title">📍 景點簡介</div>
                                ${timelineHtml}
                            </div>
                        </div>

                        ${galleryHtml}
                        ${mealsHtml}
                    </div>
                `;
                dynamicDayPages.appendChild(pageB);

            } else {
                // compact, text-heavy, fourfold - 單頁版
                const pageA = document.createElement('section');
                pageA.id = `page-${dayId}-a`;
                pageA.className = 'book-page';
                pageA.innerHTML = `
                    <div class="day-layout">
                        <div class="day-header">
                            <div class="day-date">
                                <span class="day-num">${day.dayNum || 'DAY'}</span>
                                <span class="day-calendar">${day.dateText || ''}</span>
                            </div>
                            <h2 class="day-title">${day.title || ''}</h2>
                        </div>

                        <div class="day-top-grid">
                            <div class="day-hero-image">
                                <div class="washi-tape"></div>
                                <img src="${dayImageSrc}" alt="${day.title}" class="day-art" data-day-index="${index}" onerror="${day.customImage ? '' : `handleDayImgError(this, '${mascotKey}', ${index})`}">
                            </div>

                            <div class="day-sidebar">
                                <div class="info-card">
                                    <h4>🚇 今日交通與說明</h4>
                                    <ul class="info-list">
                                        ${transportListHtml}
                                    </ul>
                                </div>
                                
                                ${tipsHtml ? `
                                <div class="info-card warning">
                                    <h4>💡 漫遊小貼士</h4>
                                    ${tipsHtml}
                                </div>
                                ` : ''}
                            </div>
                        </div>

                        <div class="day-bottom-timeline">
                            <div class="day-timeline no-time">
                                <div class="timeline-title">📍 景點簡介</div>
                                ${timelineHtml}
                            </div>
                        </div>

                        ${galleryHtml}
                        ${mealsHtml}
                    </div>
                `;
                dynamicDayPages.appendChild(pageA);
            }
        });

        // --- 行程簡介（目錄）---
        renderTocPage(book);

        // --- 旅遊資訊頁動態生成（排在每日行程之後）---
        renderInfoPages(book);

        // --- 封底 ---
        renderBackCover(book);

        // --- 自訂加頁動態生成 (V4.8) ---
        const dynamicCustomNav = document.getElementById('dynamic-custom-nav');
        const dynamicCustomPages = document.getElementById('dynamic-custom-pages');
        if (dynamicCustomNav) dynamicCustomNav.innerHTML = '';
        if (dynamicCustomPages) dynamicCustomPages.innerHTML = '';

        book.customPages = book.customPages || [];
        book.customPages.forEach((cp, cpIdx) => {
            const pageId = `custom-${cp.id}`;

            // 1. 生成側邊導覽連結
            if (dynamicCustomNav) {
                const navLink = document.createElement('a');
                navLink.href = `#page-${pageId}`;
                navLink.className = 'nav-item';
                navLink.setAttribute('data-page', pageId);
                navLink.innerHTML = `
                    <span class="day-badge" style="background-color: var(--secondary); font-size: 7.5pt; width: 38px; height: 18px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; color: #FFFFFF;">${cp.type === 'stamp' ? '蓋章' : '雜記'}</span>
                    <span>${cp.title || (cp.type === 'stamp' ? '紀念戳章' : '旅遊雜記')}</span>
                `;
                dynamicCustomNav.appendChild(navLink);
            }

            // 2. 生成自訂頁面內容
            const section = document.createElement('section');
            section.id = `page-${pageId}`;
            section.className = 'book-page';
            
            if (cp.type === 'stamp') {
                section.className += ' stamps-only-page';
                section.innerHTML = `
                    <div class="custom-page-header">
                        <h2>🌸 ${cp.title}</h2>
                        <button class="btn-delete-page no-print" data-page-id="${cp.id}">🗑️ 刪除此頁</button>
                    </div>
                    <p class="page-description" style="margin-bottom: 15px; font-size: 9.5pt; color: #666;">收集實體戳印、車票票根或印章，留下最珍貴的旅程回憶！</p>
                    <div class="blank-stamp-area" style="height: 420px; border: 1px dashed var(--border-color); border-radius: var(--radius-md); background: #FFF;">
                        <!-- Blank stamping board -->
                    </div>
                `;
            } else {
                section.className += ' travel-notes-page';
                const hasImgClass = cp.image ? 'has-image' : '';
                const imgHtml = cp.image ? `<img src="${cp.image}" alt="Note image">` : '';
                section.innerHTML = `
                    <div class="custom-page-header">
                        <h2>📝 ${cp.title}</h2>
                        <button class="btn-delete-page no-print" data-page-id="${cp.id}">🗑️ 刪除此頁</button>
                    </div>
                    
                    <!-- Top Blank Photo Area -->
                    <div class="notes-photo-placeholder ${hasImgClass}" data-custom-page-idx="${cpIdx}">
                        ${imgHtml}
                    </div>

                    <!-- Bottom Ruled Lined Text Area -->
                    <textarea class="notes-text-area" data-custom-page-idx="${cpIdx}" placeholder="在此點擊開始輸入旅遊心情與雜記備忘...">${cp.text || ''}</textarea>
                `;
            }
            if (dynamicCustomPages) dynamicCustomPages.appendChild(section);
        });

        // 重新綁定動態生成的 Nav 項目事件
        bindDynamicNavEvents();

        // 頁碼：DOM 順序就是閱讀順序，封面與封底不編號
        numberPages();

        // 頁面剛被重建，拼版的 order 與補白頁要重算
        if (typeof applyImposition === 'function') applyImposition();

        // 應用目前主角頭像
        applyMascot(book.mascot || 'dog');
        
        // 倒數計時重新計算
        updateCountdown();
    }

    // 卡片名稱：雙擊可編輯 (與行李清單物品的編輯方式一致)
    function renderCardTitle(cardKey, book) {
        const titleEl = document.getElementById(`${cardKey}-title`);
        if (!titleEl) return;
        const nameKey = `${cardKey}Name`;
        titleEl.textContent = book.cards[nameKey] || (cardKey === 'card1' ? '信用卡 1' : '信用卡 2');

        // 用 cloneNode 移除舊的事件監聽，避免每次 renderCurrentHandbook 都重複綁定
        const freshTitle = titleEl.cloneNode(true);
        titleEl.parentNode.replaceChild(freshTitle, titleEl);
        freshTitle.addEventListener('dblclick', () => {
            const newName = prompt('請修改卡片名稱：', book.cards[nameKey] || '');
            if (newName !== null && newName.trim() !== '') {
                book.cards[nameKey] = newName.trim();
                saveAllData();
                renderCardTitle(cardKey, book);
            }
        });
    }

    // 卡片優惠清單：雙擊文字可編輯、× 可刪除、底部按鈕可新增 (與行李清單一致的編輯手感)
    function renderCardPerks(cardKey, book) {
        const listEl = document.getElementById(`${cardKey}-perks-list`);
        if (!listEl) return;
        listEl.innerHTML = '';

        const perksKey = `${cardKey}Perks`;
        const perks = book.cards[perksKey] || [];

        perks.forEach((perkText, idx) => {
            const li = document.createElement('li');

            const span = document.createElement('span');
            span.className = 'card-perk-text';
            span.setAttribute('data-editable', 'true');
            span.innerHTML = perkText;
            span.title = '雙擊可編輯此優惠項目';
            span.addEventListener('dblclick', () => {
                const plainText = span.textContent;
                const newText = prompt('請修改優惠項目內容：', plainText);
                if (newText !== null && newText.trim() !== '') {
                    book.cards[perksKey][idx] = newText.trim();
                    saveAllData();
                    renderCardPerks(cardKey, book);
                }
            });
            li.appendChild(span);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-delete-item no-print';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.title = '刪除此優惠項目';
            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                book.cards[perksKey].splice(idx, 1);
                saveAllData();
                renderCardPerks(cardKey, book);
            });
            li.appendChild(deleteBtn);

            listEl.appendChild(li);
        });
    }

    // 新增卡片優惠項目按鈕 (btn-add-perk-1 / btn-add-perk-2)
    ['1', '2'].forEach(n => {
        const btn = document.getElementById(`btn-add-perk-${n}`);
        if (!btn) return;
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const book = getCurrentHandbook();
            if (!book) return;
            const cardKey = `card${n}`;
            const perksKey = `${cardKey}Perks`;
            const newText = prompt('請輸入新的優惠項目內容：', '');
            if (newText !== null && newText.trim() !== '') {
                if (!book.cards[perksKey]) book.cards[perksKey] = [];
                book.cards[perksKey].push(newText.trim());
                saveAllData();
                renderCardPerks(cardKey, book);
            }
        });
    });

    // ==========================================================================
    // 實際消費記錄表 (Expense log — 螢幕可打字 / 列印可手寫)
    // ==========================================================================
    // 設計原則跟這個專案其他地方一致：畫面上看到的表格 = 預覽看到的 = 印出來的。
    // 已填的列直接顯示文字，沒填的列留空白虛線 —— 所以同一張表在旅行前可以先
    // 打字建檔，印出來之後又還有空白列可以在現場手寫補記。
    const EXPENSE_FIELDS = ['date', 'shop', 'amount', 'card'];

    // 每個版型印得下幾列是不一樣的（.book-page 是固定高度 + overflow:hidden，
    // 塞不下的列會在紙張邊緣被無聲切掉，使用者要到印出來才發現）。
    // 下面的數字是實際量出來的：把表格撐滿後，看最後一列的底緣還在不在紙張內。
    //   單頁經典版 / 純文字版：刷卡頁是直式單欄，表格排在兩張卡片盒下面 → 11 列
    //     （量到 13 列剛好卡邊；雜誌編輯風與手繪塗鴉風的大標題會再吃掉一點
    //      高度，加上表格最後還有一列「合計」，所以退到 11 列留安全邊界，
    //      八種風格都印得完整。）
    //   雙頁詳細版：刷卡頁是橫式雙欄，表格獨佔右欄整條 → 21 列
    //   四折頁口袋版：刷卡頁只是一個窄摺頁，表格整個超出紙外 → 不列印
    const EXPENSE_PRINT_ROWS_BY_TEMPLATE = {
        'compact': 10,
        'detailed': 19,
        'text-heavy': 10,
        'fourfold': 0,
    };
    const EXPENSE_MIN_ROWS = 21;   // 網頁上一律先給滿 21 列可以打字

    function getExpensePrintRows() {
        const book = getCurrentHandbook();
        const tpl = (book && book.template) || 'compact';
        const n = EXPENSE_PRINT_ROWS_BY_TEMPLATE[tpl];
        return typeof n === 'number' ? n : 10;
    }

    function normalizeExpenses(book) {
        if (!Array.isArray(book.expenses)) book.expenses = [];
        // 永遠補足到最少列數，讓列印出來的表格高度固定、不會因為填得少就縮掉
        while (book.expenses.length < EXPENSE_MIN_ROWS) {
            book.expenses.push({ date: '', shop: '', amount: '', card: '' });
        }
        return book.expenses;
    }

    // 把使用者打的金額字串轉成數字：允許「12,480」「NT$1,200」「1200 円」這類寫法
    function parseAmount(v) {
        const n = parseFloat(String(v == null ? '' : v).replace(/[^\d.-]/g, ''));
        return isFinite(n) ? n : 0;
    }

    function calcExpenseTotal(book) {
        // 加總所有列，包含超出列印範圍的那些 —— 使用者要的是「這趟總共刷了多少」
        return (book.expenses || []).reduce((sum, r) => sum + parseAmount(r.amount), 0);
    }

    // 只改動合計那一格，不整張重畫。整張重畫會把使用者用 Tab 跳到的下一格
    // 直接砍掉重建，連續輸入時焦點會莫名其妙掉走。
    function updateExpenseTotal(book) {
        const el = document.querySelector('.exp-total-value');
        if (!el) return;
        const total = calcExpenseTotal(book);
        el.textContent = total ? total.toLocaleString('en-US') : '';
    }

    function renderExpenseTable(book) {
        const table = document.getElementById('expense-table');
        if (!table) return;

        const rows = normalizeExpenses(book);

        // 保留表頭 (.print-th)，只重畫資料列
        table.querySelectorAll('.print-tr:not(.print-th), .exp-print-limit').forEach(el => el.remove());

        const printRows = getExpensePrintRows();

        rows.forEach((row, idx) => {
            // 超出列印範圍的第一列前面插一條說明分隔線（只在網頁互動模式看得到）
            if (printRows > 0 && idx === printRows) {
                const limit = document.createElement('div');
                limit.className = 'exp-print-limit no-print';
                limit.textContent = `↑ 以上 ${printRows} 行為此版型的列印範圍　↓ 以下僅在網頁上顯示`;
                table.appendChild(limit);
            }

            const tr = document.createElement('div');
            tr.className = 'print-tr' + (printRows > 0 && idx >= printRows ? ' exp-beyond-print' : '');
            EXPENSE_FIELDS.forEach(field => {
                const cell = document.createElement('span');
                cell.className = 'exp-cell';
                cell.contentEditable = 'true';
                cell.spellcheck = false;
                cell.dataset.row = idx;
                cell.dataset.field = field;
                cell.textContent = row[field] || '';
                tr.appendChild(cell);
            });
            table.appendChild(tr);
        });

        // 合計列放在整張表最後。超出列印範圍的列在列印時是 display:none，
        // 不佔高度，所以合計會自動緊接在最後一筆印得出來的資料後面。
        const totalRow = document.createElement('div');
        totalRow.className = 'print-tr exp-total-row';
        const total = calcExpenseTotal(book);
        totalRow.innerHTML =
            `<span class="exp-total-label">合計</span>` +
            `<span class="exp-total-value">${total ? total.toLocaleString('en-US') : ''}</span>` +
            `<span></span>`;
        table.appendChild(totalRow);

        const hint = document.querySelector('.expense-hint');
        if (hint) {
            hint.textContent = printRows > 0
                ? `點任一格即可打字，離開該格自動儲存　·　此版型可印出前 ${printRows} 行`
                : '點任一格即可打字，離開該格自動儲存　·　四折頁版面沒有空間，這張表不會被印出來';
        }
    }

    // 用事件委派：表格會整批重畫，逐格掛 listener 會在重畫後失效。
    const expenseTableEl = document.getElementById('expense-table');
    if (expenseTableEl) {
        // 失焦才寫入，避免每按一個字就 saveAllData() 打 localStorage
        expenseTableEl.addEventListener('focusout', (e) => {
            const cell = e.target.closest('.exp-cell');
            if (!cell) return;
            const book = getCurrentHandbook();
            if (!book) return;
            const idx = Number(cell.dataset.row);
            const field = cell.dataset.field;
            const value = cell.textContent.trim();
            const rows = normalizeExpenses(book);
            if (!rows[idx] || rows[idx][field] === value) return;
            rows[idx][field] = value;
            saveAllData();
            if (field === 'amount') updateExpenseTotal(book);
        });

        // Enter 不要在格子裡塞換行（會把列高撐開、破壞列印版面），改成跳下一列同欄
        expenseTableEl.addEventListener('keydown', (e) => {
            const cell = e.target.closest('.exp-cell');
            if (!cell || e.key !== 'Enter') return;
            e.preventDefault();
            const next = expenseTableEl.querySelector(
                `.exp-cell[data-row="${Number(cell.dataset.row) + 1}"][data-field="${cell.dataset.field}"]`
            );
            if (next) next.focus();
            else cell.blur();
        });

        // 貼上時只取純文字，避免把 Excel/網頁的樣式與表格結構整包貼進來
        expenseTableEl.addEventListener('paste', (e) => {
            if (!e.target.closest('.exp-cell')) return;
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text/plain').replace(/\s+/g, ' ');
            document.execCommand('insertText', false, text);
        });
    }

    const btnAddExpenseRows = document.getElementById('btn-add-expense-rows');
    if (btnAddExpenseRows) {
        btnAddExpenseRows.addEventListener('click', () => {
            const book = getCurrentHandbook();
            if (!book) return;
            normalizeExpenses(book);
            for (let i = 0; i < 5; i++) book.expenses.push({ date: '', shop: '', amount: '', card: '' });
            saveAllData();
            renderExpenseTable(book);
        });
    }

    const btnClearExpenses = document.getElementById('btn-clear-expenses');
    if (btnClearExpenses) {
        btnClearExpenses.addEventListener('click', () => {
            const book = getCurrentHandbook();
            if (!book) return;
            const filled = (book.expenses || []).filter(r => EXPENSE_FIELDS.some(f => r[f]));
            if (!filled.length) {
                alert('目前沒有已填寫的消費記錄。');
                return;
            }
            if (!confirm(`確定清空 ${filled.length} 筆已填寫的消費記錄嗎？此動作無法復原。`)) return;
            book.expenses = [];
            normalizeExpenses(book);
            saveAllData();
            renderExpenseTable(book);
        });
    }

    function renderPackingCategory(category, book) {
        const container = document.querySelector(`.checklist-items[data-category="${category}"]`);
        if (!container) return;
        container.innerHTML = '';
        
        const items = book.packing.filter(item => item.category === category);
        items.forEach(item => {
            const row = document.createElement('div');
            row.className = 'check-item-row';

            const label = document.createElement('label');
            label.className = 'check-item';
            
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = item.checked;
            
            const span = document.createElement('span');
            span.textContent = ` ${item.text}`;
            span.title = '雙擊可編輯名稱';
            
            // 雙擊更改名稱
            span.addEventListener('dblclick', () => {
                const newText = prompt('請修改物品名稱：', item.text);
                if (newText !== null && newText.trim() !== '') {
                    item.text = newText.trim();
                    saveAllData();
                    renderPackingCategory(category, book);
                }
            });

            // 監聽打包打勾狀態
            input.addEventListener('change', () => {
                item.checked = input.checked;
                saveAllData();
                updatePackingProgress();
            });

            label.appendChild(input);
            label.appendChild(span);
            row.appendChild(label);

            // 刪除按鈕 (列印時隱藏)
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-delete-item no-print';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.title = '刪除此物品';
            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                book.packing = book.packing.filter(p => p !== item);
                saveAllData();
                renderPackingCategory(category, book);
                updatePackingProgress();
            });
            row.appendChild(deleteBtn);

            container.appendChild(row);
        });
    }

    // 動態綁定頁面跳轉 (與之前的 switchPage 合併)
    function bindDynamicNavEvents() {
        const dynamicNavs = dynamicDayNav.querySelectorAll('.nav-item');
        const allNavs = document.querySelectorAll('.sidebar-menu .nav-item');
        const bookPages = document.querySelectorAll('.book-page');

        function switchPage(pageId) {
            // 修正：下面的 forEach 會把每個 nav-item 換成 clone 節點來重綁事件，
            // 換完之後這裡捕捉到的 allNavs 就變成「已經被移出畫面」的舊節點了，
            // 對它們呼叫 classList.remove('active') 完全不會反映在畫面上，
            // 造成側邊欄的高亮越點越多、永遠不會消失。改成每次都重新查詢目前
            // 真正在畫面上的 nav-item。
            document.querySelectorAll('.sidebar-menu .nav-item').forEach(nav => nav.classList.remove('active'));
            // 包含動態產出的 D1~D5 與靜態 nav
            const targetNav = document.querySelector(`.nav-item[data-page="${pageId}"]`);
            if (targetNav) targetNav.classList.add('active');

            // 每次都重新查詢：bookPages 是頁面初始化時抓的靜態 NodeList，
            // 不含後來動態生成的每日行程頁與資訊頁，用它清除 active 會漏掉，
            // 造成舊頁面留在畫面上。
            document.querySelectorAll('.book-page').forEach(page => page.classList.remove('active'));
            const targetPage = document.getElementById(`page-${pageId}`);
            if (targetPage) targetPage.classList.add('active');

            // 如果是雙頁詳細版，且切換至 Page A，自動同步把 Part B 也設為 active
            if (pageId.endsWith('-a')) {
                const dayIdBase = pageId.substring(0, pageId.length - 2);
                const targetPageB = document.getElementById(`page-${dayIdBase}-b`);
                if (targetPageB) targetPageB.classList.add('active');
            }

            // 資訊頁是連續的一疊（page-info-1、-2、-3⋯⋯），側邊導覽指到某一節
            // 開始的那一頁。互動網頁上比照實體書顯示成一個跨頁，所以把下一頁
            // 也一起 active；否則使用者只看得到左半邊。
            if (/^info-\d+$/.test(pageId)) {
                const n = parseInt(pageId.slice(5), 10);
                const next = document.getElementById(`page-info-${n + 1}`);
                if (next) next.classList.add('active');
            }

            if (!document.body.classList.contains('booklet-preview')) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }

        // 給動態和靜態 Nav 都綁定事件
        allNavs.forEach(item => {
            // 先移除舊的 event listener，重新綁定
            const newItem = item.cloneNode(true);
            item.parentNode.replaceChild(newItem, item);
            
            newItem.addEventListener('click', (e) => {
                e.preventDefault();
                const pageId = newItem.getAttribute('data-page');
                
                if (document.body.classList.contains('booklet-preview')) {
                    const targetPage = document.getElementById(`page-${pageId}`);
                    if (targetPage) {
                        targetPage.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                    // 高亮
                    document.querySelectorAll('.sidebar-menu .nav-item').forEach(n => n.classList.remove('active'));
                    newItem.classList.add('active');
                } else {
                    switchPage(pageId);
                }
            });
        });
    }

    // ==========================================================================
    // 4. 打包進度條與添加自訂項目
    // ==========================================================================
    const progressPercent = document.getElementById('progress-percent');
    const progressFill = document.getElementById('progress-fill');
    const btnAddItem = document.getElementById('btn-add-item');
    const addItemName = document.getElementById('add-item-name');
    const addItemCategory = document.getElementById('add-item-category');

    function updatePackingProgress() {
        const book = getCurrentHandbook();
        if (!book || !book.packing) return;

        const total = book.packing.length;
        if (total === 0) {
            progressPercent.textContent = '0%';
            progressFill.style.width = '0%';
            return;
        }

        const checked = book.packing.filter(item => item.checked).length;
        const percent = Math.round((checked / total) * 100);

        progressPercent.textContent = `${percent}%`;
        progressFill.style.width = `${percent}%`;
    }

    // 新增打包物件
    btnAddItem.addEventListener('click', (e) => {
        e.preventDefault();
        const text = addItemName.value.trim();
        const category = addItemCategory.value;
        const book = getCurrentHandbook();

        if (!text || !book) {
            alert('請輸入物品名稱！');
            return;
        }

        // 檢查是否重複
        if (book.packing.some(item => item.text.trim() === text)) {
            alert('此物品已在清單中！');
            return;
        }

        book.packing.push({ text: text, checked: false, category: category });
        saveAllData();
        renderPackingCategory(category, book);
        updatePackingProgress();
        
        addItemName.value = '';
    });

    addItemName.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            btnAddItem.click();
        }
    });

    // ==========================================================================
    // 5. 航班出發倒數計時器
    // ==========================================================================
    const countdownEl = document.getElementById('countdown-days');
    
    function updateCountdown() {
        const book = getCurrentHandbook();
        if (!book || !book.countdownDate) {
            countdownEl.textContent = '--';
            return;
        }
        
        const departureDate = new Date(`${book.countdownDate}T00:00:00+08:00`);
        const currentDate = new Date();
        
        // 算出天數差
        const timeDiff = departureDate.getTime() - currentDate.getTime();
        
        if (timeDiff <= 0) {
            countdownEl.textContent = '0';
            return;
        }
        
        const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
        countdownEl.textContent = daysDiff;
    }

    // ==========================================================================
    // 6. 刷卡智能決策器 (Calculator)
    // ==========================================================================
    const calcCurrency = document.getElementById('calc-currency');
    const calcAmount = document.getElementById('calc-amount');
    const calcCategory = document.getElementById('calc-category');
    const calcResult = document.getElementById('calc-result');
    const JPY_TO_TWD = 0.21;

    function calculateOptimalCard() {
        const amountVal = parseFloat(calcAmount.value);
        if (isNaN(amountVal) || amountVal <= 0) {
            calcResult.innerHTML = `<span style="color: var(--text-muted);">請輸入消費金額以開始計算...</span>`;
            return;
        }

        const currency = calcCurrency.value;
        const category = calcCategory.value;
        const amountTWD = currency === 'JPY' ? amountVal * JPY_TO_TWD : amountVal;

        // 計算中信 Uniopen 11% (加碼8%滿 NT$6,250 達上限)
        const uniopenLimitTWD = 6250;
        let uniopenRebateTWD = 0;
        if (amountTWD <= uniopenLimitTWD) {
            uniopenRebateTWD = amountTWD * 0.11;
        } else {
            uniopenRebateTWD = (uniopenLimitTWD * 0.11) + ((amountTWD - uniopenLimitTWD) * 0.03);
        }

        // 計算熊本熊卡 8.5% (指定通路加碼6%滿 NT$8,333 達上限)
        const kumamonLimitTWD = 8333;
        const isKumamonDesignated = ['suica', 'bic', 'cosme', 'uniqlo'].includes(category);
        let kumamonRebateTWD = 0;

        if (isKumamonDesignated) {
            if (amountTWD <= kumamonLimitTWD) {
                kumamonRebateTWD = amountTWD * 0.085;
            } else {
                kumamonRebateTWD = (kumamonLimitTWD * 0.085) + ((amountTWD - kumamonLimitTWD) * 0.025);
            }
        } else {
            kumamonRebateTWD = amountTWD * 0.02; // 一般日本刷卡
        }

        const formattedUniopen = `NT$ ${Math.round(uniopenRebateTWD).toLocaleString()}`;
        const formattedKumamon = `NT$ ${Math.round(kumamonRebateTWD).toLocaleString()}`;

        if (uniopenRebateTWD > kumamonRebateTWD) {
            calcResult.innerHTML = `
                <div>
                    <p style="margin-bottom: 6px;">💡 推薦使用 <strong>【中信 Uniopen 聯名卡】</strong>！</p>
                    <p style="font-size: 12px; color: var(--text-muted);">
                        估計回饋額：中信 Uniopen <strong>${formattedUniopen}</strong> &gt; 玉山熊本熊 <strong>${formattedKumamon}</strong> (省約 NT$ ${Math.round(uniopenRebateTWD - kumamonRebateTWD)})
                    </p>
                </div>
            `;
        } else if (kumamonRebateTWD > uniopenRebateTWD) {
            calcResult.innerHTML = `
                <div>
                    <p style="margin-bottom: 6px;">💡 推薦使用 <strong>【玉山熊本熊卡】</strong>！</p>
                    <p style="font-size: 12px; color: var(--text-muted);">
                        估計回饋額：玉山熊本熊 <strong>${formattedKumamon}</strong> &gt; 中信 Uniopen <strong>${formattedUniopen}</strong> (省約 NT$ ${Math.round(kumamonRebateTWD - uniopenRebateTWD)})
                    </p>
                </div>
            `;
        } else {
            calcResult.innerHTML = `<div><p>💡 兩張卡估計回饋相同 (皆為 <strong>${formattedUniopen}</strong>)，任選一張刷卡即可！</p></div>`;
        }
    }

    calcAmount.addEventListener('input', calculateOptimalCard);
    calcCurrency.addEventListener('change', calculateOptimalCard);
    calcCategory.addEventListener('change', calculateOptimalCard);

    // ==========================================================================
    // 7. 主角選擇切換 (Mascot Handler)
    // ==========================================================================
    const mascotSelect = document.getElementById('mascot-select');
    const coverImg = document.getElementById('cover-img');
    const coverPartner = document.getElementById('cover-partner');
    const brandEmoji = document.querySelector('.brand-emoji');
    const brandTitle = document.getElementById('sidebar-title');

    // 每日插圖新舊資料夾降級機制：優先讀 assetsnew（16:9 精修版），
    // 若該主角/天數在 assetsnew 沒有對應圖，依序退回舊版 assets 資料夾的
    // 對應天數、再退回舊版 assets 資料夾裡最接近的天數圖片。
    window.handleDayImgError = function(imgEl, mascotKey, dayIndex) {
        const stage = imgEl.dataset.imgFallbackStage || '0';
        if (stage === '0') {
            // 該主角在該天還沒有 assetsnew 精修圖（例如兔子目前只做到 Day 3），
            // 先退回同一個主角的 assetsnew 第一天封面照，維持風格一致。
            imgEl.dataset.imgFallbackStage = '1';
            imgEl.src = `assetsnew/${mascotKey}_day1.jpg`;
        } else {
            imgEl.onerror = null;
        }
    };

    const MASCOT_CONFIG = {
        dog: { emoji: '🐶', mascotName: '馬爾濟斯', brand: '東京手冊', img: 'assets/cover_dog.jpg' },
        cat: { emoji: '🐱', mascotName: '溫馨貓貓', brand: '貓貓手冊', img: 'assets/cover_cat.jpg' },
        rabbit: { emoji: '🐰', mascotName: '軟萌兔兔', brand: '兔兔手冊', img: 'assetsnew/rabbit_cover.jpg' },
        bird: { emoji: '🐦', mascotName: '小胖', brand: '小胖手冊', img: 'assets/bird_cover.jpg' }
    };

    function applyMascot(mascotKey) {
        const config = MASCOT_CONFIG[mascotKey] || MASCOT_CONFIG.dog;
        const book = getCurrentHandbook();
        if (book) book.mascot = mascotKey;

        if (mascotSelect) mascotSelect.value = mascotKey;
        if (coverImg) {
            if (book && book.customCoverImage) {
                coverImg.src = book.customCoverImage;
            } else {
                coverImg.src = config.img;
            }
            coverImg.alt = `Cover (${mascotKey})`;
        }
        const userName = (book && book.username) ? book.username : '你';
        if (coverPartner) coverPartner.innerHTML = `${config.mascotName} & ${userName} ${config.emoji}`;
        if (brandEmoji) brandEmoji.textContent = config.emoji;
        if (brandTitle) brandTitle.textContent = book ? `${book.title.substring(0, 4)}手冊` : config.brand;

        // 同步更新所有已生成頁面的每日行程插圖 (尊重自訂圖片)
        // 修正：這裡原本寫死 (idx % 5) + 1，是還只有 5 天行程時代留下的邏輯。
        // 現在行程已經有 6 天，第 6 天 (idx=5) 會被 (5 % 5) + 1 = 1 算回第 1 天的
        // 照片，把原本正確、真的存在的 bird_day6.jpg 覆蓋掉。改成直接對應 idx+1，
        // 若該主角剛好沒有那一天的插圖，img 標籤上原本就有的 onerror 會自動接手
        // 降級到最近一天的圖，不需要在這裡預先猜測。
        const dayArts = document.querySelectorAll('.day-art');
        dayArts.forEach((img, idx) => {
            const day = book && book.days && book.days[idx];
            if (day && day.customImage) {
                img.src = day.customImage;
            } else {
                img.dataset.imgFallbackStage = '0';
                img.src = `assetsnew/${mascotKey}_day${idx + 1}.jpg`;
            }
        });
    }

    mascotSelect.addEventListener('change', (e) => {
        const selected = e.target.value;
        applyMascot(selected);
        saveAllData();
    });

    // ==========================================================================
    // 8. 多手冊自訂切換、新增、刪除操作
    // ==========================================================================
    
    // 切換下拉單
    handbookSelect.addEventListener('change', (e) => {
        currentHandbookId = e.target.value;
        saveAllData();
        renderCurrentHandbook();
        // 重返第一頁 Cover
        document.querySelector('.sidebar-menu .nav-item[data-page="cover"]').click();
    });

    // 切換排版版型下拉單 (Header)
    document.getElementById('template-select').addEventListener('change', (e) => {
        const book = getCurrentHandbook();
        if (!book) return;
        book.template = e.target.value;
        saveAllData();
        renderCurrentHandbook();
    });

    // 切換排版版型下拉單 (Editor 內連動)
    document.getElementById('edit-template').addEventListener('change', (e) => {
        const book = getCurrentHandbook();
        if (!book) return;
        book.template = e.target.value;
        const headerSelect = document.getElementById('template-select');
        if (headerSelect) headerSelect.value = e.target.value;
    });

    // 新增旅行手冊
    document.getElementById('btn-add-handbook').addEventListener('click', () => {
        const title = prompt("請輸入新旅行手冊標題 (例如: 京都紅葉行、北海道滑雪):");
        if (!title || !title.trim()) return;

        const newId = `handbook-${Date.now()}`;
        const newBook = {
            id: newId,
            title: title.trim(),
            subtitle: "手冊副標題與亮點行程說明",
            dates: "2026.10.01 — 10.05",
            flightInfo: "航班資訊帶出",
            countdownDate: "2026-10-01",
            badgeText: "TRAVEL 2026",
            mascot: "dog",
            template: "compact",
            cards: {
                card1Name: "中信 Uniopen 聯名卡",
                card1Perks: ["回饋點數：最高 11%", "甜蜜點上限：刷卡滿 NT$6,250 達回饋上限"],
                card2Name: "玉山熊本熊卡",
                card2Perks: ["回饋點數：指定通路最高 8.5%", "指定商店：Suica加值、藥妝、Bic Camera"]
            },
            packing: [
                { text: "護照", checked: false, category: "documents" },
                { text: "行動電源", checked: false, category: "electronics" },
                { text: "換洗衣物", checked: false, category: "clothing" }
            ],
            days: [
                {
                    dayNum: "DAY 1",
                    dateText: "10/01 (一)",
                    title: "抵達市區與漫遊",
                    image: "assets/day1.jpg",
                    transport: ["去程航班直達", "空手開始漫遊"],
                    tips: ["拍照大片提示"],
                    timeline: [
                        { time: "09:00 - 13:00", title: "搭機與抵達", desc: "抵達目的地，前往飯店放行李。" },
                        { time: "14:00 - 18:00", title: "經典老街漫步", desc: "悠閒地逛街拍照，享受悠閒時光。" }
                    ]
                }
            ]
        };

        handbooks.push(newBook);
        currentHandbookId = newId;
        saveAllData();
        renderHandbookSwitcher();
        renderCurrentHandbook();
        
        // 自動彈出編輯視窗以供修改
        document.getElementById('btn-edit-handbook').click();
    });

    // 刪除目前手冊
    document.getElementById('btn-delete-handbook').addEventListener('click', () => {
        const book = getCurrentHandbook();
        if (!book) return;
        
        if (handbooks.length <= 1) {
            alert("抱歉，必須保留至少一本手冊！");
            return;
        }

        const confirmDel = confirm(`確定要刪除「${book.title}」這本旅行手冊嗎？此動作無法復原！`);
        if (!confirmDel) return;

        handbooks = handbooks.filter(h => h.id !== currentHandbookId);
        currentHandbookId = handbooks[0].id;
        saveAllData();
        renderHandbookSwitcher();
        renderCurrentHandbook();
        
        // 重返第一頁
        document.querySelector('.sidebar-menu .nav-item[data-page="cover"]').click();
    });

    // ==========================================================================
    // 9. 彈窗編輯器 (Editor Logic - Basic Form + Advanced JSON)
    // ==========================================================================
    const editorModal = document.getElementById('editor-modal');
    const btnCloseEditor = document.getElementById('btn-close-editor');
    const btnCancelSave = document.getElementById('btn-cancel-save');
    const btnSaveHandbook = document.getElementById('btn-save-handbook');
    const btnEditHandbook = document.getElementById('btn-edit-handbook');
    
    // Tab 控制
    const tabBtns = document.querySelectorAll('.editor-tabs .tab-btn');
    const tabPanes = document.querySelectorAll('.editor-tab-pane');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            
            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // 打開編輯器
    btnEditHandbook.addEventListener('click', () => {
        const book = getCurrentHandbook();
        if (!book) return;

        // 填入基本欄位
        document.getElementById('edit-title').value = book.title || '';
        document.getElementById('edit-subtitle').value = book.subtitle || '';
        document.getElementById('edit-dates').value = book.dates || '';
        document.getElementById('edit-countdown').value = book.countdownDate || '';
        document.getElementById('edit-badge').value = book.badgeText || '';
        document.getElementById('edit-username').value = book.username || '';
        document.getElementById('edit-template').value = book.template || 'compact';

        // 填入航班細項欄位
        if (book.flights) {
            document.getElementById('edit-dep-time').value = book.flights.depTime || '';
            document.getElementById('edit-dep-arrtime').value = book.flights.depArrTime || '';
            document.getElementById('edit-dep-airport').value = book.flights.depAirport || '';
            document.getElementById('edit-dep-airline').value = book.flights.depAirline || '';
            document.getElementById('edit-dep-flight').value = book.flights.depFlight || '';
            
            document.getElementById('edit-ret-time').value = book.flights.retTime || '';
            document.getElementById('edit-ret-arrtime').value = book.flights.retArrTime || '';
            document.getElementById('edit-ret-airport').value = book.flights.retAirport || '';
            document.getElementById('edit-ret-airline').value = book.flights.retAirline || '';
            document.getElementById('edit-ret-flight').value = book.flights.retFlight || '';
        } else {
            document.getElementById('edit-dep-time').value = '';
            document.getElementById('edit-dep-arrtime').value = '';
            document.getElementById('edit-dep-airport').value = '';
            document.getElementById('edit-dep-airline').value = '';
            document.getElementById('edit-dep-flight').value = '';
            document.getElementById('edit-ret-time').value = '';
            document.getElementById('edit-ret-arrtime').value = '';
            document.getElementById('edit-ret-airport').value = '';
            document.getElementById('edit-ret-airline').value = '';
            document.getElementById('edit-ret-flight').value = '';
        }

        // 填入住宿飯店
        document.getElementById('edit-hotel1').value = (book.hotels && book.hotels[0]) ? book.hotels[0] : '';
        document.getElementById('edit-hotel2').value = (book.hotels && book.hotels[1]) ? book.hotels[1] : '';

        // 填入進階 JSON 編輯區
        document.getElementById('edit-json-area').value = JSON.stringify(book, null, 4);
        document.getElementById('json-error-msg').textContent = '';

        editorModal.classList.add('active');
    });

    // 格式化 JSON 按鈕
    document.getElementById('btn-format-json').addEventListener('click', (e) => {
        e.preventDefault();
        const jsonArea = document.getElementById('edit-json-area');
        try {
            const parsed = JSON.parse(jsonArea.value);
            jsonArea.value = JSON.stringify(parsed, null, 4);
            document.getElementById('json-error-msg').textContent = '';
        } catch (err) {
            document.getElementById('json-error-msg').textContent = 'JSON 語法錯誤，無法格式化！';
        }
    });

    // 關閉編輯器
    function closeEditor() {
        editorModal.classList.remove('active');
        // 重設 Tab 為第一個
        tabBtns[0].click();
    }

    btnCloseEditor.addEventListener('click', closeEditor);
    btnCancelSave.addEventListener('click', closeEditor);

    // 儲存修改
    btnSaveHandbook.addEventListener('click', () => {
        const book = getCurrentHandbook();
        if (!book) return;

        const activeTab = document.querySelector('.editor-tabs .tab-btn.active').getAttribute('data-tab');

        if (activeTab === 'tab-basic') {
            // 基本表單修改儲存
            book.title = document.getElementById('edit-title').value.trim();
            book.subtitle = document.getElementById('edit-subtitle').value.trim();
            book.dates = document.getElementById('edit-dates').value.trim();
            book.countdownDate = document.getElementById('edit-countdown').value;
            book.badgeText = document.getElementById('edit-badge').value.trim();
            book.username = document.getElementById('edit-username').value.trim();
            book.template = document.getElementById('edit-template').value;

            // 儲存航班資訊細項
            book.flights = {
                depTime: document.getElementById('edit-dep-time').value.trim(),
                depArrTime: document.getElementById('edit-dep-arrtime').value.trim(),
                depAirport: document.getElementById('edit-dep-airport').value.trim(),
                depAirline: document.getElementById('edit-dep-airline').value.trim(),
                depFlight: document.getElementById('edit-dep-flight').value.trim(),
                retTime: document.getElementById('edit-ret-time').value.trim(),
                retArrTime: document.getElementById('edit-ret-arrtime').value.trim(),
                retAirport: document.getElementById('edit-ret-airport').value.trim(),
                retAirline: document.getElementById('edit-ret-airline').value.trim(),
                retFlight: document.getElementById('edit-ret-flight').value.trim()
            };

            // 儲存住宿飯店
            book.hotels = [];
            const hotel1Val = document.getElementById('edit-hotel1').value.trim();
            const hotel2Val = document.getElementById('edit-hotel2').value.trim();
            if (hotel1Val) book.hotels.push(hotel1Val);
            if (hotel2Val) book.hotels.push(hotel2Val);

            // 動態同步更新單一 flightInfo 欄位以相容舊封面邏輯
            book.flightInfo = `${book.flights.depFlight || '去程'} ${book.flights.depTime || ''} → ${book.flights.retFlight || '回程'} ${book.flights.retTime || ''}`;
        } else {
            // 進階 JSON 編輯儲存
            const jsonText = document.getElementById('edit-json-area').value;
            try {
                const parsed = JSON.parse(jsonText);
                
                // 強制驗證關鍵欄位以防程式出錯
                if (!parsed.id || !parsed.title || !Array.isArray(parsed.days)) {
                    alert('儲存失敗：JSON 必須包含 "id"、"title" 與陣列格式的 "days" 欄位！');
                    return;
                }

                // 複寫當前手冊對象
                const index = handbooks.findIndex(h => h.id === currentHandbookId);
                if (index !== -1) {
                    handbooks[index] = parsed;
                    // 防止使用者手動修改 ID 導致對不上
                    handbooks[index].id = currentHandbookId; 
                }
            } catch (err) {
                alert('儲存失敗：JSON 語法有錯誤，請檢查是否有遺漏逗號或括號！');
                return;
            }
        }

        saveAllData();
        renderHandbookSwitcher();
        renderCurrentHandbook();
        closeEditor();
    });

    // ==========================================================================
    // 10. 實體列印手冊預覽 & 列印控制 (Print controls)
    // ==========================================================================
    const btnTogglePreview = document.getElementById('btn-toggle-preview');
    const btnPrint = document.getElementById('btn-print');
    const viewModeBadge = document.getElementById('view-mode-badge');
    const bookPages = document.querySelectorAll('.book-page'); // 抓取當下已生成的

    btnTogglePreview.addEventListener('click', () => {
        document.body.classList.toggle('booklet-preview');
        
        const isPreview = document.body.classList.contains('booklet-preview');
        const allPages = document.querySelectorAll('.book-page'); // 包含動態新增的頁面

        if (isPreview) {
            btnTogglePreview.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                <span>返回互動網頁</span>
            `;
            btnTogglePreview.classList.add('btn-primary');
            btnTogglePreview.classList.remove('btn-secondary');
            viewModeBadge.textContent = '實體手冊列印預覽';
            viewModeBadge.style.backgroundColor = 'var(--primary)';
            viewModeBadge.style.color = '#FFFFFF';
            
            // 預覽模式顯示所有頁面
            allPages.forEach(page => page.classList.add('active'));
        } else {
            btnTogglePreview.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                <span>手冊預覽模式</span>
            `;
            btnTogglePreview.classList.remove('btn-primary');
            btnTogglePreview.classList.add('btn-secondary');
            viewModeBadge.textContent = '網頁互動模式';
            viewModeBadge.style.backgroundColor = 'var(--secondary-light)';
            viewModeBadge.style.color = 'var(--secondary)';
            
            // 返回正常頁面切換狀態
            const activePageId = document.querySelector('.nav-item.active').getAttribute('data-page');
            
            allPages.forEach(page => page.classList.remove('active'));
            const targetPage = document.getElementById(`page-${activePageId}`);
            if (targetPage) targetPage.classList.add('active');
        }
    });

    // 「手冊預覽模式」是純螢幕模擬，它的 CSS 有大量規則（.book-page 尺寸、
    // .book-pages 的 flex、.content 寬度⋯⋯）並不在 @media screen 裡面，
    // 開著預覽直接列印時這些規則會洩漏進列印，把整份版面弄垮：頁面變成
    // landscape 紙張中央的一個小方框、頁數暴增、內容被拉開得空空的。
    //
    // 與其把幾十條規則逐一包進 @media screen（以後新增規則又會再踩到），
    // 不如從根本保證「列印時預覽模式一定是關的」，列印完再還原。
    let previewSuspendedForPrint = false;

    function suspendPreviewForPrint() {
        if (document.body.classList.contains('booklet-preview')) {
            previewSuspendedForPrint = true;
            document.body.classList.remove('booklet-preview');
        }
    }

    function restorePreviewAfterPrint() {
        if (previewSuspendedForPrint) {
            previewSuspendedForPrint = false;
            document.body.classList.add('booklet-preview');
        }
    }

    window.addEventListener('beforeprint', suspendPreviewForPrint);
    window.addEventListener('afterprint', restorePreviewAfterPrint);

    btnPrint.addEventListener('click', () => {
        // 有些瀏覽器的 beforeprint 觸發時機不夠可靠（尤其是先開預覽對話框
        // 才算 beforeprint 的實作），這裡先主動關掉再列印，雙保險。
        suspendPreviewForPrint();
        window.print();
        // Safari 不一定會發 afterprint，補一個 timer 還原，避免使用者列印完
        // 回到畫面時預覽模式莫名其妙消失了。
        setTimeout(restorePreviewAfterPrint, 1000);
    });

    // ==========================================================================
    // 12. 圖庫選擇與自訂路徑載入機制 (Gallery Asset Selector & Path Input V4.6)
    // ==========================================================================
    const AVAILABLE_ASSETS = [
        // 精修 16:9 新圖（assetsnew，除封面外的每日行程優先套用這批）
        "assetsnew/bird_cover.jpg", "assetsnew/bird_day1.jpg", "assetsnew/bird_day2.jpg", "assetsnew/bird_day3.jpg", "assetsnew/bird_day4.jpg", "assetsnew/bird_day5.jpg", "assetsnew/bird_day6.jpg",
        "assetsnew/cat_cover.jpg", "assetsnew/cat_day1.jpg", "assetsnew/cat_day2.jpg", "assetsnew/cat_day3.jpg", "assetsnew/cat_day4.jpg", "assetsnew/cat_day5.jpg", "assetsnew/cat_day6.jpg",
        "assetsnew/dog_cover.jpg", "assetsnew/dog_day1.jpg", "assetsnew/dog_day2.jpg", "assetsnew/dog_day3.jpg", "assetsnew/dog_day4.jpg", "assetsnew/dog_day5.jpg", "assetsnew/dog_day6.jpg",
        "assetsnew/rabbit_cover.jpg", "assetsnew/rabbit_day1.jpg", "assetsnew/rabbit_day2.jpg", "assetsnew/rabbit_day3.jpg",
        // 舊版圖庫（snake、panda 目前已不是可選主角，這裡留著純粹給手動換圖用）
        "assets/bird_cover.jpg", "assets/bird_day1.jpg", "assets/bird_day2.jpg", "assets/bird_day3.jpg", "assets/bird_day4.jpg", "assets/bird_day5.jpg", "assets/bird_day6.jpg",
        "assets/cat_day1.jpg", "assets/cat_day2.jpg", "assets/cat_day3.jpg", "assets/cat_day4.jpg", "assets/cat_day5.jpg",
        "assets/cover.jpg", "assets/cover_cat.jpg", "assets/cover_dog.jpg", "assets/cover_panda.jpg", "assets/cover_snake.jpg",
        "assets/day1.jpg", "assets/day2.jpg", "assets/day3.jpg", "assets/day4.jpg", "assets/day5.jpg",
        "assets/dog_day1.jpg", "assets/dog_day2.jpg", "assets/dog_day3.jpg", "assets/dog_day4.jpg", "assets/dog_day5.jpg",
        "assets/snake_day1.jpg", "assets/snake_day2.jpg", "assets/snake_day3.jpg"
    ];

    let imageSelectorTarget = null; // { type: 'cover' } or { type: 'day', dayIndex: idx }

    const imgSelectorModal = document.getElementById('image-selector-modal');
    const btnCloseImgSelector = document.getElementById('btn-close-image-selector');
    const btnCancelImgSelector = document.getElementById('btn-cancel-image-selector');
    const galleryGrid = document.getElementById('gallery-grid');
    const manualImagePathInput = document.getElementById('manual-image-path');
    const btnApplyManualPath = document.getElementById('btn-apply-manual-path');

    function openImageSelector(target) {
        imageSelectorTarget = target;
        manualImagePathInput.value = '';
        
        // 渲染縮圖清單
        galleryGrid.innerHTML = '';
        AVAILABLE_ASSETS.forEach(fullPath => {
            const path = fullPath;
            const filename = fullPath.split('/').pop();
            const item = document.createElement('div');
            item.className = 'gallery-item';
            item.innerHTML = `
                <img src="${path}" alt="${filename}">
                <span>${filename}</span>
            `;
            item.addEventListener('click', () => {
                selectImage(path);
            });
            galleryGrid.appendChild(item);
        });

        imgSelectorModal.classList.add('active');
    }

    function closeImageSelector() {
        imgSelectorModal.classList.remove('active');
        imageSelectorTarget = null;
    }

    function selectImage(path) {
        const book = getCurrentHandbook();
        if (!book) return;

        if (imageSelectorTarget.type === 'cover') {
            book.customCoverImage = path;
            const coverImgEl = document.getElementById('cover-img');
            if (coverImgEl) coverImgEl.src = path;
        } else if (imageSelectorTarget.type === 'galleryItem') {
            const g = (book.infoPages && book.infoPages.gallery[imageSelectorTarget.dayIndex]) || [];
            if (g[imageSelectorTarget.galleryIndex]) {
                g[imageSelectorTarget.galleryIndex].img = path;
                renderCurrentHandbook();
            }
        } else if (imageSelectorTarget.type === 'day') {
            const day = book.days[imageSelectorTarget.dayIndex];
            if (day) {
                day.customImage = path;
                renderCurrentHandbook();
            }
        } else if (imageSelectorTarget.type === 'customPage') {
            const cp = book.customPages[imageSelectorTarget.customPageIdx];
            if (cp) {
                cp.image = path;
                renderCurrentHandbook();
            }
        }

        saveAllData();
        closeImageSelector();
    }

    // 關閉視窗事件
    if (btnCloseImgSelector) btnCloseImgSelector.addEventListener('click', closeImageSelector);
    if (btnCancelImgSelector) btnCancelImgSelector.addEventListener('click', closeImageSelector);

    // 套用手動路徑
    if (btnApplyManualPath) {
        btnApplyManualPath.addEventListener('click', () => {
            const path = manualImagePathInput.value.trim();
            if (!path) {
                alert('請輸入有效的檔案路徑！');
                return;
            }
            selectImage(path);
        });
    }

    // 新增自訂蓋章頁按鈕
    document.getElementById('btn-add-stamp-page').addEventListener('click', () => {
        const book = getCurrentHandbook();
        if (!book) return;
        book.customPages = book.customPages || [];
        const newPage = {
            id: 'stamp-' + Date.now(),
            type: 'stamp',
            title: `自訂蓋章頁 (${book.customPages.filter(p => p.type === 'stamp').length + 2})`
        };
        book.customPages.push(newPage);
        saveAllData();
        renderCurrentHandbook();
        
        setTimeout(() => {
            const newNav = document.querySelector(`.nav-item[data-page="custom-${newPage.id}"]`);
            if (newNav) newNav.click();
        }, 100);
    });

    // 新增自訂旅遊雜記頁按鈕
    document.getElementById('btn-add-notes-page').addEventListener('click', () => {
        const book = getCurrentHandbook();
        if (!book) return;
        book.customPages = book.customPages || [];
        const newPage = {
            id: 'note-' + Date.now(),
            type: 'notes',
            title: `旅遊雜記 (${book.customPages.filter(p => p.type === 'notes').length + 1})`,
            image: '',
            text: ''
        };
        book.customPages.push(newPage);
        saveAllData();
        renderCurrentHandbook();
        
        setTimeout(() => {
            const newNav = document.querySelector(`.nav-item[data-page="custom-${newPage.id}"]`);
            if (newNav) newNav.click();
        }, 100);
    });

    // 點擊事件代理（圖片點選、刪除加頁等）
    document.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'cover-img') {
            e.preventDefault();
            openImageSelector({ type: 'cover' });
        } else if (e.target && e.target.classList.contains('btn-add-gallery')) {
            e.preventDefault();
            const book = getCurrentHandbook();
            if (!book) return;
            const di = parseInt(e.target.getAttribute('data-day-index'), 10);
            ensureInfoPages(book);
            if (!Array.isArray(book.infoPages.gallery[di])) book.infoPages.gallery[di] = [];
            book.infoPages.gallery[di].push({ img: '', name: '推薦名稱', note: '說明 / 營業時間' });
            saveAllData();
            renderCurrentHandbook();
        } else if (e.target && e.target.classList.contains('gallery-tile-del')) {
            e.preventDefault();
            const book = getCurrentHandbook();
            if (!book) return;
            const di = parseInt(e.target.getAttribute('data-day-index'), 10);
            const gi = parseInt(e.target.getAttribute('data-gallery-index'), 10);
            if (book.infoPages && Array.isArray(book.infoPages.gallery[di])) {
                book.infoPages.gallery[di].splice(gi, 1);
                saveAllData();
                renderCurrentHandbook();
            }
        } else if (e.target && e.target.classList.contains('gallery-tile-img')) {
            e.preventDefault();
            const tile = e.target.closest('.gallery-tile');
            openImageSelector({
                type: 'galleryItem',
                dayIndex: parseInt(tile.getAttribute('data-day-index'), 10),
                galleryIndex: parseInt(tile.getAttribute('data-gallery-index'), 10),
            });
        } else if (e.target && e.target.classList.contains('day-art')) {
            e.preventDefault();
            const dayIndex = parseInt(e.target.getAttribute('data-day-index'), 10);
            openImageSelector({ type: 'day', dayIndex: dayIndex });
        } else if (e.target && e.target.classList.contains('btn-delete-page')) {
            e.preventDefault();
            const pageId = e.target.getAttribute('data-page-id');
            const book = getCurrentHandbook();
            if (book && book.customPages) {
                if (confirm('確定要刪除此自訂加頁嗎？此動作無法復原！')) {
                    book.customPages = book.customPages.filter(p => p.id !== pageId);
                    saveAllData();
                    renderCurrentHandbook();
                    const coverNav = document.querySelector('.sidebar-menu .nav-item[data-page="cover"]');
                    if (coverNav) coverNav.click();
                }
            }
        } else if (e.target && (e.target.classList.contains('notes-photo-placeholder') || e.target.closest('.notes-photo-placeholder'))) {
            e.preventDefault();
            const placeholder = e.target.classList.contains('notes-photo-placeholder') ? e.target : e.target.closest('.notes-photo-placeholder');
            const idx = parseInt(placeholder.getAttribute('data-custom-page-idx'), 10);
            openImageSelector({ type: 'customPage', customPageIdx: idx });
        }
    });

    // 旅遊雜記文字框即時輸入儲存監聽
    document.addEventListener('input', (e) => {
        if (e.target && e.target.classList.contains('notes-text-area')) {
            const idx = parseInt(e.target.getAttribute('data-custom-page-idx'), 10);
            const book = getCurrentHandbook();
            if (book && book.customPages && book.customPages[idx]) {
                book.customPages[idx].text = e.target.value;
                saveAllData();
            }
        }
    });

    // ==========================================================================
    // 10.5 視覺風格切換 (Visual style themes)
    // ==========================================================================
    // 「風格」與「排版版型」是刻意分開的兩個軸：
    //   - 排版版型 (book.template) = 版面結構，存在每一本手冊裡，各自獨立。
    //   - 風格 (STYLE)             = 配色/字體/邊框，存全域一份，換手冊不會變。
    // 因此這裡用獨立的 localStorage key，不寫進 handbook 資料。
    const STYLE_KEY = 'travel_style';
    const STYLES = ['washi', 'minimal', 'magazine', 'ticket', 'doodle', 'scrapbook', 'slate', 'agency'];
    const DEFAULT_STYLE = 'washi';

    function getActiveStyle() {
        const saved = localStorage.getItem(STYLE_KEY);
        return STYLES.includes(saved) ? saved : DEFAULT_STYLE;
    }

    function applyStyle(styleName) {
        const name = STYLES.includes(styleName) ? styleName : DEFAULT_STYLE;
        document.body.classList.remove(...STYLES.map(s => `style-${s}`));
        document.body.classList.add(`style-${name}`);
        const sel = document.getElementById('style-select');
        if (sel) sel.value = name;
    }

    const styleSelect = document.getElementById('style-select');
    if (styleSelect) {
        styleSelect.addEventListener('change', (e) => {
            localStorage.setItem(STYLE_KEY, e.target.value);
            applyStyle(e.target.value);
        });
    }

    // ==========================================================================
    // 12. 旅遊資訊頁 (Info pages：注意事項 / 旅遊資訊 / 搭機資訊 / 飯店資訊)
    // ==========================================================================
    // 這幾頁排在每日行程之後，內容量比其他頁大得多（範本手冊光「旅遊資訊」就佔
    // 六頁），所以不能沿用「一個 section = 固定一頁」的作法 —— 那樣超出的內容
    // 會被 overflow:hidden 無聲裁掉。
    //
    // 作法：先把內容切成一個個「區塊」，在離螢幕的量測盒裡量出每塊實際高度，
    // 再貪婪地裝進一頁頁的容量裡，最後產生 N 個 .book-page。因為切點是算出來
    // 的、不是瀏覽器當下決定的，網頁互動 / 手冊預覽 / 實際列印三種情境看到的
    // 分頁位置完全一致。

    // 每個版型「一欄」裝得下的內容高度 (px @96dpi) 與欄數。
    // 高度來自各版型 .book-page 的實際 CSS 尺寸（以 mm 宣告，換算後扣掉頁首與
    // 上下留白），欄數則配合該版型的紙張方向：橫式對摺的雙頁詳細版用兩欄，
    // 四折頁是窄長條所以維持一欄。
    // 高度 = 該版型 .book-page 的內容區高度扣掉頁首，再留一點安全邊界；
    // 欄數 = 該版型一「頁」實際有多寬。雙頁詳細版每一頁本來就是 A5 半張
    // （148.5mm 寬、左右並排湊成一張橫式 A4），所以是一欄而不是兩欄。
    // contentMM = 該版型一頁的內容區寬度（mm），用來換算多欄時每一欄有多寬
    const INFO_CAPACITY = {
        'compact':    { height: 800, columns: 1, contentMM: 180 },
        'text-heavy': { height: 800, columns: 1, contentMM: 180 },
        'detailed':   { height: 600, columns: 1, contentMM: 132 },
        'fourfold':   { height: 630, columns: 1, contentMM: 64 },
    };
    const INFO_COL_GAP_MM = 8;

    function getInfoCapacity() {
        const book = getCurrentHandbook();
        const tpl = (book && book.template) || 'compact';
        return INFO_CAPACITY[tpl] || INFO_CAPACITY['compact'];
    }

    // --- 日本版預設內容（可直接在頁面上改，換國家就整段換掉）-----------------
    const INFO_DEFAULTS_JP = {
        notice: [
            { label: '氣候', text: '出發前請查詢當地即時氣象預報，依日夜溫差準備保暖衣物；夏季悶熱潮濕請注意補水與防曬。' },
            { label: '託運行李', text: '建議以一件為原則，重量不超過 23 公斤，長寬高總和不超過 158 公分。' },
            { label: '手提行李', text: '一件為原則，重量不超過 7 公斤，長寬高總和不超過 115 公分。' },
            { label: '行動電源', text: '行動電源與備用鋰電池只能隨身攜帶，不可放入託運行李；飛行期間禁止在座位上使用行動電源充電。' },
            { label: '液體規定', text: '隨身液體每瓶不超過 100ml，須裝入 1 公升以下透明夾鏈袋；超過者請放託運行李。' },
            { label: '匯率', text: '1 日圓（JPY）約 0.21 新台幣（TWD），實際請以出發前銀行牌告匯率為準。' },
            { label: '金錢', text: '出境每人可攜帶新台幣 10 萬元、美金現金 1 萬元（或等值外幣）。攜帶 100 萬日圓以上入境日本須向海關申報。' },
            { label: '小費', text: '日本無給小費的習慣，飯店與餐廳皆不需另付床頭小費或服務費。' },
            { label: '電壓', text: '100 伏特，插座為兩腳扁型。台灣電器多可直接使用，建議自備轉換插頭與延長線。' },
            { label: '時差', text: '日本比台灣快 1 小時。' },
            { label: '飲水', text: '日本自來水可直接生飲，建議自備保溫瓶隨時補充。' },
            { label: '網路', text: '建議事先租借 Wi-Fi 分享器或購買 eSIM；飯店公共區域與客房多提供免費 Wi-Fi。' },
            { label: '退稅', text: '同一店家單筆未稅滿 5,000 日圓可辦理退稅，須出示本人護照。藥妝類免稅品會以密封袋封口，出境前不可拆封。' },
            { label: '注意', text: '機場只受理機場內免稅店的退稅，市區消費請當場在店家辦理，不要留到機場。' },
        ],
        emergency: [
            { label: '日本報警', text: '110' },
            { label: '火警 / 救護車', text: '119' },
            { label: '台北駐日經濟文化代表處', text: '+81-3-3280-7811' },
            { label: '旅外國人急難救助', text: '+81-80-1009-7179（日本境內行動電話）' },
            { label: '外交部緊急服務專線', text: '800-0885-0885（日本境內免付費）' },
            { label: '桃園機場 第一航廈', text: '03-273-5081' },
            { label: '桃園機場 第二航廈', text: '03-273-5086' },
            { label: '日本打回台灣', text: '010 + 886 + 區碼（去 0）+ 電話號碼' },
            { label: '台灣打到日本', text: '002 + 81 + 區碼（去 0）+ 電話號碼' },
            { label: '信用卡掛失', text: '出發前請抄下發卡銀行 24 小時客服電話' },
        ],
        travelInfo: [
            {
                title: '地理與人口',
                body: '日本位於亞洲大陸東邊的太平洋上，國土面積約 377,873 平方公里，由北海道、本州、四國、九州四個主要島嶼與周圍約 4,000 多個小島組成。海岸線複雜多變、火山眾多、峽谷深邃，是地形變化極為豐富的國家。\n全國人口超過 1 億 2,600 萬，多集中於城市，首都東京約有 1,200 萬居民。'
            },
            {
                title: '語言與溝通',
                body: '通用語言為日語。幾乎所有日本人在義務教育階段都學過英語，因此以英語溝通時只要說得慢一些、清楚一些，多半能夠溝通。主要車站、機場與觀光地的指標多有中英文標示。\n手機翻譯 App 與截圖對照在實務上非常好用，建議事先下載離線語言包。'
            },
            {
                title: '簽證與入境',
                body: '持中華民國護照赴日觀光享免簽證待遇，可停留最多 90 天，護照效期建議六個月以上。\n入境前請先上網完成 Visit Japan Web（VJW）登錄，取得入境審查與海關申報的 QR 碼，並將截圖存於手機，可大幅縮短通關時間。'
            },
            {
                title: '貨幣與付款',
                body: '日本貨幣單位為日圓。硬幣有 1、5、50、100、500 圓五種，紙鈔有 1,000、2,000、5,000 與 10,000 圓。\n都市地區信用卡與行動支付普及，但地方小店、神社、部分餐廳仍只收現金，建議隨身準備一定金額的現金與零錢。交通卡（Suica／PASMO／ICOCA）可用於搭車與便利商店小額消費，非常方便。'
            },
            {
                title: '退稅制度',
                body: '免稅制度以非日本居住者、停留不超過 6 個月的旅客為對象。\n退稅方式有兩種：一是結帳時直接以免稅價格計算（多數藥妝店採此方式，設有專屬免稅櫃檯）；二是先以含稅價結帳，再自行持收據至退稅櫃檯領取現金（百貨、3C 賣場多為此類，可能收取手續費）。\n辦理退稅時務必攜帶本人護照。藥妝類免稅商品會以密封袋封口，出境前不可拆封，且袋內若有單瓶超過 100ml 的液體將無法手提上機，建議放入託運行李。'
            },
            {
                title: '日常禮儀',
                body: '鞠躬是日本最常見的致意方式，依彎腰角度分為點頭（約 15 度）、敬禮（約 30 度）與最敬禮（約 45 度）。\n用餐前後合掌並說「Itadakimasu」與「Gochisousama」，表達對食物與烹調者的謝意。\n手機禮儀相當受重視：劇場、電影院、美術館請關機；電車與新幹線上請切換為靜音（禮貌模式），盡量不要通話，必要時可到車廂連接處或月台再講。'
            },
            {
                title: '飲食禮法',
                body: '壽司：用手拿著吃並不失禮。醬油請自行倒入小碟，捲壽司建議將配料朝下沾取醬油，飯粒較不易散開。\n拉麵、蕎麥麵與烏龍麵：吸麵發出聲音在日本並不失禮，甚至被認為是享受美味的表現。\n濕毛巾（Oshibori）是用來擦手的，不宜用來擦臉或擦桌面。\n提醒：蕎麥麵粉可能引發嚴重過敏，初次食用者請特別留意。'
            },
            {
                title: '神社與寺院參拜',
                body: '神社：通過鳥居前先鞠躬，參道正中央是神明通道，參拜者宜靠邊行走。於手水舍以右手持杓洗左手、換左手洗右手、再以右手取水漱口，最後將杓柄立起以剩水沖淨杓柄，全程只取一次水。至正殿行「二拜二拍手一拜」：投入香油錢、搖鈴、鞠躬兩次、拍手兩次、合掌默禱、最後鞠躬一次。\n寺院：規矩較簡略，若有手水舍同樣先淨手漱口，可燃燭焚香後投香油、合掌默禱，但不拍手。'
            },
            {
                title: '交通與乘車',
                body: '大城市以鐵路與地鐵為主，班次密集但轉乘複雜，建議善用轉乘 App 查詢班次與月台。\n新幹線需另購特急券，指定席建議提前劃位；JR Pass 等票券適合長距離移動，短程市區反而不划算，出發前請先估算行程再決定是否購買。\n電車上請勿飲食與大聲交談，博愛座附近請關閉手機震動並避免使用。'
            },
            {
                title: '遺失物品與就醫',
                body: '若在車站或公共場所遺失物品，可至站長室或就近派出所（交番）尋求協助；遺留在計程車上的物品，司機常會送回乘客下車的飯店，可先向飯店櫃檯查詢。\n需要就醫時可請飯店櫃檯協助聯繫。緊急情況下使用公用電話撥打 110 或 119 無須投幣，按下紅色按鈕即可撥出。\n實用日語：「請送我去看醫生」— Isha ni tsurete itte kudasai；「請叫醫生來」— Isha o yonde kudasai。'
            },
        ],
        apps: [
            { name: 'Google Maps', purpose: '路線規劃與店家營業時間，日本鐵路轉乘資訊完整，離線地圖記得先下載。' },
            { name: '乗換案内 / Japan Transit', purpose: '電車轉乘、月台號碼與首末班車，比通用地圖更準確。' },
            { name: 'Google 翻譯', purpose: '相機即時翻譯菜單與標示，務必先下載日文離線語言包。' },
            { name: 'Visit Japan Web', purpose: '入境審查與海關申報 QR 碼，出發前先完成登錄並截圖存手機。' },
            { name: 'PayPay', purpose: '日本最普及的行動支付，部分小店只收現金或 PayPay。' },
            { name: '食べログ Tabelog', purpose: '餐廳評價，3.5 分以上大致可信，可直接看公休日與訂位。' },
            { name: 'Japan Official Travel', purpose: '官方觀光資訊，並會推播地震、颱風等災害警報。' },
        ],
        tickets: [
            { name: 'Suica / PASMO', detail: '交通 IC 卡，可搭電車巴士與便利商店小額消費。可加入 Apple Pay 直接用手機加值感應，最推薦。' },
            { name: 'JR Pass 全國版', detail: '需長距離跨區移動（例如東京↔京都↔廣島）才划算；只在單一城市活動反而虧。購買前先估算行程。' },
            { name: '東京地鐵 24/48/72 小時券', detail: '僅限東京 Metro 與都營地鐵，不含 JR。市區密集移動時很划算。' },
            { name: '京成 Skyliner', detail: '成田機場往返日暮里 / 上野最快，約 36～44 分鐘，有外國旅客優惠來回票。' },
            { name: 'N’EX 成田特快', detail: '成田直達東京、新宿、澀谷，外國旅客限定來回優惠票，行李空間大。' },
        ],
        phrases: [
            { cat: '急難', zh: '請幫我叫救護車', ja: '救急車を呼んでください' },
            { cat: '急難', zh: '我需要看醫生', ja: '医者に診てもらいたいです' },
            { cat: '急難', zh: '我的護照遺失了', ja: 'パスポートをなくしました' },
            { cat: '急難', zh: '請幫我聯絡台北駐日代表處', ja: '台北駐日経済文化代表処に連絡してください' },
            { cat: '急難', zh: '這附近有派出所嗎？', ja: 'この近くに交番はありますか' },
            { cat: '急難', zh: '我不會日文，可以找中文翻譯嗎？', ja: '日本語ができません。中国語の通訳をお願いできますか' },
            { cat: '點餐', zh: '請給我菜單', ja: 'メニューをください' },
            { cat: '點餐', zh: '請給我這個', ja: 'これをください' },
            { cat: '點餐', zh: '不要芥末', ja: 'わさび抜きでお願いします' },
            { cat: '點餐', zh: '我要結帳', ja: 'お会計お願いします' },
            { cat: '點餐', zh: '可以刷卡嗎？', ja: 'カードは使えますか' },
            { cat: '問路', zh: '請問車站在哪裡？', ja: '駅はどこですか' },
            { cat: '問路', zh: '這班車有到⋯⋯嗎？', ja: 'この電車は……に行きますか' },
            { cat: '問路', zh: '洗手間在哪裡？', ja: 'トイレはどこですか' },
            { cat: '問路', zh: '可以幫我拍照嗎？', ja: '写真を撮っていただけますか' },
            { cat: '購物', zh: '可以退稅嗎？', ja: '免税できますか' },
            { cat: '購物', zh: '有大一號的嗎？', ja: 'もっと大きいサイズはありますか' },
            { cat: '購物', zh: '這個多少錢？', ja: 'いくらですか' },
            { cat: '購物', zh: '可以試穿嗎？', ja: '試着してもいいですか' },
        ],
        knowhow: [
            { label: '乘機須知', text: '飛機起降與用餐時請將椅背豎直；座位若沒劃在一起，待起飛平穩後再自行協調調整；全機禁菸，安全帶指示燈亮起時請留在座位上。' },
            { label: '乘車須知', text: '記下遊覽車的公司名稱、顏色與車號，停車場車輛相似很容易找錯；請準時集合以免影響全團行程；下車時貴重物品務必隨身帶走。' },
            { label: '購物須知', text: '行程以參觀為主，看到喜歡的請盡快決定以免耽誤時間；務必索取收據，退稅、退換貨與保固都會用到。' },
            { label: '出入海關', text: '請聽從指示配合同行者一起行動，以免走散影響通關時間；液體、刀具類請確認已放入託運行李。' },
            { label: '免稅菸酒', text: '年滿 20 歲入境旅客可攜帶酒類 1 公升、捲菸 200 支或雪茄 25 支或菸絲 1 磅，以及價值 2 萬元以內的免稅品。' },
            { label: '遺失物品', text: '在車站或公共場所遺失可洽站長室或就近交番；遺留在計程車上的物品，司機通常會送回乘客下車的飯店，可先請飯店櫃檯協助查詢。' },
        ],
        roommates: [
            { date: '', room: '', name: '' },
            { date: '', room: '', name: '' },
            { date: '', room: '', name: '' },
            { date: '', room: '', name: '' },
            { date: '', room: '', name: '' },
            { date: '', room: '', name: '' },
            { date: '', room: '', name: '' },
            { date: '', room: '', name: '' },
        ],
        gallery: [
            { name: '一蘭拉麵', note: '天然豚骨・24H' },
            { name: '谷中銀座可樂餅', note: '150 円・現炸' },
            { name: '夕やけだんだん', note: '傍晚拍夕陽階梯' },
            { name: '根津神社千本鳥居', note: '免費・09:00 起' },
            { name: 'Tokyo Banana', note: '車站伴手禮首選' },
            { name: '白色戀人 / 生巧克力', note: '機場免稅可買' },
        ],
        oath: [
            '想吃東西就要說出來，不要餓著肚子硬撐。',
            '累了就說要休息，行程不一定要全部走完。',
            '合理的購物與消費，只要自己提得動就沒問題。',
            '抱怨行程的人，下一趟就換他負責排。',
            '去哪裡都要跟大家說一聲，不要落單。',
            '把自己打理乾淨，照片才會好看。',
            '沿路閒晃放空也是一種玩法，不是浪費時間。',
            '公主病與王子病，出國期間先收起來。',
        ],
    };

    // 建立 / 補齊資訊頁資料。舊手冊沒有這些欄位，第一次開啟時自動帶入預設值。
    function ensureInfoPages(book) {
        let seeded = false;
        if (!book.infoPages) { book.infoPages = {}; seeded = true; }
        const ip = book.infoPages;
        if (!Array.isArray(ip.notice))     { ip.notice     = JSON.parse(JSON.stringify(INFO_DEFAULTS_JP.notice));     seeded = true; }
        if (!Array.isArray(ip.emergency))  { ip.emergency  = JSON.parse(JSON.stringify(INFO_DEFAULTS_JP.emergency));  seeded = true; }
        if (!Array.isArray(ip.travelInfo)) { ip.travelInfo = JSON.parse(JSON.stringify(INFO_DEFAULTS_JP.travelInfo)); seeded = true; }
        ['apps', 'tickets', 'phrases', 'knowhow', 'roommates', 'oath'].forEach(k => {
            if (!Array.isArray(ip[k])) { ip[k] = JSON.parse(JSON.stringify(INFO_DEFAULTS_JP[k])); seeded = true; }
        });

        // 每日餐食與時間：一天一筆，跟著行程天數走。天數變動時補齊，不動既有資料。
        if (!Array.isArray(ip.meals)) { ip.meals = []; seeded = true; }
        const dayCount = (book.days || []).length;
        while (ip.meals.length < dayCount) {
            ip.meals.push({ breakfast: '', lunch: '', dinner: '', wakeup: '', mealTime: '', gather: '' });
            seeded = true;
        }

        // 每日推薦照片牆：一天一組。只有第一天先給範例，讓使用者一眼看到這個
        // 模組長什麼樣、以及換風格時它會怎麼變；其餘天數留空，由「+ 新增推薦」加。
        if (!Array.isArray(ip.gallery)) {
            ip.gallery = [];
            seeded = true;
        }
        while (ip.gallery.length < dayCount) {
            ip.gallery.push(ip.gallery.length === 0
                ? JSON.parse(JSON.stringify(INFO_DEFAULTS_JP.gallery))
                : []);
            seeded = true;
        }

        // 搭機資訊：沿用手冊既有的去／回程航班，不另外要使用者重打一次
        if (!ip.flightList) {
            seeded = true;
            const f = book.flights || {};
            ip.flightList = [
                { date: '去程', route: `${f.depAirport || '--'} ／ ${f.depArrAirport || '目的地'}`,
                  flight: `${f.depAirline || ''} ${f.depFlight || ''}`.trim(), time: `${f.depTime || '--'} ／ ${f.depArrTime || '--'}` },
                { date: '回程', route: `${f.retAirport || '--'} ／ ${f.retArrAirport || '桃園國際機場'}`,
                  flight: `${f.retAirline || ''} ${f.retFlight || ''}`.trim(), time: `${f.retTime || '--'} ／ ${f.retArrTime || '--'}` },
            ];
        }
        if (!ip.meeting) {
            seeded = true;
            ip.meeting = {
                time: '請於班機起飛前 2 小時抵達機場',
                place: book.flights ? (book.flights.depAirport || '桃園國際機場') : '桃園國際機場',
                note: '請提前完成線上報到與 Visit Japan Web 登錄，並確認護照效期六個月以上。',
            };
        }

        // 飯店資訊：把原本只有一行字串的住宿清單升級成完整卡片
        if (!Array.isArray(ip.hotels)) {
            ip.hotels = (book.hotels || []).map(h => {
                const s = String(h);
                const m = s.match(/^\s*([\d/\-.\s]+)\s+(.*)$/);
                return { date: m ? m[1].trim() : '', name: m ? m[2].trim() : s,
                         address: '', phone: '', url: '', desc: '' };
            });
            if (!ip.hotels.length) {
                ip.hotels = [{ date: '', name: '飯店名稱', address: '', phone: '', url: '', desc: '' }];
            }
            seeded = true;
        }
        // 第一次帶入預設值後立刻存檔，否則資料只活在記憶體裡，使用者關掉分頁
        // 前若沒編輯過任何欄位，下次開啟又會重新 seed 一次。
        if (seeded) saveAllData();
        return ip;
    }

    // --- 分頁引擎 -----------------------------------------------------------
    // blocks: [{ html, group }]，group 用來在續頁重複標題（例如「旅遊資訊 (續)」）
    // 回傳 [[block,...], ...]，每個元素代表一「欄」。
    function paginateBlocks(blocks, colsPerPage) {
        const cap = getInfoCapacity();
        const cols = colsPerPage || cap.columns || 1;
        const box = getMeasureBox();

        // 量測盒寬度必須等於「實際一欄的寬度」，量出來的高度才準。
        // 多欄時每欄寬 = (內容寬 - 欄距總和) / 欄數。
        const colMM = (cap.contentMM - INFO_COL_GAP_MM * (cols - 1)) / cols;
        box.style.width = colMM + 'mm';

        // 一次把所有區塊放進量測盒，讀完高度再清空 —— 逐塊 append/remove 會
        // 觸發大量 reflow，頁數多時會明顯卡頓。
        box.innerHTML = blocks.map(b => b.html).join('');
        const heights = Array.from(box.children).map(el => {
            const cs = getComputedStyle(el);
            return el.offsetHeight + parseFloat(cs.marginTop || 0) + parseFloat(cs.marginBottom || 0);
        });
        box.innerHTML = '';

        const isTitle = blocks.map(b => /info-section-title/.test(b.html));

        // 依「軟上限 limit」貪婪切欄。limit 一定不會超過實際容量 cap.height。
        function fill(limit) {
            const cols2 = [];
            let cur = [], used = 0;
            for (let i = 0; i < blocks.length; i++) {
                const h = heights[i] || 0;

                // 單一區塊就超過一整欄時只能讓它自己佔一欄（總比被裁掉好）
                if (h > cap.height && !cur.length) {
                    cols2.push([blocks[i]]);
                    continue;
                }
                if (used + h > limit && cur.length) {
                    // 避免「孤兒標題」：小標若剛好落在欄末，把它一起帶到下一欄，
                    // 否則會出現標題在這頁最下面、內容全在下一欄的難看情形。
                    if (cur.length > 1 && isTitle[i - 1] && cur[cur.length - 1] === blocks[i - 1]) {
                        cur.pop();
                        used -= heights[i - 1] || 0;
                        cols2.push(cur);
                        cur = [];
                        used = 0;
                        // 要「重新處理被退回的那個標題」。for 迴圈結尾會 i++，
                        // 所以必須退兩格；只退一格會與 i++ 抵銷，標題被跳過而消失。
                        i -= 2;
                        continue;
                    }
                    cols2.push(cur);
                    cur = [];
                    used = 0;
                    // 注意：這裡不能 continue —— 換欄之後仍要把「當前這個區塊」
                    // 放進新的一欄，否則它會被整個跳過、內容憑空消失。
                }
                cur.push(blocks[i]);
                used += h;
            }
            if (cur.length) cols2.push(cur);
            return cols2;
        }

        // 先用完整容量求出「最少需要幾欄」
        const minCols = fill(cap.height).length;

        // 再二分搜尋出「還能維持這個欄數的最小軟上限」。欄數對軟上限是單調
        // 遞減的，所以二分有效。這樣內容會平均分散到各欄，而不是前面塞爆、
        // 最後一欄只剩兩三行 —— 也就是「實用語句第三頁才一點點」的成因。
        let lo = 0, hi = cap.height, best = cap.height;
        while (lo <= hi) {
            const mid = Math.floor((lo + hi) / 2);
            if (fill(mid).length <= minCols) {
                best = mid;
                hi = mid - 1;
            } else {
                lo = mid + 1;
            }
        }
        return fill(best);
    }

    function getMeasureBox() {
        let box = document.getElementById('info-measure-box');
        if (!box) {
            box = document.createElement('div');
            box.id = 'info-measure-box';
            box.className = 'info-measure-box';
            document.body.appendChild(box);
        }
        return box;
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // 可編輯欄位：統一用 data-info-path 指路，一個委派事件處理全部四頁
    function editable(path, value, cls) {
        return `<span class="info-edit${cls ? ' ' + cls : ''}" contenteditable="true" spellcheck="false" data-info-path="${path}">${escapeHtml(value)}</span>`;
    }

    function editableBlock(path, value) {
        const html = escapeHtml(value).replace(/\n/g, '<br>');
        return `<div class="info-edit info-edit-block" contenteditable="true" spellcheck="false" data-info-path="${path}" data-multiline="1">${html}</div>`;
    }

    // --- 各頁的區塊產生器 ---------------------------------------------------
    function buildNoticeBlocks(ip) {
        const blocks = [];
        // 這裡不再放「注意事項」小標，頁首大標已經寫了，重複兩次很奇怪
        ip.notice.forEach((row, i) => {
            blocks.push({ group: '注意事項', html: `
                <div class="info-row">
                    <div class="info-row-label">${editable(`notice.${i}.label`, row.label)}</div>
                    <div class="info-row-text">${editable(`notice.${i}.text`, row.text)}</div>
                </div>` });
        });
        blocks.push({ html: `<div class="info-section-title">☎️ 緊急聯絡資訊</div>`, group: '緊急聯絡資訊' });
        ip.emergency.forEach((row, i) => {
            blocks.push({ group: '緊急聯絡資訊', html: `
                <div class="info-row">
                    <div class="info-row-label">${editable(`emergency.${i}.label`, row.label)}</div>
                    <div class="info-row-text">${editable(`emergency.${i}.text`, row.text)}</div>
                </div>` });
        });
        return blocks;
    }

    function buildTravelInfoBlocks(ip) {
        const blocks = [];
        ip.travelInfo.forEach((sec, i) => {
            blocks.push({ group: '旅遊資訊', html: `
                <div class="info-article">
                    <h4 class="info-article-title">${editable(`travelInfo.${i}.title`, sec.title)}</h4>
                    ${editableBlock(`travelInfo.${i}.body`, sec.body)}
                </div>` });
        });
        return blocks;
    }

    function buildFlightBlocks(ip) {
        const blocks = [];
        blocks.push({ group: '搭機資訊', html: `<div class="info-section-title">🧳 集合時間與地點</div>` });
        blocks.push({ group: '搭機資訊', html: `
            <div class="info-row"><div class="info-row-label">集合時間</div>
                <div class="info-row-text">${editable('meeting.time', ip.meeting.time)}</div></div>` });
        blocks.push({ group: '搭機資訊', html: `
            <div class="info-row"><div class="info-row-label">集合地點</div>
                <div class="info-row-text">${editable('meeting.place', ip.meeting.place)}</div></div>` });
        blocks.push({ group: '搭機資訊', html: `
            <div class="info-row"><div class="info-row-label">提醒</div>
                <div class="info-row-text">${editable('meeting.note', ip.meeting.note)}</div></div>` });

        blocks.push({ group: '搭機資訊', html: `<div class="info-section-title">✈️ 班機一覽表</div>` });
        blocks.push({ group: '搭機資訊', html: `
            <div class="info-table-head">
                <span>日期</span><span>航段</span><span>班次</span><span>起飛／抵達</span>
            </div>` });
        ip.flightList.forEach((f, i) => {
            blocks.push({ group: '搭機資訊', html: `
                <div class="info-table-row">
                    <span>${editable(`flightList.${i}.date`, f.date)}</span>
                    <span>${editable(`flightList.${i}.route`, f.route)}</span>
                    <span>${editable(`flightList.${i}.flight`, f.flight)}</span>
                    <span>${editable(`flightList.${i}.time`, f.time)}</span>
                </div>` });
        });
        return blocks;
    }

    function buildHotelBlocks(ip) {
        return ip.hotels.map((h, i) => ({ group: '飯店資訊', html: `
            <div class="info-hotel-card">
                <div class="info-hotel-date">${editable(`hotels.${i}.date`, h.date || '日期')}</div>
                <h4 class="info-hotel-name">${editable(`hotels.${i}.name`, h.name)}</h4>
                <div class="info-hotel-meta">
                    <div><span class="info-hotel-key">地址</span>${editable(`hotels.${i}.address`, h.address || '—')}</div>
                    <div><span class="info-hotel-key">電話</span>${editable(`hotels.${i}.phone`, h.phone || '—')}</div>
                    <div><span class="info-hotel-key">官網</span>${editable(`hotels.${i}.url`, h.url || '—')}</div>
                </div>
                <div class="info-hotel-desc">${editableBlock(`hotels.${i}.desc`, h.desc || '')}</div>
            </div>` }));
    }


    function buildKnowhowBlocks(ip) {
        const blocks = [];
        ip.knowhow.forEach((row, i) => {
            blocks.push({ group: '出國須知', html: `
                <div class="info-row">
                    <div class="info-row-label">${editable(`knowhow.${i}.label`, row.label)}</div>
                    <div class="info-row-text">${editable(`knowhow.${i}.text`, row.text)}</div>
                </div>` });
        });
        blocks.push({ group: '出國須知', html: `<div class="info-section-title">🛏️ 同行者與房號</div>` });
        blocks.push({ group: '出國須知', html: `
            <div class="info-table-head info-room-row">
                <span>日期</span><span>房號</span><span>同行者姓名</span>
            </div>` });
        ip.roommates.forEach((r, i) => {
            blocks.push({ group: '出國須知', html: `
                <div class="info-table-row info-room-row">
                    <span>${editable(`roommates.${i}.date`, r.date)}</span>
                    <span>${editable(`roommates.${i}.room`, r.room)}</span>
                    <span>${editable(`roommates.${i}.name`, r.name)}</span>
                </div>` });
        });
        return blocks;
    }

    function buildAppBlocks(ip) {
        const blocks = [];
        blocks.push({ group: 'APP 與票券', html: `<div class="info-section-title">📱 必備 APP</div>` });
        ip.apps.forEach((a, i) => {
            blocks.push({ group: 'APP 與票券', html: `
                <div class="info-row">
                    <div class="info-row-label">${editable(`apps.${i}.name`, a.name)}</div>
                    <div class="info-row-text">${editable(`apps.${i}.purpose`, a.purpose)}</div>
                </div>` });
        });
        blocks.push({ group: 'APP 與票券', html: `<div class="info-section-title">🎫 交通票券比較</div>` });
        ip.tickets.forEach((t, i) => {
            blocks.push({ group: 'APP 與票券', html: `
                <div class="info-row">
                    <div class="info-row-label">${editable(`tickets.${i}.name`, t.name)}</div>
                    <div class="info-row-text">${editable(`tickets.${i}.detail`, t.detail)}</div>
                </div>` });
        });
        return blocks;
    }

    function buildPhraseBlocks(ip) {
        const blocks = [];
        let lastCat = null;
        ip.phrases.forEach((ph, i) => {
            if (ph.cat !== lastCat) {
                lastCat = ph.cat;
                blocks.push({ group: '實用語句', html: `<div class="info-section-title">💬 ${ph.cat}</div>` });
            }
            blocks.push({ group: '實用語句', html: `
                <div class="info-phrase">
                    <div class="info-phrase-zh">${editable(`phrases.${i}.zh`, ph.zh)}</div>
                    <div class="info-phrase-ja">${editable(`phrases.${i}.ja`, ph.ja)}</div>
                </div>` });
        });
        blocks.push({ group: '實用語句', html: `<div class="info-section-title">🤝 出國宣誓</div>` });
        ip.oath.forEach((line, i) => {
            blocks.push({ group: '實用語句', html: `
                <div class="info-oath">
                    <span class="info-oath-no">${i + 1}</span>
                    <span class="info-oath-text">${editable(`oath.${i}`, line)}</span>
                </div>` });
        });
        return blocks;
    }

    // --- 主渲染 -------------------------------------------------------------
    const INFO_PAGE_DEFS = [
        { key: 'notice',     icon: '⚠️', title: '注意事項',   badge: '注意', build: buildNoticeBlocks },
        { key: 'flights',    icon: '✈️', title: '搭機資訊',   badge: '搭機', build: buildFlightBlocks },
        { key: 'hotels',     icon: '🏨', title: '飯店資訊',   badge: '飯店', build: buildHotelBlocks },
        { key: 'knowhow',    icon: '📋', title: '出國須知',   badge: '須知', build: buildKnowhowBlocks },
        { key: 'apps',       icon: '📱', title: 'APP 與票券', badge: 'APP',  build: buildAppBlocks },
        { key: 'phrases',    icon: '💬', title: '實用語句',   badge: '語句', build: buildPhraseBlocks, cols: 2 },
        { key: 'travelInfo', icon: '🗾', title: '旅遊資訊',   badge: '資訊', build: buildTravelInfoBlocks },
    ];

    function renderInfoPages(book) {
        const navBox = document.getElementById('dynamic-info-nav');
        const pageBox = document.getElementById('dynamic-info-pages');
        if (!pageBox) return;
        if (navBox) navBox.innerHTML = '';
        pageBox.innerHTML = '';

        const ip = ensureInfoPages(book);
        const cap = getInfoCapacity();

        // 每一節各自獨立成頁時，短的節（搭機資訊只填 34%、飯店資訊 46%）
        // 會各自佔掉一整頁，整份手冊看起來很空。改成把「欄數相同且相鄰」的
        // 節串成同一條流排版，短節就會自然接在同一頁上，頁面填得滿、
        // 總頁數也變少。欄數不同的節（實用語句是雙欄）自成一條流。
        const streams = [];
        INFO_PAGE_DEFS.forEach(def => {
            const blocks = def.build(ip);
            if (!blocks.length) return;
            const colsPerPage = (def.cols && cap.contentMM >= 120) ? def.cols : (cap.columns || 1);

            // 每節開頭插一個大標，合併之後才看得出這裡是新的一節
            const lead = {
                group: def.title,
                sectionKey: def.key,
                isLead: true,
                html: `<div class="info-lead-title" data-section="${def.key}">${def.icon} ${def.title}</div>`,
            };
            const tagged = [lead, ...blocks].map(b => ({ ...b, sectionKey: def.key }));

            const last = streams[streams.length - 1];
            if (last && last.cols === colsPerPage) {
                last.blocks.push(...tagged);
                last.defs.push(def);
            } else {
                streams.push({ cols: colsPerPage, blocks: tagged, defs: [def] });
            }
        });

        let pageSeq = 0;
        const navTargets = [];      // {def, pageId}

        streams.forEach(stream => {
            const columns = paginateBlocks(stream.blocks, stream.cols);
            const pages = [];
            for (let i = 0; i < columns.length; i += stream.cols) {
                pages.push(columns.slice(i, i + stream.cols));
            }

            pages.forEach(cols => {
                const pageId = `info-${++pageSeq}`;

                // 這一頁上有哪些節開頭？第一個用來當頁首標題與側邊頁籤，
                // 其餘的節把導覽也指到這一頁。
                const startsHere = [];
                cols.forEach(col => col.forEach(b => {
                    if (b.isLead) startsHere.push(b.sectionKey);
                }));
                startsHere.forEach(key => {
                    const def = stream.defs.find(d => d.key === key);
                    if (def) navTargets.push({ def, pageId });
                });

                // 頁首顯示這一頁的主題：優先用本頁開始的第一節，
                // 若整頁都是上一頁延續下來的，就標示「(續)」。
                const firstBlock = cols[0] && cols[0][0];
                const contDef = stream.defs.find(d => d.key === (firstBlock && firstBlock.sectionKey));
                // 頁首要講的是「這一頁最上面是什麼」。若第一個區塊不是某節的
                // 大標，代表這頁開頭是上一節延續下來的內容，頁首就該寫上一節
                // 的名字加「(續)」—— 寫成本頁稍後才開始的那一節會對不上，
                // 讀者在頁首看到「搭機資訊(續)」但頁面開頭其實是緊急聯絡資訊。
                const isCont = !!(firstBlock && !firstBlock.isLead);
                const headDef = isCont
                    ? contDef
                    : stream.defs.find(d => d.key === (firstBlock && firstBlock.sectionKey));
                const title = headDef ? `${headDef.icon} ${headDef.title}` : '旅遊資訊';

                const sec = document.createElement('section');
                sec.id = `page-${pageId}`;
                sec.className = 'book-page info-page';
                sec.setAttribute('data-tab', headDef ? headDef.title : '旅遊資訊');
                sec.innerHTML = `
                    <div class="page-header-container">
                        <h2 class="page-title">${title}${isCont ? ' <span class="info-page-no">(續)</span>' : ''}</h2>
                    </div>
                    <div class="info-columns" data-columns="${stream.cols}">
                        ${cols.map(col => `<div class="info-column">${col.map(b => b.html).join('')}</div>`).join('')}
                    </div>`;
                pageBox.appendChild(sec);
            });
        });

        // 側邊導覽：每一節一個項目，指到它實際開始的那一頁
        if (navBox) {
            const seen = new Set();
            navTargets.forEach(({ def, pageId }) => {
                if (seen.has(def.key)) return;
                seen.add(def.key);
                const a = document.createElement('a');
                a.href = `#page-${pageId}`;
                a.className = 'nav-item';
                a.setAttribute('data-page', pageId);
                a.innerHTML = `<span class="day-badge info-badge">${def.badge}</span><span>${def.title}</span>`;
                navBox.appendChild(a);
            });
        }
    }

    function setByPath(obj, path, value) {
        const parts = path.split('.');
        let cur = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            const k = parts[i];
            if (cur[k] == null) return false;
            cur = cur[k];
        }
        const last = parts[parts.length - 1];
        if (cur[last] === value) return false;
        cur[last] = value;
        return true;
    }

    document.addEventListener('focusout', (e) => {
        const el = e.target.closest && e.target.closest('.info-edit');
        if (!el) return;
        const book = getCurrentHandbook();
        if (!book) return;
        const value = el.dataset.multiline
            ? el.innerText.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim()
            : el.textContent.trim();

        // 兩種路徑根：data-info-path 指向 book.infoPages（資訊頁內容），
        // data-book-path 指向 book 本身（車程時間屬於行程的 timeline）。
        let changed = false;
        if (el.dataset.infoPath) {
            if (!book.infoPages) return;
            changed = setByPath(book.infoPages, el.dataset.infoPath, value);
        } else if (el.dataset.bookPath) {
            changed = setByPath(book, el.dataset.bookPath, value);
        }
        if (!changed) return;

        saveAllData();
        // 只有資訊頁的內容長度會影響分頁切點，才需要重畫。行程頁上的欄位
        // （餐食、推薦格）重畫會把使用者正在輸入的下一格砍掉重建。
        if (el.dataset.infoPath && !/^(meals|gallery)\./.test(el.dataset.infoPath)) {
            renderInfoPages(book);
        }
    });

    // 單行欄位按 Enter 不換行（會撐破表格列高），多行欄位維持正常換行
    document.addEventListener('keydown', (e) => {
        const el = e.target.closest && e.target.closest('.info-edit');
        if (!el || e.key !== 'Enter' || el.dataset.multiline) return;
        e.preventDefault();
        el.blur();
    });

    // 貼上一律取純文字，避免把來源網頁的樣式與結構整包帶進來
    document.addEventListener('paste', (e) => {
        const el = e.target.closest && e.target.closest('.info-edit');
        if (!el) return;
        e.preventDefault();
        let text = (e.clipboardData || window.clipboardData).getData('text/plain');
        if (!el.dataset.multiline) text = text.replace(/\s+/g, ' ');
        document.execCommand('insertText', false, text);
    });


    // ==========================================================================
    // 13. 拼版 / 騎馬釘小冊子 (Saddle-stitch imposition)
    // ==========================================================================
    // 雙面列印 + 對折裝訂時，紙張上的頁面順序不等於閱讀順序。八頁的小冊子，
    // 第一張紙的正面必須是「第8頁 | 第1頁」，背面是「第2頁 | 第7頁」，全部
    // 疊在一起對折之後才會從第1頁順順地讀到第8頁。
    //
    // 通式（1-based，N 為總頁數且必為 4 的倍數，第 i 張紙從 0 起算）：
    //   正面： 左 = N - 2i      右 = 2i + 1
    //   背面： 左 = 2i + 2      右 = N - 2i - 1
    //
    // 實作上不動 DOM 順序（會弄壞導覽與編輯），改成算出每頁該落在第幾格，
    // 用 CSS flex 的 order 屬性擺位。
    const IMPOSE_KEY = 'travel_imposition';

    function isImposition() {
        return localStorage.getItem(IMPOSE_KEY) === '1';
    }

    function clearImposition() {
        document.querySelectorAll('.book-page').forEach(el => {
            el.style.order = '';
            el.classList.remove('impose-left', 'impose-right');
        });
        document.querySelectorAll('.impose-blank').forEach(el => el.remove());
        document.body.classList.remove('imposition');
    }

    function applyImposition() {
        clearImposition();
        if (!isImposition()) return;

        const book = getCurrentHandbook();
        // 只有雙頁詳細版是「一張橫式 A4 對折成兩個 A5 頁面」的結構，
        // 其他版型不是騎馬釘小冊子，套拼版沒有意義。
        if (!book || book.template !== 'detailed') return;

        document.body.classList.add('imposition');

        const container = document.querySelector('.book-pages');
        const pages = [...document.querySelectorAll('.book-page')];
        if (!pages.length) return;

        // 補白頁到 4 的倍數 —— 騎馬釘一張紙固定產生 4 個頁面，湊不滿會錯位
        const pad = (4 - (pages.length % 4)) % 4;
        for (let i = 0; i < pad; i++) {
            const blank = document.createElement('section');
            blank.className = 'book-page impose-blank';
            container.appendChild(blank);
            pages.push(blank);
        }

        const N = pages.length;
        const slotOf = new Array(N);        // 閱讀頁碼(0-based) -> 紙上格子序號
        for (let i = 0; i < N / 4; i++) {
            const frontLeft  = N - 2 * i;       // 1-based
            const frontRight = 2 * i + 1;
            const backLeft   = 2 * i + 2;
            const backRight  = N - 2 * i - 1;
            const base = i * 4;
            slotOf[frontLeft  - 1] = base + 0;
            slotOf[frontRight - 1] = base + 1;
            slotOf[backLeft   - 1] = base + 2;
            slotOf[backRight  - 1] = base + 3;
        }

        pages.forEach((el, readingIdx) => {
            const slot = slotOf[readingIdx];
            el.style.order = String(slot);
            el.classList.add(slot % 2 === 0 ? 'impose-left' : 'impose-right');
        });
    }

    const btnImpose = document.getElementById('btn-imposition');
    if (btnImpose) {
        const syncImposeBtn = () => {
            const on = isImposition();
            btnImpose.classList.toggle('btn-primary', on);
            btnImpose.classList.toggle('btn-secondary', !on);
            btnImpose.querySelector('span').textContent = on ? '拼版：已開啟' : '拼版：關閉';
            const hint = document.getElementById('imposition-hint');
            if (hint) hint.style.display = on ? 'block' : 'none';
        };
        btnImpose.addEventListener('click', () => {
            const book = getCurrentHandbook();
            if (book && book.template !== 'detailed') {
                alert('拼版是為了「雙面列印後對折裝訂成小冊子」而設計的，\n目前只適用於「雙頁詳細版」。\n請先把排版版型切換成雙頁詳細版。');
                return;
            }
            localStorage.setItem(IMPOSE_KEY, isImposition() ? '0' : '1');
            syncImposeBtn();
            applyImposition();
        });
        syncImposeBtn();
    }


    // ==========================================================================
    // 14. 行程簡介（目錄）、封底、關鍵字強調、頁碼
    // ==========================================================================

    const TOC_COLORS = [
        '#E8A0A0', '#F0B98D', '#E9DC8B', '#A8D5A2', '#9FC7E8',
        '#B9AEDD', '#F2B5D4', '#8FD3D0', '#F5C77E', '#B8D98D',
    ];

    function renderTocPage(book) {
        const box = document.getElementById('dynamic-toc-page');
        if (!box) return;
        box.innerHTML = '';

        const days = book.days || [];
        const sec = document.createElement('section');
        sec.id = 'page-toc';
        sec.className = 'book-page toc-page';
        sec.setAttribute('data-tab', '行程簡介');

        if (!days.length) {
            // 空白手冊也要有這一頁，否則側邊導覽會指到不存在的頁面
            sec.innerHTML = `
                <div class="page-header-container">
                    <h2 class="page-title">📍 行程簡介</h2>
                </div>
                <p class="page-description">還沒有行程。在「編輯內容」加入每日行程後，這裡會自動整理成一頁總覽。</p>`;
            box.appendChild(sec);
            return;
        }

        const cards = days.map((day, i) => {
            const color = TOC_COLORS[i % TOC_COLORS.length];
            const stops = (day.timeline || []).map(t => {
                // 站名常寫成「第一站: 新宿御苑」，目錄只留地點本身
                const name = String(t.title || '').replace(/^\s*第[一二三四五六七八九十\d]+站\s*[:：]\s*/, '');
                return `<li class="toc-stop">${escapeHtml(name)}</li>`;
            }).join('');
            return `
                <div class="toc-day">
                    <div class="toc-date" style="background-color:${color}">${escapeHtml(day.dateText || day.dayNum || `D${i + 1}`)}</div>
                    <ul class="toc-stops">${stops}</ul>
                </div>`;
        }).join('');

        sec.innerHTML = `
            <div class="page-header-container">
                <h2 class="page-title">📍 行程簡介</h2>
            </div>
            <div class="toc-grid">${cards}</div>`;
        box.appendChild(sec);
    }

    function renderBackCover(book) {
        const box = document.getElementById('dynamic-backcover');
        if (!box) return;
        box.innerHTML = '';

        const mascotKey = book.mascot || 'dog';
        const sec = document.createElement('section');
        sec.id = 'page-backcover';
        sec.className = 'book-page backcover-page';
        sec.innerHTML = `
            <div class="backcover-layout">
                <div class="backcover-art">
                    <img src="assetsnew/${mascotKey}_cover.jpg" alt=""
                         onerror="this.onerror=null;this.src='assets/${mascotKey}_day1.jpg';">
                </div>
                <div class="backcover-words">
                    <div class="backcover-line">旅程的最後，謝謝一路同行。</div>
                    <div class="backcover-sub">${escapeHtml(book.title || '旅行手冊')}</div>
                    <div class="backcover-date">${escapeHtml(book.dates || '')}</div>
                </div>
                <div class="backcover-foot">See you next trip ✈</div>
            </div>`;
        box.appendChild(sec);
    }

    // 關鍵字強調：走在路上快速掃視時，均勻的內文很難一眼抓到重點。
    // 只套在「非可編輯」的內文（景點簡介）——可編輯欄位若插入標記元素，
    // 使用者一編輯就會把 HTML 標籤吃成純文字。
    const KEYWORDS = [
        '必吃', '必拍', '必買', '必訪', '預約', '訂位', '限定', '最佳',
        '推薦', '免費', '注意', '記得', '務必', '提早', '公休',
    ];
    const KEYWORD_RE = new RegExp(`(${KEYWORDS.join('|')})`, 'g');

    function highlightKeywords(text) {
        let out = escapeHtml(text == null ? '' : text);
        out = out.replace(/\*\*([^*]+)\*\*/g, '<strong class="kw-strong">$1</strong>');
        out = out.replace(KEYWORD_RE, '<mark class="kw">$1</mark>');
        return out;
    }

    // 頁碼。用 JS 標而不是 CSS counter，是因為 .book-page::after 已經被
    // 「PAGE BREAK」預覽標籤與拼版摺線記號用掉了，再疊上去會打架。
    function numberPages() {
        document.querySelectorAll('.page-no').forEach(el => el.remove());
        let n = 0;
        document.querySelectorAll('.book-page').forEach(sec => {
            if (sec.id === 'page-cover' || sec.id === 'page-backcover') return;
            if (sec.classList.contains('impose-blank')) return;
            n++;
            const tag = document.createElement('span');
            tag.className = 'page-no';
            tag.textContent = n;
            sec.appendChild(tag);
        });
    }

    // ==========================================================================
    // 11. 系統初始化 (System Boot)
    // ==========================================================================
    applyStyle(getActiveStyle());
    initData();
    renderHandbookSwitcher();
    renderCurrentHandbook();
    
    // 預設跳轉到 Cover
    setTimeout(() => {
        const coverNav = document.querySelector('.sidebar-menu .nav-item[data-page="cover"]');
        if (coverNav) coverNav.click();
    }, 100);
}

// ==========================================================================
// 啟動方式：由 auth.js 決定。
//  - 本機 file:// 或 localhost：auth.js 不設關卡，這裡直接啟動。
//  - 線上網址：auth.js 會先擋住，等帳號密碼驗證通過後才呼叫 __travelAppMain()。
// ==========================================================================
window.__travelAppMain = __travelAppMain;
if (!window.__TRAVEL_GATE) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', __travelAppMain);
    } else {
        __travelAppMain();
    }
}
