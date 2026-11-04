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
