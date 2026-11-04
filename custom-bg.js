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
    const linearRGB=Float64Array.from({length:256},(_,v)=>{const c=v/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});
    const linearChannel=v=>Number.isInteger(v)&&v>=0&&v<=255?linearRGB[v]:(v/255<=.04045?v/255/12.92:((v/255+.055)/1.055)**2.4);
    const luminance=rgb=>.2126*linearChannel(rgb[0])+.7152*linearChannel(rgb[1])+.0722*linearChannel(rgb[2]);
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
    function selectValue(values,index) {
        let lo=0,hi=values.length-1;
        while(lo<hi){
            const pivot=values[(lo+hi)>>>1];let i=lo,j=hi;
            while(i<=j){while(values[i]<pivot)i++;while(values[j]>pivot)j--;if(i<=j){const v=values[i];values[i++]=values[j];values[j--]=v;}}
            if(index<=j)hi=j;else if(index>=i)lo=i;else break;
        }
        return values[index]||0;
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
        const values=new Float64Array(rgb.length),dimLinear=new Float64Array(256),at=Math.min(rgb.length-1,Math.floor(rgb.length*.95));
        const percentile=dim=>{
            const scale=1-dim;
            for(let i=0;i<256;i++)dimLinear[i]=linearChannel(i*scale);
            for(let i=0;i<rgb.length;i++){
                const p=rgb[i];values[i]=.2126*(Number.isInteger(p[0])?dimLinear[p[0]]:linearChannel(p[0]*scale))+.7152*(Number.isInteger(p[1])?dimLinear[p[1]]:linearChannel(p[1]*scale))+.0722*(Number.isInteger(p[2])?dimLinear[p[2]]:linearChannel(p[2]*scale));
            }
            return at>=0?selectValue(values,at):0;
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
                backdrop-filter: none !important;
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
                backdrop-filter: none !important;
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

    const APP = {
        settings: null, image: "", decoded: null, sample: null, analysisKey: "",
        revision: 0, writeQueue: Promise.resolve(), imageToken: 0,
        notify(message, error = false) { Spicetify.showNotification?.(message, error); },
        save() { storage.put("cbp_v2_settings", JSON.stringify(this.settings)); },
        async init() {
            this.settings = loadSettings();
            this.image = await images.run("readonly").catch(error => { console.error(error); this.notify("Сохранённый фон не загрузился. Можно выбрать новую картинку.", true); return ""; });
            this.bg = document.createElement("div"); this.bg.id = "cbp-bg-layer";
            this.theme = document.createElement("style"); this.theme.id = "cbp-style-tag";
            this.extra = document.createElement("style"); this.extra.id = "cbp-ui-style"; this.extra.textContent = UI_CSS;
            document.body.prepend(this.bg); document.head.append(this.theme, this.extra);
            this.buildUI(); this.initEffects(); this.registerButtons(); this.bind();
            await this.render();
        },
        async render() {
            const token = ++this.revision;
            const s = this.settings;
            if (this.image && !this.image.startsWith("data:video/") && s.readable) {
                const key = [s.zoom, s.x, s.y, innerWidth, innerHeight].join(":");
                try {
                    const source = this.image;
                    const img = this.decoded || await decodeImage(source);
                    if (token !== this.revision) return;
                    this.decoded = img;
                    if (key !== this.analysisKey || !this.sample) {
                        if(!this.analysisCanvas){this.analysisCanvas=document.createElement("canvas");this.analysisCanvas.width=80;this.analysisCanvas.height=50;this.analysisContext=this.analysisCanvas.getContext("2d",{willReadFrequently:true});}
                        const ctx=this.analysisContext;
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
            const color = automatic ? this.sample?.text || "#f7f8fc" : s.color;
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

            const info=this.ui.autoInfo;
            const infoText=automatic ? `Автозатемнение: ${Math.round(effectiveDim * 100)}% · текст ${color.toUpperCase()}` : "Автоподбор учитывает видимую часть картинки и добавляет затемнение при необходимости.";
            if(info.textContent!==infoText)info.textContent=infoText;
            const colorInput=this.ui.color;if(colorInput.disabled!==(s.colorMode!=="custom"))colorInput.disabled=s.colorMode!=="custom";
            this.effectColor = color;
            if(this.uiColor!==color){this.uiColor=color;this.menu.style.setProperty("--cbp-ui-ink",color);}

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
            // Match control icons to the chosen text ink; artwork and our dialogs remain untouched.
            const light=luminance(color.match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16)))>.25;
            const halo=light?'#000b':'#ffffffe0',backdrop=light?'#10131b8c':'#ffffffa6';
            return `#main{--cbp-text:${color};--cbp-control-halo:${halo};--cbp-control-backdrop:${backdrop};--text-base:${color}!important;--text-subdued:${color}!important;--essential-base:${color}!important;}
                #main :is(button,[role="button"],input){color:var(--cbp-text)!important;--text-base:${color}!important;--text-subdued:${color}!important;--essential-base:${color}!important;--essential-subdued:${color}!important;}
                #main :is(#global-nav-bar,.Root__globalNav,.main-topBar-container) svg{color:var(--cbp-text)!important;filter:drop-shadow(0 0 2px var(--cbp-control-halo));}
                #main :is(#global-nav-bar,.Root__globalNav) input::placeholder{color:var(--cbp-text)!important;opacity:.85;}
                #main :is(button,[role="button"],a) span:has(svg){color:inherit!important;}
                #main :is(button,[role="button"],a) svg{color:inherit!important;filter:drop-shadow(0 0 2px var(--cbp-control-halo));}
                #main :is(button,[role="button"],a) svg:not([fill="none"]),#main :is(button,[role="button"],a) svg [fill]:not([fill="none"]){fill:currentColor!important;}
                #main :is(button,[role="button"],a) svg [stroke]:not([stroke="none"]){stroke:currentColor!important;}
                #main :is(#global-nav-bar,.Root__globalNav,.main-topBar-container,.player-controls__buttons,.main-nowPlayingBar-right) button:has(svg):not(:has(img,picture)):not([data-testid="control-button-playpause"]):not([data-testid="play-button"]){background-color:var(--cbp-control-backdrop)!important;}
                #main :is(button,[role="button"],a):focus-visible{outline:2px solid var(--cbp-text)!important;outline-offset:3px;}
                #main :is(.Root__nav-bar,.yQCyOSVcMCen_NJKPHB6,.Root__main-view,.R1kU6b2KxZc8FWfbYf3m,.Root__right-sidebar,.s8fIIxwITjOk1aFOxhPv,.Root__now-playing-bar,.XvuTwlgQRqJ5NnVLN9ZH) :is([data-encore-id="text"],h1,h2,h3,h4,p,a,[role="gridcell"]){color:var(--cbp-text)!important;text-shadow:0 1px 4px #000c!important;}
                #main :is(.Root__nav-bar,.yQCyOSVcMCen_NJKPHB6,.Root__main-view,.R1kU6b2KxZc8FWfbYf3m,.Root__right-sidebar,.s8fIIxwITjOk1aFOxhPv,.Root__now-playing-bar,.XvuTwlgQRqJ5NnVLN9ZH){--text-base:${color}!important;--text-subdued:${color}!important;}
                #main .main-trackList-rowTitle{color:${color}!important;text-shadow:0 1px 4px #000c!important;}`;
        },
        buildUI() {
            this.menu = document.createElement("section"); this.menu.id = "cbp-settings-menu";
            this.menu.hidden = true; this.menu.setAttribute("role", "dialog"); this.menu.setAttribute("aria-modal", "true"); this.menu.setAttribute("aria-labelledby", "cbp-heading");
            this.menu.innerHTML = `
                <header><div><small>CUSTOM BACKGROUND · 4.6.0</small><h2 id="cbp-heading">Твоё оформление</h2></div><button data-action="close" aria-label="Закрыть настройки">✕</button></header>
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
            this.ui={autoInfo:this.menu.querySelector("#cbp-auto-info"),color:this.menu.querySelector("#cbp-color")};
            this.cacheSettingControls();this.initTransferUI(); this.syncUI();
        },
        slider(label, key, min, max, step, unit) { return `<label class="cbp-slider"><span>${label}<output for="cbp-${key}" data-output="${key}"></output></span><input id="cbp-${key}" data-setting="${key}" data-unit="${unit}" type="range" min="${min}" max="${max}" step="${step}"></label>`; },
        toggle(key, label) { return `<label class="cbp-toggle"><input id="cbp-${key}" data-setting="${key}" type="checkbox"><span>${label}</span></label>`; },
        cacheSettingControls() {
            this.settingControls=new Map();
            for(const input of this.menu.querySelectorAll('[data-setting]'))this.settingControls.set(input.dataset.setting,{input,output:this.menu.querySelector('[data-output="'+input.dataset.setting+'"]')});
        },
        syncUI(changed) {
            const controls=changed?[this.settingControls.get(changed)]:this.settingControls.values();
            for(const control of controls){
                if(!control)continue;const {input,output}=control,key=input.dataset.setting;
                if(input.type==='checkbox'){if(input.checked!==this.settings[key])input.checked=this.settings[key];}
                else if(input.type==='color'||input.tagName==='SELECT'){if(input.value!==this.settings[key])input.value=this.settings[key];}
                else{
                    const value=this.settings[key]*(['dim','cards','libraryDim','centerDim','playerDim','lyricsDim'].includes(key)?100:1),text=Math.round(value)+input.dataset.unit;
                    if(Number(input.value)!==value)input.value=value;if(output.textContent!==text)output.textContent=text;
                }
            }
            if(this.ui.color.value!==this.settings.color)this.ui.color.value=this.settings.color;
        },
        showMenu(show = this.menu.hidden) {
            if(show&&!this.transferDialog?.hidden)this.showTransfer(false);
            if (show) { this.previousFocus = document.activeElement; for(const section of this.menu.querySelectorAll("details"))section.open=false; this.menu.scrollTop=0; }
            this.menu.hidden = !show; this.backdrop.hidden = !show;
            if (show) this.menu.querySelector('[data-action="close"]').focus(); else this.previousFocus?.focus?.();
        },
        registerButtons() {
            this.settingsButton = new Spicetify.Topbar.Button("Оформление · Alt+B", "edit", () => this.showMenu(), false, true);
        },
        syncStickyClipping() {
            let root=this.stickyRoot,viewport=this.stickyViewport;
            if(!root?.isConnected)root=this.stickyRoot=document.querySelector('.R1kU6b2KxZc8FWfbYf3m,.Root__main-view');
            if(!root)return;
            if(!viewport?.isConnected||!root.contains(viewport))viewport=this.stickyViewport=([...root.querySelectorAll('[data-overlayscrollbars-viewport],.os-viewport,.main-view-container__scroll-node')].find(el=>el.scrollTop>0)||root.querySelector('[data-overlayscrollbars-viewport],.os-viewport,.main-view-container__scroll-node'));
            if(!viewport)return;
            const clipped=this.clippedElements||=new Set();
            if(!this.image||viewport.scrollTop<=1){for(const el of clipped){el.removeAttribute('data-cbp-clipped');el.style.removeProperty('--cbp-clip-top');}clipped.clear();return;}
            for(const el of clipped)if(!el.isConnected)clipped.delete(el);
            const topbar=root.querySelector('.main-topBar-container'),edge=topbar?.getBoundingClientRect().bottom||viewport.getBoundingClientRect().top;
            const header=root.querySelector('.rrn0EjHTu7eCxn9G0Rrc.iPo4a2lbrsxW9Iedav3h'),headerRect=header?.getBoundingClientRect();
            const rowsEdge=headerRect&&headerRect.top<=edge+2?Math.max(edge,headerRect.bottom):edge,updates=[];
            // Read geometry first; interleaving writes with the next row's measurement forces layout.
            for(const el of viewport.querySelectorAll('[role="row"],.Shelf,h2,h3')){
                if(el.querySelector('[role="columnheader"]')||el.closest('.main-topBar-container'))continue;
                const rect=el.getBoundingClientRect(),cutoff=el.getAttribute('role')==='row'?rowsEdge:edge,clip=clamp(cutoff-rect.top,0,rect.height);
                if(clip>0){const value=clip.toFixed(1)+'px';if(!clipped.has(el)||el.style.getPropertyValue('--cbp-clip-top')!==value)updates.push([el,value]);}
                else if(clipped.has(el))updates.push([el,null]);
            }
            for(const [el,value] of updates){if(value!==null){el.setAttribute('data-cbp-clipped','');el.style.setProperty('--cbp-clip-top',value);clipped.add(el);}else{el.removeAttribute('data-cbp-clipped');el.style.removeProperty('--cbp-clip-top');clipped.delete(el);}}
        },
        bind() {
            let frame;
            const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => this.render()); };
            this.menu.addEventListener("input", e => {
                const el = e.target, key = el.dataset.setting;
                if (key) {
                    const value = el.type === "checkbox" ? el.checked : (el.tagName === "SELECT" || el.type === "color") ? el.value : Number(el.value) / (["dim", "cards", "libraryDim", "centerDim", "playerDim", "lyricsDim"].includes(key) ? 100 : 1);
                    this.settings = normalize({ ...this.settings, [key]: value }); if(key==='lyricsSource'&&value!=='off')this.settings.lyricsLastSource=value;
                    this.syncUI(key); this.save(); schedule();
                } else if (el.id === "cbp-color") { this.settings.color = el.value; this.save(); schedule(); }
            });
            this.menu.addEventListener("click", e => {
                const action = e.target.closest("[data-action]")?.dataset.action;
                if (action === "close") this.showMenu(false);
                if (action === "center") { Object.assign(this.settings, { x: 50, y: 50, zoom: 100 }); this.save(); this.syncUI(); this.render(); }
                if (action === "remove-image") { const token = ++this.imageToken; this.queueImage("", token).catch(error => this.report(error)); }
            });
            this.backdrop.addEventListener("click", () => this.showMenu(false));
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
                if(e.key==="Escape"&&!this.transferDialog.hidden){this.showTransfer(false);e.preventDefault();return;}
                if (e.key === "Escape") {
                    if (!this.menu.hidden) { this.showMenu(false); e.preventDefault(); }
                }
                const focusDialog=!this.transferDialog.hidden?this.transferDialog:!this.menu.hidden?this.menu:null;
                if (focusDialog && e.key === "Tab") {
                    const focusable = [...focusDialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select,summary')].filter(el => el.getClientRects().length);
                    const first = focusable[0], last = focusable[focusable.length - 1];
                    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
                }
                if (e.repeat || e.ctrlKey || e.metaKey) return;
                const shortcut = ({ KeyB: "settings", KeyP: "transfer", KeyV: "lyrics" })[e.code]
                    || ({ b: "settings", "и": "settings", p: "transfer", "з": "transfer", v: "lyrics", "м": "lyrics" })[(e.key || "").toLowerCase()];
                if (e.altKey && shortcut) {
                    e.preventDefault(); e.stopImmediatePropagation();
                    if (shortcut === "settings") this.showMenu();
                    if (shortcut === "transfer") this.showTransfer();
                    if (shortcut === "lyrics") this.togglePanelLyrics();
                }
            }, true);
            let resize;
            window.addEventListener("resize", () => { clearTimeout(resize); resize = setTimeout(() => this.render(), 180); });
            let clipFrame;
            const clipSoon = () => { cancelAnimationFrame(clipFrame); clipFrame = requestAnimationFrame(() => this.syncStickyClipping()); };
            document.addEventListener('scroll', e => { if(e.target.matches?.('.main-view-container__scroll-node,[data-overlayscrollbars-viewport],.os-viewport')){this.stickyViewport=e.target;clipSoon();} }, true);
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
    };

            Object.assign(APP, {
        initTransferUI() {
            const dialog=document.createElement('section');dialog.id='cbp-transfer';dialog.hidden=true;
            dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','cbp-transfer-title');
            dialog.innerHTML='<article><header><h2 id="cbp-transfer-title">Импорт и экспорт</h2><button data-transfer="close" aria-label="Закрыть импорт и экспорт">✕</button></header><p>Сохрани текущий фон и все настройки в файл или открой ранее сохранённый файл.</p><button data-transfer="export">Сохранить в файл</button><button data-transfer="import">Импортировать файл</button><input id="cbp-import" type="file" accept=".json,application/json" hidden><p role="status"></p></article>';
            dialog.addEventListener('click',e=>{const action=e.target.closest('[data-transfer]')?.dataset.transfer;if(action==='close'||e.target===dialog)this.showTransfer(false);if(action==='import')dialog.querySelector('input').click();if(action==='export')this.exportAppearance().catch(error=>this.report(error));});
            dialog.querySelector('input').addEventListener('change',async e=>{try{const file=e.target.files[0];if(file){if(file.size>45*1024*1024)throw Error('Файл оформления слишком большой (максимум 45 МБ)');await this.previewImport(JSON.parse(await file.text()));}}catch(error){dialog.querySelector('[role="status"]').textContent=error.message;}finally{e.target.value='';}});
            document.body.append(dialog);this.transferDialog=dialog;
        },
        showTransfer(show=this.transferDialog.hidden) {
            if(show){if(!this.menu.hidden)this.showMenu(false);this.transferFocus=document.activeElement;this.transferDialog.querySelector('[role="status"]').textContent='';}
            this.transferDialog.hidden=!show;
            if(show)this.transferDialog.querySelector('[data-transfer="export"]').focus();else this.transferFocus?.focus?.();
        },
        async appearanceBundle() {
            await this.mediaUpload;await this.writeQueue;
            return {format:'custom-background-preset',version:1,name:'Моё оформление',settings:normalize(this.settings),image:this.image};
        },
        async exportAppearance() {
            const bundle=await this.appearanceBundle();
            const url=URL.createObjectURL(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'}));
            const link=document.createElement('a');link.href=url;link.download='custom-background.json';
            document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
            this.notify('Фон и настройки сохранены в файл');
        },
        async importAppearance(raw) {
            const bundle=this.validateBundle(raw),token=++this.imageToken;
            if(bundle.image)await validateMedia(bundle.image);
            if(token!==this.imageToken)return;
            await this.queueImage(bundle.image,token);if(token!==this.imageToken)return;
            this.settings=bundle.settings;this.save();this.syncUI();await this.render();
            this.notify('Оформление применено');return bundle;
        }
    });

    async function validateMedia(src) {
        if (!src.startsWith('data:video/')) return decodeImage(src);
        return new Promise((resolve,reject)=>{
            const v=document.createElement('video'); v.muted=true; v.preload='metadata';
            const done=error=>{clearTimeout(timer);v.removeAttribute('src');v.load();error?reject(error):resolve();};
            const timer=setTimeout(()=>done(Error('Видео не загрузилось')),10000);
            v.onloadedmetadata=()=>done();v.onerror=()=>done(Error('Не удалось открыть видео'));v.src=src;
        });
    }
    Object.assign(APP, {
        initEffects() {
            this.bg.style.cssText='position:fixed;inset:0;z-index:-2;pointer-events:none;overflow:hidden;background:#121212';
            this.reduced=matchMedia('(prefers-reduced-motion: reduce)');
            document.addEventListener('visibilitychange',()=>{if(document.hidden)this.media?.pause?.();else this.renderBackground();});
        },
        renderBackground() {
            const s=this.settings;
            if(this.bgSource!==this.image) {
                this.bgSource=this.image;this.backgroundStyleKey=null;
                const old=this.media;
                if(this.image) {
                    const video=this.image.startsWith('data:video/');
                    const media=document.createElement(video?'video':'img');
                    media.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none';
                    if(video){media.muted=true;media.loop=true;media.playsInline=true;}
                    media.src=this.image;this.bg.append(media);this.media=media;
                    old?.pause?.();old?.remove();
                    for(const el of [...this.bg.children])if(el!==media){el.pause?.();el.remove();}
                    media.onerror=()=>this.notify('Фон не удалось воспроизвести. Выбери другой файл.',true);
                } else {for(const el of [...this.bg.children]){el.pause?.();el.remove();}this.media=null;}
            }
            const styleKey=[this.imageToken,s.zoom,s.x,s.y,s.blur].join(':');
            if(this.media&&styleKey!==this.backgroundStyleKey){this.backgroundStyleKey=styleKey;this.media.style.transform=`scale(${s.zoom/100})`;this.media.style.objectPosition=`${s.x}% ${s.y}%`;this.media.style.transformOrigin=`${s.x}% ${s.y}%`;this.media.style.filter=`blur(${s.blur}px)`;}
            if(this.media?.tagName==='VIDEO'){const media=this.media;if(document.hidden||this.reduced.matches){if(!media.paused)media.pause();}else if(media.paused&&this.backgroundPlaybackVideo!==media){this.backgroundPlaybackVideo=media;media.play().catch(()=>{}).finally(()=>{if(this.backgroundPlaybackVideo===media)this.backgroundPlaybackVideo=null;});}}

            const display=this.image?'block':'none';if(this.bg.style.display!==display)this.bg.style.display=display;
        }
    });

    const STUDIO_DEFAULTS = {
        hidePodcasts:false, hideRecommendations:false, hideSidebar:false, hideStore:false,
        coverRadius:8, coverScale:100, rowHeight:56, fontSize:14, font:'default',
        trackColor:'#b2c9ff', buttonColor:'#b2c9ff', playerCover:56, progressHeight:4,
        lyricsSource:'off', lyricsLastSource:'spicy', lyricsWidth:360, lyricsFont:24, lyricsDim:.12, lyricsTranslation:false, lyricsTranslationEngine:'local'
    };
    Object.assign(DEFAULT_EXTRA, STUDIO_DEFAULTS);
    Object.assign(LIMITS,{coverRadius:[0,40],coverScale:[70,130],rowHeight:[40,88],fontSize:[12,20],playerCover:[40,88],progressHeight:[2,10],lyricsWidth:[260,560],lyricsFont:[16,40],lyricsDim:[0,.6]});
    const originalBuildUI=APP.buildUI, originalRender=APP.render, originalInit=APP.init;
    Object.assign(APP, {
        scanHomeShelves() {
            if(!this.settings)return;
            this.scanHomeFilters();
            if(!this.settings.hidePodcasts&&!this.settings.hideRecommendations){for(const el of document.querySelectorAll('[data-cbp-hide-section]'))el.removeAttribute('data-cbp-hide-section');return;}
            for(const el of document.querySelectorAll('[data-testid="home-page"] :is(section,.Shelf)')) {
                if(el.querySelector('section,.Shelf'))continue;
                const title=el.querySelector('h2,h3')?.textContent||'';
                const podcast=!!el.querySelector('a[href^="/show/"],a[href^="/episode/"],a[href^="/audiobook/"],a[href^="/book/"],a[href^="/chapter/"]');
                const recommended=/рекоменд|специально для тебя|тебе может понравиться|сделано для тебя|recommended|made for you|suggested for you|you might like/i.test(title);
                el.toggleAttribute('data-cbp-hide-section',(this.settings.hidePodcasts&&podcast)||(this.settings.hideRecommendations&&recommended));
            }
        },
        scanHomeFilters() {
            const root=document.querySelector('.Root__main-view,.R1kU6b2KxZc8FWfbYf3m')||document.querySelector('[data-testid="home-page"]');
            if(!root)return;
            const hidden=this.hiddenHomeChips||=new Set(),next=new Set();
            if(!this.settings.hidePodcasts){for(const el of hidden)el.removeAttribute('data-cbp-hide-chip');hidden.clear();return;}
            const label=el=>(el.getAttribute('aria-label')||el.textContent||'').trim().toLocaleLowerCase();
            const controls=[...root.querySelectorAll('button,[role="tab"],[role="checkbox"],a[href]')];
            for(const button of controls){
                if(!/^(?:подкасты(?: и шоу)?|аудиокниги|podcasts(?: & shows)?|audiobooks)$/.test(label(button)))continue;
                const parent=button.parentElement;
                const wrapper=parent?.children.length===1&&/^(?:DIV|SPAN)$/.test(parent.tagName)&&parent!==root?parent:button;
                next.add(wrapper);if(!hidden.has(wrapper))wrapper.setAttribute('data-cbp-hide-chip','');
                const selected=['aria-pressed','aria-selected','aria-checked'].some(key=>button.getAttribute(key)==='true');
                if(!selected){this.hiddenHomeSelection?.delete(button);continue;}
                this.hiddenHomeSelection||=new WeakSet();if(this.hiddenHomeSelection.has(button))continue;
                const group=button.closest('[role="tablist"],[role="group"],.Yt3NCcQ9MNQ6msx88cPe')||parent?.parentElement;
                const all=[...(group||root).querySelectorAll('button,[role="tab"],[role="checkbox"],a[href]')].find(el=>/^(?:все|всё|all)$/.test(label(el)));
                if(all){this.hiddenHomeSelection.add(button);all.click();}
            }
            for(const el of hidden)if(!next.has(el))el.removeAttribute('data-cbp-hide-chip');
            this.hiddenHomeChips=next;
        },
        scheduleHomeScan() {
            if(!this.settings?.hidePodcasts&&!this.settings?.hideRecommendations)return;
            clearTimeout(this.homeScanTimer);this.homeScanTimer=setTimeout(()=>this.scanHomeShelves(),120);
        },
        buildUI() {
            originalBuildUI.call(this);
            const section=document.createElement('div');section.id='cbp-studio';
            section.innerHTML=`<details><summary>Конструктор интерфейса</summary>
                ${this.toggle('hidePodcasts','Скрыть подкасты и аудиокниги')}${this.toggle('hideRecommendations','Скрыть рекомендации на главной')}
                ${this.toggle('hideSidebar','Скрыть правую панель')}${this.toggle('hideStore','Скрыть магазин и Premium')}
                <button data-studio="reset-interface">Вернуть стандартный интерфейс</button></details>
                <details><summary>Элементы и плеер</summary>
                ${this.slider('Скругление обложек','coverRadius',0,40,1,'px')}${this.slider('Размер обложек карточек','coverScale',70,130,1,'%')}
                ${this.slider('Высота строк треков','rowHeight',40,88,1,'px')}${this.slider('Размер текста','fontSize',12,20,1,'px')}
                <label class="cbp-row">Шрифт<select data-setting="font"><option value="default">Spotify</option><option value="system">Системный</option></select></label>
                <label class="cbp-row">Текущий трек<input type="color" data-setting="trackColor"></label><label class="cbp-row">Кнопки плеера<input type="color" data-setting="buttonColor"></label>
                <details><summary>Дополнительно</summary>${this.slider('Обложка в плеере','playerCover',40,88,1,'px')}${this.slider('Толщина прогресса','progressHeight',2,10,1,'px')}</details></details>
                <details><summary>Текст песни в правой панели</summary>
                <label class="cbp-row">Источник<select data-setting="lyricsSource"><option value="off">Выключен</option><option value="spicy">Spicy Lyrics · автоматически</option><option value="spotify">Spotify</option></select></label>
                ${this.toggle('lyricsTranslation','Русский перевод под каждой строкой')}
                <label class="cbp-row">Переводчик<select data-setting="lyricsTranslationEngine"><option value="local">На компьютере · EN → RU · без дневной квоты</option><option value="mymemory">MyMemory · другие языки · онлайн</option></select></label>
                <p class="cbp-hint">Локальный перевод: английский → русский. При первом запуске скачиваются модель и движок, затем они работают без интернета. Текст песни остаётся на компьютере. Вычисления используют память и процессор. MyMemory отправляет строки сервису перевода; у него лимит 5000 символов в день.</p>
                ${this.slider('Ширина панели','lyricsWidth',260,560,1,'px')}${this.slider('Размер букв','lyricsFont',16,40,1,'px')}${this.slider('Затемнение фона панели','lyricsDim',0,60,1,'%')}
                <p class="cbp-hint">Spicy Lyrics загружается автоматически и плавно подсвечивает слоги, если источник предоставляет их тайминги. Spotify доступен отдельно с синхронизацией по строкам. Нажатие на строку перематывает.</p></details>`;
            this.menu.querySelector('footer').before(section);
            const edit=document.createElement('button');edit.dataset.studio='edit-background';edit.textContent='Настроить фон на экране';this.menu.querySelector('.cbp-upload').before(edit);
            this.menu.addEventListener('click',e=>{const action=e.target.closest('[data-studio]')?.dataset.studio;
                if(action==='edit-background')this.openBackgroundEditor();
                if(action==='reset-interface'){for(const k of Object.keys(STUDIO_DEFAULTS).filter(k=>!k.startsWith('lyrics')))this.settings[k]=STUDIO_DEFAULTS[k];this.save();this.syncUI();this.render();}
            });
            this.cacheSettingControls();this.syncUI();
        },
        syncReadyTrack(attempt=0) {
            clearTimeout(this.initialTrackTimer);this.initialTrackTimer=null;
            if(this.settings.lyricsSource==='off')return;
            if(/^spotify:track:[a-zA-Z0-9]+$/.test(Spicetify.Player.data?.item?.uri||'')){this.loadPanelLyrics();this.refreshPanelBackdrop();return;}
            if(attempt<20)this.initialTrackTimer=setTimeout(()=>this.syncReadyTrack(attempt+1),500);
        },
        togglePanelLyrics() {
            const open=this.settings.lyricsSource==='off';if(!open)this.settings.lyricsLastSource=this.settings.lyricsSource;this.settings.lyricsSource=open?this.settings.lyricsLastSource:'off';
            if(!open){this.lyricsPanel.hidden=true;document.body.classList.remove('cbp-panel-lyrics');this.cancelPanelTranslation();this.refreshPanelBackdrop();}
            this.save();this.syncUI();this.render();
        },
        async init() {
            this.studioStyle=document.createElement('style');document.head.append(this.studioStyle);
            this.lyricsPanel=document.createElement('aside');this.lyricsPanel.id='cbp-lyrics';this.lyricsPanel.hidden=true;
            this.lyricsPanel.innerHTML='<header><strong>Текст песни</strong><button data-translation aria-label="Русский перевод" aria-pressed="false" title="Русский перевод">RU</button><button data-retry aria-label="Обновить текст">↻</button><button data-close aria-label="Закрыть текст песни">✕</button></header><p role="status"></p><p class="cbp-translation-status" role="status" hidden></p><div class="cbp-lines" tabindex="0" aria-label="Строки песни"></div>';
            this.lyricsPanel.querySelector('[data-translation]').onclick=()=>{this.settings.lyricsTranslation=!this.settings.lyricsTranslation;this.save();this.syncUI();this.render();};
            this.lyricsPanel.querySelector('[data-retry]').onclick=()=>{this.loadPanelLyrics(true);this.refreshPanelBackdrop(true);};
            this.lyricsPanel.querySelector('[data-close]').onclick=()=>{if(this.settings.lyricsSource!=='off')this.togglePanelLyrics();};document.body.append(this.lyricsPanel);
            this.lyricsPanel.addEventListener('pointerdown',event=>event.stopPropagation());
            await originalInit.call(this);
            this.initPanelBackdrop();
            Spicetify.Player.addEventListener('songchange',()=>{this.loadPanelLyrics();this.syncReadyTrack();});
            Spicetify.Player.addEventListener('onplaypause',()=>{this.updateLyricsClock();this.syncPanelBackdropPlayback();});
            Spicetify.Player.addEventListener('onprogress',()=>{if(!document.hidden&&this.settings.lyricsSource!=='off'&&!this.lyricFrame&&!this.lyricsTimer)this.syncPanelLyrics();});
            document.addEventListener('visibilitychange',()=>{this.updateLyricsClock();this.syncPanelBackdropPlayback();this.updatePanelTranslation();});
            this.updateLyricsClock();this.syncReadyTrack();
        },
        async render() {
            await originalRender.call(this);if(!this.studioStyle)return;
            this.renderStudio();
            if(this.lyricsPanel){this.loadPanelLyrics();this.updateLyricsClock();this.refreshPanelBackdrop();}
        },
        renderStudio() {
            const s=this.settings;const controlInk=luminance(s.buttonColor.match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16)))>.3?'#101828':'#ffffff';
            const fonts={default:'inherit',system:'system-ui,sans-serif'};
            const styleKey=JSON.stringify(Object.keys(STUDIO_DEFAULTS).map(k=>s[k]))+':'+this.effectColor;
            if(styleKey===this.studioKey)return;this.studioKey=styleKey;
            const css=[];
            const homeKey=s.hidePodcasts+':'+s.hideRecommendations;if(homeKey!==this.homeVisibilityKey){this.homeVisibilityKey=homeKey;this.scanHomeShelves();}css.push('#main :is([data-cbp-hide-section],[data-cbp-hide-chip]){display:none!important}');
            if(s.hidePodcasts)css.push('[data-testid="home-page"] :is(.Shelf,section):has(a[href^="/show/"],a[href^="/episode/"],a[href^="/audiobook/"],a[href^="/book/"],a[href^="/chapter/"]){display:none!important}');
            if(s.hideRecommendations)css.push('[data-testid="home-page"] :is([data-testid="recommendation-section"],[data-testid="recommended-section"],section[data-uri*="recommendation"],.Shelf:has(a[href^="/genre/recommended"])) {display:none!important}');
            if(s.hideStore)css.push('#main :is(a[href^="/store"],a[href*="spotify.com/premium"],[data-testid="upgrade-button"],[data-testid="premium-upsell-link"],[aria-label="Маркетплейс"],[aria-label="Marketplace"],[title="Marketplace"],[title="Маркетплейс"]){display:none!important}');
            if(s.hideSidebar||s.lyricsSource!=='off')css.push('#main :is(.Root__right-sidebar,.s8fIIxwITjOk1aFOxhPv,[data-testid="right-sidebar"],#Desktop_PanelContainer_Id){display:none!important}#main{--right-sidebar-width:0!important}#main .R1kU6b2KxZc8FWfbYf3m{grid-area:main-view/main-view/main-view/right-sidebar!important}');
            css.push(`#main :is(.main-card-imageContainer,.main-card-imageContainer img,[data-testid="card-image"]){border-radius:${s.coverRadius}px!important}
                #main :is(.main-gridContainer-gridContainer,[data-testid="card-grid"]){grid-template-columns:repeat(auto-fill,minmax(min(100%,${Math.round(160*s.coverScale/100)}px),1fr))!important}
                #main :is(.main-trackList-trackListRow,[data-testid="tracklist-row"]){min-height:${s.rowHeight}px!important;height:${s.rowHeight}px!important}
                #main :is(.main-trackList-rowTitle,.main-trackList-rowSubTitle){font-size:${s.fontSize}px!important}
                #main :is([data-encore-id="text"],.main-trackList-rowTitle){font-family:${fonts[s.font]}!important}
                #main :is(.main-trackList-playingIndicator,.main-trackList-rowTitle[aria-current="true"],[data-testid="tracklist-row"][data-playing="true"] .main-trackList-rowTitle){color:${s.trackColor}!important}
                #main .main-trackList-trackListRow:has(.main-trackList-playingIcon) .main-trackList-rowTitle{color:${s.trackColor}!important}
                #main :is([data-testid="control-button-playpause"],.player-controls__buttons button[aria-label="Pause"],.player-controls__buttons button[aria-label="Play"]){background:${s.buttonColor}!important;color:${controlInk}!important}
                #main :is(.main-nowPlayingWidget-coverArt,.main-nowPlayingWidget-coverArt img){width:${s.playerCover}px!important;height:${s.playerCover}px!important;border-radius:${s.coverRadius}px!important}
                #main .playback-bar :is(.progress-bar__bg,.progress-bar__fg,.progress-bar__fg_wrapper){height:${s.progressHeight}px!important}
                #cbp-lyrics{--cbp-lyric-ink:${this.effectColor||s.color};width:min(${s.lyricsWidth}px,90vw);font-size:${s.lyricsFont}px}
                body.cbp-panel-lyrics #main{width:calc(100% - ${s.lyricsWidth}px)!important}
                @media(max-width:700px){body.cbp-panel-lyrics #main{width:100%!important}}`);
            this.studioStyle.textContent=STUDIO_CSS+css.join('\n');
            document.body.classList.toggle('cbp-panel-lyrics',s.lyricsSource!=='off');
            this.lyricsPanel.hidden=s.lyricsSource==='off';
            this.updatePanelContrast?.();
        },
        openBackgroundEditor() {
            if(!this.image){this.notify('Сначала выбери фон',true);return;}
            this.showMenu(false);const before={x:this.settings.x,y:this.settings.y,zoom:this.settings.zoom,dim:this.settings.dim,blur:this.settings.blur};
            const editor=document.createElement('section');editor.id='cbp-bg-editor';editor.setAttribute('role','dialog');editor.setAttribute('aria-label','Редактор фона');
            editor.innerHTML='<div class="cbp-editor-tools"><strong>Перетаскивай фон · колесо — масштаб</strong><button data-editor="save">Сохранить</button><button data-editor="cancel">Отмена · Esc</button><label>Затемнение <input aria-label="Затемнение" type="range" min="0" max="100" data-edit="dim"></label><label>Размытие <input aria-label="Размытие" type="range" min="0" max="50" data-edit="blur"></label><output></output></div>';
            document.body.append(editor);this.backgroundEditor=editor;this.editingBackground=true;
            const paint=()=>{this.syncUI();this.render();editor.querySelector('output').textContent=`Масштаб ${Math.round(this.settings.zoom)}% · X ${Math.round(this.settings.x)} · Y ${Math.round(this.settings.y)}`;};
            let editorFrame=0;const update=()=>{if(!editorFrame)editorFrame=requestAnimationFrame(()=>{editorFrame=0;paint();});};
            editor.querySelector('[data-edit="dim"]').value=this.settings.dim*100;editor.querySelector('[data-edit="blur"]').value=this.settings.blur;
            const finish=save=>{cancelAnimationFrame(editorFrame);editorFrame=0;if(!save)Object.assign(this.settings,before);else{this.save();}editor.remove();document.removeEventListener('keydown',escape,true);this.backgroundEditor=null;this.editingBackground=false;paint();this.showMenu(true);};
            const escape=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish(false);}else if(e.key==='Tab'){const nodes=[...editor.querySelectorAll('button,input')];if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0].focus();}}};document.addEventListener('keydown',escape,true);
            editor.onclick=e=>{const a=e.target.closest('[data-editor]')?.dataset.editor;if(a)finish(a==='save');};
            editor.oninput=e=>{const k=e.target.dataset.edit;if(k){this.settings[k]=Number(e.target.value)/(k==='dim'?100:1);update();}};
            let drag;
            editor.onpointerdown=e=>{if(e.target.closest('.cbp-editor-tools')||e.button!==0)return;drag={x:e.clientX,y:e.clientY,sx:this.settings.x,sy:this.settings.y};editor.setPointerCapture(e.pointerId);};
            editor.onpointermove=e=>{if(!drag)return;const m=this.media,iw=m.naturalWidth||m.videoWidth||innerWidth,ih=m.naturalHeight||m.videoHeight||innerHeight,scale=Math.max(innerWidth/iw,innerHeight/ih)*this.settings.zoom/100;
                this.settings.x=clamp(drag.sx-(e.clientX-drag.x)/Math.max(1,iw*scale-innerWidth)*100,0,100);this.settings.y=clamp(drag.sy-(e.clientY-drag.y)/Math.max(1,ih*scale-innerHeight)*100,0,100);update();};
            editor.onpointerup=editor.onpointercancel=()=>drag=null;
            editor.addEventListener('wheel',e=>{if(e.target.closest('.cbp-editor-tools'))return;e.preventDefault();this.settings.zoom=clamp(this.settings.zoom+(e.deltaY<0?5:-5),100,250);update();},{passive:false});
            editor.querySelector('button').focus();paint();
        }
    });
    const STUDIO_CSS=`
        #cbp-studio button{white-space:normal}#cbp-studio input[type=color]{width:42px;height:30px;padding:0;margin-left:auto}
        #cbp-bg-editor{position:fixed;inset:0;z-index:100000;cursor:grab;touch-action:none;border:3px solid #b2c9ff;box-sizing:border-box}
        .cbp-editor-tools{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);width:min(720px,90vw);background:#14171ff5;color:white;border:1px solid #ffffff30;border-radius:16px;padding:18px;display:flex;gap:12px;flex-wrap:wrap;cursor:default;font:14px system-ui}
        .cbp-editor-tools button,#cbp-lyrics button,#cbp-import-preview button{font:inherit;color:inherit;background:#ffffff15;border:1px solid #ffffff30;border-radius:8px;padding:8px;cursor:pointer}
        .cbp-editor-tools strong{width:100%}.cbp-editor-tools label{display:flex;gap:8px;align-items:center}
        #cbp-lyrics{position:fixed;right:8px;top:8px;bottom:8px;z-index:9000;padding:18px;box-sizing:border-box;display:flex;flex-direction:column;background:#11151c;backdrop-filter:none;border-radius:16px;isolation:isolate;overflow:hidden;color:var(--cbp-panel-ink,var(--cbp-lyric-ink,#fff));font-family:system-ui;text-shadow:0 1px 4px #0009;box-shadow:0 0 0 1px #ffffff18}
        #cbp-lyrics>.cbp-panel-backdrop{position:absolute;inset:0;z-index:0;pointer-events:none;background:#11151c}
        #cbp-lyrics>.cbp-panel-backdrop :is(img,video){position:absolute;inset:0;display:block;width:100%;height:100%;max-width:none;max-height:none;object-fit:cover;object-position:center;filter:none;border-radius:0}
        #cbp-lyrics>.cbp-panel-backdrop::after{content:"";position:absolute;inset:0;background:var(--cbp-panel-scrim,#0000001f)}
        #cbp-lyrics,#cbp-lyrics *{-webkit-app-region:no-drag!important;app-region:no-drag!important}
        #cbp-lyrics header,#cbp-lyrics header button{pointer-events:auto!important;touch-action:manipulation}
        #cbp-lyrics>.cbp-panel-backdrop:is([data-source=canvas],[data-source=clip])>img{display:none}
        #cbp-lyrics>:not(.cbp-panel-backdrop){position:relative;z-index:1}
        #cbp-lyrics[hidden]{display:none}#cbp-lyrics header{display:flex;justify-content:space-between;align-items:center;font-size:15px;gap:8px}#cbp-lyrics p{font-size:13px;line-height:1.5}
        #cbp-lyrics .cbp-lines{overflow:auto;flex:1;min-height:0;padding-block:32px;scrollbar-width:thin}
        #cbp-lyrics .cbp-line{display:block;width:100%;border:0;background:transparent;text-align:start;color:inherit;font:inherit;line-height:1.5;opacity:1;padding:12px 4px;white-space:pre-wrap;overflow-wrap:anywhere;transition:opacity .2s}
        #cbp-lyrics .cbp-line[aria-current=true]{opacity:1;font-weight:650;background:#ffffff0d}#cbp-lyrics .cbp-line:hover{opacity:1}
        #cbp-lyrics :is(.cbp-original,.cbp-syllable,.cbp-translation){-webkit-text-stroke:.25px var(--cbp-panel-outline,#000b);paint-order:stroke fill}
        #cbp-lyrics .cbp-original{display:block}
        #cbp-lyrics .cbp-translation{display:block;font-size:.7em;font-weight:450;line-height:1.45;margin-top:5px;opacity:1;color:inherit}
        #cbp-lyrics .cbp-translation[hidden]{display:none}
        #cbp-lyrics [data-translation][aria-pressed=true]{background:#ffffff30;outline:1px solid currentColor}
        #cbp-lyrics .cbp-translation-status{font-size:12px;margin:0 0 6px}
        #cbp-lyrics .cbp-line:has(.cbp-syllable){font-weight:650;opacity:1}
        #cbp-lyrics .cbp-line[aria-current=true]:has(.cbp-syllable){opacity:1}
        #cbp-lyrics .cbp-syllable{--cbp-fill:0%;display:inline-block;white-space:pre;color:transparent;background:linear-gradient(var(--cbp-syllable-direction,90deg),var(--cbp-panel-ink,var(--cbp-lyric-ink,#fff)) var(--cbp-fill),var(--cbp-panel-muted-ink,var(--cbp-panel-ink,var(--cbp-lyric-ink,#fff))) var(--cbp-fill));background-clip:text;-webkit-background-clip:text;transition:transform .18s ease;transform:translateY(0)}
        #cbp-lyrics .cbp-syllable-active{transform:translateY(-1px)}
        #cbp-lyrics [data-state=past] .cbp-syllable{--cbp-fill:100%!important}
        #cbp-lyrics [data-state=future] .cbp-syllable{--cbp-fill:0%!important}
        #cbp-lyrics .cbp-backing{display:block;font-size:.78em;opacity:1;margin-top:4px}
        body.cbp-spicy-loading #main :is(.Root__right-sidebar,.s8fIIxwITjOk1aFOxhPv,[data-testid="right-sidebar"],#Desktop_PanelContainer_Id){display:flex!important;position:fixed!important;right:-10000px!important;top:80px!important;bottom:100px!important;width:360px!important;visibility:hidden!important;pointer-events:none!important}
        @media(prefers-reduced-motion:reduce){#cbp-lyrics .cbp-syllable{transition:none;transform:none}}
        #cbp-import-preview{position:fixed;inset:0;z-index:100001;background:#000a;display:grid;place-items:center;font:14px system-ui;color:#f5f7ff}
        #cbp-import-preview article{width:min(600px,90vw);max-height:90vh;overflow:auto;background:#14171f;border:1px solid #ffffff30;border-radius:18px;padding:22px}
        #cbp-import-preview .cbp-import-art{height:200px;width:100%;object-fit:cover;border-radius:12px}#cbp-import-preview label{display:block;margin:14px 0}#cbp-import-preview button{margin:8px 8px 0 0}
        @media(prefers-reduced-motion:reduce){#cbp-lyrics .cbp-line{transition:none}}
    `;

    Object.assign(APP,{
        syncPanelTimeline(progress) {
            if(this.panelTimelineSource!==this.panelLyricLines){
                this.panelTimelineSource=this.panelLyricLines;
                this.panelTimeline=this.panelLyricLines.map((line,index)=>({start:line.start,index})).filter(l=>l.start!==null).sort((a,b)=>a.start-b.start||a.index-b.index);
                this.panelList=this.lyricsPanel.querySelector('.cbp-lines');
                this.panelRowNodes=Array.from(this.panelList.children);this.panelStateIndex=undefined;
            }
            let lo=0,hi=this.panelTimeline.length;
            while(lo<hi){const mid=(lo+hi)>>>1;if(this.panelTimeline[mid].start<=progress)lo=mid+1;else hi=mid;}
            const index=lo?this.panelTimeline[lo-1].index:-1,previous=this.panelStateIndex,rows=this.panelRowNodes;
            if(index!==previous){
                const first=previous===undefined?0:Math.max(0,Math.min(previous,index));
                const last=previous===undefined?rows.length-1:Math.min(rows.length-1,Math.max(previous,index));
                for(let i=first;i<=last;i++){
                    const el=rows[i],current=String(i===index),state=i<index?'past':i===index?'current':'future';
                    if(el.getAttribute('aria-current')!==current)el.setAttribute('aria-current',current);
                    if(el.dataset.state!==state)el.dataset.state=state;
                }
                this.panelStateIndex=index;
            }
            if(index!==this.panelLyricIndex){
                this.panelLyricIndex=index;
                const el=rows[index],list=this.panelList;
                if(el)list.scrollTo({top:el.offsetTop-list.offsetTop-list.clientHeight/2+el.clientHeight/2,behavior:this.reduced.matches?'instant':'smooth'});
            }
            return index;
        }
    });

    function panelLines(payload, source='spotify') {
        if(typeof payload==='string'){try{payload=JSON.parse(payload);}catch{return [];}}
        const data=source==='spotify'?payload?.lyrics:payload;
        const list=source==='spotify'?data?.lines:data?.Content;if(!Array.isArray(list))return [];
        const synced=source==='spotify'?data.syncType==='LINE_SYNCED':data.Type!=='Static';
        const segments=voice=>Array.isArray(voice?.Syllables)?voice.Syllables.slice(0,500).filter(s=>s&&typeof s.Text==='string').map((s,i,all)=>({
            text:s.Text.slice(0,500),start:Number(s.StartTime)*1000,end:Number(s.EndTime)*1000,space:!s.IsPartOfWord&&i<all.length-1
        })).filter(s=>Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.start>=0&&s.end>=s.start):[];
        return list.slice(0,2500).map(line=>{
            const lead=line?.Lead||line,syllables=source==='spicy'?segments(lead):[];
            const text=source==='spotify'?line?.words:syllables.length?syllables.map(s=>s.text+(s.space?' ':'')).join(''):typeof line==='string'?line:line?.Text;
            const rawStart=source==='spotify'?Number(line?.startTimeMs):Number(lead?.StartTime)*1000;
            const start=synced?(Number.isFinite(rawStart)?rawStart:syllables[0]?.start):null;
            return {text:String(text||'').slice(0,10000),start:Number.isFinite(start)&&start>=0?start:null,syllables,
                background:Array.isArray(line?.Background)?line.Background.slice(0,8).map(segments).filter(s=>s.length):[]};
        }).filter(l=>l.text.trim());
    }
    Object.assign(APP,{
        panelLines, lyricRequest:0,
        updateLyricsClock() {
            if(this.clockLineSource!==this.panelLyricLines){this.clockLineSource=this.panelLyricLines;this.clockHasTimings=!!this.panelLyricLines?.some(line=>line.start!==null);}
            const active=this.clockHasTimings&&this.settings?.lyricsSource!=='off'&&!document.hidden&&playerValue('isPlaying',false);
            const smooth=active&&this.panelHasSyllables&&!this.reduced.matches;
            if((!active||smooth)&&this.lyricsTimer){clearInterval(this.lyricsTimer);this.lyricsTimer=null;}
            if(!smooth&&this.lyricFrame){cancelAnimationFrame(this.lyricFrame);this.lyricFrame=0;this.panelClock=null;}
            if(active&&!smooth&&!this.lyricsTimer)this.lyricsTimer=setInterval(()=>this.syncPanelLyrics(),200);
            if(smooth&&!this.lyricFrame){
                const tick=now=>{
                    this.lyricFrame=0;
                    if(document.hidden||this.settings.lyricsSource==='off'||!playerValue('isPlaying',false)){this.updateLyricsClock();return;}
                    const raw=playerValue('getProgress');
                    if(!this.panelClock||raw!==this.panelClock.raw)this.panelClock={raw,at:now};
                    this.syncPanelLyrics(raw+Math.min(1200,Math.max(0,now-this.panelClock.at)));
                    this.lyricFrame=requestAnimationFrame(tick);
                };this.lyricFrame=requestAnimationFrame(tick);
            }
        },
        ensureSpicyLoader(owner) {
            if(owner!==this.lyricRequest)return;
            this.spicyLoaderOwner=owner;document.body.classList.add('cbp-spicy-loading');
            const panel=document.querySelector('#Desktop_PanelContainer_Id,aside.NowPlayingView');
            if(panel?.closest('[hidden],[inert],[aria-hidden="true"]')){
                const button=document.querySelector('[data-testid="control-button-npv"]');
                if(!this.spicyOpenedNPV&&button&&button.getAttribute('aria-pressed')!=='true'){this.spicyOpenedNPV=true;button.click();}
                return;
            }
            const card=document.querySelector('#SpicyLyricsNPVCard'),toggle=card?.querySelector('#NPVCardToggle');
            if(toggle&&card.classList.contains('Collapsed')){if(!this.spicyOpenedCard){this.spicyOpenedCard=true;toggle.click();}return;}
            if(card)return;
            const npv=document.querySelector('#Desktop_PanelContainer_Id,aside.NowPlayingView');
            if(!npv&&!this.spicyOpenedNPV){
                const button=document.querySelector('[data-testid="control-button-npv"]');
                if(button&&button.getAttribute('aria-pressed')!=='true'){this.spicyOpenedNPV=true;button.click();}
            }
        },
        releaseSpicyLoader(owner=this.spicyLoaderOwner) {
            if(owner!==this.spicyLoaderOwner)return;
            if(this.spicyOpenedCard){const card=document.querySelector('#SpicyLyricsNPVCard');if(card&&!card.classList.contains('Collapsed'))card.querySelector('#NPVCardToggle')?.click();}
            if(this.spicyOpenedNPV){const button=document.querySelector('[data-testid="control-button-npv"]');if(button?.getAttribute('aria-pressed')==='true')button.click();}
            this.spicyOpenedCard=false;this.spicyOpenedNPV=false;this.spicyLoaderOwner=null;document.body.classList.remove('cbp-spicy-loading');
        },
        async readSpicy(uri) {
            const manager=window.SpicyLyrics?.db?.objectStores?.lyricsStore?.manager;
            if(manager?.get){const local=await manager.get(uri);if(local?.Content)return local;}
            if(!window.caches)return null;
            if(!this.spicyCacheIndex||!this.spicyCacheIndex.names.length||Date.now()-this.spicyCacheIndex.at>2000){
                this.spicyCacheIndex={at:Date.now(),names:(await caches.keys()).filter(n=>/spicy.*lyrics.*store/i.test(n))};
            }
            for(const name of this.spicyCacheIndex.names){
                const response=await (await caches.open(name)).match('/'+uri.split(':')[2]);if(!response)continue;
                const entry=await response.json();if(entry.ExpiresAt&&entry.ExpiresAt<Date.now())continue;
                const data=entry.Content;if(data?.uri&&data.uri!==uri)continue;
                if(data?.Content)return data;
            }return null;
        },
        async spotifyPanelData(uri) {
            if(!Spicetify.CosmosAsync?.get)throw Error('Источник Spotify пока недоступен');
            let timer;try{return await Promise.race([Spicetify.CosmosAsync.get(`https://spclient.wg.spotify.com/color-lyrics/v2/track/${uri.split(':')[2]}?format=json&vocalRemoval=false&market=from_token`),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Источник не ответил')),10000))]);}finally{clearTimeout(timer);}
        },
        async loadPanelLyrics(force=false) {
            if(!this.lyricsPanel)return;
            const source=this.settings.lyricsSource,uri=Spicetify.Player.data?.item?.uri||'',key=source+':'+uri;
            if(!force&&this.panelLyricKey===key){this.updatePanelTranslation();return;}this.panelLyricKey=key;this.releaseSpicyLoader();this.cancelPanelTranslation();
            const token=++this.lyricRequest;this.panelLyricLines=[];this.panelLyricIndex=-1;this.clockLineSource=null;this.panelTimelineSource=null;this.panelTimeline=[];this.panelRowNodes=[];this.panelStateIndex=undefined;this.translationIdleLines=null;this.panelSyllableNodes=[];this.syllableCursor=null;this.panelClock=null;this.panelHasSyllables=false;
            const status=this.lyricsPanel.querySelector('[role="status"]'),list=this.lyricsPanel.querySelector('.cbp-lines');list.replaceChildren();list.scrollTop=0;this.updateLyricsClock();
            if(source==='off')return;
            if(!/^spotify:track:[a-zA-Z0-9]+$/.test(uri)){status.textContent='Включи песню, чтобы увидеть текст';return;}
            status.textContent=source==='spicy'?'Spicy Lyrics: загружаю текст и тайминги…':'Загружаю текст Spotify…';
            const current=()=>token===this.lyricRequest&&this.settings.lyricsSource===source&&Spicetify.Player.data?.item?.uri===uri;
            try{
                let data;
                if(source==='spicy'){
                    data=await this.readSpicy(uri);if(!current())return;
                    if(!data)for(let i=0;i<60&&!data;i++){
                        if(!current())return;this.ensureSpicyLoader(token);
                        await new Promise(r=>setTimeout(r,400));if(!current())return;data=await this.readSpicy(uri);
                        if(i===9)status.textContent='Ожидаю ответ Spicy Lyrics…';
                    }
                    if(!data)throw Error('Spicy Lyrics не вернул текст. Проверь, что его карточка Lyrics включена в настройках расширения. Spotify можно выбрать отдельно.');
                }else data=await this.spotifyPanelData(uri);
                if(!current())return;
                this.panelLyricLines=panelLines(data,source);
                const language=data?.lyrics?.language||data?.Language||data?.language||'';
                const text=this.panelLyricLines.map(l=>l.text).join(' ');
                this.panelLyricLanguage=/^[a-z]{2,3}(?:-[a-z]{2})?$/i.test(language)?language.toLowerCase():/\p{Script=Cyrillic}/u.test(text)?'ru':/[a-z]/i.test(text)?'en':'autodetect';
                const syllableMode=this.panelLyricLines.some(l=>l.syllables.length);
                this.panelHasSyllables=this.panelLyricLines.some(l=>l.syllables.length||l.background.length);
                status.textContent=!this.panelLyricLines.length?'Для этой песни текст не найден':source==='spicy'?(syllableMode?'Spicy Lyrics · синхронизация по слогам':'Spicy Lyrics · источник дал только строки, без таймингов слогов'):'Spotify · синхронизация по строкам';
                const fragment=document.createDocumentFragment();
                for(const line of this.panelLyricLines){
                    const el=document.createElement(line.start===null?'p':'button');el.className='cbp-line';el.dir='auto';const nodes=[];
                    const original=document.createElement('span');original.className='cbp-original';
                    const translated=document.createElement('span');translated.className='cbp-translation';translated.lang='ru';translated.dir='ltr';translated.hidden=true;el.append(original,translated);
                    const append=(parent,segments)=>{for(const segment of segments){const span=document.createElement('span');span.className='cbp-syllable';span.textContent=segment.text;parent.append(span);if(segment.space)parent.append(document.createTextNode(' '));nodes.push({el:span,...segment});}};
                    if(line.syllables.length)append(original,line.syllables);else original.textContent=line.text;
                    for(const voice of line.background){const bg=document.createElement('span');bg.className='cbp-backing';append(bg,voice);original.append(bg);}
                    if(line.start!==null)el.onclick=()=>{this.panelClock=null;Spicetify.Player.seek(line.start);};
                    fragment.append(el);this.panelSyllableNodes.push(nodes);
                    const firstLetter=line.text.match(/\p{L}/u)?.[0]||'';
                    el.style.setProperty('--cbp-syllable-direction',/[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]/.test(firstLetter)?'270deg':'90deg');
                }
                list.append(fragment);
                this.syncPanelLyrics();this.updateLyricsClock();this.updatePanelTranslation();
            }catch(error){if(current())status.textContent='Текст недоступен. '+(error.message||'Попробуй другой трек.');}
            finally{this.releaseSpicyLoader(token);}
        },
        syncPanelLyrics(progress=playerValue('getProgress')) {
            if(this.settings?.lyricsSource==='off'||!this.panelLyricLines?.length)return;
            const index=this.syncPanelTimeline(progress);
            this.syncPanelSyllables(index,progress);
        },
        syncPanelSyllables(index,progress) {
            const source=this.panelSyllableNodes?.[index];if(!source?.length)return;
            const update=(word)=>{
                const fill=progress<word.start?0:word.end===word.start?1:clamp((progress-word.start)/(word.end-word.start),0,1),percent=Math.round(fill*1000)/10;
                if(word.fill!==percent){word.fill=percent;word.el.style.setProperty('--cbp-fill',percent+'%');}
                const active=progress>=word.start&&progress<word.end;
                if(word.active!==active){word.active=active;word.el.classList.toggle('cbp-syllable-active',active);}
            };
            let state=this.syllableCursor;
            if(!state||state.source!==source||progress<state.progress){
                const nodes=source.slice().sort((a,b)=>a.start-b.start);
                state=this.syllableCursor={source,nodes,next:0,active:new Set(),progress};
                for(const word of nodes){update(word);if(word.start<=progress){state.next++;if(word.end>progress)state.active.add(word);}}
            }else{
                const nodes=state.nodes;
                while(state.next<nodes.length&&nodes[state.next].start<=progress){const word=nodes[state.next++];update(word);if(word.end>progress)state.active.add(word);}
                for(const word of state.active){update(word);if(word.end<=progress)state.active.delete(word);}
                state.progress=progress;
            }
        }
    });

    const translationCacheKey='cbp_ru_translation_cache_v1';
    const translationTTL=30*24*60*60*1000;
    const translationPlain=value=>String(value).replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi,entity=>{
        const named={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};
        if(named[entity.toLowerCase()])return named[entity.toLowerCase()];
        const code=entity[2].toLowerCase()==='x'?parseInt(entity.slice(3,-1),16):Number(entity.slice(2,-1));
        return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):entity;
    });
    Object.assign(APP,{
        translationWithTone(source,translated) {
            // A phrasal verb, not a literal sexual verb. Do not rewrite unrelated profanity.
            const phrase=source.match(/\bfucking\s+(me|you|him|her|us|them)\s+up\b/i);
            if(!phrase)return translated;
            const pronouns={me:'меня',you:'тебя',him:'его',her:'её',us:'нас',them:'их'},pronoun=pronouns[phrase[1].toLowerCase()];
            const verb='разъёбывает';
            const wrong='(?:на[её]б[а-яё]*|траха[а-яё]*|[её]б[её]т|расстраива[а-яё]*|доста[а-яё]*)';
            return translated.replace(new RegExp(pronoun+'\\s+'+wrong,'gi'),pronoun+' '+verb).replace(new RegExp(wrong+'\\s+'+pronoun,'gi'),verb+' '+pronoun);
        },
        translationChunks(text) {
            const chunks=[];let chunk='',bytes=0;
            const length=text=>{let n=0;for(const c of text){const p=c.codePointAt(0);n+=p<=127?1:p<=2047?2:p<=65535?3:4;}return n;};
            for(const char of text){
                const p=char.codePointAt(0),size=p<=127?1:p<=2047?2:p<=65535?3:4;
                while(bytes+size>480){const space=chunk.lastIndexOf(' ');if(space>0){chunks.push(chunk.slice(0,space));chunk=chunk.slice(space+1);bytes=length(chunk);}else{chunks.push(chunk);chunk='';bytes=0;}}
                chunk+=char;bytes+=size;
            }
            if(chunk.trim())chunks.push(chunk.trim());return chunks;
        },
        cancelPanelTranslation() {
            this.panelTranslationAbort?.abort();this.panelTranslationAbort=null;this.panelTranslationKey=null;
            if(!this.settings?.lyricsTranslation||this.settings.lyricsSource==='off'||this.settings.lyricsTranslationEngine!=='local'||document.hidden)this.scheduleLocalUnload?.();
            const status=this.lyricsPanel?.querySelector('.cbp-translation-status');if(status){status.textContent='';status.hidden=true;}
        },
        async getTranslationCache() {
            if(this.translationCache)return this.translationCache;
            if(!this.translationCachePromise)this.translationCachePromise=(async()=>{
                let saved;try{saved=await images.run('readonly',undefined,translationCacheKey);}catch{}
                const cache=new Map(),now=Date.now();
                if(Array.isArray(saved))for(const entry of saved.slice(-500)){
                    if(!Array.isArray(entry)||typeof entry[0]!=='string'||entry[0].length>11000)continue;
                    const value=entry[1];if(value&&typeof value.text==='string'&&value.text.length<=15000&&Number.isFinite(value.at)&&now-value.at<translationTTL)cache.set(entry[0],value);
                }
                this.translationCache=cache;return cache;
            })();
            return this.translationCachePromise;
        },
        rememberTranslation(key,text) {
            const cache=this.translationCache;if(!cache)return;
            cache.delete(key);cache.set(key,{text,at:Date.now()});
            while(cache.size>500)cache.delete(cache.keys().next().value);
            clearTimeout(this.translationSaveTimer);
            this.translationSaveTimer=setTimeout(()=>{this.translationSaveTimer=null;images.run('readwrite',[...cache],translationCacheKey).catch(()=>{});},500);
        },
        async requestRussianTranslation(text,language,signal) {
            const parts=[];
            for(const chunk of this.translationChunks(text)){
                const query=new URLSearchParams({q:chunk,langpair:language+'|ru',mt:'1'});
                const response=await fetch('https://api.mymemory.translated.net/get?'+query,{signal:AbortSignal.any([signal,AbortSignal.timeout(10000)]),credentials:'omit',referrerPolicy:'no-referrer'});
                if(response.status===429){const error=Error('Дневной лимит переводчика исчерпан');error.quota=true;throw error;}
                if(!response.ok)throw Error('Сервис перевода недоступен');
                const data=await response.json();
                if(data.quotaFinished||Number(data.responseStatus)===429){const error=Error('Дневной лимит переводчика исчерпан');error.quota=true;throw error;}
                if(Number(data.responseStatus)!==200||typeof data.responseData?.translatedText!=='string'||!data.responseData.translatedText.trim()||data.responseData.translatedText.length>15000)throw Error('Сервис не вернул перевод');
                parts.push(translationPlain(data.responseData.translatedText));
            }
            return parts.join(' ');
        },
        async updatePanelTranslation() {
            const enabled=this.settings?.lyricsTranslation===true&&this.settings.lyricsSource!=='off';
            const button=this.translationButton||=this.lyricsPanel?.querySelector('[data-translation]');
            const pressed=String(this.settings?.lyricsTranslation===true);if(button&&button.getAttribute('aria-pressed')!==pressed)button.setAttribute('aria-pressed',pressed);
            const lines=this.panelLyricLines,hidden=document.hidden;
            if(!enabled||hidden){
                const state=enabled+':'+hidden;
                if(this.translationIdleLines===lines&&this.translationIdleState===state)return;
                this.translationIdleLines=lines;this.translationIdleState=state;this.cancelPanelTranslation();
                if(!enabled)this.lyricsPanel?.querySelectorAll('.cbp-translation').forEach(el=>{if(!el.hidden)el.hidden=true;});
                return;
            }
            this.translationIdleLines=null;this.translationIdleState=null;
            if(!lines?.length)return;
            const language=this.panelLyricLanguage||'autodetect',engine=this.settings.lyricsTranslationEngine||'local',key=this.lyricRequest+':'+language+':'+engine;
            if(this.panelTranslationKey===key)return;
            const nodes=this.lyricsPanel.querySelectorAll('.cbp-translation');
            this.cancelPanelTranslation();this.panelTranslationKey=key;
            const controller=new AbortController();this.panelTranslationAbort=controller;const signal=controller.signal;
            const current=()=>!signal.aborted&&this.panelLyricLines===lines&&this.settings.lyricsTranslation===true&&this.settings.lyricsSource!=='off';
            const status=this.lyricsPanel.querySelector('.cbp-translation-status');status.hidden=false;
            if(/^ru(?:-|$)/.test(language)){status.textContent='Песня уже на русском';return;}
            if(engine==='local'&&!/^en(?:-|$)|^eng$/.test(language)){
                status.textContent='Локальная модель: только английский → русский. Для другого языка выбери MyMemory в настройках.';return;
            }
            status.textContent=engine==='local'?'Готовлю локальный перевод…':'Перевожу на русский · MyMemory…';
            const cacheKey=text=>(engine==='local'?'local-enru-v2:':'')+language+'\n'+text;
            let completed=0,failed=0,quota=false,firstError='';
            const groups=new Map(),order=new Map(),at=Math.max(0,this.panelLyricIndex);
            for(let i=0;i<lines.length;i++){
                const text=lines[i].text;if(!/\p{L}/u.test(text))continue;
                let group=groups.get(text);if(!group){group=[];groups.set(text,group);}if(nodes[i])group.push(nodes[i]);
                order.set(text,Math.min(order.get(text)??Infinity,Math.abs(i-at)));
            }
            const apply=(text,translation)=>{if(!current())return;const result=this.translationWithTone(text,translation);for(const el of groups.get(text)||[]){if(el.textContent!==result)el.textContent=result;const hide=!result||result===text;if(el.hidden!==hide)el.hidden=hide;}};
            try{
                const cache=await this.getTranslationCache();if(!current())return;
                const unique=[...groups.keys()];
                const pending=[];
                for(const text of unique){const cached=cache.get(cacheKey(text));if(cached&&Date.now()-cached.at<translationTTL){apply(text,cached.text);completed++;}else pending.push(text);}
                // Translate near the playing line first, while keeping every result attached
                // to its original row. Chorus repetitions share one request and cache entry.
                pending.sort((a,b)=>(order.get(a)||0)-(order.get(b)||0));
                let consumed=0;const queue=engine==='local'?pending:pending.filter(text=>{consumed+=text.length;return consumed<=16000;});
                failed+=pending.length-queue.length;
                let next=0,networkFailures=0;
                await Promise.all(Array.from({length:Math.min(engine==='local'?1:2,queue.length)},async()=>{
                    while(next<queue.length&&current()&&!quota){
                        const text=queue[next++];
                        try{
                            const translated=engine==='local'?await this.requestLocalRussianTranslation(text,signal):await this.requestRussianTranslation(text,language,signal);if(!current())return;
                            this.rememberTranslation(cacheKey(text),translated);apply(text,translated);completed++;
                        }catch(error){if(!current())return;failed++;networkFailures++;firstError||=error.message;if(error.quota||engine==='local'||networkFailures>=3){quota=!!error.quota;controller.abort();}}
                    }
                }));
                if(this.panelTranslationAbort!==controller||this.panelLyricLines!==lines||!this.settings.lyricsTranslation||this.settings.lyricsSource==='off')return;
                status.textContent=quota?'Лимит MyMemory исчерпан. Готовые переводы сохранены.':failed?(engine==='local'?firstError+' Нажми ↻ для повторной попытки.':'Часть строк не переведена. Нажми ↻ для повторной попытки.'):completed?(engine==='local'?'Локальный перевод · EN → RU · без дневной квоты':'Машинный перевод · MyMemory'):'Нет строк для перевода';
                // Translation changes row heights: re-center the active original/translation pair.
                this.panelLyricIndex=-1;this.syncPanelLyrics();
                if(engine==='local'){
                    if(this.localCacheFailed)status.textContent+=' · Кэш модели недоступен: при следующем запуске понадобится интернет.';
                    this.scheduleLocalUnload();
                }
            }catch{if(current())status.textContent='Перевод недоступен. Нажми ↻ для повторной попытки.';}
        }
    });

    // Runs in its own Web Worker: model inference never blocks Spotify's UI.
    function localTranslatorWorker() {
        const runtimeBase='https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/';
        const assets=[
            ['transformers.min.js','aa5002b70e789798da263f5f99c62bd3e8fcd0c119258a493c40c180648365fa'],
            ['ort-wasm-simd-threaded.jsep.mjs','08fb86ec433c78bfb032c5d84a68b8e8e5a8d81268fa39e24314179a5767a5b9'],
            ['ort-wasm-simd-threaded.jsep.wasm','c46655e8a94afc45338d4cb2b840475f88e5012d524509916e505079c00bfa39']
        ];
        const model='Xenova/opus-mt-en-ru',revision='e050376e960175e8ddc5cff85025dc8436cddd68';
        const modelBase=`https://huggingface.co/${model}/resolve/${revision}/`;
        const modelFiles=['tokenizer.json','tokenizer_config.json','config.json','generation_config.json','onnx/encoder_model_quantized.onnx','onnx/decoder_model_merged_quantized.onnx'];
        const nativeFetch=self.fetch.bind(self),blobs=[],pendingCache=new Set();
        let enginePromise,library,cache,lastProgress=0,cacheFailed=false,active=null,queue=[],working=false;
        const modelProgress=new Map();
        const notify=data=>self.postMessage(data);
        const progress=data=>{const now=Date.now();if(now-lastProgress>200||data.phase==='ready'){lastProgress=now;notify({type:'progress',...data});}};
        const cancelled=job=>job.cancelled;
        async function cachedFetch(url) {
            if(typeof url!=='string')url=url.url;
            if(blobs.includes(url))return nativeFetch(url);
            const trusted=assets.some(([name])=>url===runtimeBase+name)||modelFiles.some(name=>url===modelBase+name);
            if(!trusted)throw Error('Unexpected model resource');
            const saved=await cache.match(url);if(saved)return saved;
            progress({phase:'download',file:url.split('/').at(-1)});
            const response=await nativeFetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(180000)});
            if(!response.ok)throw Error('Model download failed: HTTP '+response.status);
            const writing=cache.put(url,response.clone()).catch(()=>{cacheFailed=true;}).finally(()=>pendingCache.delete(writing));
            pendingCache.add(writing);return response;
        }
        function blobURL(bytes,type) {const url=URL.createObjectURL(new Blob([bytes],{type}));blobs.push(url);return url;}
        async function runtimeAsset([name,expected]) {
            const url=runtimeBase+name,response=await cachedFetch(url),bytes=await response.arrayBuffer();
            const digest=await crypto.subtle.digest('SHA-256',bytes);
            const actual=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
            if(actual!==expected){await cache.delete(url);throw Error('Runtime integrity check failed');}
            return bytes;
        }
        async function engine() {
            if(!enginePromise)enginePromise=(async()=>{
                cache=await caches.open('cbp-local-en-ru-v1');
                const [runtime,module,wasm]=await Promise.all(assets.map(runtimeAsset));
                library=await import(blobURL(runtime,'text/javascript'));
                const env=library.env;env.allowLocalModels=false;env.useBrowserCache=false;
                env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
                env.backends.onnx.wasm.wasmPaths={mjs:blobURL(module,'text/javascript'),wasm:blobURL(wasm,'application/wasm')};
                // Only fixed model assets can leave this worker; lyric text is never sent.
                self.fetch=cachedFetch;
                const pipe=await library.pipeline('translation',model,{device:'wasm',dtype:'q8',revision,progress_callback:data=>{
                    if(data.status==='progress'&&data.file?.endsWith('.onnx')){
                        modelProgress.set(data.file,data.progress);
                        progress({phase:'model',progress:[...modelProgress.values()].reduce((sum,value)=>sum+value,0)/2});
                    }
                    else if(data.status==='initiate')progress({phase:'model'});
                }});
                await Promise.all([...pendingCache]);
                progress({phase:'ready',cacheFailed});return pipe;
            })();
            return enginePromise;
        }
        async function drain() {
            if(working)return;working=true;
            try{
                while(queue.length){
                    const job=queue.shift();if(cancelled(job))continue;active=job;
                    try{
                        const pipe=await engine();if(cancelled(job))continue;
                        const stop=new library.InterruptableStoppingCriteria();job.stop=stop;
                        const criteria=new library.StoppingCriteriaList();criteria.push(stop);
                        const result=await pipe(job.text,{max_new_tokens:128,stopping_criteria:criteria,num_beams:3});
                        if(!cancelled(job))notify({type:'result',id:job.id,text:result?.[0]?.translation_text});
                    }catch(error){if(!cancelled(job))notify({type:'error',id:job.id,message:String(error.message||error).slice(0,300)});}
                    finally{active=null;}
                }
            }finally{working=false;}
        }
        self.onmessage=({data})=>{
            if(data.type==='cancel'){
                const queued=queue.find(job=>job.id===data.id);if(queued)queued.cancelled=true;
                if(active?.id===data.id){active.cancelled=true;active.stop?.interrupt();}
            }else if(data.type==='translate'&&Number.isSafeInteger(data.id)&&typeof data.text==='string'&&data.text.length<=2000){
                queue.push({id:data.id,text:data.text,cancelled:false});drain();
            }
        };
    }

    Object.assign(APP,{
        closeLocalTranslator() {
            clearTimeout(this.localUnloadTimer);this.localUnloadTimer=null;
            this.localWorker?.terminate();this.localWorker=null;this.localWorkerReady=false;
            if(this.localWorkerURL)URL.revokeObjectURL(this.localWorkerURL);this.localWorkerURL=null;
            for(const entry of this.localPending?.values()||[])entry.reject(Error('Local translator closed'));
            this.localPending?.clear();
        },
        scheduleLocalUnload() {
            if(!this.localWorker)return;clearTimeout(this.localUnloadTimer);
            this.localUnloadTimer=setTimeout(()=>this.closeLocalTranslator(),60000);
        },
        getLocalTranslator() {
            clearTimeout(this.localUnloadTimer);this.localUnloadTimer=null;
            if(this.localWorker)return this.localWorker;
            this.localPending=new Map();
            this.localWorkerURL=URL.createObjectURL(new Blob(['('+localTranslatorWorker.toString()+')();'],{type:'text/javascript'}));
            const worker=new Worker(this.localWorkerURL,{type:'module',name:'cbp-local-translation'});this.localWorker=worker;
            worker.onmessage=({data})=>{
                if(this.localWorker!==worker)return;
                if(data.type==='progress'){
                    if(data.phase==='ready'){this.localWorkerReady=true;this.localCacheFailed=!!data.cacheFailed;}
                    const status=this.lyricsPanel?.querySelector('.cbp-translation-status');
                    if(status&&this.panelTranslationAbort&&!this.panelTranslationAbort.signal.aborted&&this.settings.lyricsTranslation&&this.settings.lyricsTranslationEngine==='local'){
                        status.textContent=data.phase==='ready'?'Перевожу на этом компьютере…':data.phase==='download'?'Скачиваю движок локального перевода…':Number.isFinite(data.progress)?`Подготовка языковой модели · ${Math.round(data.progress)}%`:'Подготовка языковой модели…';
                    }
                    return;
                }
                const entry=this.localPending.get(data.id);if(!entry)return;
                if(data.type==='result'&&typeof data.text==='string'&&data.text.trim()&&data.text.length<=15000)entry.resolve(data.text.trim());
                else if(data.type==='error'){
                    entry.reject(Error(this.localWorkerReady?'Локальный перевод не получился':'Не удалось подготовить локальную модель. Проверь интернет и нажми ↻.'));
                    if(!this.localWorkerReady)this.closeLocalTranslator();
                }else entry.reject(Error('Локальная модель не вернула перевод'));
            };
            worker.onerror=event=>{event.preventDefault();this.closeLocalTranslator();};return worker;
        },
        async localTranslationLine(text,signal) {
            if(signal.aborted)throw new DOMException('Cancelled','AbortError');
            const worker=this.getLocalTranslator(),id=this.localRequestId=(this.localRequestId||0)+1;
            return new Promise((resolve,reject)=>{
                let timer;
                const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);this.localPending.delete(id);};
                const abort=()=>{worker.postMessage({type:'cancel',id});cleanup();reject(new DOMException('Cancelled','AbortError'));};
                this.localPending.set(id,{resolve:value=>{cleanup();resolve(value);},reject:error=>{cleanup();reject(error);}});
                signal.addEventListener('abort',abort,{once:true});
                timer=setTimeout(()=>{abort();this.closeLocalTranslator();},this.localWorkerReady?60000:240000);
                worker.postMessage({type:'translate',id,text});
            });
        },
        async requestLocalRussianTranslation(text,signal) {
            const result=[];
            for(const chunk of this.translationChunks(text))result.push(await this.localTranslationLine(chunk,signal));
            return result.join(' ');
        }
    });

    // This background belongs only to the lyric sidebar. The user's main wallpaper is untouched.
    const panelMediaURL=value=>{
        if(typeof value!=='string')return '';
        if(/^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,/i.test(value))return value;
        if(value.startsWith('spotify:image:'))return 'https://i.scdn.co/image/'+value.slice(14);
        try{const url=new URL(value);return ['https:','blob:'].includes(url.protocol)?url.href:'';}catch{return '';}
    };
    function panelMediaEvent(target,event,signal) {
        return new Promise((resolve,reject)=>{
            const cleanup=()=>{clearTimeout(timer);target.removeEventListener(event,done);target.removeEventListener('error',fail);signal.removeEventListener('abort',fail);};
            const done=()=>{cleanup();resolve();},fail=()=>{cleanup();reject(Error('Media unavailable'));};
            const timer=setTimeout(fail,12000);
            if(signal.aborted){fail();return;}
            target.addEventListener(event,done,{once:true});target.addEventListener('error',fail,{once:true});signal.addEventListener('abort',fail,{once:true});
        });
    }
    Object.assign(APP,{
        initPanelBackdrop() {
            this.panelBackdrop=document.createElement('div');this.panelBackdrop.className='cbp-panel-backdrop';this.panelBackdrop.setAttribute('aria-hidden','true');
            this.lyricsPanel.prepend(this.panelBackdrop);
            Spicetify.Player.addEventListener('songchange',()=>this.refreshPanelBackdrop(true));
            const root=document.getElementById('main');
            this.panelVideoObserver=new MutationObserver(records=>{
                if(this.settings.lyricsSource==='off'||document.hidden||this.panelBackdrop.dataset.source==='canvas')return;
                const changed=records.some(record=>record.type==='attributes'?record.target.tagName==='VIDEO':
                    [...record.addedNodes].some(node=>node.nodeType===1&&(node.tagName==='VIDEO'||node.querySelector('video'))));
                if(changed&&!this.panelVideoCheck)this.panelVideoCheck=setTimeout(()=>{this.panelVideoCheck=null;this.findPanelClip();},250);
            });
            this.panelObserverRoot=root;this.refreshPanelBackdrop();
        },
        clearPanelVideo() {
            clearTimeout(this.panelContrastTimer);this.panelContrastTimer=null;this.panelClipReadyAbort?.abort();this.panelClipReadyAbort=null;
            if(this.panelContrastSample?.media===this.panelVideo)this.panelContrastSample=null;
            if(this.panelVideo){this.panelVideo.pause();this.panelVideo.srcObject=null;this.panelVideo.removeAttribute('src');this.panelVideo.load();this.panelVideo.remove();this.panelVideo=null;}
            this.panelVideoStream?.getTracks().forEach(t=>t.stop());this.panelVideoStream=null;
            if(this.panelVideoObjectURL)URL.revokeObjectURL(this.panelVideoObjectURL);this.panelVideoObjectURL=null;this.panelClipSource=null;this.panelPlaybackVideo=null;this.panelWaitingSource=null;
        },
        syncPanelBackdropPlayback() {
            const video=this.panelVideo;if(!video)return;
            const playing=!document.hidden&&this.settings.lyricsSource!=='off'&&playerValue('isPlaying',false);
            if(!playing){if(!video.paused)video.pause();}
            else if(video.paused&&this.panelPlaybackVideo!==video){this.panelPlaybackVideo=video;video.play().catch(()=>{}).finally(()=>{if(this.panelPlaybackVideo===video)this.panelPlaybackVideo=null;});}
            this.updatePanelContrast();
            if(playing&&this.settings.colorMode!=='custom'){
                if(!this.panelContrastTimer)this.panelContrastTimer=setTimeout(()=>{this.panelContrastTimer=null;this.syncPanelBackdropPlayback();},1800);
            }else{clearTimeout(this.panelContrastTimer);this.panelContrastTimer=null;}
        },
        async refreshPanelBackdrop(force=false) {
            if(!this.panelBackdrop)return;
            const item=Spicetify.Player.data?.item,uri=item?.uri||'',enabled=this.settings.lyricsSource!=='off',key=enabled+':'+uri;
            if(!force&&key===this.panelBackdropKey){this.syncPanelBackdropPlayback();return;}
            this.panelBackdropKey=key;this.panelMediaAbort?.abort();this.panelMediaAbort=new AbortController();
            const signal=this.panelMediaAbort.signal;this.panelCanvasPending=true;this.panelClipURL='';this.clearPanelVideo();clearTimeout(this.panelVideoCheck);this.panelVideoCheck=null;this.panelVideoObserver.disconnect();
            this.panelContrastSample=null;this.panelBackdrop.replaceChildren();this.panelBackdrop.dataset.source='cover';
            if(!enabled){this.panelCanvasPending=false;return;}
            const meta=item?.metadata||{},cover=panelMediaURL(meta.image_xlarge_url||meta.image_large_url||meta.image_url||item?.album?.images?.[0]?.url);
            if(cover){const img=document.createElement('img');img.alt='';img.crossOrigin='anonymous';img.onload=()=>{if(this.panelBackdrop.contains(img))this.updatePanelContrast();};img.src=cover;this.panelBackdrop.append(img);}
            this.updatePanelContrast();
            if(this.panelObserverRoot)this.panelVideoObserver.observe(this.panelObserverRoot,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
            const current=()=>!signal.aborted&&Spicetify.Player.data?.item?.uri===uri&&this.settings.lyricsSource!=='off';
            if(!/^spotify:track:[a-zA-Z0-9]+$/.test(uri)){this.panelCanvasPending=false;return;}
            try{
                let canvas=meta['canvas.fileId']||meta['canvas.url']?{fileId:meta['canvas.fileId'],url:meta['canvas.url'],type:meta['canvas.type']}:null;
                if(!canvas&&Spicetify.GraphQL?.Definitions?.canvas&&Spicetify.GraphQL?.Request){
                    let timeout;try{const result=await Promise.race([Spicetify.GraphQL.Request(Spicetify.GraphQL.Definitions.canvas,{trackUri:uri}),new Promise((_,reject)=>timeout=setTimeout(()=>reject(Error('Canvas timeout')),6000))]);canvas=result?.data?.trackUnion?.canvas;}finally{clearTimeout(timeout);}
                }
                if(!current())return;
                if(canvas&&(!canvas.type||/^VIDEO/.test(canvas.type))){
                    if(/^[a-zA-Z0-9_-]{8,160}$/.test(canvas.fileId||'')){
                        try{await this.playPanelCanvas(canvas.fileId,signal);if(current())return;}catch{if(!current())return;this.clearPanelVideo();}
                    }
                    const url=panelMediaURL(canvas.url);
                    if(url){try{await this.playPanelURL(url,'canvas',signal);if(current())return;}catch{if(!current())return;this.clearPanelVideo();}}
                }
            }catch{if(!current())return;}finally{if(current())this.panelCanvasPending=false;}
            if(current())this.findPanelClip();
        },
        newPanelVideo() {
            const video=document.createElement('video');video.muted=true;video.playsInline=true;video.loop=true;video.preload='auto';video.disablePictureInPicture=true;
            this.panelBackdrop.append(video);this.panelVideo=video;return video;
        },
        updatePanelContrast() {
            if(!this.panelBackdrop||this.settings.lyricsSource==='off')return;
            const s=this.settings;let mean=null;
            if(s.colorMode!=='custom'){
                const media=this.panelVideo?.readyState>=2?this.panelVideo:this.panelBackdrop.querySelector('img');
                if(media){
                    const iw=media.videoWidth||media.naturalWidth,ih=media.videoHeight||media.naturalHeight;
                    const width=this.lyricsPanel.clientWidth||360,height=this.lyricsPanel.clientHeight||900,now=performance.now();
                    let sample=this.panelContrastSample;
                    const changed=!sample||sample.media!==media||sample.iw!==iw||sample.ih!==ih||sample.width!==width||sample.height!==height;
                    const moving=media===this.panelVideo&&!media.paused&&!document.hidden&&sample&&!sample.failed&&now-sample.at>=1800;
                    if(iw&&ih&&(changed||moving)){
                        sample=this.panelContrastSample={media,iw,ih,width,height,at:now,mean:null,failed:false};
                        try{
                            if(!this.panelContrastCanvas){const canvas=this.panelContrastCanvas=document.createElement('canvas');canvas.width=24;canvas.height=48;this.panelContrastContext=canvas.getContext('2d',{willReadFrequently:true});}
                            const ctx=this.panelContrastContext,ratio=width/height,cropW=Math.min(iw,ih*ratio),cropH=Math.min(ih,iw/ratio);
                            ctx.drawImage(media,(iw-cropW)/2,(ih-cropH)/2,cropW,cropH,0,0,24,48);
                            const pixels=ctx.getImageData(0,0,24,48).data;let sum=0;
                            for(let i=0;i<pixels.length;i+=4)sum+=.2126*linearRGB[pixels[i]]+.7152*linearRGB[pixels[i+1]]+.0722*linearRGB[pixels[i+2]];
                            sample.mean=sum/(pixels.length/4);
                        }catch{sample.failed=true;}
                    }
                    if(sample?.media===media)mean=sample.mean;
                }
            }
            const ink=s.colorMode==='custom'?s.color:mean!==null&&mean>.45?'#10151d':'#f8faff',key=ink+':'+s.lyricsDim;
            if(this.panelContrastKey===key)return;this.panelContrastKey=key;
            const rgb=ink.match(/[0-9a-f]{2}/gi).map(x=>parseInt(x,16)),light=luminance(rgb)>.179,scrim=light?0:255;
            let muted=rgb;
            for(let weight=.82;weight<=1.001;weight+=.02){muted=rgb.map(c=>Math.round(c*weight+scrim*(1-weight)));const m=luminance(muted);if((Math.max(m,scrim?1:0)+.05)/(Math.min(m,scrim?1:0)+.05)>=4.5)break;}
            this.lyricsPanel.style.setProperty('--cbp-panel-ink',ink);
            this.lyricsPanel.style.setProperty('--cbp-panel-muted-ink','#'+muted.map(c=>c.toString(16).padStart(2,'0')).join(''));
            this.lyricsPanel.style.setProperty('--cbp-panel-scrim',`rgba(0,0,0,${s.lyricsDim})`);
            this.lyricsPanel.style.setProperty('--cbp-panel-outline',light?'#000c':'#ffffffd9');
            this.lyricsPanel.style.textShadow=light?'0 1px 2px #000e,0 0 5px #000b':'0 1px 2px #fffffff0,0 0 4px #ffffffc0';
        },
        async playPanelURL(url,kind,signal) {
            this.clearPanelVideo();const video=this.newPanelVideo();video.style.opacity='0';
            const ready=panelMediaEvent(video,'loadeddata',signal);video.src=url;await ready;
            if(signal.aborted)throw Error('Cancelled');video.style.opacity='1';this.panelBackdrop.dataset.source=kind;
            video.onerror=()=>{if(this.panelVideo===video){this.clearPanelVideo();this.panelBackdrop.dataset.source='cover';this.findPanelClip();}};
            this.syncPanelBackdropPlayback();
        },
        followPanelVideo(source,kind,signal) {
            if(source.readyState<2||signal.aborted)return false;
            try{
                const capture=source.captureStream||source.mozCaptureStream;if(!capture)return false;
                const original=capture.call(source),tracks=original.getVideoTracks();
                if(!tracks.length){original.getTracks().forEach(t=>t.stop());return false;}
                const stream=new MediaStream(tracks.map(t=>t.clone()));original.getTracks().forEach(t=>t.stop());
                this.clearPanelVideo();this.panelVideoStream=stream;const video=this.newPanelVideo();video.srcObject=stream;this.panelClipSource=source;
                this.panelBackdrop.dataset.source=kind;this.syncPanelBackdropPlayback();
                stream.getVideoTracks().forEach(t=>t.addEventListener('ended',()=>{if(this.panelVideoStream===stream){this.clearPanelVideo();this.panelBackdrop.dataset.source='cover';}},{once:true}));return true;
            }catch{return false;}
        },
        findPanelClip() {
            if(!this.panelBackdrop||this.settings.lyricsSource==='off'||document.hidden||this.panelMediaAbort.signal.aborted||(this.panelBackdrop.dataset.source==='canvas'||this.panelCanvasPending))return;
            const signal=this.panelMediaAbort.signal;
            const source=document.querySelector('[data-testid="video-player-npv"] video,[data-testid="video-player"] video');
            if(source&&source!==this.panelClipSource){
                if(this.followPanelVideo(source,'clip',signal))return;
                if(source.readyState<2&&this.panelWaitingSource!==source){
                    this.panelClipReadyAbort?.abort();this.panelWaitingSource=source;
                    const ready=this.panelClipReadyAbort=new AbortController();
                    source.addEventListener('loadeddata',()=>{this.panelWaitingSource=null;this.findPanelClip();},{once:true,signal:AbortSignal.any([signal,ready.signal])});
                }
            }
            if(this.panelBackdrop.dataset.source==='clip')return;
            const meta=Spicetify.Player.data?.item?.metadata||{},url=panelMediaURL(meta.video_url||meta['video.url']||meta.music_video_url);
            if(url&&url!==this.panelClipURL){this.panelClipURL=url;this.playPanelURL(url,'clip',signal).catch(()=>{if(!signal.aborted){this.clearPanelVideo();this.panelBackdrop.dataset.source='cover';}});}
        },
        async playPanelCanvas(fileId,signal) {
            const endpoint=`https://spclient.wg.spotify.com/manifests/v9/json/sources/${fileId}/options/supports_drm`;
            let token;try{token=Spicetify.Platform?.AuthorizationAPI?.getState?.()?.token?.accessToken;}catch{}
            if(!token){
                let provider,timer;try{provider=Spicetify.Platform?.Registry?.resolve?.(Symbol.for('TokenProvider'));}catch{}
                provider??=Spicetify.Platform?.AuthorizationAPI?._tokenProvider;
                try{token=(await Promise.race([provider?.getToken?.(),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Token timeout')),3000))]))?.accessToken;}finally{clearTimeout(timer);}
            }
            if(!token||signal.aborted)throw Error('Canvas unavailable');
            const requestSignal=AbortSignal.any([signal,AbortSignal.timeout(15000)]);
            const response=await fetch(endpoint,{headers:{Authorization:'Bearer '+token},signal:requestSignal});if(!response.ok)throw Error('Canvas manifest unavailable');
            const manifest=await response.json(),part=manifest.contents?.[0],base=manifest.base_urls?.[0];
            if(!part||!base||!manifest.initialization_template||!manifest.segment_template)throw Error('Invalid canvas manifest');
            const profiles=(part.profiles||[]).filter(p=>p.file_type==='webm'&&MediaSource.isTypeSupported(`video/webm; codecs="${p.video_codec}"`));
            profiles.sort((a,b)=>a.video_height-b.video_height);const profile=profiles.find(p=>p.video_height>=480)||profiles.at(-1);if(!profile)throw Error('No playable Canvas');
            const build=(template,time=0)=>new URL(template.replaceAll('{{profile_id}}',String(profile.id)).replaceAll('{{file_type}}','webm').replaceAll('{{segment_timestamp}}',String(time)),base).href;
            const step=Number(part.segment_length)*1000,start=Number(part.start_time_millis),end=Number(part.end_time_millis);
            if(!(step>0&&end>start&&end-start<=60000))throw Error('Canvas bounds invalid');
            const urls=[build(manifest.initialization_template)];for(let t=start;t<end;t+=step){if(urls.length>60)throw Error('Canvas too large');urls.push(build(manifest.segment_template,Math.round(t/1000)));}
            if(signal.aborted)throw Error('Cancelled');this.clearPanelVideo();const video=this.newPanelVideo();video.style.opacity='0';
            const media=new MediaSource(),objectURL=URL.createObjectURL(media);this.panelVideoObjectURL=objectURL;
            const opened=panelMediaEvent(media,'sourceopen',requestSignal);video.src=objectURL;await opened;
            const buffer=media.addSourceBuffer(`video/webm; codecs="${profile.video_codec}"`);let bytes=0;
            // Append one fetched segment at a time instead of retaining the entire video twice.
            for(const url of urls){
                if(new URL(url).protocol!=='https:')throw Error('Invalid media URL');
                const res=await fetch(url,{signal:requestSignal});if(!res.ok)throw Error('Canvas segment unavailable');
                const data=await res.arrayBuffer();bytes+=data.byteLength;if(bytes>20*1024*1024)throw Error('Canvas too large');
                const updated=panelMediaEvent(buffer,'updateend',requestSignal);buffer.appendBuffer(data);await updated;
            }
            if(media.readyState==='open')media.endOfStream();if(signal.aborted)throw Error('Cancelled');
            video.style.opacity='1';this.panelBackdrop.dataset.source='canvas';this.syncPanelBackdropPlayback();
            video.onerror=()=>{if(this.panelVideo===video){this.clearPanelVideo();this.panelBackdrop.dataset.source='cover';this.findPanelClip();}};
        }
    });

    Object.assign(APP,{
        validateBundle(bundle) {
            if(!bundle||bundle.format!=='custom-background-preset'||bundle.version!==1||typeof bundle.name!=='string'||!bundle.name.trim()||!bundle.settings||typeof bundle.settings!=='object'||Array.isArray(bundle.settings))throw Error('Это не файл оформления Custom Background');
            const image=bundle.image??'';
            if(typeof image!=='string'||image.length>43*1024*1024||(image&&!/^data:(?:video\/(?:mp4|webm)|image\/(?:png|jpeg|jpg|webp|gif|avif|bmp|x-icon|svg\+xml));base64,[a-z0-9+/=\s]+$/i.test(image)))throw Error('В оформлении должен быть встроенный фон, а не ссылка');
            return {...bundle,name:bundle.name.trim().slice(0,40),settings:normalize(bundle.settings),image};
        },
        async previewImport(raw) {
            const bundle=this.validateBundle(raw);if(bundle.image)await validateMedia(bundle.image);
            this.importPreview?.remove();
            const modal=document.createElement('section');modal.id='cbp-import-preview';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Предпросмотр оформления');
            modal.innerHTML='<article><h2></h2><div class="cbp-preview-media"></div><p></p><label><input type="radio" name="cbp-import-mode" value="all" checked> Всё оформление</label><label><input type="radio" name="cbp-import-mode" value="colors"> Только фон и цвета — сохранить мои панели и размеры</label><button data-confirm>Импортировать и применить</button><button data-cancel>Отмена</button><p role="status"></p></article>';
            modal.querySelector('h2').textContent=bundle.name;
            if(bundle.image){const el=document.createElement(bundle.image.startsWith('data:video/')?'video':'img');el.className='cbp-import-art';el.src=bundle.image;el.alt='Предпросмотр фона';if(el.tagName==='VIDEO'){el.muted=true;el.controls=true;el.preload='metadata';}modal.querySelector('.cbp-preview-media').append(el);}
            const s=bundle.settings;modal.querySelector('article>p').textContent=`Текст ${s.color} · затемнение ${Math.round(s.dim*100)}% · масштаб ${s.zoom}%`;
            const beforeFocus=document.activeElement;
            const close=()=>{modal.querySelector('video')?.pause();modal.remove();document.removeEventListener('keydown',key,true);this.importPreview=null;beforeFocus?.focus();};
            const key=e=>{if(e.key==='Escape'){e.stopImmediatePropagation();e.preventDefault();close();}if(e.key==='Tab'){const nodes=[...modal.querySelectorAll('button:not(:disabled),input,video[controls]')];const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};document.addEventListener('keydown',key,true);
            modal.querySelector('[data-cancel]').onclick=close;
            modal.querySelector('[data-confirm]').onclick=async()=>{
                const button=modal.querySelector('[data-confirm]');button.disabled=true;
                try{
                    const mode=modal.querySelector('input:checked').value;
                    const settings=mode==='colors'?{...this.settings,...Object.fromEntries(['blur','dim','zoom','x','y','readable','accent','custom','colorMode','color','trackColor','buttonColor'].map(k=>[k,s[k]]))}:s;
                    await this.importAppearance({...bundle,settings});close();
                }catch(error){modal.querySelector('[role="status"]').textContent=error.message;button.disabled=false;}
            };
            document.body.append(modal);this.importPreview=modal;modal.querySelector('input').focus();return modal;
        }
    });


    const UI_CSS = `
        #cbp-transfer[hidden]{display:none!important}#cbp-transfer{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;background:#0008;font:14px system-ui;color:#f5f7ff;-webkit-app-region:no-drag}
        #cbp-transfer article{width:min(440px,90vw);padding:24px;border:1px solid #ffffff30;border-radius:18px;background:#14171ff5;box-shadow:0 20px 80px #0009}#cbp-transfer header{display:flex;align-items:center;justify-content:space-between;gap:16px}#cbp-transfer h2{font-size:22px;margin:0}#cbp-transfer p{line-height:1.6;color:#c5cee0}#cbp-transfer button{padding:10px 14px;border:1px solid #ffffff38;border-radius:9px;background:#ffffff15;color:#fff;font:inherit;cursor:pointer;margin:6px 6px 0 0}#cbp-transfer button:focus-visible{outline:2px solid #bad0ff;outline-offset:3px}

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
        .cbp-row{display:flex;align-items:center;gap:8px;}
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
    window.CBP = { version: "4.6.0", app: APP, normalize, cropRect, analyzePixels, luminance };
    boot();
})();
