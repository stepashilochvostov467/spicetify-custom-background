// Custom Background 2.0 for Spicetify. All image processing and storage are local.
(() => {
    "use strict";
    if (window.__cbpLoaded) return;
    window.__cbpLoaded = true;

    const DEFAULT_EXTRA = {};
    const DEFAULTS = Object.freeze({
        blur: 0, dim: 0.45, cards: 0.4,
        libraryBlur: 14, libraryDim: 0.18,
        centerBlur: 0, centerDim: 0,
        playerBlur: 16, playerDim: 0.6,
        zoom: 100, x: 50, y: 50,
        readable: false, accent: false, custom: false, color: "#ffffff",
        colorMode: "standard"
    });
    const LIMITS = {
        blur: [0, 50], dim: [0, 1], cards: [0, 1],
        libraryBlur: [0, 40], libraryDim: [0, 1],
        centerBlur: [0, 40], centerDim: [0, 1],
        playerBlur: [0, 40], playerDim: [0, 1],
        zoom: [100, 250], x: [0, 100], y: [0, 100],
    };
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    function playerValue(method, fallback = 0) {
        try { return Spicetify.Player[method]() ?? fallback; } catch { return fallback; }
    }
    function normalize(value = {}) {
        if (!value || typeof value !== "object") value = {};
        const s = { ...DEFAULTS, ...DEFAULT_EXTRA };
        for (const [key, [lo, hi]] of Object.entries(LIMITS)) {
            if (typeof value[key] === "number" && Number.isFinite(value[key])) s[key] = clamp(value[key], lo, hi);
        }
        for (const key of ["readable", "accent", "custom"]) if (typeof value[key] === "boolean") s[key] = value[key];
        for(const [key, fallback] of Object.entries(DEFAULT_EXTRA)) {
            if(typeof fallback==='boolean' && typeof value[key]==='boolean')s[key]=value[key];
        }
        for(const key of ['trackColor','buttonColor'])if(/^#[0-9a-f]{6}$/i.test(value[key]||''))s[key]=value[key];
        if(['default','system'].includes(value.font))s.font=value.font;
        if(['off','spotify','spicy'].includes(value.lyricsSource))s.lyricsSource=value.lyricsSource;
        if(['spotify','spicy'].includes(value.lyricsLastSource))s.lyricsLastSource=value.lyricsLastSource;
        if(['local','mymemory'].includes(value.lyricsTranslationEngine))s.lyricsTranslationEngine=value.lyricsTranslationEngine;
        if (/^#[0-9a-f]{6}$/i.test(value.color || "")) s.color = value.color;
        const mode=['standard','custom','auto'].includes(value.colorMode)?value.colorMode:(s.readable||s.accent?'auto':s.custom?'custom':'standard');
        s.colorMode=mode;s.readable=mode==='auto';s.custom=mode==='custom';s.accent=false;
        return s;
    }
    const storage = {
        get(key) { try { return Spicetify.LocalStorage.get(key); } catch { return null; } },
        put(key, value) { Spicetify.LocalStorage.set(key, String(value)); },
        json(key, fallback) { try { return JSON.parse(this.get(key)) ?? fallback; } catch { return fallback; } }
    };
    function loadSettings() {
        const saved = storage.json("cbp_v2_settings", null);
        if (saved && typeof saved === "object") return normalize(saved);
        const old = { ...DEFAULTS };
        for (const [key, oldKey] of Object.entries({ blur: "cbp_bg_blur", dim: "cbp_bg_opacity", cards: "cbp_card_opacity", playerDim: "cbp_player_opacity" })) {
            const value = parseFloat(storage.get(oldKey));
            if (Number.isFinite(value)) old[key] = value;
        }
        delete old.colorMode;
        old.accent = storage.get("cbp_ai_color") === "true";
        old.custom = storage.get("cbp_use_custom_color") === "true";
        old.color = storage.get("cbp_custom_color_hex") || DEFAULTS.color;
        return normalize(old);
    }
    const BUILTINS = [
        { id: "glass", name: "Стекло", settings: normalize({ ...DEFAULTS, libraryDim: 0.14, centerDim: 0.1, centerBlur: 12, playerDim: 0.25, playerBlur: 22, readable: true, colorMode: "auto" }) },
        { id: "minimal", name: "Минимализм", settings: normalize({ ...DEFAULTS, libraryDim: 0, libraryBlur: 0, centerDim: 0, playerBlur: 0, playerDim: 0.16, cards: 0.08, readable: true, colorMode: "auto" }) },
        { id: "night", name: "Ночной", settings: normalize({ ...DEFAULTS, dim: 0.72, libraryDim: 0.3, centerDim: 0.16, centerBlur: 4, playerDim: 0.65, cards: 0.45, readable: true, colorMode: "auto" }) }
    ];
    const images = {
        open() {
            return new Promise((resolve, reject) => {
                const r = indexedDB.open("CBP_Storage", 1);
                r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains("images")) r.result.createObjectStore("images"); };
                r.onsuccess = () => resolve(r.result);
                r.onerror = () => reject(r.error);
                r.onblocked = () => reject(Error("Хранилище занято другим окном Spotify"));
            });
        },
        async run(mode, value, key = "cbp_bg_image") {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                let result = "";
                const tx = db.transaction("images", mode);
                const req = mode === "readonly" ? tx.objectStore("images").get(key) : tx.objectStore("images").put(value, key);
                req.onsuccess = () => { result = req.result || ""; };
                tx.oncomplete = () => { db.close(); resolve(result); };
                tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || Error("Ошибка хранилища")); };
            });
        }
    };
    const luminance = (rgb) => rgb.map(v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    const hex = rgb => "#" + rgb.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");
    const decodeImage = src => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(Error("Не удалось открыть изображение"));
        img.src = src;
    });
    function cropRect(iw, ih, width, height, zoom, x, y) {
        const scale = Math.max(width / iw, height / ih) * zoom / 100;
        const sw = width / scale, sh = height / scale;
        return [(iw - sw) * x / 100, (ih - sh) * y / 100, sw, sh];
    }
    function analyzePixels(data) {
        const rgb = [], buckets = new Map();
        for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3] / 255;
            const p = [0, 1, 2].map(n => data[i + n] * alpha + 18 * (1 - alpha));
            rgb.push(p);
            const max = Math.max(...p), min = Math.min(...p);
            if (max - min > 45 && max > 65 && min < 210) {
                const key = p.map(c => Math.min(255, Math.round(c / 32) * 32)).join(",");
                buckets.set(key, (buckets.get(key) || 0) + 1);
            }
        }
        const dominant = [...buckets].sort((a, b) => b[1] - a[1])[0]?.[0].split(",").map(Number) || [210, 220, 235];
        const text = dominant.map(c => 232 + c / 255 * 23);
        const textLum = luminance(text);
        // Use the 95th percentile of the visible crop; a 5:1 target leaves margin.
        const percentile = (dim) => {
            const values = rgb.map(p => luminance(p.map(c => c * (1 - dim)))).sort((a, b) => a - b);
            return values[Math.min(values.length - 1, Math.floor(values.length * 0.95))] || 0;
        };
        let lo = 0, hi = 0.9;
        for (let i = 0; i < 12; i++) {
            const mid = (lo + hi) / 2;
            if ((textLum + 0.05) / (percentile(mid) + 0.05) >= 5) hi = mid; else lo = mid;
        }
        return { text: hex(text), accent: hex(dominant), minDim: hi };
    }

    function baseStyles(bgOp, cardOp, playerOp) {
        return `__BASE_STYLES__`;
    }

    const APP = {
        settings: null, image: "", decoded: null, sample: null, analysisKey: "", activePreset: "", 
        revision: 0, writeQueue: Promise.resolve(), imageToken: 0,
        notify(message, error = false) { Spicetify.showNotification?.(message, error); },
        save() { storage.put("cbp_v2_settings", JSON.stringify(this.settings)); storage.put("cbp_v2_active_preset", this.activePreset); },
        async init() {
            this.settings = loadSettings();
            this.activePreset = storage.get("cbp_v2_active_preset") || "";
            this.customPresets = storage.json("cbp_v2_presets", []);
            if (!Array.isArray(this.customPresets)) this.customPresets = [];
            this.customPresets = this.customPresets.filter(p => p && typeof p.id === "string" && typeof p.name === "string").slice(0, 30).map(p => ({ id: p.id, name: p.name.slice(0, 40), imageSaved: p.imageSaved === true, settings: normalize(p.settings) }));
            this.presetImages = storage.json("cbp_v2_preset_images", {});
            if (!this.presetImages || typeof this.presetImages !== "object" || Array.isArray(this.presetImages)) this.presetImages = {};
            this.image = await images.run("readonly").catch(error => { console.error(error); this.notify("Сохранённый фон не загрузился. Можно выбрать новую картинку.", true); return ""; });
            this.bg = document.createElement("div"); this.bg.id = "cbp-bg-layer";
            this.theme = document.createElement("style"); this.theme.id = "cbp-style-tag";
            this.extra = document.createElement("style"); this.extra.id = "cbp-ui-style"; this.extra.textContent = UI_CSS;
            document.body.prepend(this.bg); document.head.append(this.theme, this.extra);
            this.buildUI(); this.initEffects(); this.registerButtons(); this.bind();
            await this.render();
        },
        presets() { return [...BUILTINS, ...this.customPresets]; },
        async render() {
            const token = ++this.revision;
            const s = this.settings;
            if (this.image && !this.image.startsWith("data:video/") && (s.readable || s.accent)) {
                const key = [s.zoom, s.x, s.y, innerWidth, innerHeight].join(":");
                try {
                    const source = this.image;
                    const img = this.decoded || await decodeImage(source);
                    if (token !== this.revision) return;
                    this.decoded = img;
                    if (key !== this.analysisKey || !this.sample) {
                        const canvas = document.createElement("canvas"); canvas.width = 80; canvas.height = 50;
                        const ctx = canvas.getContext("2d", { willReadFrequently: true });
                        ctx.fillStyle = "#121212"; ctx.fillRect(0, 0, 80, 50);
                        ctx.drawImage(img, ...cropRect(img.naturalWidth, img.naturalHeight, innerWidth, innerHeight, s.zoom, s.x, s.y), 0, 0, 80, 50);
                        this.sample = analyzePixels(ctx.getImageData(0, 0, 80, 50).data);
                        this.analysisKey = key;
                    }
                } catch (error) {
                    if (token !== this.revision) return;
                    console.error("[CBP] Image analysis", error);
                    this.sample = { text: "#f7f8fc", accent: "#d2dceb", minDim: 0.56 };
                }
            }
            if (token !== this.revision) return;
            const automatic = s.readable && !!this.image;
            const color = automatic || (s.accent && this.image) ? this.sample?.text || "#f7f8fc" : s.color;
            const effectiveDim = automatic ? Math.max(s.dim, this.sample?.minDim || (this.image.startsWith("data:video/") ? .56 : 0)) : s.dim;
            let css='';
            if(this.image){
                const baseKey=[effectiveDim,s.cards,s.playerDim].join(':');
                if(baseKey!==this.baseKey){this.baseKey=baseKey;this.baseCSS=baseStyles(effectiveDim,s.cards,s.playerDim);}
                const glassKey=[s.libraryDim,s.libraryBlur,s.centerDim,s.centerBlur,s.playerDim,s.playerBlur].join(':');
                if(glassKey!==this.glassKey){this.glassKey=glassKey;this.cachedGlassCSS=this.glassCSS(s);}
                const textKey=color+':'+(automatic||s.custom);
                if(textKey!==this.textKey){this.textKey=textKey;this.cachedTextCSS=this.textCSS(color,automatic||s.custom);}
                css=this.baseCSS+this.cachedGlassCSS+this.cachedTextCSS;
            }
            if(this.theme.textContent!==css)this.theme.textContent=css;
            this.renderBackground();

            const info = this.menu.querySelector("#cbp-auto-info");
            info.textContent = automatic ? `Автозатемнение: ${Math.round(effectiveDim * 100)}% · текст ${color.toUpperCase()}` : "Автоподбор учитывает видимую часть картинки и добавляет затемнение при необходимости.";
            this.menu.querySelector("#cbp-color").disabled = s.colorMode!=="custom";
            this.effectColor = color;
            this.menu.style.setProperty("--cbp-ui-ink", color);

            this.syncStickyClipping();
        },
        glassCSS(s) {
            const panel = (selectors, dim, blur) => `${selectors}{background:rgba(10,12,18,${dim})!important;backdrop-filter:blur(${blur}px)!important;-webkit-backdrop-filter:blur(${blur}px)!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)!important;}`;
            return panel(".Root__nav-bar,.yQCyOSVcMCen_NJKPHB6", s.libraryDim, s.libraryBlur)
                + panel(".Root__main-view,.R1kU6b2KxZc8FWfbYf3m", s.centerDim, s.centerBlur)
                + panel(".Root__now-playing-bar,.XvuTwlgQRqJ5NnVLN9ZH", s.playerDim, s.playerBlur)
                + `[data-testid="now-playing-bar"],.main-nowPlayingBar-container,.main-nowPlayingBar-nowPlayingBar{background:transparent!important;backdrop-filter:none!important;}`;
        },
        textCSS(color, enabled) {
            if (!enabled) return "";
            // Scope to Spotify content; keep settings, action buttons and artwork native.
            return `#main{--cbp-text:${color};}
                #main :is(.Root__nav-bar,.yQCyOSVcMCen_NJKPHB6,.Root__main-view,.R1kU6b2KxZc8FWfbYf3m,.Root__right-sidebar,.s8fIIxwITjOk1aFOxhPv,.Root__now-playing-bar,.XvuTwlgQRqJ5NnVLN9ZH) :is([data-encore-id="text"],h1,h2,h3,h4,p,a,[role="gridcell"]){color:var(--cbp-text)!important;text-shadow:0 1px 4px #000c!important;}
                #main :is(.Root__nav-bar,.yQCyOSVcMCen_NJKPHB6,.Root__main-view,.R1kU6b2KxZc8FWfbYf3m,.Root__right-sidebar,.s8fIIxwITjOk1aFOxhPv,.Root__now-playing-bar,.XvuTwlgQRqJ5NnVLN9ZH){--text-base:${color}!important;--text-subdued:${color}!important;}
                #main .main-trackList-rowTitle{color:${color}!important;text-shadow:0 1px 4px #000c!important;}`;
        },
        buildUI() {
            this.menu = document.createElement("section"); this.menu.id = "cbp-settings-menu";
            this.menu.hidden = true; this.menu.setAttribute("role", "dialog"); this.menu.setAttribute("aria-modal", "true"); this.menu.setAttribute("aria-labelledby", "cbp-heading");
            this.menu.innerHTML = `
                <header><div><small>CUSTOM BACKGROUND · 4.4.0</small><h2 id="cbp-heading">Твоё оформление</h2></div><button data-action="close" aria-label="Закрыть настройки">✕</button></header>
                <details><summary>Сохранённые оформления</summary>
                <div class="cbp-toolbar"><select id="cbp-presets" aria-label="Сохранённые оформления"></select><button data-action="apply">Применить</button></div>
                <div class="cbp-preset-save"><input id="cbp-preset-name" maxlength="40" placeholder="Название своего оформления" aria-label="Название оформления"><button data-action="save">Сохранить</button><button data-action="delete" aria-label="Удалить выбранное оформление">Удалить</button></div>
                <div class="cbp-row cbp-sharing"><button data-action="preset-image">Фон для выбранного</button><button data-action="export">Экспорт</button><button data-action="import">Импорт</button><input id="cbp-import" type="file" accept=".json,application/json" hidden></div>
                <p class="cbp-hint">Новое оформление сохраняет фон и настройки. «Фон для выбранного» назначает текущую картинку выбранному стилю. Экспорт включает картинку.</p></details>
                <details><summary>Фон и положение</summary>
                    <label class="cbp-upload">Выбрать картинку, GIF или видео<input id="cbp-image-upload" type="file" accept="image/*,video/mp4,video/webm"></label>
                    <p class="cbp-hint">До 30 МБ. Файл хранится локально. Видео воспроизводится без звука.</p>
                    ${this.slider("Размытие фона", "blur", 0, 50, 1, "px")}
                    ${this.slider("Затемнение фона", "dim", 0, 100, 1, "%")}
                    ${this.slider("Масштаб", "zoom", 100, 250, 1, "%")}
                    ${this.slider("Положение по горизонтали", "x", 0, 100, 1, "%")}
                    ${this.slider("Положение по вертикали", "y", 0, 100, 1, "%")}
                    <div class="cbp-row"><button data-action="center">По центру</button><button class="cbp-danger" data-action="remove-image">Удалить картинку</button></div>
                </details>
                <details><summary>Стеклянные панели</summary><p class="cbp-hint">Затемнение 0% — прозрачная панель. Размытие смягчает фон под ней.</p>
                    ${[ ["Медиатека", "library"], ["Центральная часть", "center"], ["Плеер", "player"] ].map(([name,key]) => `<h3>${name}</h3>${this.slider("Размытие", key+"Blur", 0, 40, 1, "px")}${this.slider("Затемнение", key+"Dim", 0, 100, 1, "%")}`).join("")}
                    ${this.slider("Непрозрачность карточек", "cards", 0, 100, 1, "%")}
                </details>
                <details><summary>Читаемость и цвет</summary>
                    <label class="cbp-row">Цвет текста<select data-setting="colorMode"><option value="standard">Стандартный</option><option value="custom">Свой цвет</option><option value="auto">Автоматический</option></select></label>
                    <p class="cbp-hint" id="cbp-auto-info"></p>
                    <div class="cbp-row"><span>Выбранный цвет</span><input id="cbp-color" type="color" aria-label="Цвет текста"></div>
                </details>
                <footer><span>Alt+B — настройки · Alt+V — текст песни</span></footer>`;
            this.backdrop = document.createElement("div"); this.backdrop.id = "cbp-menu-backdrop"; this.backdrop.hidden = true;
            document.body.append(this.backdrop, this.menu);
            this.fillPresets(); this.syncUI();
        },
        slider(label, key, min, max, step, unit) { return `<label class="cbp-slider"><span>${label}<output for="cbp-${key}" data-output="${key}"></output></span><input id="cbp-${key}" data-setting="${key}" data-unit="${unit}" type="range" min="${min}" max="${max}" step="${step}"></label>`; },
        toggle(key, label) { return `<label class="cbp-toggle"><input id="cbp-${key}" data-setting="${key}" type="checkbox"><span>${label}</span></label>`; },
        syncUI() {
            for (const input of this.menu.querySelectorAll("[data-setting]")) {
                const key = input.dataset.setting;
                if (input.type === "checkbox") input.checked = this.settings[key];
                else if (input.type === "color") input.value = this.settings[key];
                else if (input.tagName === "SELECT") input.value = this.settings[key];
                else {
                    const value = this.settings[key] * (["dim", "cards", "libraryDim", "centerDim", "playerDim"].includes(key) ? 100 : 1);
                    input.value = value;
                    this.menu.querySelector(`[data-output="${key}"]`).textContent = `${Math.round(value)}${input.dataset.unit}`;
                }
            }
            this.menu.querySelector("#cbp-color").value = this.settings.color;
        },
        fillPresets(selected = this.activePreset) {
            const list = this.menu.querySelector("#cbp-presets"); list.replaceChildren();
            for (const p of this.presets()) { const option = document.createElement("option"); option.value = p.id; option.textContent = p.name; list.append(option); }
            list.value = this.presets().some(p => p.id === selected) ? selected : "glass";
            this.menu.querySelector('[data-action="delete"]').disabled = BUILTINS.some(p => p.id === list.value);
        },
        async applyPreset(id) {
            const preset = this.presets().find(p => p.id === id); if (!preset) return;
            const token = ++this.imageToken;
            if (preset.imageSaved || this.presetImages[id] === true) {
                try { const data = await images.run("readonly", undefined, `cbp_preset_${id}`); if (token !== this.imageToken) return; await this.queueImage(data, token); }
                catch (error) { this.report(error); return; }
            }
            if (token !== this.imageToken) return;
            this.settings = normalize({ ...this.settings, ...preset.settings }); this.activePreset = id;
            this.save(); this.syncUI(); this.fillPresets(id); this.render();
            this.notify(`Оформление: ${preset.name}`);
        },
        cyclePreset() { const all = this.presets(); const index = all.findIndex(p => p.id === this.activePreset); this.applyPreset(all[(index + 1) % all.length].id); },
        showMenu(show = this.menu.hidden) {
            if (show) { this.previousFocus = document.activeElement; for(const section of this.menu.querySelectorAll("details"))section.open=false; this.menu.scrollTop=0; }
            this.menu.hidden = !show; this.backdrop.hidden = !show;
            if (show) this.menu.querySelector('[data-action="close"]').focus(); else this.previousFocus?.focus?.();
        },
        registerButtons() {
            this.settingsButton = new Spicetify.Topbar.Button("Оформление · Alt+B", "edit", () => this.showMenu(), false, true);
        },
        syncStickyClipping() {
            const root = document.querySelector('.R1kU6b2KxZc8FWfbYf3m,.Root__main-view');
            const viewport = root && ([...root.querySelectorAll('[data-overlayscrollbars-viewport],.os-viewport,.main-view-container__scroll-node')].find(el => el.scrollTop > 0)
                || root.querySelector('[data-overlayscrollbars-viewport],.os-viewport')
                || root.querySelector('.main-view-container__scroll-node'));
            if (!viewport) return;
            if(!this.image || viewport.scrollTop<=1){
                for(const el of root.querySelectorAll('[data-cbp-clipped]')){el.removeAttribute('data-cbp-clipped');el.style.removeProperty('--cbp-clip-top');}
                return;
            }
            const topbar = root.querySelector('.main-topBar-container');
            const edge = topbar?.getBoundingClientRect().bottom || viewport.getBoundingClientRect().top;
            const header = root.querySelector('.rrn0EjHTu7eCxn9G0Rrc.iPo4a2lbrsxW9Iedav3h');
            const headerRect = header?.getBoundingClientRect();
            const rowsEdge = headerRect && headerRect.top <= edge + 2 ? Math.max(edge, headerRect.bottom) : edge;
            for (const el of viewport.querySelectorAll('[role="row"],.Shelf,h2,h3')) {
                if (el.querySelector('[role="columnheader"]') || el.closest('.main-topBar-container')) continue;
                const rect = el.getBoundingClientRect();
                const cutoff = el.getAttribute('role') === 'row' ? rowsEdge : edge;
                const clip = this.image && viewport.scrollTop > 1 ? clamp(cutoff - rect.top, 0, rect.height) : 0;
                if (clip > 0) {
                    el.setAttribute('data-cbp-clipped', '');
                    el.style.setProperty('--cbp-clip-top', `${clip.toFixed(1)}px`);
                } else if (el.hasAttribute('data-cbp-clipped')) {
                    el.removeAttribute('data-cbp-clipped');
                    el.style.removeProperty('--cbp-clip-top');
                }
            }
        },
        bind() {
            let frame;
            const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => this.render()); };
            this.menu.addEventListener("input", e => {
                const el = e.target, key = el.dataset.setting;
                if (key) {
                    const value = el.type === "checkbox" ? el.checked : (el.tagName === "SELECT" || el.type === "color") ? el.value : Number(el.value) / (["dim", "cards", "libraryDim", "centerDim", "playerDim"].includes(key) ? 100 : 1);
                    this.settings = normalize({ ...this.settings, [key]: value }); if(key==='lyricsSource'&&value!=='off')this.settings.lyricsLastSource=value; this.activePreset = "";
                    this.syncUI(); this.save(); schedule();
                } else if (el.id === "cbp-color") { this.settings.color = el.value; this.activePreset = ""; this.save(); schedule(); }
            });
            this.menu.querySelector("#cbp-presets").addEventListener("change", () => this.fillPresets(this.menu.querySelector("#cbp-presets").value));
            this.menu.addEventListener("click", e => {
                const action = e.target.closest("[data-action]")?.dataset.action;
                const selected = this.menu.querySelector("#cbp-presets").value;
                if (action === "close") this.showMenu(false);
                if (action === "apply") this.applyPreset(selected).catch(error => this.report(error));
                if (action === "center") { Object.assign(this.settings, { x: 50, y: 50, zoom: 100 }); this.activePreset = ""; this.save(); this.syncUI(); this.render(); }
                if (action === "save") this.savePreset().catch(error => this.report(error));
                if (action === "preset-image") this.rememberPresetImage(selected).catch(error => this.report(error));
                if (action === "export") this.exportPreset(selected).catch(error => this.report(error));
                if (action === "import") this.menu.querySelector("#cbp-import").click();
                if (action === "delete") {
                    if (BUILTINS.some(p => p.id === selected)) return;
                    this.customPresets = this.customPresets.filter(p => p.id !== selected);
                    storage.put("cbp_v2_presets", JSON.stringify(this.customPresets)); if(this.activePreset===selected){this.activePreset="";this.save();} this.fillPresets();
                }
                if (action === "remove-image") { const token = ++this.imageToken; this.queueImage("", token).catch(error => this.report(error)); }
            });
            this.backdrop.addEventListener("click", () => this.showMenu(false));
            this.menu.querySelector("#cbp-import").addEventListener("change", async e => { try { const file = e.target.files[0]; if (file) { if (file.size > 45 * 1024 * 1024) throw Error("Файл оформления слишком большой (максимум 45 МБ)"); await this.previewImport(JSON.parse(await file.text())); } } catch (error) { this.report(error); } finally { e.target.value = ""; } });
            this.menu.querySelector("#cbp-image-upload").addEventListener("change", e => {
                this.mediaUpload=(async()=>{
                const token = ++this.imageToken; const file = e.target.files[0]; if (!file) return;
                try {
                    if (!/^(image\/|video\/(mp4|webm)$)/.test(file.type)) throw Error("Выбери картинку, GIF, MP4 или WebM");
                    if (file.size > 30 * 1024 * 1024) throw Error("Максимальный размер картинки — 30 МБ");
                    const data = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(file); });
                    await validateMedia(data);
                    if (token === this.imageToken) await this.queueImage(data, token);
                } catch (error) { this.report(error); }
                finally { e.target.value = ""; }
                })();
            });
            document.addEventListener("keydown", e => {
                if(this.importPreview || this.backgroundEditor)return;
                if (e.key === "Escape") {
                    if (!this.menu.hidden) { this.showMenu(false); e.preventDefault(); }
                }
                if (!this.menu.hidden && e.key === "Tab") {
                    const focusable = [...this.menu.querySelectorAll('button:not(:disabled),input:not(:disabled),select,summary')].filter(el => el.getClientRects().length);
                    const first = focusable[0], last = focusable[focusable.length - 1];
                    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
                }
                if (e.repeat || e.ctrlKey || e.metaKey) return;
                const shortcut = ({ KeyB: "settings", KeyP: "preset", KeyV: "lyrics" })[e.code]
                    || ({ b: "settings", "и": "settings", p: "preset", "з": "preset", v: "lyrics", "м": "lyrics" })[(e.key || "").toLowerCase()];
                if (e.altKey && shortcut) {
                    e.preventDefault(); e.stopImmediatePropagation();
                    if (shortcut === "settings") this.showMenu();
                    if (shortcut === "preset") this.cyclePreset();
                    if (shortcut === "lyrics") this.togglePanelLyrics();
                }
            }, true);
            let resize;
            window.addEventListener("resize", () => { clearTimeout(resize); resize = setTimeout(() => this.render(), 180); });
            let clipFrame;
            const clipSoon = () => { cancelAnimationFrame(clipFrame); clipFrame = requestAnimationFrame(() => this.syncStickyClipping()); };
            document.addEventListener('scroll', e => { if (e.target.matches?.('.main-view-container__scroll-node,[data-overlayscrollbars-viewport],.os-viewport')) clipSoon(); }, true);
            const content = document.querySelector('.R1kU6b2KxZc8FWfbYf3m,.Root__main-view');
            if (content) { this.clipObserver = new MutationObserver(()=>{clipSoon();this.scheduleHomeScan?.();}); this.clipObserver.observe(content, { childList: true, subtree: true }); }
        },
        report(error) { console.error("[CBP]", error); this.notify(error?.message || "Не удалось сохранить изменение", true); },
        queueImage(data, token) {
            // Serialize IndexedDB mutations so a late upload cannot undo Remove.
            const task = this.writeQueue.catch(() => {}).then(async () => {
                if (token !== this.imageToken) return;
                await images.run("readwrite", data);
                if (token !== this.imageToken) return;
                this.image = data; this.decoded = null; this.sample = null; this.analysisKey = "";
                await this.render();
            });
            this.writeQueue = task; return task;
        },
        async savePreset() {
            const input = this.menu.querySelector("#cbp-preset-name"); const name = input.value.trim();
            if (!name) { this.notify("Введи название оформления", true); input.focus(); return; }
            if (this.customPresets.length >= 30) { this.notify("Можно сохранить до 30 оформлений", true); return; }
            const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            await this.mediaUpload;
            await this.writeQueue;
            const settings = normalize(this.settings), image = this.image;
            await images.run("readwrite", image, `cbp_preset_${id}`);
            if (this.customPresets.length >= 30) throw Error("Можно сохранить до 30 оформлений");
            this.customPresets.push({ id, name, settings, imageSaved: true });
            storage.put("cbp_v2_presets", JSON.stringify(this.customPresets)); this.activePreset = id;
            this.save(); this.fillPresets(id); input.value = ""; this.notify("Оформление сохранено");
        },
    };

        __EFFECTS__

    const UI_CSS = `
        #cbp-settings-menu,#cbp-menu-backdrop{font-family:var(--font-family,Arial,sans-serif);box-sizing:border-box;}
        #cbp-settings-menu[hidden],#cbp-menu-backdrop[hidden]{display:none!important;}
        #cbp-menu-backdrop{position:fixed;inset:0;background:#0006;z-index:99998;}
        #cbp-settings-menu{position:fixed;inset:50% auto auto 50%;transform:translate(-50%,-50%);width:min(570px,calc(100vw - 32px));max-height:90vh;overflow:auto;background:#14171fed;backdrop-filter:blur(28px);border:1px solid #ffffff24;border-radius:20px;padding:26px;color:#f5f7ff;z-index:99999;box-shadow:0 24px 100px #0009;color-scheme:dark;}
        #cbp-settings-menu *{box-sizing:border-box;text-shadow:none!important;}
        #cbp-settings-menu header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:22px;}
        #cbp-settings-menu small{font-size:10px;letter-spacing:2px;color:#a7b5ce;}
        #cbp-settings-menu h2{font-size:25px;margin:6px 0 0;font-weight:700;color:#f5f7ff!important;}
        #cbp-settings-menu h3{font-size:13px;color:#b5c9f6!important;margin:20px 0 10px;}
        #cbp-settings-menu button,#cbp-settings-menu select,#cbp-settings-menu input:not([type=range]):not([type=checkbox]):not([type=file]):not([type=color]){font:inherit;font-size:12px;border:1px solid #ffffff24;border-radius:9px;padding:9px 10px;background:#ffffff0d;color:#f5f7ff!important;}
        #cbp-settings-menu button{cursor:pointer;white-space:nowrap;}
        #cbp-settings-menu button:hover{background:#ffffff20;}
        #cbp-settings-menu button:disabled{opacity:.35;cursor:default;}
        #cbp-settings-menu :focus-visible{outline:2px solid #c0d2ff;outline-offset:3px;}
        #cbp-settings-menu select{flex:1;min-width:0;}
        #cbp-settings-menu option{background:#1c2130;}
        .cbp-toolbar,.cbp-preset-save,.cbp-row{display:flex;align-items:center;gap:8px;}
        .cbp-preset-save{margin:8px 0 22px;flex-wrap:wrap;}
        #cbp-preset-name{flex:1;min-width:140px;}
        #cbp-settings-menu details{border-top:1px solid #ffffff16;padding:17px 0 5px;}
        #cbp-settings-menu summary{font-size:15px;font-weight:600;cursor:pointer;margin-bottom:15px;}
        .cbp-upload{font-size:13px;display:grid;gap:10px;}
        #cbp-image-upload{width:100%;font-size:12px;}
        #cbp-settings-menu .cbp-hint{font-size:11px;line-height:1.6;color:#9eabc2!important;margin:9px 0 15px;}
        .cbp-slider{display:block;margin:13px 0;font-size:12px;}
        .cbp-slider>span{display:flex;justify-content:space-between;gap:16px;margin-bottom:7px;}
        .cbp-slider output{color:#c6d7ff;font-variant-numeric:tabular-nums;}
        #cbp-settings-menu input[type=range]{width:100%;accent-color:#b2c9ff;cursor:pointer;}
        .cbp-toggle{display:flex;align-items:center;gap:10px;margin:12px 0;font-size:13px;}
        .cbp-toggle input{accent-color:#b2c9ff;width:17px;height:17px;}
        #cbp-color{margin-left:auto;width:38px;height:30px;border:0;background:transparent;cursor:pointer;}
        #cbp-settings-menu footer{border-top:1px solid #ffffff16;margin-top:16px;padding-top:19px;display:flex;gap:14px;align-items:center;justify-content:space-between;flex-wrap:wrap;}
        #cbp-settings-menu footer span{font-size:10px;line-height:1.7;color:#9eabc2;}
        #cbp-settings-menu .cbp-primary{background:#bad0ff;color:#101828!important;border-color:transparent;font-weight:700;}
        #cbp-settings-menu .cbp-danger{color:#ffb9b9!important;}
        #cbp-settings-menu,#cbp-settings-menu :is(h2,h3,p,small,label,summary,output,footer span){color:var(--cbp-ui-ink,#f5f7ff)!important;}
        @media(max-width:500px){#cbp-settings-menu{padding:18px;}#cbp-settings-menu h2{font-size:22px;}}
    `;
    async function boot() {
        if (!window.Spicetify?.LocalStorage || !Spicetify.Topbar?.Button || !Spicetify.Player?.addEventListener || !document.body) { setTimeout(boot, 200); return; }
        try { await APP.init(); } catch (error) { APP.report(error); window.__cbpLoaded = false; }
    }
    // A small diagnostic surface for support and deterministic tests.
    window.CBP = { version: "4.4.0", app: APP, normalize, cropRect, analyzePixels, luminance };
    boot();
})();
