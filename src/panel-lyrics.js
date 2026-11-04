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
