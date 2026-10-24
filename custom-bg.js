// Custom Background 2.0 for Spicetify. All image processing and storage are local.
(() => {
    "use strict";
    if (window.__cbpLoaded) return;
    window.__cbpLoaded = true;

    const DEFAULTS = Object.freeze({
        blur: 0, dim: 0.45, cards: 0.4,
        libraryBlur: 14, libraryDim: 0.18,
        centerBlur: 0, centerDim: 0,
        playerBlur: 16, playerDim: 0.6,
        zoom: 100, x: 50, y: 50,
        readable: false, accent: false, custom: false, color: "#ffffff",
        lyricsSource: "off", freeLayout: false,
        coverX: 15, coverY: 22, coverSize: 34,
        controlsX: 15, controlsY: 85, controlsSize: 38,
        lyricsX: 92, lyricsY: 50, lyricsSize: 43, lyricsHeight: 78
    });
    const LIMITS = {
        blur: [0, 50], dim: [0, 1], cards: [0, 1],
        libraryBlur: [0, 40], libraryDim: [0, 1],
        centerBlur: [0, 40], centerDim: [0, 1],
        playerBlur: [0, 40], playerDim: [0, 1],
        zoom: [100, 250], x: [0, 100], y: [0, 100],
        coverX:[0,100],coverY:[0,100],coverSize:[12,60],
        controlsX:[0,100],controlsY:[0,100],controlsSize:[24,80],
        lyricsX:[0,100],lyricsY:[0,100],lyricsSize:[25,85],lyricsHeight:[25,95]
    };
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    function playerValue(method, fallback = 0) {
        try { return Spicetify.Player[method]() ?? fallback; } catch { return fallback; }
    }
    function normalize(value = {}) {
        if (!value || typeof value !== "object") value = {};
        const s = { ...DEFAULTS };
        for (const [key, [lo, hi]] of Object.entries(LIMITS)) {
            if (typeof value[key] === "number" && Number.isFinite(value[key])) s[key] = clamp(value[key], lo, hi);
        }
        for (const key of ["readable", "accent", "custom", "freeLayout"]) if (typeof value[key] === "boolean") s[key] = value[key];
        if (["off", "spotify", "spicy"].includes(value.lyricsSource)) s.lyricsSource = value.lyricsSource;
        if (/^#[0-9a-f]{6}$/i.test(value.color || "")) s.color = value.color;
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
        old.accent = storage.get("cbp_ai_color") === "true";
        old.custom = storage.get("cbp_use_custom_color") === "true";
        old.color = storage.get("cbp_custom_color_hex") || DEFAULTS.color;
        return normalize(old);
    }
    const BUILTINS = [
        { id: "glass", name: "Стекло", settings: normalize({ ...DEFAULTS, libraryDim: 0.14, centerDim: 0.1, centerBlur: 12, playerDim: 0.25, playerBlur: 22, readable: true }) },
        { id: "minimal", name: "Минимализм", settings: normalize({ ...DEFAULTS, libraryDim: 0, libraryBlur: 0, centerDim: 0, playerBlur: 0, playerDim: 0.16, cards: 0.08, readable: true }) },
        { id: "night", name: "Ночной", settings: normalize({ ...DEFAULTS, dim: 0.72, libraryDim: 0.3, centerDim: 0.16, centerBlur: 4, playerDim: 0.65, cards: 0.45, readable: true }) }
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
        return `
            body { isolation: isolate; background: #121212 !important; }
            * {
                --cinema-mode-bg-color-from: transparent !important;
                --cinema-mode-bg-color-to: transparent !important;
                --lyrics-color-background: transparent !important;
                --card-color: transparent !important;
                --card-color-cover: transparent !important;
                --background-noise: transparent !important;
                --section-background-base: transparent !important;
            }
            :root {
                --background-base: transparent !important;
                --background-elevated-base: transparent !important;
            }
            .Root__top-container, .main-view-container__scroll-node-child,
            .main-yourLibraryX-libraryContainer, .main-yourLibraryX-background,
            .Root__nav-bar, #main,
            .main-topBar-background, .main-topBar-overlay,
            .Root__now-playing-bar,
            #global-nav-bar, .Root__globalNav,
            .Root__right-sidebar,
            .gpBiAnJHb1gq46qV,
            .pk9BAVtyZVEnbPof,
            .main-entityHeader-background,
            .main-entityHeader-backgroundColor,
            .main-entityHeader-overlay,
            .main-actionBarBackground,
            .main-trackList-trackListHeaderStuck,
            .main-trackList-trackListHeader,
            .main-nowPlayingView-container,
            .main-nowPlayingView-mainContainer,
            .ZWDHceKsZZA3lvFT,
            .YZ3y8n8ToUt_xDKt {
                background-color: transparent !important;
                background: transparent !important;
                background-image: none !important;
                box-shadow: none !important;
            }
            .x-categoryTab-CategoryTab,
            .x-filterBox-filter {
                background-color: rgba(100, 100, 100, 0.3) !important;
                border: 1px solid rgba(255, 255, 255, 0.1) !important;
                backdrop-filter: blur(8px) !important;
                border-radius: 32px !important;
                transition: 0.2s !important;
            }
            .x-categoryTab-CategoryTab[aria-selected="true"] {
                background-color: rgba(255, 255, 255, 0.2) !important;
                border: 1px solid rgba(255, 255, 255, 0.5) !important;
            }
            .x-categoryTab-CategoryTab:hover, .x-filterBox-filter:hover {
                background-color: rgba(255, 255, 255, 0.15) !important;
            }
            .main-nowPlayingBar-container {
                background-color: rgba(10, 10, 10, ${playerOp}) !important;
                background: rgba(10, 10, 10, ${playerOp}) !important;
                backdrop-filter: none !important;
                border: none !important;
                border-top: 1px solid rgba(255, 255, 255, 0.05) !important;
            }
            .main-card-cardContainer,
            .main-card-card,
            .main-heroCard-card,
            .main-yourLibraryX-entryItem,
            .view-homeShortcutsGrid-shortcut,
            .main-home-shortcut,
            .main-contextMenu-menu {
                background-color: rgba(20, 20, 20, ${cardOp}) !important;
                background: rgba(20, 20, 20, ${cardOp}) !important;
                backdrop-filter: blur(12px) !important;
                border: 6px solid transparent !important;
                background-clip: padding-box !important;
                border-radius: 14px !important;
                transition: background-color 0.2s ease, background 0.2s ease !important;
            }
            .main-card-cardContainer:hover,
            .main-card-card:hover, 
            .main-yourLibraryX-entryItem:hover,
            .main-home-shortcut:hover, 
            .view-homeShortcutsGrid-shortcut:hover {
                background-color: rgba(45, 45, 45, calc(${cardOp} + 0.2)) !important;
                background: rgba(45, 45, 45, calc(${cardOp} + 0.2)) !important;
            }
            .zPBFT1LAMAuacsb6,
            .main-nowPlayingView-queueItem .e-10451-legacy-list-row,
            .main-nowPlayingView-credits .e-10451-legacy-list-row {
                background-color: rgba(20, 20, 20, ${cardOp}) !important;
                background: rgba(20, 20, 20, ${cardOp}) !important;
                backdrop-filter: blur(12px) !important;
                border: none !important;
                border-radius: 8px !important;
            }
            .e-10451-card__button,
            .e-10451-card__on-click,
            .main-cardImage-imageWrapper,
            .main-cardImage-imageWrapper > div,
            .main-card-imageContainer,
            .main-home-homeHeader,
            div[class*="homeHeader"],
            [data-testid="home-page"] > div:first-child {
                background: transparent !important;
                background-color: transparent !important;
                background-image: none !important;
                box-shadow: none !important;
                border: none !important;
            }
            .NowPlayingView,
            .main-nowPlayingView-section,
            #lyrics-cinema,
            .Root__lyrics-cinema,
            #SpicyLyricsNPVCard, 
            #SpicyLyricsPage, 
            .SpicyRenderer, 
            .ContentBox,
            .NowBar, 
            .LyricsContainer, 
            .LyricsContent, 
            .SpicyLyricsScrollContainer,
            .VirtualLyricsContainer,
            .BrE1JdiaGL4XscBh, 
            .JacI9L8XJSIjX3Gp, 
            .NUo3jiNfWtYtagMn, 
            .lusRYvjXWncP_Aqb,
            .lyrics-lyricsContainer-LyricsContainer,
            .lyrics-lyricsContainer-ProviderView,
            .main-nowPlayingView-content {
                background-color: transparent !important;
                border: none !important;      
                box-shadow: none !important;  
            }
            canvas.spicy-dynamic-bg,
            .main-nowPlayingView-aboutArtist .P1a_MNB6ZEIu50sz,
            .main-nowPlayingView-aboutArtist [style*="background-image"],
            .lyrics-lyrics-background,
            .TLo_mZ7hWAaT3fsA,
            .KBRwz1uoWl0AAEsT,
            .g5l1TSALoQMUlKhS,
            .T0IQrE6mvz4Fs7rc,
            .lyrics-lyricsContainer-LyricsBackground {
                display: none !important;
                opacity: 0 !important;
                background: transparent !important;
                background-image: none !important;
            }
            body::before {
                content: "" !important;
                position: fixed !important;
                top: 0; left: 0; right: 0; bottom: 0 !important;
                background: rgba(0, 0, 0, ${bgOp}) !important;
                z-index: -1 !important;
                pointer-events: none !important;
            }
            /* Panel wrappers in Spotify 1.3.6; keep artwork and controls intact. */
            .Root__main-view,
            .Root__nav-bar,
            .Root__now-playing-bar,
            .yQCyOSVcMCen_NJKPHB6,
            .XvuTwlgQRqJ5NnVLN9ZH,
            .main-yourLibraryX-library,
            .main-yourLibraryX-libraryRootlist,
            .main-yourLibraryX-libraryRootlistContents,
            .qB0QkhexXi3Wx0P1k0Rf,
            .main-view-container,
            .main-view-container__mh-footer-container,
            [data-testid="home-page"],
            [data-testid="home-page"] .kMaYBahSBLOnErF7DLR2,
            .kMaYBahSBLOnErF7DLR2,
            .xCEkyVpabf3oVGmFQVej,
            .main-home-homeHeader,
            .main-home-homeHeader::before,
            .main-home-homeHeader::after,
            .Dm_tXf4_OMK2m7UbfxgV.i7X8RVjZPy66Kx0dUHIK::before {
                background: transparent !important;
                background-image: none !important;
                box-shadow: none !important;
            }
            /* Background-only gradient layers, including inline color overrides. */
            .hbNOZbHD3bPL3OcHQWNn,
            .hbNOZbHD3bPL3OcHQWNn[data-seamless-gradient] {
                background: transparent !important;
                background-image: none !important;
                --color-from: transparent !important;
                --color-to: transparent !important;
                --dither: none !important;
            }
            /* Variables must also be set on panels, where Spotify redefines them. */
            .Root__nav-bar,
            .yQCyOSVcMCen_NJKPHB6,
            .main-yourLibraryX-library,
            .main-yourLibraryX-libraryContainer,
            [data-testid="home-page"] {
                --background-base: transparent !important;
                --background-base-min-contrast: transparent !important;
                --background-base-20: transparent !important;
                --background-base-70: transparent !important;
                --background-noise: none !important;
            }
            .main-nowPlayingBar-nowPlayingBar,
            [data-testid="now-playing-bar"] {
                background: rgba(10, 10, 10, ${playerOp}) !important;
                box-shadow: none !important;
            }
            /* Avoid stacking two translucent backgrounds on the player. */
            [data-testid="now-playing-bar"] .main-nowPlayingBar-container {
                background: transparent !important;
            }
            /* Playlist / artist surfaces and their scroll-dependent layers. */
            .playlist-playlist-playlistContent,
            .fmJtSKRbaIwuGI4eOWBt,
            .I5gPGkX7nJaKDMRuOyf2,
            .u9i__FHAyXJecXMPsrLQ,
            .GECIboaMmkIqHDKwQ3vR,
            .z0ow24AABLbFsQt7mYDF,
            .ErNDIeqOIhQ9kGfrxqS_,
            .C0YTSqDKL6_Qo68om_i1,
            .main-entityHeader-container,
            .main-entityHeader-container::before,
            .main-entityHeader-container::after,
            .main-entityHeader-background,
            .main-entityHeader-backgroundColor,
            .main-entityHeader-overlay,
            .main-actionBarBackground,
            .main-actionBar-ActionBar,
            .main-topBar-container,
            .main-topBar-background,
            .main-topBar-overlay,
            .main-topBar-mixingBackground,
            .main-topBar-mixingBackground::after,
            .playlist-playlist-mixingBackground,
            .playlist-playlist-mixingBackground::after,
            .main-trackList-trackListHeader,
            .main-trackList-trackListHeaderStuck,
            .SdObJk3_bmCg1nV_PTUU.tnEtMe827oywEa8TgLqg,
            .IfBZ5VdI_2nwDMl4H6Yh,
            .QwcIb5mGvbu4qb3_cnAQ,
            .venMPE3QitySGonlITLf,
            .venMPE3QitySGonlITLf::after,
            .AE3dcjFNJ9068_vrnLB6,
            .AE3dcjFNJ9068_vrnLB6::after,
            .nfBy1HoO33kgPOyEc3WZ {
                background: transparent !important;
                background-image: none !important;
                box-shadow: none !important;
            }
            /* Artist banner photography is a separate decorative layer. */
            .main-entityHeader-backgroundImage,
            .main-entityHeader-backgroundImageContainer,
            .b7x0AwQ51vLACMAHB71B,
            .L0UgUY1nWxdZ3XyrJNMt {
                background: transparent !important;
                background-image: none !important;
                opacity: 0 !important;
            }
            /* Spotify 1.3.6 surfaces verified in the live client, including theme overrides. */
html body #main .uP1rcUSIWCFaOZaoH0ZG,
html body #main .P1kwly6O5plr1VQVdOLV,
html body #main .r8bczAWCEgb9_L0iyIcc,
html body #main .main-topBar-background,
html body #main .main-topBar-background::before,
html body #main .main-topBar-background::after,
html body #main .main-topBar-overlay,
html body #main .main-topBar-mixingBackground::after,
html body #main .rrn0EjHTu7eCxn9G0Rrc.iPo4a2lbrsxW9Iedav3h {
    background-color: transparent !important;
    background-image: none !important;
    box-shadow: none !important;
    transition: none !important;
}
/* Keep scrolled text from competing with the transparent sticky headings. */
html body #main .main-topBar-container,
html body #main .rrn0EjHTu7eCxn9G0Rrc.iPo4a2lbrsxW9Iedav3h {
    background-color: transparent !important;
    backdrop-filter: blur(20px) !important;
    -webkit-backdrop-filter: blur(20px) !important;
}
html body #main [data-cbp-clipped] {
    clip-path: inset(var(--cbp-clip-top) 0 0 0) !important;
}
`;
    }

    const TRANSPORT_ICONS = {
        play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
        pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
        back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h2v14H5zm3 7 11 7V5z"/></svg>',
        next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 5h2v14h-2zM5 5v14l11-7z"/></svg>'
    };

    const APP = {
        settings: null, image: "", decoded: null, sample: null, analysisKey: "", activePreset: "", immersive: false,
        revision: 0, writeQueue: Promise.resolve(), imageToken: 0,
        notify(message, error = false) { Spicetify.showNotification?.(message, error); },
        save() { storage.put("cbp_v2_settings", JSON.stringify(this.settings)); storage.put("cbp_v2_active_preset", this.activePreset); },
        async init() {
            this.settings = loadSettings();
            this.activePreset = storage.get("cbp_v2_active_preset") || "";
            this.presetLayouts = storage.json("cbp_v2_preset_layouts", {});
            if (!this.presetLayouts || typeof this.presetLayouts !== "object" || Array.isArray(this.presetLayouts)) this.presetLayouts = {};
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
            this.buildUI(); this.buildImmersion(); this.registerButtons(); this.bind();
            await this.render();
        },
        presets() { return [...BUILTINS, ...this.customPresets]; },
        async render() {
            const token = ++this.revision;
            const s = this.settings;
            if (this.image && (s.readable || s.accent)) {
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
            const effectiveDim = automatic ? Math.max(s.dim, this.sample?.minDim || 0) : s.dim;
            this.theme.textContent = this.image ? baseStyles(effectiveDim, s.cards, s.playerDim) + this.glassCSS(s) + this.textCSS(color, automatic || s.accent || s.custom) : "";
            this.bg.style.cssText = this.image ? `position:fixed;inset:0;z-index:-2;pointer-events:none;background-color:#121212;background-image:url(${JSON.stringify(this.image)});background-size:cover;background-position:${s.x}% ${s.y}%;filter:blur(${s.blur}px);transform:scale(${s.zoom / 100});transform-origin:${s.x}% ${s.y}%;` : "display:none";
            const info = this.menu.querySelector("#cbp-auto-info");
            info.textContent = automatic ? `Автозатемнение: ${Math.round(effectiveDim * 100)}% · текст ${color.toUpperCase()}` : "Автоподбор учитывает видимую часть картинки и добавляет затемнение при необходимости.";
            this.menu.querySelector("#cbp-color").disabled = s.readable || s.accent;
            this.menu.querySelector("#cbp-custom").disabled = s.readable || s.accent;
            this.menu.querySelector("#cbp-accent").disabled = s.readable;
            this.overlay.style.setProperty("--cbp-ink", color);
            this.menu.style.setProperty("--cbp-ui-ink", color);
            this.applyLayout(); this.refreshLyrics();
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
                <header><div><small>CUSTOM BACKGROUND · 2.2</small><h2 id="cbp-heading">Твоё оформление</h2></div><button data-action="close" aria-label="Закрыть настройки">✕</button></header>
                <div class="cbp-toolbar"><select id="cbp-presets" aria-label="Сохранённые оформления"></select><button data-action="apply">Применить</button><button data-action="cycle" title="Следующее оформление · Alt+P">↻</button></div>
                <div class="cbp-preset-save"><input id="cbp-preset-name" maxlength="40" placeholder="Название своего оформления" aria-label="Название оформления"><button data-action="save">Сохранить</button><button data-action="delete" aria-label="Удалить выбранное оформление">Удалить</button></div>
                <div class="cbp-row cbp-sharing"><button data-action="preset-image">Фон для выбранного</button><button data-action="export">Экспорт</button><button data-action="import">Импорт</button><input id="cbp-import" type="file" accept=".json,application/json" hidden></div>
                <p class="cbp-hint">Новое оформление сохраняет картинку и компоновку. «Фон для выбранного» назначает текущую картинку выбранному стилю. Экспорт включает картинку.</p>
                <details open><summary>Погружение и текст песни</summary><label class="cbp-row">Источник текста<select id="cbp-lyrics-source" data-setting="lyricsSource"><option value="off">Без текста</option><option value="spotify">Spotify</option><option value="spicy">Spicy Lyrics</option></select></label><p class="cbp-hint">Текущая строка выделяется автоматически. Нажми на строку для перемотки. Для Spicy Lyrics требуется установленное расширение.</p>${this.toggle("freeLayout", "Свободная компоновка")}<div class="cbp-row"><button data-action="layout">Переместить и изменить размер</button><button data-action="reset-layout">Сбросить компоновку</button></div></details>
                <details open><summary>Фон и положение</summary>
                    <label class="cbp-upload">Выбрать картинку или GIF<input id="cbp-image-upload" type="file" accept="image/*"></label>
                    <p class="cbp-hint">До 30 МБ. Картинка хранится только в Spotify.</p>
                    ${this.slider("Размытие фона", "blur", 0, 50, 1, "px")}
                    ${this.slider("Затемнение фона", "dim", 0, 100, 1, "%")}
                    ${this.slider("Масштаб", "zoom", 100, 250, 1, "%")}
                    ${this.slider("Положение по горизонтали", "x", 0, 100, 1, "%")}
                    ${this.slider("Положение по вертикали", "y", 0, 100, 1, "%")}
                    <div class="cbp-row"><button data-action="center">По центру</button><button class="cbp-danger" data-action="remove-image">Удалить картинку</button></div>
                </details>
                <details open><summary>Стеклянные панели</summary><p class="cbp-hint">Затемнение 0% — прозрачная панель. Размытие смягчает фон под ней.</p>
                    ${[ ["Медиатека", "library"], ["Центральная часть", "center"], ["Плеер", "player"] ].map(([name,key]) => `<h3>${name}</h3>${this.slider("Размытие", key+"Blur", 0, 40, 1, "px")}${this.slider("Затемнение", key+"Dim", 0, 100, 1, "%")}`).join("")}
                    ${this.slider("Непрозрачность карточек", "cards", 0, 100, 1, "%")}
                </details>
                <details open><summary>Читаемость и цвет</summary>
                    ${this.toggle("readable", "Автоматическая читаемость")}
                    <p class="cbp-hint" id="cbp-auto-info"></p>
                    ${this.toggle("accent", "Оттенок текста из картинки")}
                    <div class="cbp-row">${this.toggle("custom", "Свой цвет текста")}<input id="cbp-color" type="color" aria-label="Цвет текста"></div>
                </details>
                <footer><button class="cbp-primary" data-action="immerse">Режим погружения</button><span>Alt+B — настройки · Alt+I — погружение<br>Alt+P — следующее оформление</span></footer>`;
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
            this.settings = normalize({ ...preset.settings, ...this.savedLayout(id) }); this.activePreset = id;
            this.save(); this.syncUI(); this.fillPresets(id); this.render();
            this.notify(`Оформление: ${preset.name}`);
        },
        cyclePreset() { const all = this.presets(); const index = all.findIndex(p => p.id === this.activePreset); this.applyPreset(all[(index + 1) % all.length].id); },
        showMenu(show = this.menu.hidden) {
            if (show) this.previousFocus = this.immersionHost?.shadowRoot.activeElement || document.activeElement;
            this.menu.hidden = !show; this.backdrop.hidden = !show;
            if (show) this.menu.querySelector('[data-action="close"]').focus(); else this.previousFocus?.focus?.();
        },
        registerButtons() {
            this.settingsButton = new Spicetify.Topbar.Button("Оформление · Alt+B", "edit", () => this.showMenu(), false, true);
            this.presetButton = new Spicetify.Topbar.Button("Следующее оформление · Alt+P", "repeat", () => this.cyclePreset(), false, true);
        },
        syncStickyClipping() {
            const root = document.querySelector('.R1kU6b2KxZc8FWfbYf3m,.Root__main-view');
            const viewport = root && ([...root.querySelectorAll('[data-overlayscrollbars-viewport],.os-viewport,.main-view-container__scroll-node')].find(el => el.scrollTop > 0)
                || root.querySelector('[data-overlayscrollbars-viewport],.os-viewport')
                || root.querySelector('.main-view-container__scroll-node'));
            if (!viewport) return;
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
                    const value = el.type === "checkbox" ? el.checked : el.tagName === "SELECT" ? el.value : Number(el.value) / (["dim", "cards", "libraryDim", "centerDim", "playerDim"].includes(key) ? 100 : 1);
                    this.settings = normalize({ ...this.settings, [key]: value }); this.activePreset = "";
                    this.syncUI(); this.save(); schedule();
                } else if (el.id === "cbp-color") { this.settings.color = el.value; this.activePreset = ""; this.save(); schedule(); }
            });
            this.menu.querySelector("#cbp-presets").addEventListener("change", () => this.fillPresets(this.menu.querySelector("#cbp-presets").value));
            this.menu.addEventListener("click", e => {
                const action = e.target.closest("[data-action]")?.dataset.action;
                const selected = this.menu.querySelector("#cbp-presets").value;
                if (action === "close") this.showMenu(false);
                if (action === "apply") this.applyPreset(selected).catch(error => this.report(error));
                if (action === "cycle") this.cyclePreset();
                if (action === "center") { Object.assign(this.settings, { x: 50, y: 50, zoom: 100 }); this.activePreset = ""; this.save(); this.syncUI(); this.render(); }
                if (action === "immerse") { this.showMenu(false); this.setImmersion(true); }
                if (action === "save") this.savePreset().catch(error => this.report(error));
                if (action === "preset-image") this.rememberPresetImage(selected).catch(error => this.report(error));
                if (action === "export") this.exportPreset(selected).catch(error => this.report(error));
                if (action === "import") this.menu.querySelector("#cbp-import").click();
                if (action === "layout") { this.showMenu(false); this.setImmersion(true); this.setEditing(true); }
                if (action === "reset-layout") this.resetLayout();
                if (action === "delete") {
                    if (BUILTINS.some(p => p.id === selected)) return;
                    this.customPresets = this.customPresets.filter(p => p.id !== selected);
                    storage.put("cbp_v2_presets", JSON.stringify(this.customPresets)); this.fillPresets();
                }
                if (action === "remove-image") { const token = ++this.imageToken; this.queueImage("", token).catch(error => this.report(error)); }
            });
            this.backdrop.addEventListener("click", () => this.showMenu(false));
            this.menu.querySelector("#cbp-import").addEventListener("change", async e => { try { const file = e.target.files[0]; if (file) { if (file.size > 45 * 1024 * 1024) throw Error("Файл оформления слишком большой (максимум 45 МБ)"); await this.importPreset(JSON.parse(await file.text())); } } catch (error) { this.report(error); } finally { e.target.value = ""; } });
            this.menu.querySelector("#cbp-image-upload").addEventListener("change", async e => {
                const token = ++this.imageToken; const file = e.target.files[0]; if (!file) return;
                try {
                    if (!file.type.startsWith("image/")) throw Error("Выбери картинку или GIF");
                    if (file.size > 30 * 1024 * 1024) throw Error("Максимальный размер картинки — 30 МБ");
                    const data = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(file); });
                    await decodeImage(data);
                    if (token === this.imageToken) await this.queueImage(data, token);
                } catch (error) { this.report(error); }
                finally { e.target.value = ""; }
            });
            document.addEventListener("keydown", e => {
                if (e.key === "Escape") {
                    if (!this.menu.hidden) { this.showMenu(false); e.preventDefault(); }
                    else if (this.immersive) { this.setImmersion(false); e.preventDefault(); }
                }
                if (!this.menu.hidden && e.key === "Tab") {
                    const focusable = [...this.menu.querySelectorAll('button:not(:disabled),input:not(:disabled),select,summary')].filter(el => el.getClientRects().length);
                    const first = focusable[0], last = focusable[focusable.length - 1];
                    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
                }
                if (e.repeat || e.ctrlKey || e.metaKey) return;
                const shortcut = ({ KeyB: "settings", KeyI: "immerse", KeyP: "preset" })[e.code]
                    || ({ b: "settings", "и": "settings", i: "immerse", "ш": "immerse", p: "preset", "з": "preset" })[(e.key || "").toLowerCase()];
                if (e.altKey && shortcut) {
                    e.preventDefault(); e.stopImmediatePropagation();
                    if (shortcut === "settings") this.showMenu();
                    if (shortcut === "immerse") { this.showMenu(false); this.setImmersion(!this.immersive); }
                    if (shortcut === "preset") this.cyclePreset();
                }
            }, true);
            let resize;
            window.addEventListener("resize", () => { this.applyLayout(); clearTimeout(resize); resize = setTimeout(() => this.render(), 180); });
            let clipFrame;
            const clipSoon = () => { cancelAnimationFrame(clipFrame); clipFrame = requestAnimationFrame(() => this.syncStickyClipping()); };
            document.addEventListener('scroll', e => { if (e.target.matches?.('.main-view-container__scroll-node,[data-overlayscrollbars-viewport],.os-viewport')) clipSoon(); }, true);
            const content = document.querySelector('.R1kU6b2KxZc8FWfbYf3m,.Root__main-view');
            if (content) { this.clipObserver = new MutationObserver(clipSoon); this.clipObserver.observe(content, { childList: true, subtree: true }); }
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
            const settings = normalize(this.settings), image = this.image;
            await images.run("readwrite", image, `cbp_preset_${id}`);
            if (this.customPresets.length >= 30) throw Error("Можно сохранить до 30 оформлений");
            this.customPresets.push({ id, name, settings, imageSaved: true });
            storage.put("cbp_v2_presets", JSON.stringify(this.customPresets)); this.activePreset = id;
            this.fillPresets(id); input.value = ""; this.notify("Оформление сохранено");
        },
        buildImmersion() {
            this.immersionHost = document.createElement('div'); this.immersionHost.id = 'cbp-immersion-host';
            const shadow = this.immersionHost.attachShadow({ mode: 'open' });
            const style = document.createElement('style'); style.textContent = IMMERSION_CSS;
            this.overlay = document.createElement("section"); this.overlay.id = "cbp-immersion"; this.overlay.hidden = true;
            this.overlay.setAttribute("role", "dialog"); this.overlay.setAttribute("aria-label", "Режим погружения");
            this.overlay.innerHTML = `<div class="cbp-immersion-tools"><button data-i="settings">Оформление</button><button data-i="preset">Сменить стиль</button><button data-i="layout">Компоновка</button><button data-i="save-layout" hidden>Сохранить компоновку</button><button data-i="exit">Выйти · Esc</button></div>
                <div class="cbp-stage"><div class="cbp-now"><div class="cbp-cover-box" data-block="cover"><img id="cbp-cover" alt="Обложка текущего трека"></div><div class="cbp-details" data-block="controls"><p class="cbp-eyebrow">СЕЙЧАС ИГРАЕТ</p><h1 id="cbp-track">Музыка ждёт</h1><p id="cbp-artist">Включи трек в Spotify</p>
                <div class="cbp-transport"><button data-i="back" aria-label="Предыдущий трек">${TRANSPORT_ICONS.back}</button><button class="cbp-play" data-i="play" aria-label="Воспроизвести">${TRANSPORT_ICONS.play}</button><button data-i="next" aria-label="Следующий трек">${TRANSPORT_ICONS.next}</button></div>
                <label class="cbp-seek"><span id="cbp-time">0:00</span><input id="cbp-seek" type="range" min="0" max="1000" value="0" aria-label="Позиция воспроизведения"><span id="cbp-duration">0:00</span></label></div></div><aside id="cbp-lyrics-panel" data-block="lyrics" hidden><header class="cbp-lyrics-header"><select id="cbp-live-source" aria-label="Источник текста"><option value="off">Без текста</option><option value="spotify">Spotify</option><option value="spicy">Spicy Lyrics</option></select><button data-i="retry">Обновить</button></header><p id="cbp-lyrics-status" role="status"></p><div id="cbp-lyrics-lines" tabindex="0" aria-label="Текст песни"></div></aside></div>`;
            shadow.append(style, this.overlay); document.body.append(this.immersionHost);
            this.overlay.addEventListener("click", e => {
                const action = e.target.closest("[data-i]")?.dataset.i;
                if (action === "exit") this.setImmersion(false);
                if (action === "settings") this.showMenu(true);
                if (action === "preset") this.cyclePreset();
                if (action === "layout") { if (this.editing) this.saveLayout(); else this.setEditing(true); }
                if (action === "save-layout") this.saveLayout();
                if (action === "retry") this.refreshLyrics(true);
                if (action === "back") Spicetify.Player.back();
                if (action === "next") Spicetify.Player.next();
                if (action === "play") Spicetify.Player.togglePlay();
            });
            this.overlay.querySelector("#cbp-live-source").addEventListener("change", e => { this.settings.lyricsSource = e.target.value; this.activePreset = ""; this.save(); this.syncUI(); this.applyLayout(); this.refreshLyrics(true); });
            this.bindLayout();
            this.overlay.querySelector("#cbp-seek").addEventListener("change", e => { const duration = playerValue("getDuration"); if (Number.isFinite(duration) && duration > 0) Spicetify.Player.seek(Number(e.target.value) / 1000 * duration); });
            Spicetify.Player.addEventListener("songchange", () => this.updateTrack());
            Spicetify.Player.addEventListener("onplaypause", () => this.updateTrack());
            Spicetify.Player.addEventListener("onprogress", () => { if (this.immersive && this.immersionHost.shadowRoot.activeElement !== this.overlay.querySelector("#cbp-seek")) this.updateProgress(); });
            this.updateTrack();
        },
        setImmersion(active) {
            if (active === this.immersive) return;
            this.immersive = active; this.overlay.hidden = !active;
            document.body.classList.toggle("cbp-immersive", active);
            const main = document.getElementById("main");
            if (active) { this.immersionFocus = document.activeElement; this.wasInert = main?.inert; if (main) main.inert = true; this.updateTrack(); this.overlay.querySelector('[data-i="exit"]').focus(); }
            else { this.setEditing(false); ++this.lyricsToken; this.lyricsKey = ""; clearTimeout(this.lyricsPoll); cancelAnimationFrame(this.lyricRAF); this.lyricRAF=0; this.restoreSpicyLoader(); if (main) main.inert = !!this.wasInert; this.immersionFocus?.focus?.(); }
            this.applyLayout(); this.refreshLyrics();
        },
        updateTrack() {
            const m = Spicetify.Player.data?.item?.metadata || {};
            this.overlay.querySelector("#cbp-track").textContent = m.title || "Музыка ждёт";
            this.overlay.querySelector("#cbp-track").title = m.title || "";
            this.overlay.querySelector("#cbp-artist").textContent = m.artist_name || "Включи трек в Spotify";
            const cover = this.overlay.querySelector("#cbp-cover");
            const src = m.image_xlarge_url || m.image_large_url || m.image_url || "";
            if (src) { if (cover.getAttribute("src") !== src) cover.src = src; } else cover.removeAttribute("src");
            cover.hidden = !src;
            const playing = playerValue("isPlaying", false);
            const button = this.overlay.querySelector('[data-i="play"]'); button.innerHTML = playing ? TRANSPORT_ICONS.pause : TRANSPORT_ICONS.play; button.setAttribute("aria-label", playing ? "Пауза" : "Воспроизвести");
            this.updateProgress();
            if (this.immersive) this.refreshLyrics();
        },
        updateProgress() {
            const p = Math.max(0, playerValue("getProgress")), d = Math.max(0, playerValue("getDuration"));
            const format = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
            this.overlay.querySelector("#cbp-time").textContent = format(p);
            this.overlay.querySelector("#cbp-duration").textContent = format(d);
            const seek = this.overlay.querySelector("#cbp-seek"); seek.disabled = !d; seek.value = d ? clamp(p / d * 1000, 0, 1000) : 0;
            if(!this.lyricRAF)this.syncLyrics(p);
        }
    };

    // Read installed Spicy Lyrics' local cache; never request its API or credentials.
    function lyricLines(payload, source) {
        if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch { return []; } }
        const data = source === 'spotify' ? payload?.lyrics : payload;
        if (!data) return [];
        const synced = source === 'spotify' ? data.syncType !== 'UNSYNCED' : data.Type !== 'Static';
        const list = source === 'spotify' ? data.lines : data.Content;
        if (!Array.isArray(list)) return [];
        return list.slice(0, 2500).map(line => {
            const lead = line.Lead || line;
            const syllables = lead.Syllables;
            const text = source === 'spotify' ? line.words : typeof line === 'string' ? line : line.Text ?? (Array.isArray(syllables) ? syllables.map((s,i) => String(s.Text || '') + (s.IsPartOfWord || i === syllables.length - 1 ? '' : ' ')).join('') : '');
            const start = synced ? Number(source === 'spotify' ? line.startTimeMs : lead.StartTime * 1000) : null;
            const words = source === 'spicy' && Array.isArray(syllables) ? syllables.slice(0,500).filter(s=>s && typeof s.Text==='string').map((s,i)=>({text:s.Text.slice(0,500),start:Number(s.StartTime)*1000,end:Number(s.EndTime)*1000,space:!s.IsPartOfWord&&i<syllables.length-1})).filter(s=>Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.end>=s.start) : [];
            return { text: String(text || '').slice(0, 3000), start: Number.isFinite(start) && start >= 0 ? start : null, words };
        }).filter(line => line.text.trim());
    }
    Object.assign(APP, {
        lyricsToken: 0, lyricsKey: '', lyricsLines: [], lyricIndex: -1, editing: false,
        async rememberPresetImage(id) {
            if (!this.presets().some(p => p.id === id)) return;
            await images.run('readwrite', this.image, `cbp_preset_${id}`);
            this.presetImages[id] = true;
            storage.put('cbp_v2_preset_images', JSON.stringify(this.presetImages));
            this.notify('Картинка назначена выбранному оформлению');
        },
        async presetBundle(id) {
            const p = this.presets().find(p => p.id === id); if (!p) throw Error('Выбери оформление');
            await this.writeQueue;
            const savedImage = p.imageSaved || this.presetImages[id] === true;
            const image = savedImage ? await images.run('readonly', undefined, `cbp_preset_${id}`) : this.image;
            return { format: 'custom-background-preset', version: 1, name: p.name, settings: normalize({ ...p.settings, ...this.savedLayout(id) }), image };
        },
        async exportPreset(id) {
            const bundle = await this.presetBundle(id);
            const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
            const link = document.createElement('a'); link.href = url; link.download = `custom-background-${bundle.name.replace(/[^\p{L}\p{N}_-]/gu, '_').slice(0,40)}.json`;
            document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
            this.notify('Оформление экспортировано вместе с картинкой');
        },
        async importPreset(bundle) {
            if (!bundle || bundle.format !== 'custom-background-preset' || bundle.version !== 1 || typeof bundle.name !== 'string' || !bundle.name.trim() || !bundle.settings || typeof bundle.settings !== 'object' || Array.isArray(bundle.settings)) throw Error('Это не файл оформления Custom Background');
            if (this.customPresets.length >= 30) throw Error('Можно сохранить до 30 оформлений');
            const image = bundle.image ?? '';
            if (typeof image !== 'string' || image.length > 43 * 1024 * 1024 || (image && !/^data:image\/(png|jpeg|jpg|webp|gif|avif|bmp|x-icon|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(image))) throw Error('В файле должна быть встроенная картинка, а не ссылка');
            if (image) await decodeImage(image);
            const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
            await images.run('readwrite', image, `cbp_preset_${id}`);
            const p = { id, name: bundle.name.trim().slice(0,40), settings: normalize(bundle.settings), imageSaved: true };
            if (this.customPresets.length >= 30) throw Error('Можно сохранить до 30 оформлений');
            this.customPresets.push(p); storage.put('cbp_v2_presets', JSON.stringify(this.customPresets));
            this.fillPresets(id); await this.applyPreset(id); this.notify('Оформление импортировано'); return p;
        },
        resetLayout() {
            for (const key of ['freeLayout','coverX','coverY','coverSize','controlsX','controlsY','controlsSize','lyricsX','lyricsY','lyricsSize','lyricsHeight']) this.settings[key] = DEFAULTS[key];
            this.setEditing(false); this.activePreset = ''; this.save(); this.syncUI(); this.applyLayout();
        },
        setEditing(active) {
            if(active && !this.editing) this.layoutPreset = this.activePreset;
            this.editing = active;
            if (active) { this.settings.freeLayout = true; this.activePreset = ''; this.save(); this.syncUI(); }
            this.overlay.classList.toggle('cbp-editing', active);
            const b = this.overlay.querySelector('[data-i="layout"]'); b.textContent = active ? 'Готово' : 'Компоновка'; b.setAttribute('aria-pressed', String(active));
            this.overlay.querySelector('[data-i="save-layout"]').hidden = !active;
            this.applyLayout();
        },
        layoutValues(value = this.settings) {
            const normalized = normalize(value);
            return Object.fromEntries(['freeLayout','coverX','coverY','coverSize','controlsX','controlsY','controlsSize','lyricsX','lyricsY','lyricsSize','lyricsHeight'].map(k => [k,normalized[k]]));
        },
        savedLayout(id) { const value=this.presetLayouts?.[id]; return value && typeof value==='object' ? this.layoutValues(value) : {}; },
        saveLayout() {
            try {
                const id=this.layoutPreset;
                if(id && this.presets().some(p=>p.id===id)) {
                    this.presetLayouts[id]=this.layoutValues();
                    storage.put('cbp_v2_preset_layouts',JSON.stringify(this.presetLayouts));
                    this.activePreset=id;
                }
                this.save(); this.setEditing(false); this.layoutPreset=''; this.fillPresets();
                this.notify(id ? 'Компоновка сохранена для оформления' : 'Компоновка сохранена');
            } catch(error) { this.report(error); }
        },
        applyLayout() {
            if (!this.overlay) return;
            const hasLyrics = this.settings.lyricsSource !== 'off';
            this.overlay.classList.toggle('cbp-with-lyrics', hasLyrics);
            this.overlay.classList.toggle('cbp-free', this.settings.freeLayout);
            this.overlay.querySelector('#cbp-lyrics-panel').hidden = !hasLyrics;
            this.overlay.querySelector('#cbp-live-source').value = this.settings.lyricsSource;
            for (const box of this.overlay.querySelectorAll('[data-block]')) {
                if (!this.settings.freeLayout) { box.style.cssText = ''; continue; }
                const stage = this.overlay.querySelector('.cbp-stage').getBoundingClientRect(), key = box.dataset.block;
                if (!stage.width || !stage.height) continue;
                const minSide = Math.min(stage.width, stage.height);
                const width = key === 'cover' ? clamp(minSide * this.settings.coverSize / 100, 80, stage.width) : clamp(stage.width * this.settings[key+'Size'] / 100, Math.min(230,stage.width), stage.width);
                box.style.width = `${width}px`;
                if(key==='controls')box.style.setProperty('--cbp-control-scale',String(clamp(width/460,.7,1.5)));
                box.style.height = key === 'cover' ? `${Math.min(width,stage.height)}px` : key === 'lyrics' ? `${stage.height * this.settings.lyricsHeight / 100}px` : 'auto';
                const height = Math.min(box.getBoundingClientRect().height, stage.height);
                box.style.maxHeight = `${stage.height}px`;
                box.style.left = `${Math.max(0,stage.width-width) * this.settings[key+'X'] / 100}px`;
                box.style.top = `${Math.max(0,stage.height-height) * this.settings[key+'Y'] / 100}px`;
            }
        },
        bindLayout() {
            const labels = { cover:'Обложка', controls:'Управление', lyrics:'Текст' };
            for (const box of this.overlay.querySelectorAll('[data-block]')) {
                const key = box.dataset.block;
                const move = document.createElement('button'); move.className = 'cbp-move'; move.dataset.layout = 'move'; move.textContent = `⠿ ${labels[key]}`; move.setAttribute('aria-label', `Переместить: ${labels[key]}`); move.title = 'Перетащи или используй стрелки';
                const resize = document.createElement('button'); resize.className = 'cbp-resize'; resize.dataset.layout = 'resize'; resize.textContent = '↘'; resize.setAttribute('aria-label', `Размер: ${labels[key]}`); resize.title = 'Потяни для изменения размера или используй стрелки';
                box.append(move, resize);
            }
            this.overlay.addEventListener('pointerdown', e => {
                const handle = e.target.closest('[data-layout]'); if (!this.editing || !handle || e.button !== 0) return;
                e.preventDefault(); const box = handle.closest('[data-block]'), key = box.dataset.block;
                const stage = this.overlay.querySelector('.cbp-stage').getBoundingClientRect(), rect = box.getBoundingClientRect();
                this.layoutDrag = { pointer: e.pointerId, handle, key, mode:handle.dataset.layout, stage, rect, x:e.clientX, y:e.clientY };
                handle.setPointerCapture(e.pointerId);
            });
            this.overlay.addEventListener('pointermove', e => {
                const d = this.layoutDrag; if (!d || d.pointer !== e.pointerId) return;
                const dx = e.clientX-d.x, dy=e.clientY-d.y, key=d.key;
                if (d.mode === 'move') {
                    const maxX=d.stage.width-d.rect.width, maxY=d.stage.height-d.rect.height;
                    this.settings[key+'X'] = maxX>0 ? clamp((d.rect.left-d.stage.left+dx)/maxX*100,0,100) : 0;
                    this.settings[key+'Y'] = maxY>0 ? clamp((d.rect.top-d.stage.top+dy)/maxY*100,0,100) : 0;
                } else {
                    this.settings[key+'Size'] = (d.rect.width+dx)/(key==='cover'?Math.min(d.stage.width,d.stage.height):d.stage.width)*100;
                    if(key==='lyrics') this.settings.lyricsHeight=(d.rect.height+dy)/d.stage.height*100;
                }
                this.settings=normalize(this.settings); this.applyLayout();
            });
            const finish = e => { if(this.layoutDrag?.pointer!==e.pointerId)return; this.layoutDrag=null; this.activePreset=''; this.save(); };
            this.overlay.addEventListener('pointerup', finish); this.overlay.addEventListener('pointercancel', finish);
            this.overlay.addEventListener('keydown', e => {
                const handle = e.target.closest('[data-layout]'); if(!this.editing||!handle||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
                e.preventDefault(); const key=handle.closest('[data-block]').dataset.block;
                const field=handle.dataset.layout==='resize'?key+'Size':key+(['ArrowLeft','ArrowRight'].includes(e.key)?'X':'Y');
                this.settings[field]+=(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1)*(e.shiftKey?5:1);
                this.settings=normalize(this.settings); this.save(); this.applyLayout();
            });
        },
        async spicyData(uri) {
            const manager = window.SpicyLyrics?.db?.objectStores?.lyricsStore?.manager;
            if (typeof manager?.get === 'function') { const local = await manager.get(uri); if(local) return local; }
            if (!window.caches) return null;
            const id=uri.split(':')[2];
            for (const name of (await caches.keys()).filter(n=>/spicy.*lyrics.*store/i.test(n))) {
                const cache=await caches.open(name), response=await cache.match(`/${id}`);
                if (!response) continue;
                const envelope=await response.json();
                if (envelope.ExpiresAt && envelope.ExpiresAt < Date.now()) continue;
                const data=envelope.Content;
                if(data?.uri && data.uri!==uri) continue;
                if(data?.Value==='NO_LYRICS') return {Type:'Static',Content:[]};
                if(data?.Content) return data;
            }
            return null;
        },
        ensureSpicyLoader() {
            // Mount the installed extension behind our overlay. It owns its requests,
            // authentication, retries and track-change subscriptions.
            if(!window._spicy_lyrics && !window.SpicyLyrics && !document.getElementById('SpicyLyrics_PageButton')) throw Error('Spicy Lyrics не установлен или ещё не запустился');
            const history=Spicetify.Platform?.History;
            if(!history?.location || typeof history.replace!=='function') throw Error('Spotify ещё запускается. Повтори через несколько секунд.');
            if(history.location.pathname==='/SpicyLyrics') return;
            if(!this.spicyReturnLocation) {
                const l=history.location;
                this.spicyReturnLocation={pathname:l.pathname,search:l.search||'',hash:l.hash||'',state:l.state};
            }
            history.replace({pathname:'/SpicyLyrics'});
        },
        restoreSpicyLoader() {
            const previous=this.spicyReturnLocation; this.spicyReturnLocation=null;
            const history=Spicetify.Platform?.History;
            if(previous && history?.location?.pathname==='/SpicyLyrics')history.replace(previous);
        },
        animateLyrics() {
            if(this.lyricRAF)return;
            this.lyricClock=null;
            const tick=now=>{
                this.lyricRAF=0;
                if(!this.immersive || this.settings.lyricsSource==='off')return;
                const raw=playerValue('getProgress'),playing=playerValue('isPlaying',false);
                if(!this.lyricClock || this.lyricClock.raw!==raw || !playing)this.lyricClock={raw,at:now};
                const progress=raw+(playing?Math.min(1200,now-this.lyricClock.at):0);
                this.syncLyrics(progress);
                this.lyricRAF=requestAnimationFrame(tick);
            };
            this.lyricRAF=requestAnimationFrame(tick);
        },
        async refreshLyrics(force=false, poll=false) {
            if (!this.overlay || !this.immersive) return;
            const source=this.settings.lyricsSource, uri=Spicetify.Player.data?.item?.uri || '', key=`${source}:${uri}`;
            if(!force && !poll && key===this.lyricsKey)return;
            if(force || key!==this.lyricsKey) this.spicyAttempts=0;
            this.lyricsKey=key; const token=++this.lyricsToken; clearTimeout(this.lyricsPoll);
            this.lyricsLines=[]; this.lyricIndex=-1;
            const status=this.overlay.querySelector('#cbp-lyrics-status'), lines=this.overlay.querySelector('#cbp-lyrics-lines'); lines.replaceChildren(); lines.scrollTop=0;
            if(source!=='spicy')this.restoreSpicyLoader();
            if(source==='off'){status.textContent='';cancelAnimationFrame(this.lyricRAF);this.lyricRAF=0;return;}
            if(!/^spotify:track:[a-zA-Z0-9]+$/.test(uri)){status.textContent='Включи песню, чтобы увидеть текст';return;}
            status.textContent='Загружаю текст…';
            const stillCurrent=()=>token===this.lyricsToken && this.immersive && this.settings.lyricsSource===source && Spicetify.Player.data?.item?.uri===uri;
            try {
                let data;
                if(source==='spotify') {
                    if(!Spicetify.CosmosAsync?.get) throw Error('Spotify пока не готов. Нажми «Обновить».');
                    let timeout;
                    try { data=await Promise.race([Spicetify.CosmosAsync.get(`https://spclient.wg.spotify.com/color-lyrics/v2/track/${uri.split(':')[2]}?format=json&vocalRemoval=false&market=from_token`),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Spotify не ответил. Нажми «Обновить».')),12000);})]); } finally {clearTimeout(timeout);}
                } else {
                    if(!poll && !this.spicyReturnLocation) {
                        // A cache hit needs no navigation; an uncached song starts the loader.
                        data=await this.spicyData(uri);
                        if(!stillCurrent())return;
                        if(!data)this.ensureSpicyLoader();
                    }
                    data=data||await this.spicyData(uri);
                    if(!data) {
                        if(!stillCurrent())return;
                        if(this.spicyAttempts++<40){status.textContent='Загружаю из Spicy Lyrics…';this.lyricsPoll=setTimeout(()=>{if(stillCurrent())this.refreshLyrics(false,true);},750);return;}
                        throw Error('Spicy Lyrics не вернул текст. Возможно, он недоступен или сервис временно не отвечает.');
                    }
                }
                if(!stillCurrent())return;
                this.spicyAttempts=0; this.lyricsLines=lyricLines(data,source);
                if(!this.lyricsLines.length){status.textContent='Для этой песни текст не найден';return;}
                status.textContent=this.lyricsLines.some(l=>l.start!==null)?'':'Текст без синхронизации';
                const fragment=document.createDocumentFragment();
                this.syllableNodes=[];
                for(const line of this.lyricsLines){const el=document.createElement(line.start===null?'p':'button');el.className='cbp-lyric-line';el.dir='auto';
                    if(line.words.length){for(const word of line.words){const span=document.createElement('span');span.className='cbp-syllable';span.textContent=word.text;el.append(span);if(word.space)el.append(document.createTextNode(' '));this.syllableNodes.push({el:span,...word});}}
                    else el.textContent=line.text;
                    if(line.start!==null){el.addEventListener('click',()=>{this.lyricClock=null;Spicetify.Player.seek(line.start);});}fragment.append(el);}
                lines.append(fragment); this.syncLyrics(playerValue('getProgress')); this.animateLyrics();
            } catch(error) { if(stillCurrent())status.textContent=source==='spotify'?'Текст Spotify недоступен для этой песни. Можно выбрать Spicy Lyrics.':error.message; }
        },
        syncLyrics(progress) {
            if(!this.immersive || !this.lyricsLines.length)return;
            let index=-1; for(let i=0;i<this.lyricsLines.length;i++){const start=this.lyricsLines[i].start;if(start!==null && start<=progress)index=i;}
            const changed=index!==this.lyricIndex; this.lyricIndex=index;
            const list=this.overlay.querySelector('#cbp-lyrics-lines');
            if(changed)for(let i=0;i<list.children.length;i++){list.children[i].classList.toggle('cbp-current-line',i===index);if(i===index)list.children[i].setAttribute('aria-current','true');else list.children[i].removeAttribute('aria-current');}
            if(changed && index>=0){const line=list.children[index];list.scrollTo({top:line.offsetTop-list.offsetTop-list.clientHeight/2+line.clientHeight/2,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
            for(const word of this.syllableNodes||[]){
                const fill=progress<word.start?0:word.end<=word.start?1:clamp((progress-word.start)/(word.end-word.start),0,1);
                const value=Math.round(fill*100);
                if(word.fill!==value){word.fill=value;word.el.style.setProperty('--cbp-fill',value+'%');}
                const active=progress>=word.start&&progress<word.end;
                if(word.active!==active){word.active=active;word.el.classList.toggle('cbp-syllable-active',active);}
            }
        }
    });

    const IMMERSION_CSS = `        :host,#cbp-immersion,#cbp-immersion *{-webkit-app-region:no-drag!important;app-region:no-drag!important;}
        #cbp-immersion button[hidden]{display:none!important;}
        #cbp-immersion{padding-top:145px!important;}
        .cbp-stage{display:flex;align-items:center;justify-content:center;width:100%;gap:clamp(24px,5vw,100px);min-width:0;}
        .cbp-cover-box{position:relative;flex:none;}
        .cbp-details{position:relative;}
        #cbp-lyrics-panel{position:relative;display:flex;flex-direction:column;text-align:left;min-width:0;flex:1;width:45%;max-width:800px;height:min(70dvh,900px);padding:16px;background:#0b101a55;backdrop-filter:blur(14px);border:1px solid #ffffff1a;border-radius:18px;}
        #cbp-lyrics-panel[hidden]{display:none!important;}
        .cbp-lyrics-header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex:none;}
        .cbp-lyrics-header select{font:inherit;font-size:13px;background:#182130;color:inherit;border:1px solid #ffffff30;border-radius:10px;padding:10px;}
        #cbp-lyrics-status{font-size:13px;opacity:.8;line-height:1.6;}
        #cbp-lyrics-status:empty{display:none;}
        #cbp-lyrics-lines{position:relative;overflow:auto;overscroll-behavior:contain;color-scheme:dark;scrollbar-width:thin;scrollbar-color:#ffffff40 transparent;flex:1;min-height:0;padding:clamp(30px,9dvh,100px) 8px;}
        #cbp-lyrics-lines .cbp-lyric-line{display:block;background:none;backdrop-filter:none;border:0;border-radius:8px;width:100%;text-align:start;padding:12px 8px;margin:0;font:inherit;font-size:clamp(20px,2.6dvh,38px);line-height:1.4;font-weight:650;color:inherit;opacity:.5;white-space:pre-line;overflow-wrap:anywhere;transition:opacity .2s;}
        #cbp-lyrics-lines .cbp-current-line{opacity:1;background:#ffffff12;text-shadow:0 2px 12px #0008;}
        #cbp-lyrics-lines button:hover{opacity:1;}
        .cbp-syllable{--cbp-fill:0%;background:linear-gradient(90deg,var(--cbp-ink,#f7f8fc) 0%,var(--cbp-ink,#f7f8fc) var(--cbp-fill),color-mix(in srgb,var(--cbp-ink,#f7f8fc) 40%,transparent) var(--cbp-fill),color-mix(in srgb,var(--cbp-ink,#f7f8fc) 40%,transparent) 100%);background-clip:text;-webkit-background-clip:text;color:transparent;display:inline-block;white-space:pre;transition:transform .16s,text-shadow .16s;transform:translateY(0);}
        .cbp-syllable-active{transform:translateY(-2px) scale(1.035);filter:drop-shadow(0 0 7px color-mix(in srgb,var(--cbp-ink,#f7f8fc) 35%,transparent));}
        #cbp-lyrics-lines .cbp-lyric-line:has(.cbp-syllable){opacity:.8;}
        #cbp-lyrics-lines .cbp-current-line:has(.cbp-syllable){opacity:1;}
        @media(prefers-reduced-motion:reduce){.cbp-syllable{transition:none;}.cbp-syllable-active{transform:none;}}
        .cbp-with-lyrics .cbp-now{width:45%;max-width:650px;flex:none;}
        .cbp-with-lyrics #cbp-cover{width:min(32dvh,30vw,440px);height:min(32dvh,30vw,440px);}
        .cbp-move,.cbp-resize{display:none;}
        .cbp-free .cbp-stage{position:absolute;inset:145px 24px 24px;width:auto;display:block;}
        .cbp-free .cbp-now{display:contents;}
        .cbp-free [data-block]{position:absolute;max-width:none;}
        .cbp-free #cbp-cover{width:100%;height:100%;}
        .cbp-free .cbp-details{overflow:auto;padding:8px;}
        .cbp-free .cbp-transport button{width:calc(60px * var(--cbp-control-scale,1));height:calc(60px * var(--cbp-control-scale,1));}
        .cbp-free .cbp-transport .cbp-play{width:calc(76px * var(--cbp-control-scale,1));height:calc(76px * var(--cbp-control-scale,1));}
        .cbp-free #cbp-track{font-size:clamp(22px,calc(40px * var(--cbp-control-scale,1)),56px);}
        .cbp-free #cbp-lyrics-panel{margin:0;}
        .cbp-editing [data-block]{outline:1px dashed #c6d7ff;outline-offset:4px;overflow:visible;}
        .cbp-editing .cbp-move{display:flex;position:absolute;top:4px;left:4px;z-index:3;padding:6px 10px;background:#15223ded;font-size:12px;cursor:grab;touch-action:none;}
        .cbp-editing .cbp-resize{display:flex;position:absolute;right:0;bottom:0;z-index:3;padding:4px;width:30px;height:30px;background:#15223ded;cursor:nwse-resize;touch-action:none;}
        .cbp-editing .cbp-cover-box #cbp-cover{pointer-events:none;}
        @media(max-width:700px){.cbp-with-lyrics .cbp-stage{flex-direction:column;gap:24px;}.cbp-with-lyrics .cbp-now{width:100%;}.cbp-with-lyrics #cbp-lyrics-panel{width:100%;height:48dvh;flex:none;}.cbp-free .cbp-stage{inset:165px 12px 16px;}#cbp-immersion{padding-top:165px!important;}}
        @media(prefers-reduced-motion:reduce){#cbp-lyrics-lines .cbp-lyric-line{transition:none;}}
        @media(max-width:700px) and (max-height:600px){#cbp-immersion:not(.cbp-free) #cbp-cover{width:min(20dvh,100px);height:min(20dvh,100px);}#cbp-immersion:not(.cbp-free) .cbp-now{gap:8px;}#cbp-immersion:not(.cbp-free) .cbp-details{gap:6px;}#cbp-immersion:not(.cbp-free) .cbp-transport{margin:4px 0;}#cbp-immersion:not(.cbp-free) .cbp-transport .cbp-play{width:50px;height:50px;}}

        :host{all:initial;position:fixed;inset:0;z-index:10000;pointer-events:none;font-family:var(--font-family,Arial,sans-serif);}
        #cbp-immersion{box-sizing:border-box;position:fixed;inset:0;pointer-events:auto;color:var(--cbp-ink,#f7f8fc);background:linear-gradient(#0002,#0005);display:grid;place-items:center;overflow:auto;padding:clamp(76px,8dvh,110px) 24px clamp(20px,4dvh,50px);text-align:center;font-family:var(--font-family,Arial,sans-serif);}
        #cbp-immersion *,#cbp-immersion *::before,#cbp-immersion *::after{box-sizing:border-box;}
        #cbp-immersion[hidden],#cbp-cover[hidden]{display:none!important;}
        #cbp-immersion :focus-visible{outline:2px solid #c0d2ff;outline-offset:4px;}
        .cbp-immersion-tools{position:fixed;right:24px;top:80px;z-index:20;display:flex;gap:8px;flex-wrap:wrap;max-width:calc(100% - 48px);justify-content:flex-end;-webkit-app-region:no-drag;app-region:no-drag;}
        button{appearance:none;display:inline-flex;align-items:center;justify-content:center;background:#11151c88;color:inherit;border:1px solid #ffffff30;border-radius:999px;padding:10px 16px;cursor:pointer;backdrop-filter:blur(16px);font:inherit;font-size:13px;line-height:1.3;}
        button:hover{background:#28303bb3;}
        .cbp-now{display:flex;flex-direction:column;align-items:center;gap:clamp(14px,2.3dvh,30px);max-width:760px;width:100%;text-shadow:0 2px 12px #0008;}
        #cbp-cover{display:block;flex:none;width:min(38dvh,55vw,440px);height:min(38dvh,55vw,440px);object-fit:cover;border-radius:18px;box-shadow:0 24px 70px #0006;}
        .cbp-details{display:flex;flex-direction:column;align-items:center;gap:clamp(8px,1.4dvh,18px);width:100%;min-width:0;}
        .cbp-eyebrow{font-size:10px;letter-spacing:3px;margin:0;opacity:.8;}
        #cbp-track{font-size:clamp(22px,4.3dvh,56px);line-height:1.12;margin:0;overflow-wrap:anywhere;max-width:100%;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;font-weight:700;}
        #cbp-artist{font-size:clamp(14px,1.7dvh,20px);line-height:1.4;opacity:.9;margin:0;max-width:100%;overflow-wrap:anywhere;}
        .cbp-transport{display:flex;justify-content:center;align-items:center;gap:18px;margin:clamp(4px,1dvh,12px) 0;}
        .cbp-transport button{width:clamp(44px,5.5dvh,60px);height:clamp(44px,5.5dvh,60px);padding:0;border-radius:50%;}
        .cbp-transport .cbp-play{width:clamp(56px,7dvh,76px);height:clamp(56px,7dvh,76px);background:#e7efff;color:#111827;border:0;}
        .cbp-transport .cbp-play:hover{background:#fff;}
        .cbp-transport svg{display:block;fill:currentColor;width:24px;height:24px;}
        .cbp-transport .cbp-play svg{width:30px;height:30px;}
        .cbp-seek{display:flex;gap:14px;align-items:center;font-size:11px;font-variant-numeric:tabular-nums;width:min(100%,460px);margin:0;}
        .cbp-seek input{flex:1;min-width:0;accent-color:#e7efff;height:24px;cursor:pointer;}
        @media(max-height:600px) and (min-width:700px){#cbp-immersion{padding-top:76px;}.cbp-now{flex-direction:row;max-width:860px;gap:clamp(24px,4vw,64px);}#cbp-cover{width:min(58dvh,30vw);height:min(58dvh,30vw);}.cbp-details{flex:1;}}
        @media(max-width:500px){#cbp-immersion{padding-inline:20px;}.cbp-immersion-tools{right:12px;left:12px;justify-content:center;}.cbp-immersion-tools button{font-size:11px;padding:9px 12px;}}
    `;

    const UI_CSS = `
        #cbp-settings-menu,#cbp-menu-backdrop,#cbp-immersion{font-family:var(--font-family,Arial,sans-serif);box-sizing:border-box;}
        #cbp-settings-menu[hidden],#cbp-menu-backdrop[hidden],#cbp-immersion[hidden],#cbp-cover[hidden]{display:none!important;}
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
        #cbp-settings-menu :focus-visible,#cbp-immersion :focus-visible{outline:2px solid #c0d2ff;outline-offset:3px;}
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
        html body.cbp-immersive #main{display:none!important;}
        @media(max-width:500px){#cbp-settings-menu{padding:18px;}#cbp-settings-menu h2{font-size:22px;}.cbp-immersion-tools{right:12px;left:12px;justify-content:center;}}
    `;
    async function boot() {
        if (!window.Spicetify?.LocalStorage || !Spicetify.Topbar?.Button || !Spicetify.Player?.addEventListener || !document.body) { setTimeout(boot, 200); return; }
        try { await APP.init(); } catch (error) { APP.report(error); window.__cbpLoaded = false; }
    }
    // A small diagnostic surface for support and deterministic tests.
    window.CBP = { version: "2.2.0", app: APP, normalize, cropRect, analyzePixels, luminance };
    boot();
})();
