    const STUDIO_DEFAULTS = {
        hidePodcasts:false, hideRecommendations:false, hideSidebar:false, hideStore:false,
        coverRadius:8, coverScale:100, rowHeight:56, fontSize:14, font:'default',
        trackColor:'#b2c9ff', buttonColor:'#b2c9ff', playerCover:56, progressHeight:4,
        lyricsHighlight:'letters', lyricsCinema:true, lyricsLayout:'above', lyricsSource:'off', lyricsLastSource:'spicy', lyricsWidth:360, lyricsFont:24, lyricsDim:.12, lyricsTranslation:false, lyricsTranslationEngine:'local', lyricsSongMap:true, lyricsDuet:true
    };
    Object.assign(DEFAULT_EXTRA, STUDIO_DEFAULTS);
    const LYRIC_WIDTH_MIN=260, LYRIC_WIDTH_MAX=760;
    Object.assign(LIMITS,{coverRadius:[0,40],coverScale:[70,130],rowHeight:[40,88],fontSize:[12,20],playerCover:[40,88],progressHeight:[2,10],lyricsWidth:[LYRIC_WIDTH_MIN,LYRIC_WIDTH_MAX],lyricsFont:[16,40],lyricsDim:[0,.6]});
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
                <label class="cbp-row">Подсветка текста<select data-setting="lyricsHighlight"><option value="letters">По буквам</option><option value="syllables">По слогам · меньше нагрузка</option></select></label>
                <label class="cbp-row">Расположение видео<select data-setting="lyricsLayout"><option value="above">Текущая строка в нижней трети</option><option value="below">Под текстом</option><option value="overlay">Фоном · прежний вид</option></select></label>
                ${this.toggle('lyricsCinema','Увеличивать видео в проигрышах')}
                ${this.toggle('lyricsSongMap','Карта песни над полосой прогресса')}
                ${this.toggle('lyricsTranslation','Русский перевод под каждой строкой')}
                ${this.toggle('lyricsDuet','Дуэт · партии по сторонам, если размечены в Spicy')}
                <label class="cbp-row">Переводчик<select data-setting="lyricsTranslationEngine"><option value="local">Лёгкий OPUS · EN → RU · на компьютере</option><option value="mymemory">MyMemory · другие языки · онлайн</option></select></label>
                <p class="cbp-hint">Локальный OPUS переводит английский на русский на компьютере, без дневной квоты. Текст остаётся на устройстве. Готовые переводы сохраняются в кэш до 2 МБ. MyMemory отправляет строки онлайн-сервису и имеет дневной лимит.</p>
                ${this.slider('Ширина панели','lyricsWidth',LYRIC_WIDTH_MIN,LYRIC_WIDTH_MAX,1,'px')}${this.slider('Размер букв','lyricsFont',16,40,1,'px')}${this.slider('Затемнение видео в режиме фона','lyricsDim',0,60,1,'%')}
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
            this.lyricsPanel.querySelector('[data-translation]').onmouseenter=()=>{const status=this.lyricsPanel.querySelector('.cbp-translation-status');this.lyricsPanel.querySelector('[data-translation]').title=status?.textContent||'Русский перевод';};
            this.lyricsPanel.querySelector('[data-translation]').onclick=()=>{this.settings.lyricsTranslation=!this.settings.lyricsTranslation;this.save();this.syncUI();this.render();};
            this.lyricsPanel.querySelector('[data-retry]').onclick=()=>{this.loadPanelLyrics(true);this.refreshPanelBackdrop(true);};
            this.lyricsPanel.querySelector('[data-close]').onclick=()=>{if(this.settings.lyricsSource!=='off')this.togglePanelLyrics();};document.body.append(this.lyricsPanel);
            this.bindLyricReading();
            this.lyricsPanel.addEventListener('pointerdown',event=>event.stopPropagation());
            this.initPanelResize();
            await originalInit.call(this);
            this.initPanelBackdrop();
            Spicetify.Player.addEventListener('songchange',()=>{this.refreshPanelBackdrop();this.loadPanelLyrics();this.syncReadyTrack();this.scheduleTrackPrefetch?.();});
            Spicetify.Player.addEventListener('onplaypause',()=>{this.updateLyricsClock();this.syncPanelBackdropPlayback();this.findPanelClip();});
            Spicetify.Player.addEventListener('onprogress',()=>{if(!document.hidden&&this.settings.lyricsSource!=='off'&&!this.lyricFrame&&!this.lyricsTimer)this.syncPanelLyrics();});
            document.addEventListener('visibilitychange',()=>{this.updateLyricsClock();this.syncPanelBackdropPlayback();this.updatePanelTranslation();this.scheduleTrackPrefetch?.();});
            this.updateLyricsClock();this.syncReadyTrack();
            try{Spicetify.Platform?.PlayerAPI?.getEvents?.().addListener('queue_update',()=>this.scheduleTrackPrefetch?.());}catch{}
            this.scheduleTrackPrefetch?.();
        },
        initPanelResize() {
            const grip=document.createElement('div');
            grip.className='cbp-panel-resize';
            grip.tabIndex=0;
            grip.setAttribute('role','separator');
            grip.setAttribute('aria-orientation','vertical');
            grip.setAttribute('aria-label','Ширина панели текста');
            grip.setAttribute('aria-controls','cbp-lyrics');
            this.lyricsPanel.append(grip);
            this.lyricsResizeGrip=grip;

            const setWidth=width=>{
                const max=Math.min(LYRIC_WIDTH_MAX,Math.round(innerWidth*(innerWidth<=700?.9:.6)));
                const next=clamp(Math.round(width),Math.min(LYRIC_WIDTH_MIN,max),max);
                if(next===this.settings.lyricsWidth)return;
                this.settings.lyricsWidth=next;
                this.applyPanelWidth();
                this.syncUI('lyricsWidth');
            };
            let drag;
            grip.addEventListener('pointerdown',event=>{
                if(event.button!==0||drag)return;
                event.preventDefault();
                drag={id:event.pointerId,x:event.clientX,width:this.lyricsPanel.getBoundingClientRect().width,initial:this.settings.lyricsWidth};
                grip.setPointerCapture(event.pointerId);
                grip.dataset.dragging='';
            });
            grip.addEventListener('pointermove',event=>{
                if(drag?.id===event.pointerId)setWidth(drag.width+drag.x-event.clientX);
            });
            const finish=event=>{
                if(drag?.id!==event.pointerId)return;
                const initial=drag.initial;
                drag=null;
                delete grip.dataset.dragging;
                if(this.settings.lyricsWidth!==initial)this.save();
            };
            for(const event of ['pointerup','pointercancel','lostpointercapture'])grip.addEventListener(event,finish);
            grip.addEventListener('keydown',event=>{
                if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
                event.preventDefault();
                event.stopPropagation();
                setWidth(this.lyricsPanel.getBoundingClientRect().width+(event.key==='ArrowLeft'?16:-16));
                this.save();
            });
        },
        applyPanelWidth() {
            if(!this.lyricsResizeGrip)return;
            const width=this.settings.lyricsWidth;
            document.body.style.setProperty('--cbp-panel-width',width+'px');
            this.lyricsResizeGrip.setAttribute('aria-valuenow',String(width));
            this.lyricsResizeGrip.setAttribute('aria-valuemin',String(LYRIC_WIDTH_MIN));
            this.lyricsResizeGrip.setAttribute('aria-valuemax',String(LYRIC_WIDTH_MAX));
        },
        bindLyricReading() {
            const list=this.lyricsPanel.querySelector('.cbp-lines');
            list.title='Alt+R — удерживать строку · колёсико — прокручивать текст';
            list.addEventListener('wheel',event=>{
                if(event.ctrlKey||!event.deltaY)return;
                if(this.lyricsPanel.dataset.reading==='hold'){event.preventDefault();return;}
                if(this.lyricsPanel.dataset.timed!=='true')return;
                event.preventDefault();
                this.setLyricReading('browse');
                const unit=event.deltaMode===1?24:event.deltaMode===2?list.clientHeight:1;
                list.scrollBy({top:event.deltaY*unit,behavior:'instant'});
                clearTimeout(this.lyricReadingTimer);
                if(!this.panelClipAnchorArmed)this.lyricReadingTimer=setTimeout(()=>this.setLyricReading(),4000);
            },{passive:false});
            document.addEventListener('keydown',event=>{
                if(event.code==='KeyS'&&event.altKey&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey&&!event.repeat
                    &&!this.lyricsPanel.hidden&&this.menu.hidden&&this.transferDialog.hidden&&this.panelMediaPicker?.menu.hidden
                    &&!event.target.closest?.('input,textarea,select,[contenteditable=true]')){
                    const row=list.querySelector('.cbp-line[data-start-ms]:hover')||event.target.closest?.('.cbp-line[data-start-ms]');
                    if(row&&list.contains(row)&&this.bindCurrentClipLine(Number(row.dataset.startMs))){
                        event.preventDefault();
                        return;
                    }
                }
                if(event.code==='Escape'&&this.panelClipAnchorArmed){
                    this.panelClipAnchorArmed=false;
                    this.setLyricReading();
                    this.notify('Привязка отменена');
                    return;
                }
                if(event.code==='Escape'&&this.lyricsPanel.dataset.reading==='browse'&&this.menu.hidden){
                    this.setLyricReading();return;
                }
                if(event.repeat||!event.altKey||event.ctrlKey||event.shiftKey||event.metaKey||event.code!=='KeyR'
                    ||this.lyricsPanel.hidden||!this.menu.hidden||!this.transferDialog.hidden
                    ||event.target.closest?.('input,textarea,select,[contenteditable=true]')
                    ||!list.querySelector('[aria-current=true]'))return;
                event.preventDefault();
                this.setLyricReading('hold');
            });
            document.addEventListener('keyup',event=>{
                if((event.code==='KeyR'||event.key==='Alt')&&this.lyricsPanel.dataset.reading==='hold')this.setLyricReading();
            });
            window.addEventListener('blur',()=>this.setLyricReading());
        },
        setLyricReading(mode='',resync=true) {
            const panel=this.lyricsPanel;
            if((panel.dataset.reading||'')===mode)return;
            clearTimeout(this.lyricReadingTimer);
            if(mode){
                const list=panel.querySelector('.cbp-lines');
                const current=list.querySelector('[aria-current=true]');
                const top=current?.getBoundingClientRect().top;
                panel.dataset.reading=mode;
                if(mode==='browse'&&panel.dataset.cinematic==='true'){
                    panel.dataset.cinemaMotion='false';
                    panel.dataset.cinematic='false';
                }
                const offset=current?current.getBoundingClientRect().top-top:0;
                list.scrollTo({top:list.scrollTop+offset,behavior:'instant'});
                return;
            }
            delete panel.dataset.reading;
            if(resync){
                this.panelLyricIndex=null;
                this.panelTimelineProgress=null;
                this.syncPanelLyrics();
            }
        },
        async render() {
            await originalRender.call(this);if(!this.studioStyle)return;
            this.renderStudio();
            if(this.lyricsPanel){this.loadPanelLyrics();this.updateLyricsClock();this.refreshPanelBackdrop();this.scheduleTrackPrefetch?.();}
        },
        renderStudio() {
            const s=this.settings;this.updatePanelHighlight?.();this.applyPanelWidth();if(this.lyricsPanel)this.lyricsPanel.dataset.layout=s.lyricsLayout;this.updatePanelContrast?.();const controlInk=luminance(s.buttonColor.match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16)))>.3?'#101828':'#ffffff';
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
                #cbp-lyrics{--cbp-lyric-ink:${this.effectColor||s.color};font-size:${s.lyricsFont}px}
                body.cbp-panel-lyrics #main{width:calc(100% - var(--cbp-panel-effective-width))!important}
                @media(max-width:700px){body.cbp-panel-lyrics{--cbp-panel-effective-width:min(var(--cbp-panel-width,360px),90vw)}body.cbp-panel-lyrics #main{width:100%!important}}`);
            this.studioStyle.textContent=STUDIO_CSS+css.join('\n');
            if(this.panelLyricLines?.length&&this.lyricsPanel.dataset.reading!=='hold'){this.panelLyricIndex=null;this.syncPanelLyrics();}
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
        #cbp-lyrics{position:fixed;right:0;top:0;bottom:0;z-index:9000;padding:18px;box-sizing:border-box;display:flex;flex-direction:column;background:#11151c;backdrop-filter:none;border-radius:0;isolation:isolate;overflow:hidden;color:var(--cbp-panel-ink,var(--cbp-lyric-ink,#fff));font-family:var(--font-family,var(--encore-body-font-stack,sans-serif));font-weight:500;text-shadow:none;box-shadow:0 0 0 1px #ffffff18}
        body.cbp-panel-lyrics{--cbp-panel-effective-width:min(var(--cbp-panel-width,360px),60vw)}
        #cbp-lyrics{width:var(--cbp-panel-effective-width,360px)}
        #cbp-lyrics>.cbp-panel-resize{position:absolute;z-index:6;inset:0 auto 0 0;width:10px;cursor:ew-resize;touch-action:none;user-select:none}
        #cbp-lyrics>.cbp-panel-resize::after{content:"";position:absolute;inset:0 auto 0 0;width:2px;background:currentColor;opacity:0}
        #cbp-lyrics>.cbp-panel-resize:is(:hover,:focus-visible,[data-dragging])::after{opacity:.65}
        #cbp-lyrics>.cbp-panel-backdrop{position:absolute;inset:0;z-index:0;pointer-events:none;background:#11151c}
        #cbp-lyrics>.cbp-panel-backdrop :is(img,video){position:absolute;inset:0;display:block;width:100%;height:100%;max-width:none;max-height:none;object-fit:cover;object-position:center;filter:none;border-radius:0}
        #cbp-lyrics>.cbp-panel-backdrop::after{content:"";position:absolute;inset:0;background:var(--cbp-panel-scrim,#0000001f)}
        #cbp-lyrics:not([data-layout=overlay]){background:var(--cbp-lyric-surface,#15171d)}
        #cbp-lyrics:not([data-layout=overlay])>header{order:0}
        #cbp-lyrics:not([data-layout=overlay])>p{order:1}
        #cbp-lyrics:not([data-layout=overlay])>.cbp-panel-backdrop{position:relative;inset:auto;order:2;flex:0 0 auto;width:min(100%,calc(34vh * var(--cbp-media-ratio,1)));height:auto;aspect-ratio:var(--cbp-media-ratio,1);align-self:center;margin:8px 0 12px;border-radius:10px;overflow:hidden;background:#090b10}
        #cbp-lyrics:not([data-layout=overlay])>.cbp-panel-backdrop:not(:has(img,video)){display:none}
        #cbp-lyrics:not([data-layout=overlay])>.cbp-panel-backdrop :is(img,video){object-fit:contain}
        #cbp-lyrics:not([data-layout=overlay])>.cbp-panel-backdrop::after{display:none}
        #cbp-lyrics:not([data-layout=overlay])>.cbp-lines{order:3;padding-block:12px}
        #cbp-lyrics[data-layout=below]{padding-bottom:0}
        #cbp-lyrics[data-layout=below]>.cbp-lines{padding:0;overflow:hidden;overflow-anchor:none}
        #cbp-lyrics[data-layout=below] .cbp-vocal-countdown{padding-block:4px;opacity:.72}
        #cbp-lyrics[data-layout=below][data-timed=true]>.cbp-lines::before{content:"";display:block;height:100%}
        #cbp-lyrics[data-layout=below][data-timed=true] .cbp-line[data-state=future]{visibility:hidden;pointer-events:none}
        #cbp-lyrics[data-layout=below][data-timed=true] :is(.cbp-line[data-state=current],.cbp-vocal-countdown)+.cbp-line[data-state=future]{visibility:visible;pointer-events:auto}
        #cbp-lyrics[data-layout=below][data-timed=false]>.cbp-lines{overflow:auto}
        #cbp-lyrics[data-layout=below]>.cbp-panel-backdrop{order:4;margin:12px 0 0;border-radius:0;width:var(--cbp-panel-effective-width);height:min(calc(var(--cbp-panel-effective-width) / var(--cbp-media-ratio,1)),60vh,max(0px,calc(100vh - 30px - var(--cbp-visible-lyrics-height,0px))));aspect-ratio:auto;background:var(--cbp-media-edges,var(--cbp-lyric-surface,#15171d))}
        #cbp-lyrics[data-layout=below]>.cbp-panel-backdrop :is(img,video){object-fit:contain;mask-image:linear-gradient(transparent,#000 min(24px,12%))}
        #cbp-lyrics[data-layout=below]>.cbp-panel-backdrop::after{display:block;background:linear-gradient(to bottom,var(--cbp-lyric-surface,#15171d),transparent min(32px,16%))}
        #cbp-lyrics[data-layout=above]{--cbp-media-height:min(calc(var(--cbp-panel-effective-width,360px) / var(--cbp-media-ratio,1)),calc(66.6667vh - 16px));--cbp-lines-top:calc(var(--cbp-media-height) + 16px)}
        #cbp-lyrics[data-layout=above][data-cinematic=true]{--cbp-media-height:calc(88vh - 16px)}
        #cbp-lyrics[data-layout=above][data-cinematic=true]>.cbp-panel-backdrop :is(img,video){width:min(100%,calc(var(--cbp-media-height) * var(--cbp-media-ratio,1)))}
        #cbp-lyrics[data-layout=below][data-cinematic=true]>.cbp-panel-backdrop{height:88vh}
        #cbp-lyrics[data-cinematic=true] .cbp-line{visibility:hidden!important}
        @media(prefers-reduced-motion:no-preference){
            #cbp-lyrics[data-cinema-motion=true]>.cbp-panel-backdrop{transition:height .45s ease}
            #cbp-lyrics[data-cinema-motion=true][data-layout=above]>.cbp-lines{transition:top .45s ease}
            #cbp-lyrics[data-cinema-motion=true][data-layout=above]>.cbp-panel-backdrop :is(img,video){transition:height .45s ease,width .45s ease}
        }
        #cbp-lyrics[data-layout=above]:not(:has(>.cbp-panel-backdrop :is(img,video))){--cbp-lines-top:54px}
        #cbp-lyrics[data-layout=above]>.cbp-panel-backdrop{position:absolute;left:0;right:0;top:0;width:100%;height:var(--cbp-lines-top);aspect-ratio:auto;margin:0;border-radius:0;background:var(--cbp-media-edges,var(--cbp-lyric-surface,#15171d));isolation:isolate}
        #cbp-lyrics[data-layout=above]>.cbp-panel-backdrop::before{content:"";position:absolute;inset:-24px;background-image:var(--cbp-media-ambient,none);background-size:cover;background-position:center;filter:blur(24px);opacity:.32;z-index:0}
        #cbp-lyrics[data-layout=above]>.cbp-panel-backdrop :is(img,video){z-index:1;inset:0 auto auto 50%;transform:translateX(-50%);width:calc(var(--cbp-media-height) * var(--cbp-media-ratio,1));height:var(--cbp-media-height);object-fit:contain;object-position:center top;mask-image:linear-gradient(to bottom,#000 calc(100% - min(56px,22%)),transparent 100%)}
        #cbp-lyrics[data-layout=above]>.cbp-panel-backdrop::after{display:block;z-index:2;background:linear-gradient(to bottom,transparent calc(100% - min(72px,24%)),var(--cbp-lyric-surface,#15171d) 100%)}
        #cbp-lyrics[data-layout=above]>.cbp-lines{position:absolute;top:var(--cbp-lines-top);left:18px;right:18px;bottom:18px;padding:0 0 calc(100vh - var(--cbp-lines-top) - 18px);box-sizing:border-box;scroll-behavior:auto;overflow:hidden;overflow-anchor:none}
        #cbp-lyrics[data-layout=above][data-timed=false]>.cbp-lines{overflow:auto;padding-bottom:12px}
        #cbp-lyrics[data-layout=above] .cbp-line[data-state=past]{visibility:hidden;pointer-events:none}
        #cbp-lyrics[data-layout=above][data-adaptive] .cbp-line[aria-current=true]{background:transparent}
        #cbp-lyrics>header{position:absolute!important;top:10px;right:10px;left:auto;z-index:5!important;gap:6px;opacity:.55;transition:opacity .15s}
        #cbp-lyrics>header:hover,#cbp-lyrics>header:focus-within{opacity:1}
        #cbp-lyrics>header button::before,#cbp-lyrics>header button::after{content:none!important;background:none!important;box-shadow:none!important}
        #cbp-lyrics>header>strong{display:none}
        #cbp-lyrics>header button:is([data-media-picker],[data-translation],[data-retry],[data-close]){height:32px;min-width:32px;padding:4px;font-size:13px;background:none!important;box-shadow:none!important;border:none!important}
        #cbp-lyrics>p{display:none}
        #cbp-lyrics>p[data-error=true]{display:block;position:absolute;left:18px;right:18px;top:50%;z-index:4}
        #cbp-lyrics,#cbp-lyrics *{-webkit-app-region:no-drag!important;app-region:no-drag!important}
        #cbp-lyrics header,#cbp-lyrics header button{pointer-events:auto!important;touch-action:manipulation}
        #cbp-lyrics>.cbp-panel-backdrop:is([data-source=canvas],[data-source=clip],[data-source=custom])>img{display:none}
        #cbp-lyrics:not([data-layout=overlay])>.cbp-panel-backdrop{pointer-events:auto;cursor:pointer}
        #cbp-lyrics>.cbp-media-picker:not([hidden]){position:absolute;z-index:7;top:48px;right:10px;left:auto;width:min(240px,calc(100% - 20px));padding:12px;display:grid;gap:8px;border:1px solid #ffffff30;border-radius:12px;background:#15171d;color:#f5f7ff;font-size:14px;box-sizing:border-box}
        #cbp-lyrics .cbp-media-picker label{display:grid;gap:6px}
        #cbp-lyrics .cbp-media-picker select{color:inherit;background:#252a35;border:1px solid #ffffff30;border-radius:6px;padding:6px}
        #cbp-lyrics .cbp-media-picker [hidden]{display:none}
        #cbp-lyrics .cbp-media-picker output{font-size:12px}
        #cbp-lyrics>:not(.cbp-panel-backdrop,.cbp-panel-resize){position:relative;z-index:1}
        body.cbp-clip-loading #main :is(.Root__right-sidebar,.s8fIIxwITjOk1aFOxhPv,[data-testid="right-sidebar"],#Desktop_PanelContainer_Id){display:flex!important;position:fixed!important;right:-10000px!important;top:80px!important;bottom:100px!important;width:360px!important;pointer-events:none!important}
        video[data-cbp-native-clip]:popover-open{position:fixed!important;inset:auto!important;left:var(--cbp-native-left)!important;top:var(--cbp-native-top)!important;width:var(--cbp-native-width)!important;height:var(--cbp-native-height)!important;margin:0!important;padding:0!important;border:0!important;max-width:none!important;max-height:none!important;background:transparent!important;visibility:visible!important;object-fit:contain!important;pointer-events:none!important}
        body:has(#cbp-media-picker:not([hidden])) video[data-cbp-native-clip]:popover-open{opacity:0!important}
        #cbp-lyrics:not([data-layout=overlay])>.cbp-panel-backdrop[data-native-clip]{display:block}
        #cbp-lyrics[data-layout=above]:has(>.cbp-panel-backdrop[data-native-clip]){--cbp-lines-top:calc(var(--cbp-media-height) + 16px)}
        #cbp-lyrics[hidden]{display:none}#cbp-lyrics header{display:flex;justify-content:space-between;align-items:center;font-size:15px;gap:8px}#cbp-lyrics p{font-size:13px;line-height:1.5}
        #cbp-lyrics[data-reading=browse]>.cbp-lines{overflow:auto;overscroll-behavior:contain}
        #cbp-lyrics[data-reading=browse] .cbp-line[data-state]{visibility:visible!important;pointer-events:auto!important}
        #cbp-lyrics[data-reading=browse][data-layout=below]>.cbp-lines::before{display:none}
        #cbp-lyrics[data-reading=browse][data-layout=above]>.cbp-lines{padding-bottom:12px}
        #cbp-lyrics .cbp-voice-cue{display:block;margin-top:.35em;font-size:.62em;line-height:1.35;color:var(--cbp-panel-muted-ink,currentColor);font-weight:400}
        #cbp-lyrics .cbp-lines{overflow:auto;flex:1;min-height:0;padding-block:32px;scrollbar-width:thin}
        #cbp-lyrics .cbp-line{display:block;width:100%;border:0;background:transparent;text-align:start;color:inherit;font:inherit;line-height:1.5;opacity:1;padding:12px 4px;white-space:pre-wrap;overflow-wrap:anywhere;transition:opacity .2s}
        #cbp-lyrics .cbp-vocal-countdown{padding:12px 4px;font-size:.8em;line-height:1.5;opacity:.85;font-variant-numeric:tabular-nums}
        #cbp-lyrics .cbp-vocal-name{display:block;font-size:.58em;font-weight:400;line-height:1.4;opacity:.72;margin-bottom:3px}
        #cbp-lyrics .cbp-vocal-countdown .cbp-vocal-name{display:inline;font-size:.88em;margin:0}
        #cbp-lyrics .cbp-vocal-countdown + .cbp-line .cbp-vocal-name{display:none}
        #cbp-lyrics .cbp-line[aria-current=true]:not(:has(.cbp-syllable)){font-size:1.12em}
        #cbp-lyrics .cbp-line[aria-current=true]{--cbp-unfilled-ink:color-mix(in srgb,var(--cbp-panel-ink,#fff) 35%,var(--cbp-panel-muted-ink,#c4ccda));opacity:1;font-weight:600;background:#ffffff0d}#cbp-lyrics .cbp-line:hover{opacity:1}
        #cbp-lyrics[data-adaptive=true] .cbp-line{background:transparent;text-shadow:none}
        #cbp-lyrics[data-adaptive=true] .cbp-line[aria-current=true]{background:#ffffff0d}
        #cbp-lyrics .cbp-original,#cbp-lyrics .cbp-translation{text-shadow:none;filter:none}
        #cbp-lyrics .cbp-original{display:block}
        #cbp-lyrics .cbp-line[aria-current=false] :is(.cbp-original,.cbp-translation){color:var(--cbp-panel-muted-ink,currentColor)}
        #cbp-lyrics .cbp-translation{display:block;font-size:.7em;font-weight:400;line-height:1.45;margin-top:5px;opacity:1;color:inherit}
        #cbp-lyrics .cbp-translation[hidden]{display:none}
        #cbp-lyrics [data-translation][aria-pressed=true]{background:transparent!important;outline:none;text-decoration:underline;text-underline-offset:4px}
        #cbp-lyrics .cbp-translation-status{font-size:12px;margin:0 0 6px}
        #cbp-lyrics .cbp-line:has(.cbp-syllable){font-weight:500;opacity:1}#cbp-lyrics .cbp-line[aria-current=true]:has(.cbp-syllable){font-weight:500}
        #cbp-lyrics .cbp-line[aria-current=true]:has(.cbp-syllable){opacity:1}
        #cbp-lyrics .cbp-syllable{--cbp-fill:0%;display:inline-block;white-space:pre;color:transparent;background:linear-gradient(var(--cbp-syllable-direction,90deg),var(--cbp-panel-ink,var(--cbp-lyric-ink,#fff)) var(--cbp-fill),var(--cbp-panel-muted-ink,#c4ccda) var(--cbp-fill));background-clip:text;-webkit-background-clip:text;transition:transform .18s ease;transform:translateY(0)}
        #cbp-lyrics [aria-current=true] .cbp-syllable-active{position:relative;z-index:1;transform:translateY(calc(var(--cbp-segment-emphasis,0) * -1px)) scale(calc(1 + var(--cbp-segment-emphasis,0) * .06));transform-origin:center bottom}
        #cbp-lyrics [data-state=past] .cbp-syllable{--cbp-fill:100%!important}
        #cbp-lyrics [data-state=future] .cbp-syllable{--cbp-fill:0%!important}
        #cbp-lyrics [data-state=past] .cbp-syllable{background-image:none;color:var(--cbp-panel-muted-ink,#c4ccda)}
        #cbp-lyrics .cbp-word{display:inline-block;white-space:nowrap;overflow-wrap:normal;padding-inline:.025em}
        #cbp-lyrics .cbp-syllable:has(.cbp-letter){background:none;transform:none}
        #cbp-lyrics .cbp-letter{position:relative;display:inline-block;padding-inline:.015em;white-space:pre;color:transparent;background:linear-gradient(var(--cbp-syllable-direction,90deg),var(--cbp-panel-ink,#fff) var(--cbp-fill,0%),var(--cbp-unfilled-ink,var(--cbp-panel-muted-ink,#c4ccda)) var(--cbp-fill,0%));background-clip:text;-webkit-background-clip:text;transform:translateY(calc(var(--cbp-letter-emphasis,0) * -1.5px)) scale(var(--cbp-letter-scale,1));transform-origin:center 75%}
        #cbp-lyrics [aria-current=true] .cbp-letter::after{content:attr(data-letter);position:absolute;inset:0;box-sizing:border-box;padding-inline:inherit;font:inherit;font-weight:700;color:var(--cbp-panel-ink,#fff);opacity:var(--cbp-letter-emphasis,0);pointer-events:none}
        @media(prefers-reduced-motion:reduce){#cbp-lyrics .cbp-letter{transform:none}}
        #cbp-lyrics [data-state=past] .cbp-letter{background:none;color:var(--cbp-panel-muted-ink,#c4ccda);transform:none}
        #cbp-lyrics .cbp-backing{display:block;font-size:.78em;opacity:1;margin-top:4px}
        #cbp-lyrics[data-duet=true] .cbp-line[data-voice]{width:88%;box-sizing:border-box}
        #cbp-lyrics[data-duet=true] .cbp-line[data-voice=left]{margin-inline:0 auto;text-align:left}
        #cbp-lyrics[data-duet=true] .cbp-line[data-voice=right]{margin-inline:auto 0;text-align:right}
        #cbp-lyrics[data-duet=true] .cbp-line[data-voice=joint]{width:100%;margin-inline:0;text-align:center}
        #cbp-lyrics[data-duet=true] .cbp-backing{font-size:.74em;margin-top:8px;padding-inline:12px;line-height:1.4}
        body.cbp-spicy-loading #main :is(.Root__right-sidebar,.s8fIIxwITjOk1aFOxhPv,[data-testid="right-sidebar"],#Desktop_PanelContainer_Id){display:flex!important;position:fixed!important;right:-10000px!important;top:80px!important;bottom:100px!important;width:360px!important;visibility:hidden!important;pointer-events:none!important}
        @media(prefers-reduced-motion:reduce){#cbp-lyrics .cbp-syllable{transition:none}}
        #cbp-import-preview{position:fixed;inset:0;z-index:100001;background:#000a;display:grid;place-items:center;font:14px system-ui;color:#f5f7ff}
        #cbp-import-preview article{width:min(600px,90vw);max-height:90vh;overflow:auto;background:#14171f;border:1px solid #ffffff30;border-radius:18px;padding:22px}
        #cbp-import-preview .cbp-import-art{height:200px;width:100%;object-fit:cover;border-radius:12px}#cbp-import-preview label{display:block;margin:14px 0}#cbp-import-preview button{margin:8px 8px 0 0}
        @media(prefers-reduced-motion:reduce){#cbp-lyrics .cbp-line{transition:none}}
    `;

