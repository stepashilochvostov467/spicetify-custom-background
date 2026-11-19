    function expandWordTimings(segments,language) {
        return segments.flatMap((segment,index)=>{
            if(segment.joinsNext||segments[index-1]?.joinsNext)return [segment];
            const word=segment.text.match(/^([a-z]+|[а-яё]+)([.,!?…:]*)$/iu)?.[1];
            if(!word)return [segment];
            const russian=/^[а-яё]+$/iu.test(word);
            if(!russian&&!/^en(?:-|$)|^eng$/i.test(language))return [segment];
            const pattern=russian?/[аеёиоуыэюя]+/giu:/[aeiouy]+/gi;
            const nuclei=[...word.matchAll(pattern)];
            if(!russian&&nuclei.length>1&&nuclei.at(-1)[0].toLowerCase()==='e'
                &&word.toLowerCase().endsWith('e')&&!word.match(/[^aeiouy]le$/i))nuclei.pop();
            const duration=segment.end-segment.start;
            if(nuclei.length<2||duration<nuclei.length*70)return [segment];

            // The provider timed the word as a whole. Split its duration evenly across estimated syllables.
            const boundaries=[0,...nuclei.slice(1).map(vowel=>vowel.index-1),segment.text.length];
            return boundaries.slice(0,-1).map((start,i)=>({
                text:segment.text.slice(start,boundaries[i+1]),
                start:segment.start+duration*i/nuclei.length,
                end:segment.start+duration*(i+1)/nuclei.length,
                space:i===nuclei.length-1&&segment.space,
                estimated:true
            }));
        });
    }
    function panelLines(payload, source='spotify') {
        if(typeof payload==='string'){try{payload=JSON.parse(payload);}catch{return [];}}
        const data=source==='spotify'?payload?.lyrics:payload;
        const list=source==='spotify'?data?.lines:data?.Content;if(!Array.isArray(list))return [];
        const synced=source==='spotify'?data.syncType==='LINE_SYNCED':data.Type!=='Static';
        const segments=voice=>Array.isArray(voice?.Syllables)?voice.Syllables.slice(0,500).filter(s=>s&&typeof s.Text==='string').map((s,i,all)=>({
            text:s.Text.slice(0,500),start:Number(s.StartTime)*1000,end:Number(s.EndTime)*1000,space:!s.IsPartOfWord&&i<all.length-1,joinsNext:!!s.IsPartOfWord
        })).filter(s=>Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.start>=0&&s.end>=s.start):[];
        let sectionVocalist='',sectionSide;
        return list.slice(0,2500).flatMap(line=>{
            const lead=line?.Lead||line,syllables=source==='spicy'?segments(lead):[];
            const text=source==='spotify'?line?.words:syllables.length?syllables.map(s=>s.text+(s.space?' ':'')).join(''):typeof line==='string'?line:(lead?.Text??line?.Text);
            if(typeof text!=='string'||!text.trim())return [];
            const heading=text.trim().match(/^\[(?:intro|verse|pre[- ]chorus|chorus|hook|bridge|refrain|interlude|outro|куплет|припев|бридж)(?:\s+\d+)?(?:\s*:\s*([^\]\r\n]{1,60}))?\]$/i);
            if(heading){
                sectionVocalist=heading[1]?.trim()||'';
                sectionSide=undefined;
                return [];
            }
            const opposite=source==='spicy'&&(line?.OppositeAligned===true||lead?.OppositeAligned===true);
            if(sectionVocalist&&sectionSide===undefined)sectionSide=opposite;
            const creditedVocalist=lead?.VocalistName??lead?.Vocalist??line?.VocalistName??line?.Vocalist??line?.vocalistName??line?.vocalist;
            const vocalist=typeof creditedVocalist==='string'
                ? creditedVocalist.trim().slice(0,60)
                : sectionSide===opposite?sectionVocalist:'';
            const rawStart=source==='spotify'?Number(line?.startTimeMs??NaN):Number(lead?.StartTime??NaN)*1000;
            const start=synced?(Number.isFinite(rawStart)?rawStart:syllables[0]?.start):null;
            const rawEnd=source==='spicy'?Number(lead?.EndTime??NaN)*1000:Number(line?.endTimeMs??NaN);
            const end=Number.isFinite(rawEnd)?rawEnd:syllables.at(-1)?.end;
            return {text:text.slice(0,10000),start:Number.isFinite(start)&&start>=0?start:null,end:start!=null&&Number.isFinite(end)&&end>start?end:null,opposite,syllables,vocalist,
                background:Array.isArray(line?.Background)?line.Background.slice(0,8).map(segments).filter(s=>s.length):[]};
        });
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
            this.spicyLoaderWait?.finish();
            const route=this.spicyPageLoad;
            this.spicyPageLoad=null;
            if(route){
                const history=Spicetify.Platform?.History;
                if(history?.location?.pathname==='/SpicyLyrics'&&history.location.state?.cbpLyricsLoad===route)history.goBack();
            }
            if(this.spicyOpenedCard){const card=document.querySelector('#SpicyLyricsNPVCard');if(card&&!card.classList.contains('Collapsed'))card.querySelector('#NPVCardToggle')?.click();}
            if(this.spicyOpenedNPV&&this.panelClipHostKey)this.panelClipOpenedNPV=true;
            else if(this.spicyOpenedNPV){const button=document.querySelector('[data-testid="control-button-npv"]');if(button?.getAttribute('aria-pressed')==='true')button.click();}
            this.spicyOpenedCard=false;this.spicyOpenedNPV=false;this.spicyLoaderOwner=null;document.body.classList.remove('cbp-spicy-loading');
        },
        startSpicyPageLoader(owner,origin) {
            const history=Spicetify.Platform?.History;
            if(owner!==this.lyricRequest||this.spicyPageAttempt===owner||document.hidden||!origin||origin.pathname==='/SpicyLyrics')return;
            if(!history?.push||!history?.goBack||!document.getElementById('SpicyLyrics_PageButton'))return;
            const location=history.location;
            if(location?.pathname!==origin.pathname||location.search!==origin.search||location.hash!==origin.hash||location.key!==origin.key)return;
            this.spicyPageAttempt=owner;
            const marker=crypto.randomUUID();
            this.spicyPageLoad=marker;
            // Use the same route as Spicy's microphone button, tagged so cleanup
            // can distinguish this temporary visit from the user's navigation.
            history.push({pathname:'/SpicyLyrics',state:{cbpLyricsLoad:marker}});
        },
        waitSpicyUpdate(owner,delay=100) {
            return new Promise(resolve=>{
                let timer,wakeTimer,settled=false;
                const finish=()=>{if(settled)return;settled=true;clearTimeout(timer);clearTimeout(wakeTimer);observer.disconnect();if(this.spicyLoaderWait?.owner===owner)this.spicyLoaderWait=null;resolve();};
                const observer=new MutationObserver(records=>{
                    if(!wakeTimer&&records.some(record=>(record.target instanceof Element?record.target:record.target.parentElement)?.closest('#SpicyLyricsNPVCard')||[...record.addedNodes].some(node=>node instanceof Element&&(node.id==='SpicyLyricsNPVCard'||node.querySelector('#SpicyLyricsNPVCard')))))wakeTimer=setTimeout(finish,20);
                });
                observer.observe(document.querySelector('#Desktop_PanelContainer_Id,aside.NowPlayingView,#main')||document.body,{childList:true,subtree:true,characterData:true});
                this.spicyLoaderWait={owner,finish};timer=setTimeout(finish,delay);
            });
        },
        async readSpicy(uri) {
            const manager=window.SpicyLyrics?.db?.objectStores?.lyricsStore?.manager;
            let local;
            if(manager?.get){
                try{local=await this.withPrefetchSignal(manager.get(uri),AbortSignal.timeout(300));}catch{}
                if(local?.uri&&local.uri!==uri)local=null;
                if(this.hasSpicySyllables(local,uri))return local;
            }
            if(!window.caches)return local?.Content?local:null;
            if(!this.spicyCacheIndex||Date.now()-this.spicyCacheIndex.at>(this.spicyCacheIndex.names.length?2000:75)){
                this.spicyCacheIndex={at:Date.now(),names:(await caches.keys()).filter(n=>/spicy.*lyrics.*store/i.test(n))};
            }
            for(const name of this.spicyCacheIndex.names){
                const response=await (await caches.open(name)).match('/'+uri.split(':')[2]);if(!response)continue;
                const entry=await response.json().catch(()=>null);if(!entry||entry.ExpiresAt&&entry.ExpiresAt<Date.now())continue;
                const data=entry.Content;if(data?.uri&&data.uri!==uri)continue;
                if(this.hasSpicySyllables(data,uri))return data;
                if(!local?.Content&&data?.Content)local=data;
            }return local?.Content?local:null;
        },
        async readPanelSpicy(uri) {
            const playing=Spicetify.Player.data?.item?.uri;
            if(!playing||playing===uri||this.panelAudioURI()!==uri)return this.readSpicy(uri).catch(()=>null);
            const [video,audio]=await Promise.all([this.readSpicy(playing).catch(()=>null),this.readSpicy(uri).catch(()=>null)]);
            if((!video?.uri||video.uri===playing)&&panelLines(video,'spicy').some(line=>line.start!==null)){
                return {...video,uri,timingURI:playing};
            }
            return audio;
        },
        hasSpicySyllables(data,uri) {
            return (!data?.uri||data.uri===uri)&&panelLines(data,'spicy').some(line=>
                line.start!==null&&(line.syllables.some(s=>s.end>s.start)||line.background.some(voice=>voice.some(s=>s.end>s.start))));
        },
        hasSpicyLoader() {
            return Boolean(window.SpicyLyrics||document.querySelector('#SpicyLyrics_PageButton,#SpicyLyricsNPVCard'));
        },
        rememberSpicyReady(uri,data) {
            const ready=this.spicyReadyTracks||=new Map();
            ready.delete(uri);
            ready.set(uri,{data,expires:Date.now()+300000});
            if(ready.size>3)ready.delete(ready.keys().next().value);
        },
        watchLateSpicy(uri,current,playingURI=uri) {
            const check=async()=>{
                this.spicyLateTimer=null;
                if(!current())return;
                if(!document.hidden){
                    const data=await this.readPanelSpicy(uri);
                    if(!current())return;
                    if(this.hasSpicySyllables(data,uri)&&(playingURI===uri||data?.timingURI===playingURI)){
                        if(playingURI===uri)this.rememberSpicyReady(uri,data);
                        this.presentPanelLyrics(data,'spicy');
                        return;
                    }
                }
                this.spicyLateTimer=setTimeout(check,document.hidden?5000:2000);
            };
            this.spicyLateTimer=setTimeout(check,2000);
        },
        async fetchSpotifyPanelData(uri) {
            if(!Spicetify.CosmosAsync?.get)throw Error('Источник Spotify пока недоступен');
            let timer;try{return await Promise.race([Spicetify.CosmosAsync.get(`https://spclient.wg.spotify.com/color-lyrics/v2/track/${uri.split(':')[2]}?format=json&vocalRemoval=false&market=from_token`),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Источник не ответил')),10000))]);}finally{clearTimeout(timer);}
        },
        async spotifyPanelData(uri,force=false) {return await this.preparedLyrics?.('spotify',uri,force)||this.fetchSpotifyPanelData(uri);},
        presentPanelLyrics(data,source,timingURI=data?.timingURI||this.panelAudioURI()) {
            this.panelLyricTimingURI=timingURI;this.panelLyricTimingSource=source;
            if(!this.panelUsesAudioTiming())this.panelClipAnchorArmed=false;
            this.cancelPanelTranslation();this.translationIdleLines=null;this.duetLiveRow=null;this.duetBackingCursor=null;this.panelDuetAnchor=undefined;
            this.panelLyricIndex=-1;this.panelTimelineSource=null;this.panelStateIndex=undefined;this.panelSyllableNodes=[];this.syllableCursor=null;this.panelClock=null;this.clockLineSource=null;
            const status=this.lyricsPanel.querySelector('[role="status"]'),list=this.lyricsPanel.querySelector('.cbp-lines');
            this.lyricsPanel.dataset.cinemaMotion='false';this.lyricsPanel.dataset.cinematic='false';status.dataset.error='false';list.replaceChildren();
            this.panelLyricLines=this.arrangePanelDuet(panelLines(data,source));
            this.lyricsPanel.dataset.duet=String(this.panelLyricLines.some(line=>line.voice));
            const language=data?.lyrics?.language||data?.Language||data?.language||'';
            this.panelLyricLanguage=this.lyricLanguage(language,this.panelLyricLines);
            const syllableMode=this.panelLyricLines.some(l=>l.syllables.length);
            this.panelHasSyllables=this.panelLyricLines.some(l=>l.syllables.length||l.background.length);
            status.textContent=!this.panelLyricLines.length?'Для этой песни текст не найден':source==='spicy'?(syllableMode?'Spicy Lyrics · синхронизация по слогам':'Spicy Lyrics · источник дал только строки, без таймингов слогов'):'Spotify · синхронизация по строкам';
            status.dataset.error=String(!this.panelLyricLines.length);this.lyricsPanel.dataset.timed=String(this.panelLyricLines.some(line=>line.start!==null));
            const fragment=document.createDocumentFragment();
            for(const line of this.panelLyricLines){
                const el=document.createElement(line.start===null?'p':'button');el.className='cbp-line';el.dir='auto';if(line.voice)el.dataset.voice=line.voice;const nodes=[];
                const original=document.createElement('span');original.className='cbp-original';
                const translated=document.createElement('span');translated.className='cbp-translation';translated.lang='ru';translated.dir='ltr';translated.hidden=true;el.append(original,translated);
                const append=(parent,segments)=>{
                    let word;
                    const separate=()=>{
                        if(word){parent.append(document.createTextNode(' '));word=null;}
                    };
                    for(const segment of expandWordTimings(segments,this.panelLyricLanguage)){
                        const parts=[...segment.text.matchAll(/\s+|\S+/gu)];
                        for(const part of parts){
                            if(/^\s/u.test(part[0])){separate();continue;}
                            if(!word){word=document.createElement('span');word.className='cbp-word';parent.append(word);}
                            const span=document.createElement('span');span.className='cbp-syllable';
                            if(segment.estimated)span.dataset.estimated='';
                            span.textContent=part[0];
                            const duration=segment.end-segment.start;
                            nodes.push({...segment,el:span,text:part[0],
                                start:segment.start+duration*part.index/segment.text.length,
                                end:segment.start+duration*(part.index+part[0].length)/segment.text.length});
                            word.append(span);
                        }
                        if(segment.space)separate();
                    }
                };
                if(line.syllables.length)append(original,line.syllables);else original.textContent=line.text;
                for(const voice of line.background){const bg=document.createElement('span');bg.className='cbp-backing';bg.setAttribute('aria-label','Бэк-вокал');append(bg,voice);original.append(bg);}
                if(line.start!==null){el.dataset.startMs=line.start;el.onclick=()=>this.seekPanelLyric(line.start);}
                fragment.append(el);this.panelSyllableNodes.push(nodes);
                const firstLetter=line.text.match(/\p{L}/u)?.[0]||'';
                el.style.setProperty('--cbp-syllable-direction',/[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]/.test(firstLetter)?'270deg':'90deg');
            }
            if(fragment.querySelector('[data-estimated]')){status.textContent+= ' · часть слогов рассчитана по словам';}
            list.append(fragment);
            this.panelHighlightMode=null;this.updatePanelHighlight();
            this.renderPanelVocalists(list,this.panelLyricLines);
            this.syncPanelLyrics();this.updateLyricsClock();this.updatePanelTranslation();this.updatePanelMediaPicker?.();
            this.applyOnlineVocalists(this.panelLyricLines,list).catch(()=>{});
        },
        async loadPanelLyrics(force=false) {
            if(!this.lyricsPanel)return;
            const source=this.settings.lyricsSource,playingURI=Spicetify.Player.data?.item?.uri;
            if(source!=='off'&&this.panelAudioURI()===playingURI&&this.isPanelVideoTrack()){
                await this.restorePanelVideoEdition(playingURI);
                if(this.settings.lyricsSource!==source||Spicetify.Player.data?.item?.uri!==playingURI)return;
            }
            const uri=this.panelAudioURI(),key=source+':'+uri+':'+this.settings.lyricsDuet+(playingURI&&playingURI!==uri?':'+playingURI:'');
            const clip=playingURI&&playingURI!==uri;
            const sync=clip?this.preparePanelClipTiming(playingURI,uri):null;
            if(this.onlineVocalLookup&&(source==='off'||this.onlineVocalLookup.uri!==uri)){
                this.onlineVocalLookup.controller.abort();
                this.onlineVocalLookup=null;
            }
            if(!force&&this.panelLyricKey===key){this.updatePanelTranslation();return;}
            this.panelClipAnchorArmed=false;this.panelLyricTimingURI=null;this.panelLyricTimingSource=null;this.panelLyricKey=key;this.setLyricReading("",false);this.lyricsPanel.style.removeProperty('--cbp-visible-lyrics-height');this.releaseSpicyLoader();this.cancelPanelTranslation();
            clearTimeout(this.spicyLateTimer);this.spicyLateTimer=null;
            this.prefetchTranslation?.controller.abort();
            this.duetLiveRow=null;this.duetBackingCursor=null;this.panelDuetAnchor=undefined;
            const token=++this.lyricRequest;this.panelLyricLines=[];this.panelLyricIndex=-1;this.clockLineSource=null;this.panelTimelineSource=null;this.panelTimeline=[];this.panelRowNodes=[];this.panelStateIndex=undefined;this.translationIdleLines=null;this.panelSyllableNodes=[];this.syllableCursor=null;this.panelClock=null;this.panelHasSyllables=false;
            const status=this.lyricsPanel.querySelector('[role="status"]'),list=this.lyricsPanel.querySelector('.cbp-lines');this.lyricsPanel.dataset.cinemaMotion='false';this.lyricsPanel.dataset.cinematic='false';status.dataset.error='false';list.replaceChildren();list.scrollTop=0;this.updateLyricsClock();
            if(source==='off')return;
            if(!/^spotify:track:[a-zA-Z0-9]+$/.test(uri)){status.textContent='Включи песню, чтобы увидеть текст';return;}
            status.textContent=source==='spicy'?'Spicy Lyrics: загружаю текст и тайминги…':'Загружаю текст Spotify…';
            const current=()=>token===this.lyricRequest&&this.settings.lyricsSource===source&&this.panelAudioURI()===uri&&Spicetify.Player.data?.item?.uri===playingURI;
            const origin=Spicetify.Platform?.History?.location;
            let previewTimer,loaderTimer,previewShown=false,spicyReady=false;
            const preview=()=>{
                this.panelSpotifyTiming(uri,playingURI).then(async({data,timingURI})=>{
                    if(sync)await sync;
                    const exact=clip&&timingURI===playingURI;
                    if(!current()||!panelLines(data,'spotify').length||(spicyReady||this.panelLyricTimingSource==='spicy')&&(!exact||this.panelLyricTimingURI===playingURI))return;
                    this.presentPanelLyrics(data,'spotify',timingURI);previewShown=true;
                    status.textContent='Spotify · синхронизация по строкам · ожидаю тайминги Spicy Lyrics';
                }).catch(()=>{});
            };
            if(source==='spicy'){
                if(clip)preview();
                else previewTimer=setTimeout(preview,200);
            }
            try{
                if(sync)await sync;
                if(!current())return;
                let data,timingURI;
                if(source==='spicy'){
                    const ready=!force&&!clip&&this.spicyReadyTracks?.get(uri);
                    data=ready&&ready.expires>Date.now()?ready.data:await this.preparedLyrics?.('spicy',uri,force);
                    if(!current())return;
                    const exactSpicy=value=>this.hasSpicySyllables(value,uri)&&(!clip||value?.timingURI===playingURI);
                    let hasTiming=exactSpicy(data);
                    if(!hasTiming){
                        loaderTimer=setTimeout(()=>{if(current()&&this.hasSpicyLoader())this.ensureSpicyLoader(token);},80);
                        data=await this.readPanelSpicy(uri)||data;
                        clearTimeout(loaderTimer);
                        hasTiming=exactSpicy(data);
                    }
                    if(!current())return;
                    if(data&&!panelLines(data,'spicy').length)data=null;
                    const started=Date.now();
                    let spicyPreview=false;
                    while(!hasTiming&&Date.now()-started<(data?6500:24000)){
                        if(!current())return;
                        if(data&&!spicyPreview){
                            if(!clip||this.panelLyricTimingURI!==playingURI||data.timingURI===playingURI){
                                this.presentPanelLyrics(data,'spicy');
                                previewShown=true;
                            }
                            spicyPreview=true;
                            clearTimeout(previewTimer);
                        }
                        const elapsed=Date.now()-started;
                        if(!this.hasSpicyLoader()&&elapsed>=1200)break;
                        const update=this.waitSpicyUpdate(token,elapsed<1000?100:650);
                        if(this.hasSpicyLoader()){
                            this.ensureSpicyLoader(token);
                            const cardActive=document.querySelector('#SpicyLyricsNPVCard #SpicyLyricsPage');
                            if(elapsed>=(cardActive?4000:1000))this.startSpicyPageLoader(token,origin);
                        }
                        await update;
                        if(!current())return;
                        const next=await this.readPanelSpicy(uri);
                        if(!current())return;
                        hasTiming=exactSpicy(next);
                        if(hasTiming||(!data||clip&&next?.timingURI===playingURI&&data.timingURI!==playingURI)&&panelLines(next,'spicy').length){
                            if(!hasTiming)spicyPreview=false;
                            data=next;
                        }
                        if(!previewShown&&Date.now()-started>=4000)status.textContent='Ожидаю ответ Spicy Lyrics…';
                    }
                    if(hasTiming){if(!clip)this.rememberSpicyReady(uri,data);}
                    else if(this.hasSpicyLoader())this.watchLateSpicy(uri,current,playingURI);
                    if(!hasTiming&&spicyPreview)return;
                    if(!data&&previewShown){status.textContent='Spotify · синхронизация по строкам · Spicy Lyrics пока недоступен';return;}
                    if(!data)throw Error('Spicy Lyrics не вернул текст. Проверь, что его карточка Lyrics включена в настройках расширения. Spotify можно выбрать отдельно.');
                }else ({data,timingURI}=await this.panelSpotifyTiming(uri,playingURI,force));
                if(!current())return;
                spicyReady=true;clearTimeout(previewTimer);this.presentPanelLyrics(data,source,timingURI);
            }catch(error){if(current()&&!previewShown){status.dataset.error='true';status.textContent='Текст недоступен. '+(error.message||'Попробуй другой трек.');}}
            finally{clearTimeout(previewTimer);clearTimeout(loaderTimer);this.releaseSpicyLoader(token);}
        },
        updatePanelHighlight() {
            const mode=this.settings.lyricsHighlight||'letters';
            if(this.panelHighlightMode===mode)return;
            this.panelHighlightMode=mode;
            this.syllableCursor=null;this.duetBackingCursor=null;
            for(const row of this.panelSyllableNodes||[])for(const segment of row){
                segment.fill=null;segment.letterPosition=undefined;
                if(mode==='letters'){
                    segment.letters=Array.from(segment.text,text=>{
                        const letter=document.createElement('span');
                        letter.className='cbp-letter';letter.textContent=text;letter.dataset.letter=text;
                        return letter;
                    });
                    segment.el.replaceChildren(...segment.letters);
                    segment.el.style.removeProperty('--cbp-segment-emphasis');
                }else{
                    segment.el.textContent=segment.text;
                    segment.letters=null;
                }
            }
            this.syncPanelLyrics();
        },
        syncPanelLyrics(progress=playerValue('getProgress')) {
            if(this.lyricsPanel?.dataset.reading==='hold')return;
            if(this.settings?.lyricsSource==='off'||!this.panelLyricLines?.length)return;
            progress=this.panelLyricProgress(progress);
            const index=this.syncPanelTimeline(progress);
            if(this.duetLiveRow){const cursor=this.syllableCursor;this.syllableCursor=this.duetBackingCursor;this.syncPanelSyllables(index-1,progress);this.duetBackingCursor=this.syllableCursor;this.syllableCursor=cursor;}
            this.syncPanelSyllables(index,progress);
        },
        syncPanelSyllables(index,progress) {
            const source=this.panelSyllableNodes?.[index];if(!source?.length)return;
            const update=(word)=>{
                const fill=progress<word.start?0:word.end===word.start?1:clamp((progress-word.start)/(word.end-word.start),0,1),percent=Math.round(fill*1000)/10;
                if(word.fill!==percent){word.fill=percent;word.el.style.setProperty('--cbp-fill',percent+'%');}
                if(word.letters){
                    const length=word.letters.length,position=fill*length,previous=word.letterPosition;
                    if(position!==previous){
                        // Only letters crossed by the playback cursor can change.
                        const first=previous===undefined?0:Math.floor(Math.min(previous,position));
                        const last=previous===undefined?length-1:Math.min(length-1,Math.floor(Math.max(previous,position)));
                        for(let i=first;i<=last;i++){
                            const amount=clamp(position-i,0,1);
                            if(previous!==undefined&&amount===clamp(previous-i,0,1))continue;
                            const style=word.letters[i].style;
                            const emphasis=amount>0&&amount<1?Math.sin(amount*Math.PI):0;
                            style.setProperty('--cbp-fill',Math.round(amount*1000)/10+'%');
                            style.setProperty('--cbp-letter-emphasis',emphasis.toFixed(3));
                            style.setProperty('--cbp-letter-scale',(1+emphasis*.08).toFixed(3));
                        }
                        word.letterPosition=position;
                    }
                }
                if(!word.letters){
                    const emphasis=fill>0&&fill<1?Math.sin(fill*Math.PI).toFixed(3):'0';
                    if(word.el.style.getPropertyValue('--cbp-segment-emphasis')!==emphasis)word.el.style.setProperty('--cbp-segment-emphasis',emphasis);
                }
                const active=progress>=word.start&&progress<word.end;
                if(word.active!==active){word.active=active;word.el.classList.toggle('cbp-syllable-active',active);}
            };
            let state=this.syllableCursor;
            if(!state||state.source!==source||progress<state.progress){
                const ordered=this.panelSortedSyllables||=new WeakMap();
                let nodes=ordered.get(source);
                if(!nodes){nodes=source.slice().sort((a,b)=>a.start-b.start);ordered.set(source,nodes);}
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
