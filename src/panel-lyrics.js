    function panelLines(payload, source) {
        if(typeof payload==='string'){try{payload=JSON.parse(payload);}catch{return [];}}
        const data=source==='spotify'?payload?.lyrics:payload;
        const list=source==='spotify'?data?.lines:data?.Content;if(!Array.isArray(list))return [];
        const synced=source==='spotify'?data.syncType!=='UNSYNCED':data.Type!=='Static';
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
            const active=this.settings?.lyricsSource!=='off'&&!document.hidden&&playerValue('isPlaying',false);
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
            if(!force&&this.panelLyricKey===key)return;this.panelLyricKey=key;this.releaseSpicyLoader();
            const token=++this.lyricRequest;this.panelLyricLines=[];this.panelLyricIndex=-1;this.panelSyllableNodes=[];this.panelClock=null;this.panelHasSyllables=false;
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
                const syllableMode=this.panelLyricLines.some(l=>l.syllables.length);
                this.panelHasSyllables=this.panelLyricLines.some(l=>l.syllables.length||l.background.length);
                status.textContent=!this.panelLyricLines.length?'Для этой песни текст не найден':source==='spicy'?(syllableMode?'Spicy Lyrics · синхронизация по слогам':'Spicy Lyrics · источник дал только строки, без таймингов слогов'):'Spotify · синхронизация по строкам';
                const fragment=document.createDocumentFragment();
                for(const line of this.panelLyricLines){
                    const el=document.createElement(line.start===null?'p':'button');el.className='cbp-line';el.dir='auto';const nodes=[];
                    const append=(parent,segments)=>{for(const segment of segments){const span=document.createElement('span');span.className='cbp-syllable';span.textContent=segment.text;parent.append(span);if(segment.space)parent.append(document.createTextNode(' '));nodes.push({el:span,...segment});}};
                    if(line.syllables.length)append(el,line.syllables);else el.textContent=line.text;
                    for(const voice of line.background){const bg=document.createElement('span');bg.className='cbp-backing';append(bg,voice);el.append(bg);}
                    if(line.start!==null)el.onclick=()=>{this.panelClock=null;Spicetify.Player.seek(line.start);};
                    fragment.append(el);this.panelSyllableNodes.push(nodes);
                    const firstLetter=line.text.match(/\p{L}/u)?.[0]||'';
                    el.style.setProperty('--cbp-syllable-direction',/[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]/.test(firstLetter)?'270deg':'90deg');
                }
                list.append(fragment);
                this.syncPanelLyrics();this.updateLyricsClock();
            }catch(error){if(current())status.textContent='Текст недоступен. '+(error.message||'Попробуй другой трек.');}
            finally{this.releaseSpicyLoader(token);}
        },
        syncPanelLyrics(progress=playerValue('getProgress')) {
            if(this.settings?.lyricsSource==='off'||!this.panelLyricLines?.length)return;
            if(this.panelTimelineSource!==this.panelLyricLines){
                this.panelTimelineSource=this.panelLyricLines;
                this.panelTimeline=this.panelLyricLines.map((line,index)=>({start:line.start,index})).filter(l=>l.start!==null).sort((a,b)=>a.start-b.start||a.index-b.index);
                this.panelList=this.lyricsPanel.querySelector('.cbp-lines');
            }
            let lo=0,hi=this.panelTimeline.length;
            while(lo<hi){const mid=(lo+hi)>>>1;if(this.panelTimeline[mid].start<=progress)lo=mid+1;else hi=mid;}
            const index=lo?this.panelTimeline[lo-1].index:-1,list=this.panelList;
            if(index!==this.panelLyricIndex){
                this.panelLyricIndex=index;
                [...list.children].forEach((el,i)=>{el.setAttribute('aria-current',String(i===index));el.dataset.state=i<index?'past':i===index?'current':'future';});
                const el=list.children[index];if(el)list.scrollTo({top:el.offsetTop-list.offsetTop-list.clientHeight/2+el.clientHeight/2,behavior:this.reduced.matches?'instant':'smooth'});
            }
            for(const word of this.panelSyllableNodes?.[index]||[]){
                const fill=progress<word.start?0:word.end===word.start?1:clamp((progress-word.start)/(word.end-word.start),0,1),percent=Math.round(fill*1000)/10;
                if(word.fill!==percent){word.fill=percent;word.el.style.setProperty('--cbp-fill',percent+'%');}
                const active=progress>=word.start&&progress<word.end;
                if(word.active!==active){word.active=active;word.el.classList.toggle('cbp-syllable-active',active);}
            }
        }
    });
