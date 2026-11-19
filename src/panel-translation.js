    const translationCacheKey='cbp_ru_translation_cache_v1';
    const translationMaxBytes=2*1024*1024;
    const translationTTL=30*24*60*60*1000;
    const translationPlain=value=>String(value).replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi,entity=>{
        const named={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};
        if(named[entity.toLowerCase()])return named[entity.toLowerCase()];
        const code=entity[2].toLowerCase()==='x'?parseInt(entity.slice(3,-1),16):Number(entity.slice(2,-1));
        return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):entity;
    });
    Object.assign(APP,{
        lyricLanguage(value,lines) {
            const tag=typeof value==='string'?value.trim().toLowerCase().replace(/_/g,'-'):'';
            const aliases={eng:'en',english:'en',rus:'ru',russian:'ru',spa:'es',fra:'fr',fre:'fr',deu:'de',ger:'de',por:'pt',ita:'it',jpn:'ja',kor:'ko',zho:'zh',chi:'zh'};
            const primary=tag.split('-')[0],language=aliases[primary]||primary;

            // Some lyric sources return "und" even for English. Check the words
            // before rejecting a song that the local EN→RU model can translate.
            const text=lines.map(line=>line.text).join(' ').slice(0,16000);
            if(/\p{Script=Cyrillic}/u.test(text)&&!/[a-z]/i.test(text))return 'ru';
            const words=text.toLowerCase().match(/[a-z]+/g)||[];
            const common=new Set(['i','you','your','me','my','we','the','and','is','it','that','to','of','for','with','not','but','this','have','on','in','can','be','just','wanna','gonna','don','been','she','he','they','them','her','him','want','know','never','all','so','do','get']);
            const found=new Set(words.filter(word=>common.has(word)));
            // Provider language tags can be wrong (e.g. English labeled pcm/sco).
            const letters=text.match(/\p{L}/gu)||[],latin=text.match(/[a-z]/gi)||[];
            if((found.size>=4||(['pcm','sco'].includes(language)&&found.size>=3))&&latin.length/Math.max(1,letters.length)>.85&&words.filter(word=>common.has(word)).length/Math.max(1,words.length)>=.12)return 'en';
            if(/^[a-z]{2,3}$/.test(language)&&!['und','unk','zxx','mul','xx','zz'].includes(language))return language;
            return found.size>=3?'en':'autodetect';
        },
        translationWithTone(source,translated) {
            if(/\b(car|driver|driving|honda|civic|tires|tyres|parking|road|wheels)\b/i.test(source)&&/\b(do|doing|doin[’']?|does|did) donuts\b/i.test(source))translated=translated.replace(/(?:едет|ездит|катается)(?:\s+в)?\s+(?:(?:плотных|тесных|узких|плотными|тесными|узкими)\s+)?круг(?:ах|ами|у)/gi,'крутит пятаки');
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
            this.panelTranslationAbort?.abort();this.panelTranslationAbort=null;this.panelTranslationKey=null;this.panelTranslationDone=true;
            if(!this.settings?.lyricsTranslation||this.settings.lyricsSource==='off'||this.settings.lyricsTranslationEngine!=='local'||document.hidden)this.scheduleLocalUnload?.();
            const status=this.lyricsPanel?.querySelector('.cbp-translation-status');if(status){status.textContent='';status.hidden=true;}
        },
        trimTranslationCache(cache) {
            const encoder=new TextEncoder();let bytes=0,kept=0;
            for(const [key,value] of [...cache].reverse()){
                const size=encoder.encode(JSON.stringify([key,value])).byteLength;
                if(bytes+size>translationMaxBytes||kept>=500)cache.delete(key);else{bytes+=size;kept++;}
            }
            this.translationCacheBytes=bytes;
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
                this.trimTranslationCache(cache);this.translationCache=cache;return cache;
            })();
            return this.translationCachePromise;
        },
        rememberTranslation(key,text) {
            const cache=this.translationCache;if(!cache)return;
            cache.delete(key);cache.set(key,{text,at:Date.now()});
            this.trimTranslationCache(cache);
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
            this.prefetchTranslation?.controller.abort();
            this.cancelPanelTranslation();this.panelTranslationKey=key;
            const controller=new AbortController();this.panelTranslationAbort=controller;const signal=controller.signal;
            const current=()=>!signal.aborted&&this.panelLyricLines===lines&&this.settings.lyricsTranslation===true&&this.settings.lyricsSource!=='off';
            const status=this.lyricsPanel.querySelector('.cbp-translation-status');status.hidden=false;
            if(/^ru(?:-|$)/.test(language)){status.textContent='Песня уже на русском';return;}
            if(engine==='local'&&!/^en(?:-|$)|^eng$/.test(language)){
                status.textContent='Локальная модель: только английский → русский. Для другого языка выбери MyMemory в настройках.';return;
            }
            status.textContent=engine==='quality'?'Перевожу с контекстом · Qwen на этом компьютере…':engine==='local'?'Готовлю локальный перевод…':'Перевожу на русский · MyMemory…';
            const contexts=new Map();
            const context=text=>{if(!contexts.has(text))contexts.set(text,this.qualityTranslationContext(lines,text));return contexts.get(text);};
            const cacheKey=text=>engine==='quality'?'qwen3-4b-context-v1:'+language+'\n'+JSON.stringify(context(text))+'\n'+text:(engine==='local'?'local-enru-v3:':'')+language+'\n'+text;
            let completed=0,failed=0,quota=false,firstError='';
            const groups=new Map(),positions=new Map();
            for(let i=0;i<lines.length;i++){
                const text=lines[i].text;if(!/\p{L}/u.test(text))continue;
                let group=groups.get(text);if(!group){group=[];groups.set(text,group);}if(nodes[i])group.push(nodes[i]);
                if(!positions.has(text))positions.set(text,[]);positions.get(text).push(i);
            }
            const apply=(text,translation)=>{if(!current())return;const result=engine==='quality'?translation:this.translationWithTone(text,translation);for(const el of groups.get(text)||[]){if(el.textContent!==result)el.textContent=result;const hide=!result||result===text;if(el.hidden!==hide)el.hidden=hide;}this.schedulePanelAnchor();};
            this.panelTranslationDone=false;
            try{
                const cache=await this.getTranslationCache();if(!current())return;
                const unique=[...groups.keys()];
                const pending=[];
                for(const text of unique){const cached=cache.get(cacheKey(text));if(cached&&Date.now()-cached.at<translationTTL){apply(text,cached.text);completed++;}else pending.push(text);}
                // Translate near the playing line first, while keeping every result attached
                // to its original row. Chorus repetitions share one request and cache entry.
                const priority=text=>{
                    const at=Math.max(0,this.panelLyricIndex);let score=Infinity;
                    for(const index of positions.get(text)||[])score=Math.min(score,index>=at?index-at:lines.length+at-index);
                    return score;
                };
                let consumed=0;const queue=engine!=='mymemory'?pending:pending.filter(text=>{consumed+=text.length;return consumed<=16000;});
                failed+=pending.length-queue.length;
                let next=0,networkFailures=0,localRetried=false;
                await Promise.all(Array.from({length:Math.min(engine!=='mymemory'?1:2,queue.length)},async()=>{
                    while(next<queue.length&&current()&&!quota){
                        let best=next;
                        for(let i=next+1;i<queue.length;i++)if(priority(queue[i])<priority(queue[best]))best=i;
                        [queue[next],queue[best]]=[queue[best],queue[next]];
                        const text=queue[next++];
                        try{
                            let translated;
                            if(engine==='quality')translated=await this.requestQualityRussianTranslation(text,signal,context(text));
                            else if(engine==='local'){
                                try{translated=await this.requestLocalRussianTranslation(text,signal);}
                                catch(error){
                                    if(!current()||localRetried)throw error;
                                    localRetried=true;this.closeLocalTranslator();
                                    translated=await this.requestLocalRussianTranslation(text,signal);
                                }
                            }else translated=await this.requestRussianTranslation(text,language,signal);
                            if(!current())return;networkFailures=0;
                            this.rememberTranslation(cacheKey(text),translated);apply(text,translated);completed++;
                        }catch(error){if(!current())return;failed++;networkFailures++;firstError||=error.message;if(error.quota||networkFailures>=3){quota=!!error.quota;controller.abort();}}
                    }
                }));
                if(this.panelTranslationAbort!==controller||this.panelLyricLines!==lines||!this.settings.lyricsTranslation||this.settings.lyricsSource==='off')return;
                status.textContent=quota?'Лимит MyMemory исчерпан. Готовые переводы сохранены.':failed?(engine!=='mymemory'?firstError+' Нажми ↻ для повторной попытки.':'Часть строк не переведена. Нажми ↻ для повторной попытки.'):completed?(engine==='quality'?'Локальный перевод · Qwen 4B · с контекстом':engine==='local'?'Локальный перевод · EN → RU · без дневной квоты':'Машинный перевод · MyMemory'):'Нет строк для перевода';
                // Translation changes row heights: re-center the active original/translation pair.
                this.panelLyricIndex=-1;this.syncPanelLyrics();
                if(engine==='local'){
                    if(this.localCacheFailed)status.textContent+=' · Кэш модели недоступен: при следующем запуске понадобится интернет.';
                    this.scheduleLocalUnload();
                }
            }catch{if(current())status.textContent='Перевод недоступен. Нажми ↻ для повторной попытки.';}
            finally{if(this.panelTranslationAbort===controller){this.panelTranslationDone=true;this.scheduleTrackPrefetch?.();}}
        }
    });
