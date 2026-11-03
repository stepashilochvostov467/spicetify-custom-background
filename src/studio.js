    const STUDIO_DEFAULTS = {
        hidePodcasts:false, hideRecommendations:false, hideSidebar:false, hideStore:false,
        coverRadius:8, coverScale:100, rowHeight:56, fontSize:14, font:'default',
        trackColor:'#b2c9ff', buttonColor:'#b2c9ff', playerCover:56, progressHeight:4,
        lyricsSource:'off', lyricsWidth:360, lyricsFont:24
    };
    Object.assign(DEFAULT_EXTRA, STUDIO_DEFAULTS);
    Object.assign(LIMITS,{coverRadius:[0,40],coverScale:[70,130],rowHeight:[40,88],fontSize:[12,20],playerCover:[40,88],progressHeight:[2,10],lyricsWidth:[260,560],lyricsFont:[16,40]});
    const originalBuildUI=APP.buildUI, originalRender=APP.render, originalInit=APP.init;
    Object.assign(APP, {
        scanHomeShelves() {
            if(!this.settings)return;
            if(!this.settings.hidePodcasts&&!this.settings.hideRecommendations){for(const el of document.querySelectorAll('[data-cbp-hide-section]'))el.removeAttribute('data-cbp-hide-section');return;}
            for(const el of document.querySelectorAll('[data-testid="home-page"] :is(section,.Shelf)')) {
                if(el.querySelector('section,.Shelf'))continue;
                const title=el.querySelector('h2,h3')?.textContent||'';
                const podcast=!!el.querySelector('a[href^="/show/"],a[href^="/episode/"]');
                const recommended=/рекоменд|специально для тебя|тебе может понравиться|сделано для тебя|recommended|made for you|suggested for you|you might like/i.test(title);
                el.toggleAttribute('data-cbp-hide-section',(this.settings.hidePodcasts&&podcast)||(this.settings.hideRecommendations&&recommended));
            }
        },
        scheduleHomeScan() {
            if(!this.settings?.hidePodcasts&&!this.settings?.hideRecommendations)return;
            clearTimeout(this.homeScanTimer);this.homeScanTimer=setTimeout(()=>this.scanHomeShelves(),120);
        },
        buildUI() {
            originalBuildUI.call(this);
            const section=document.createElement('div');section.id='cbp-studio';
            section.innerHTML=`<details open><summary>Конструктор интерфейса</summary>
                ${this.toggle('hidePodcasts','Скрыть подкасты на главной')}${this.toggle('hideRecommendations','Скрыть рекомендации на главной')}
                ${this.toggle('hideSidebar','Скрыть правую панель')}${this.toggle('hideStore','Скрыть магазин и Premium')}
                <button data-studio="reset-interface">Вернуть стандартный интерфейс</button></details>
                <details><summary>Элементы и плеер</summary>
                ${this.slider('Скругление обложек','coverRadius',0,40,1,'px')}${this.slider('Размер обложек карточек','coverScale',70,130,1,'%')}
                ${this.slider('Высота строк треков','rowHeight',40,88,1,'px')}${this.slider('Размер текста','fontSize',12,20,1,'px')}
                <label class="cbp-row">Шрифт<select data-setting="font"><option value="default">Spotify</option><option value="system">Системный</option></select></label>
                <label class="cbp-row">Текущий трек<input type="color" data-setting="trackColor"></label><label class="cbp-row">Кнопки плеера<input type="color" data-setting="buttonColor"></label>
                <details><summary>Дополнительно</summary>${this.slider('Обложка в плеере','playerCover',40,88,1,'px')}${this.slider('Толщина прогресса','progressHeight',2,10,1,'px')}</details></details>
                <details open><summary>Оформление плейлиста</summary><p id="cbp-route-status" class="cbp-hint"></p>
                <button data-studio="assign">Назначить выбранный пресет этому плейлисту</button><button data-studio="unassign">Убрать привязку</button>
                <p class="cbp-hint">Открой плейлист и выбери сохранённое оформление сверху. При уходе с плейлиста вернётся обычное оформление.</p></details>
                <details><summary>Текст песни в правой панели</summary>
                <label class="cbp-row">Источник<select data-setting="lyricsSource"><option value="off">Выключен</option><option value="spicy">Spicy Lyrics · автоматически</option><option value="spotify">Spotify</option></select></label>
                ${this.slider('Ширина панели','lyricsWidth',260,560,1,'px')}${this.slider('Размер букв','lyricsFont',16,40,1,'px')}
                <p class="cbp-hint">Spicy Lyrics загружается автоматически. Плавная подсветка слогов использует тайминги песни; нажатие на строку перематывает. Цвет — из твоего оформления.</p></details>`;
            this.menu.querySelector('footer').before(section);
            const edit=document.createElement('button');edit.dataset.studio='edit-background';edit.textContent='Настроить фон на экране';this.menu.querySelector('.cbp-upload').before(edit);
            this.menu.addEventListener('click',e=>{const action=e.target.closest('[data-studio]')?.dataset.studio;
                if(action==='edit-background')this.openBackgroundEditor();
                if(e.target.closest('[data-action="delete"]'))setTimeout(()=>{for(const [path,id] of Object.entries(this.sceneMap))if(!this.presets().some(p=>p.id===id))delete this.sceneMap[path];storage.put('cbp_scene_map',JSON.stringify(this.sceneMap));this.lastSceneKey=null;this.applyRouteScene().catch(e=>this.report(e));},0);
                if(action==='assign')this.assignScene();if(action==='unassign')this.assignScene(true);
                if(action==='reset-interface'){for(const k of Object.keys(STUDIO_DEFAULTS).filter(k=>!k.startsWith('lyrics')))this.settings[k]=STUDIO_DEFAULTS[k];this.save();this.syncUI();this.render();}
            });
            this.syncUI();
        },
        async init() {
            this.sceneMap=storage.json('cbp_scene_map',{});if(!this.sceneMap||typeof this.sceneMap!=='object'||Array.isArray(this.sceneMap))this.sceneMap={};
            this.studioStyle=document.createElement('style');document.head.append(this.studioStyle);
            this.lyricsPanel=document.createElement('aside');this.lyricsPanel.id='cbp-lyrics';this.lyricsPanel.hidden=true;
            this.lyricsPanel.innerHTML='<header><strong>Текст песни</strong><button data-retry aria-label="Обновить текст">↻</button><button data-close aria-label="Закрыть текст песни">✕</button></header><p role="status"></p><div class="cbp-lines" tabindex="0" aria-label="Строки песни"></div>';
            this.lyricsPanel.querySelector('[data-retry]').onclick=()=>this.loadPanelLyrics(true);
            this.lyricsPanel.querySelector('[data-close]').onclick=()=>{this.settings.lyricsSource='off';this.save();this.syncUI();this.render();};document.body.append(this.lyricsPanel);
            await originalInit.call(this);
            this.initPanelBackdrop();
            const route=()=>this.applyRouteScene().catch(e=>this.report(e));
            const history=Spicetify.Platform?.History;
            if(typeof history?.listen==='function')this.unlistenRoute=history.listen(route);
            else this.routeTimer=setInterval(()=>{if(!document.hidden&&this.routePath()!==this.lastRoute)route();},1000);
            window.addEventListener('popstate',route);
            Spicetify.Player.addEventListener('songchange',()=>this.loadPanelLyrics());
            Spicetify.Player.addEventListener('onplaypause',()=>{this.updateLyricsClock();this.syncPanelBackdropPlayback();});
            Spicetify.Player.addEventListener('onprogress',()=>{if(!document.hidden&&this.settings.lyricsSource!=='off')this.syncPanelLyrics();});
            document.addEventListener('visibilitychange',()=>{this.updateLyricsClock();this.syncPanelBackdropPlayback();});
            this.updateLyricsClock();
            await route();
        },
        async render() {
            await originalRender.call(this);if(!this.studioStyle)return;
            this.renderStudio();this.updateRouteStatus();
            if(this.lyricsPanel){this.loadPanelLyrics();this.updateLyricsClock();this.refreshPanelBackdrop();}
        },
        renderStudio() {
            const s=this.settings, fonts={default:'inherit',system:'system-ui,sans-serif'};
            const styleKey=JSON.stringify(Object.keys(STUDIO_DEFAULTS).map(k=>s[k]))+':'+this.effectColor;
            if(styleKey===this.studioKey)return;this.studioKey=styleKey;
            const css=[];
            this.scanHomeShelves();css.push('#main [data-cbp-hide-section]{display:none!important}');
            if(s.hidePodcasts)css.push('[data-testid="home-page"] :is(.Shelf,section):has(a[href^="/show/"],a[href^="/episode/"]){display:none!important}');
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
                #main :is([data-testid="control-button-playpause"],.player-controls__buttons button[aria-label="Pause"],.player-controls__buttons button[aria-label="Play"]){background:${s.buttonColor}!important;color:#101828!important}
                #main :is(.main-nowPlayingWidget-coverArt,.main-nowPlayingWidget-coverArt img){width:${s.playerCover}px!important;height:${s.playerCover}px!important;border-radius:${s.coverRadius}px!important}
                #main .playback-bar :is(.progress-bar__bg,.progress-bar__fg,.progress-bar__fg_wrapper){height:${s.progressHeight}px!important}
                #cbp-lyrics{--cbp-lyric-ink:${this.effectColor||s.color};width:min(${s.lyricsWidth}px,90vw);font-size:${s.lyricsFont}px}
                body.cbp-panel-lyrics #main{width:calc(100% - ${s.lyricsWidth}px)!important}
                @media(max-width:700px){body.cbp-panel-lyrics #main{width:100%!important}}`);
            this.studioStyle.textContent=STUDIO_CSS+css.join('\n');
            document.body.classList.toggle('cbp-panel-lyrics',s.lyricsSource!=='off');
            this.lyricsPanel.hidden=s.lyricsSource==='off';
        },
        routePath() {return Spicetify.Platform?.History?.location?.pathname||location.pathname;},
        playlistPath() {const p=this.routePath();if(p==='/collection/tracks')return p;return /^\/playlist\/[a-zA-Z0-9]+\/?$/.test(p)?p.replace(/\/$/,''):null;},
        updateRouteStatus(){const el=this.menu?.querySelector('#cbp-route-status');if(!el)return;const path=this.playlistPath();const p=this.presets().find(p=>p.id===this.sceneMap?.[path]);el.textContent=path?`Этот плейлист: ${p?.name||'оформление не назначено'}`:'Открой страницу плейлиста для привязки оформления.';},
        assignScene(remove=false) {
            const path=this.playlistPath();if(!path){this.notify('Сначала открой плейлист',true);return;}
            if(remove)delete this.sceneMap[path];else this.sceneMap[path]=this.menu.querySelector('#cbp-presets').value;
            storage.put('cbp_scene_map',JSON.stringify(this.sceneMap));this.lastSceneKey=null;
            this.applyRouteScene().catch(e=>this.report(e));
        },
        async applyRouteScene() {
            const token=this.sceneToken=(this.sceneToken||0)+1;this.lastRoute=this.routePath();
            const id=this.sceneMap[this.playlistPath()],p=this.presets().find(p=>p.id===id),key=p?`${this.lastRoute}:${id}`:'';
            this.updateRouteStatus();if(key===this.lastSceneKey)return;
            let image;
            if(p&&(p.imageSaved||this.presetImages[id]))image=await images.run('readonly',undefined,`cbp_preset_${id}`);
            if(token!==this.sceneToken)return;
            if(p){if(!this.sceneBase)this.sceneBase={settings:{...this.settings},image:this.image,activePreset:this.activePreset};this.settings=normalize(p.settings);this.image=image??this.sceneBase.image;this.activePreset=id;}
            else if(this.sceneBase){Object.assign(this,this.sceneBase);this.sceneBase=null;}
            this.lastSceneKey=key;this.decoded=null;this.sample=null;this.analysisKey='';this.syncUI();this.fillPresets();await this.render();
        },
        openBackgroundEditor() {
            if(!this.image){this.notify('Сначала выбери фон',true);return;}
            this.showMenu(false);const before={x:this.settings.x,y:this.settings.y,zoom:this.settings.zoom,dim:this.settings.dim,blur:this.settings.blur};
            const editor=document.createElement('section');editor.id='cbp-bg-editor';editor.setAttribute('role','dialog');editor.setAttribute('aria-label','Редактор фона');
            editor.innerHTML='<div class="cbp-editor-tools"><strong>Перетаскивай фон · колесо — масштаб</strong><button data-editor="save">Сохранить</button><button data-editor="cancel">Отмена · Esc</button><label>Затемнение <input aria-label="Затемнение" type="range" min="0" max="100" data-edit="dim"></label><label>Размытие <input aria-label="Размытие" type="range" min="0" max="50" data-edit="blur"></label><output></output></div>';
            document.body.append(editor);this.backgroundEditor=editor;this.editingBackground=true;
            const update=()=>{this.syncUI();this.render();editor.querySelector('output').textContent=`Масштаб ${Math.round(this.settings.zoom)}% · X ${Math.round(this.settings.x)} · Y ${Math.round(this.settings.y)}`;};
            editor.querySelector('[data-edit="dim"]').value=this.settings.dim*100;editor.querySelector('[data-edit="blur"]').value=this.settings.blur;
            const finish=save=>{if(!save)Object.assign(this.settings,before);else{this.activePreset='';this.save();}editor.remove();document.removeEventListener('keydown',escape,true);this.backgroundEditor=null;this.editingBackground=false;update();this.showMenu(true);};
            const escape=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish(false);}else if(e.key==='Tab'){const nodes=[...editor.querySelectorAll('button,input')];if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0].focus();}}};document.addEventListener('keydown',escape,true);
            editor.onclick=e=>{const a=e.target.closest('[data-editor]')?.dataset.editor;if(a)finish(a==='save');};
            editor.oninput=e=>{const k=e.target.dataset.edit;if(k){this.settings[k]=Number(e.target.value)/(k==='dim'?100:1);update();}};
            let drag;
            editor.onpointerdown=e=>{if(e.target.closest('.cbp-editor-tools')||e.button!==0)return;drag={x:e.clientX,y:e.clientY,sx:this.settings.x,sy:this.settings.y};editor.setPointerCapture(e.pointerId);};
            editor.onpointermove=e=>{if(!drag)return;const m=this.media,iw=m.naturalWidth||m.videoWidth||innerWidth,ih=m.naturalHeight||m.videoHeight||innerHeight,scale=Math.max(innerWidth/iw,innerHeight/ih)*this.settings.zoom/100;
                this.settings.x=clamp(drag.sx-(e.clientX-drag.x)/Math.max(1,iw*scale-innerWidth)*100,0,100);this.settings.y=clamp(drag.sy-(e.clientY-drag.y)/Math.max(1,ih*scale-innerHeight)*100,0,100);update();};
            editor.onpointerup=editor.onpointercancel=()=>drag=null;
            editor.addEventListener('wheel',e=>{if(e.target.closest('.cbp-editor-tools'))return;e.preventDefault();this.settings.zoom=clamp(this.settings.zoom+(e.deltaY<0?5:-5),100,250);update();},{passive:false});
            editor.querySelector('button').focus();update();
        }
    });
    const STUDIO_CSS=`
        #cbp-studio button{white-space:normal}#cbp-studio input[type=color]{width:42px;height:30px;padding:0;margin-left:auto}
        #cbp-bg-editor{position:fixed;inset:0;z-index:100000;cursor:grab;touch-action:none;border:3px solid #b2c9ff;box-sizing:border-box}
        .cbp-editor-tools{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);width:min(720px,90vw);background:#14171ff5;color:white;border:1px solid #ffffff30;border-radius:16px;padding:18px;display:flex;gap:12px;flex-wrap:wrap;cursor:default;font:14px system-ui}
        .cbp-editor-tools button,#cbp-lyrics button,#cbp-import-preview button{font:inherit;color:inherit;background:#ffffff15;border:1px solid #ffffff30;border-radius:8px;padding:8px;cursor:pointer}
        .cbp-editor-tools strong{width:100%}.cbp-editor-tools label{display:flex;gap:8px;align-items:center}
        #cbp-lyrics{position:fixed;right:8px;top:8px;bottom:8px;z-index:5;padding:18px;box-sizing:border-box;display:flex;flex-direction:column;background:#11151c;backdrop-filter:none;border-radius:16px;isolation:isolate;overflow:hidden;color:var(--cbp-lyric-ink,#fff);font-family:system-ui;text-shadow:0 1px 4px #0009;box-shadow:0 0 0 1px #ffffff18}
        #cbp-lyrics>.cbp-panel-backdrop{position:absolute;inset:0;z-index:0;pointer-events:none;background:#11151c}
        #cbp-lyrics>.cbp-panel-backdrop :is(img,video){position:absolute;inset:0;display:block;width:100%;height:100%;max-width:none;max-height:none;object-fit:cover;object-position:center;filter:none;border-radius:0}
        #cbp-lyrics>.cbp-panel-backdrop:is([data-source=canvas],[data-source=clip])>img{display:none}
        #cbp-lyrics>:not(.cbp-panel-backdrop){position:relative;z-index:1}
        #cbp-lyrics[hidden]{display:none}#cbp-lyrics header{display:flex;justify-content:space-between;align-items:center;font-size:15px;gap:8px}#cbp-lyrics p{font-size:13px;line-height:1.5}
        #cbp-lyrics .cbp-lines{overflow:auto;flex:1;min-height:0;padding-block:32px;scrollbar-width:thin}
        #cbp-lyrics .cbp-line{display:block;width:100%;border:0;background:transparent;text-align:start;color:inherit;font:inherit;line-height:1.5;opacity:.45;padding:12px 4px;white-space:pre-wrap;overflow-wrap:anywhere;transition:opacity .2s}
        #cbp-lyrics .cbp-line[aria-current=true]{opacity:1;font-weight:650;background:#ffffff0d}#cbp-lyrics .cbp-line:hover{opacity:1}
        #cbp-lyrics .cbp-line:has(.cbp-syllable){font-weight:650;opacity:.85}
        #cbp-lyrics .cbp-line[aria-current=true]:has(.cbp-syllable){opacity:1}
        #cbp-lyrics .cbp-syllable{--cbp-fill:0%;display:inline-block;white-space:pre;color:transparent;background:linear-gradient(var(--cbp-syllable-direction,90deg),var(--cbp-lyric-ink,#fff) var(--cbp-fill),color-mix(in srgb,var(--cbp-lyric-ink,#fff) 35%,transparent) var(--cbp-fill));background-clip:text;-webkit-background-clip:text;transition:transform .18s ease;transform:translateY(0)}
        #cbp-lyrics .cbp-syllable-active{transform:translateY(-1px)}
        #cbp-lyrics [data-state=past] .cbp-syllable{--cbp-fill:100%!important}
        #cbp-lyrics [data-state=future] .cbp-syllable{--cbp-fill:0%!important}
        #cbp-lyrics .cbp-backing{display:block;font-size:.78em;opacity:.75;margin-top:4px}
        body.cbp-spicy-loading #main :is(.Root__right-sidebar,.s8fIIxwITjOk1aFOxhPv,[data-testid="right-sidebar"],#Desktop_PanelContainer_Id){display:flex!important;position:fixed!important;right:-10000px!important;top:80px!important;bottom:100px!important;width:360px!important;visibility:hidden!important;pointer-events:none!important}
        @media(prefers-reduced-motion:reduce){#cbp-lyrics .cbp-syllable{transition:none;transform:none}}
        #cbp-import-preview{position:fixed;inset:0;z-index:100001;background:#000a;display:grid;place-items:center;font:14px system-ui;color:#f5f7ff}
        #cbp-import-preview article{width:min(600px,90vw);max-height:90vh;overflow:auto;background:#14171f;border:1px solid #ffffff30;border-radius:18px;padding:22px}
        #cbp-import-preview .cbp-import-art{height:200px;width:100%;object-fit:cover;border-radius:12px}#cbp-import-preview label{display:block;margin:14px 0}#cbp-import-preview button{margin:8px 8px 0 0}
        @media(prefers-reduced-motion:reduce){#cbp-lyrics .cbp-line{transition:none}}
    `;
