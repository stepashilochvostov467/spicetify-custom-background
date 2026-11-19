    // Media for two upcoming tracks; translation for the next two English tracks.
    Object.assign(APP,{
        preparedTracks:new Map(),prefetchBytes:0,
        upcomingTracks(limit=2) {
            const seen=new Set([Spicetify.Player.data?.item?.uri]);
            let queue;
            try{queue=Spicetify.Platform?.PlayerAPI?.getQueue?.();}catch{}
            const groups=Array.isArray(queue?.queued)&&Array.isArray(queue?.nextUp)
                ? [queue.queued,queue.nextUp]
                : [Spicetify.Queue?.nextTracks||[]];
            const maximum=Math.min(10,limit),tracks=[];
            if(maximum<=0)return tracks;
            for(const group of groups)for(const item of group){
                const track=item?.contextTrack||item;
                if(!/^spotify:track:[a-zA-Z0-9]+$/.test(track?.uri)||seen.has(track.uri))continue;
                seen.add(track.uri);
                tracks.push(track);
                if(tracks.length>=maximum)return tracks;
            }
            return tracks;
        },
        getPreparedTrack(uri) {const entry=this.preparedTracks.get(uri);return entry&&Date.now()-entry.at<300000?entry:null;},
        async preparedLyrics(source,uri,force=false) {
            if(force)return null;
            const entry=this.getPreparedTrack(uri);
            return source==='spotify'?entry?.spotifyLyrics||null:entry?.spicyLyrics||null;
        },
        clearTrackPrefetch() {
            clearTimeout(this.prefetchTimer);this.prefetchTimer=null;
            for(const entry of this.preparedTracks.values())entry.controller.abort();
            this.preparedTracks.clear();this.prefetchBytes=0;this.prefetchQueueKey=null;this.prefetchRevision=(this.prefetchRevision||0)+1;
        },
        scheduleTrackPrefetch() {
            if(this.settings.lyricsSource==='off'||document.hidden){this.clearTrackPrefetch();return;}
            const current=Spicetify.Player.data?.item?.uri;
            const upcoming=this.upcomingTracks(this.settings.lyricsTranslation?10:2);
            const key=JSON.stringify([current,...upcoming.map(track=>track.uri)]);
            if(key!==this.prefetchQueueKey){
                const changedTrack=this.prefetchForegroundURI!==current;
                this.prefetchForegroundURI=current;
                this.prefetchQueueKey=key;
                this.prefetchRevision=(this.prefetchRevision||0)+1;
                const relevant=new Set([current,...upcoming.map(track=>track.uri)]);
                for(const [uri,entry] of this.preparedTracks){
                    if(!relevant.has(uri)||(changedTrack&&uri!==current&&(entry.lyricsTask||entry.mediaTask))){
                        entry.controller.abort();
                        this.prefetchBytes-=entry.blob?.size||0;
                        this.preparedTracks.delete(uri);
                    }
                }
                this.prefetchTranslation?.controller.abort();
                if(this.prefetchRunning)this.prefetchAgain=true;
                if(changedTrack&&current){
                    this.prefetchResumeAt=Date.now()+1000;
                    clearTimeout(this.prefetchTimer);this.prefetchTimer=null;
                }
            }
            if(this.prefetchTimer)return;
            this.prefetchTimer=setTimeout(()=>{this.prefetchTimer=null;this.runTrackPrefetch().catch(()=>{});},Math.max(150,(this.prefetchResumeAt||0)-Date.now()));
        },
        async runTrackPrefetch() {
            if(this.settings.lyricsSource==='off'||document.hidden)return;
            if(this.prefetchRunning){this.prefetchAgain=true;return;}
            this.prefetchRunning=true;
            const revision=this.prefetchRevision;
            try{
                const translate=this.settings.lyricsTranslation&&this.settings.lyricsTranslationEngine==='local';
                const upcoming=this.upcomingTracks(translate?10:2),current=Spicetify.Player.data?.item?.uri;
                if(this.prefetchCurrent!==current){this.prefetchCurrent=current;this.prefetchEmptyAttempts=0;}
                if(!upcoming.length&&(this.prefetchEmptyAttempts||0)<3){this.prefetchEmptyAttempts=(this.prefetchEmptyAttempts||0)+1;clearTimeout(this.prefetchTimer);this.prefetchTimer=setTimeout(()=>{this.prefetchTimer=null;this.runTrackPrefetch().catch(()=>{});},1000);}
                const keep=new Set([current,...upcoming.map(t=>t.uri)]);
                for(const [uri,entry] of this.preparedTracks)if(!keep.has(uri)||Date.now()-entry.at>=300000){entry.controller.abort();this.prefetchBytes-=entry.blob?.size||0;this.preparedTracks.delete(uri);}
                const prepare=(track,media)=>{
                    let entry=this.getPreparedTrack(track.uri);
                    if(!entry){entry={uri:track.uri,source:this.settings.lyricsSource,at:Date.now(),controller:new AbortController()};this.preparedTracks.set(track.uri,entry);}
                    const signal=entry.controller.signal;
                    if(!entry.spotifyLyrics&&Date.now()>=(entry.retryAt||0)){
                        if(!entry.lyricsTask)entry.lyricsTask=this.fetchSpotifyPanelData(track.uri).then(data=>{if(!signal.aborted&&this.panelLines(data,'spotify').length)entry.spotifyLyrics=data;else entry.retryAt=Date.now()+15000;}).catch(()=>{entry.retryAt=Date.now()+15000;}).finally(()=>{entry.lyricsTask=null;});
                    }
                    if(this.settings.lyricsSource==='spicy'&&this.readSpicy&&!entry.spicyLyrics){
                        this.readSpicy(track.uri).then(data=>{if(!signal.aborted&&data?.Content&&(!data.uri||data.uri===track.uri))entry.spicyLyrics=data;}).catch(()=>{});
                    }
                    if(media&&!entry.mediaTask&&!entry.canvasResolved){entry.mediaTask=this.prepareTrackMedia(track,entry).catch(()=>{}).finally(()=>{entry.mediaTask=null;});}
                    return entry;
                };
                for(const track of upcoming.slice(0,2))prepare(track,true);
                // Wait only in this background task, never inside the foreground loader.
                let english=0;
                for(let index=0;index<upcoming.length;index++){
                    if(this.settings.lyricsSource==='off'||document.hidden||Spicetify.Player.data?.item?.uri!==current||this.prefetchRevision!==revision){this.prefetchAgain=true;break;}
                    if(index>=2&&(!translate||english>=2))break;
                    const entry=prepare(upcoming[index],index<2);await this.withPrefetchSignal(entry.lyricsTask,entry.controller.signal).catch(()=>{});
                    if(entry.controller.signal.aborted)continue;
                    const data=entry.spicyLyrics||entry.spotifyLyrics,source=entry.spicyLyrics?'spicy':'spotify';if(!data)continue;
                    const language=this.lyricLanguage(data?.lyrics?.language||data.Language||data.language,this.panelLines(data,source));
                    if(language==='en'&&english<2){english++;await this.prepareTrackTranslation(entry);}
                }
            }finally{this.prefetchRunning=false;if(this.prefetchAgain){this.prefetchAgain=false;this.scheduleTrackPrefetch();}}
        },
        async prepareTrackTranslation(entry) {
            if(entry.translationComplete||entry.translationStopped||this.settings.lyricsTranslationEngine!=='local'||!this.settings.lyricsTranslation)return;
            if(this.panelTranslationAbort&&!this.panelTranslationAbort.signal.aborted&&!this.panelTranslationDone)return;
            const data=entry.spicyLyrics||entry.spotifyLyrics,source=entry.spicyLyrics?'spicy':'spotify';if(!data)return;
            const lines=this.panelLines(data,source);if(this.lyricLanguage(data?.lyrics?.language||data.Language||data.language,lines)!=='en')return;
            entry.translationController=new AbortController();const signal=AbortSignal.any([entry.controller.signal,entry.translationController.signal]);
            const cache=await this.getTranslationCache();
            // Warm the beginning, not the entire song: at most twelve unique lines per track.
            const texts=new Set();
            for(const line of lines){
                texts.add(line.text);
                if(texts.size===12)break;
            }
            for(const text of texts){
                if(signal.aborted||document.hidden||this.settings.lyricsSource==='off'||!this.settings.lyricsTranslation||this.settings.lyricsTranslationEngine!=='local')return;
                if(this.panelTranslationAbort&&!this.panelTranslationAbort.signal.aborted&&!this.panelTranslationDone)return;
                const key='local-enru-v3:en\n'+text;if(cache.has(key)||!/\p{L}/u.test(text))continue;
                this.prefetchTranslation={uri:entry.uri,controller:entry.translationController};
                try{const translated=await this.requestLocalRussianTranslation(text,signal);if(!signal.aborted)this.rememberTranslation(key,translated);}
                catch{if(!signal.aborted)entry.translationStopped=true;return;}
                finally{if(this.prefetchTranslation?.controller===entry.translationController)this.prefetchTranslation=null;}
            }
            entry.translationComplete=true;
        },
        async limitedMediaBlob(response,signal) {
            if(!response.ok)throw Error('Media unavailable');
            const max=20*1024*1024,parts=[];let bytes=0;
            if(Number(response.headers?.get('content-length'))>max)throw Error('Media too large');
            const reader=response.body?.getReader();
            if(reader){try{while(true){if(signal.aborted)throw Error('Cancelled');const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>max)throw Error('Media too large');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}}
            else{const data=await response.arrayBuffer();if(data.byteLength>max)throw Error('Media too large');parts.push(data);}
            return new Blob(parts,{type:response.headers?.get('content-type')||'video/webm'});
        },
        withPrefetchSignal(task,signal) {
            return new Promise((resolve,reject)=>{
                const abort=()=>reject(new DOMException('Cancelled','AbortError'));
                if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});
                Promise.resolve(task).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
            });
        },
        async prepareTrackMedia(track,entry) {
            const signal=AbortSignal.any([entry.controller.signal,AbortSignal.timeout(20000)]),meta=track.metadata||{};
            const choice=await this.readPanelMediaChoice(track.uri).catch(()=>null);
            if(signal.aborted||choice&&!['auto','canvas'].includes(choice.mode))return;
            let canvas=meta['canvas.fileId']||meta['canvas.url']?{fileId:meta['canvas.fileId'],url:meta['canvas.url'],type:meta['canvas.type']}:null;
            if(!canvas&&Spicetify.GraphQL?.Definitions?.canvas&&Spicetify.GraphQL?.Request){
                entry.canvasTask=this.withPrefetchSignal(Spicetify.GraphQL.Request(Spicetify.GraphQL.Definitions.canvas,{trackUri:track.uri}),signal);
                canvas=(await entry.canvasTask)?.data?.trackUnion?.canvas;
            }
            if(signal.aborted)return;entry.canvas=canvas;entry.canvasResolved=true;if(canvas?.type&&!/^VIDEO/.test(canvas.type)){entry.canvas=null;return;}let blob;
            if(canvas?.fileId){const plan=await this.getPanelCanvasPlan(canvas.fileId,signal),parts=[];let size=0;
                for(const url of plan.urls){const response=await fetch(url,{signal,credentials:'omit',referrerPolicy:'no-referrer'});const part=await this.limitedMediaBlob(response,signal);size+=part.size;if(size>20*1024*1024)throw Error('Canvas too large');parts.push(part);}
                blob=new Blob(parts,{type:plan.mime});
            }else if(/^https:\/\//.test(canvas?.url||''))blob=await this.limitedMediaBlob(await fetch(canvas.url,{signal,credentials:'omit',referrerPolicy:'no-referrer'}),signal);
            if(!blob||signal.aborted)return;
            entry.blob=blob;this.prefetchBytes+=blob.size;
            for(const candidate of this.preparedTracks.values()){
                if(this.prefetchBytes<=32*1024*1024)break;
                if(candidate.blob){this.prefetchBytes-=candidate.blob.size;candidate.blob=null;}
            }
        },
        async playPreparedCanvas(entry,signal) {
            const url=URL.createObjectURL(entry.blob);
            try{await this.playPanelURL(url,'canvas',signal);this.panelVideoObjectURL=url;}
            catch(error){URL.revokeObjectURL(url);throw error;}
        }
    });
