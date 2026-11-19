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
    const panelMediaOptions={auto:'Авто',canvas:'Canvas',clip:'Клип',cover:'Обложка',custom:'Свой ролик'};
    const panelTrackURI=()=>Spicetify.Player.data?.item?.uri||'';
    const validPanelTrackURI=uri=>/^spotify:track:[a-zA-Z0-9]+$/.test(uri||'');
    // Spotify's track query includes the official audio associations of a video.
    const panelTrackQuery={name:'getTrack',operation:'query',sha256Hash:'e7b1bf4e95cb3d733d48b442f93006e9712fd504e8b88d7a82e6e3bac9306a6b',value:null};
    const panelMediaStorageKey=uri=>'lyrics-media:'+uri;
    const panelTrackName=item=>{
        const title=item?.metadata?.title||item?.name||'';
        const artist=item?.metadata?.artist_name||item?.artists?.[0]?.name||'';
        return title&&artist?JSON.stringify([title.trim().toLowerCase(),artist.trim().toLowerCase()]):'';
    };
    const nativeClipSelectors='[data-testid="video-player-npv"],[data-testid="video-player"],[data-video-container]:not([data-testid^="ads-"])';
    Object.assign(APP,{
        initPanelBackdrop() {
            this.panelBackdrop=document.createElement('div');this.panelBackdrop.className='cbp-panel-backdrop';this.panelBackdrop.setAttribute('aria-hidden','true');
            this.lyricsPanel.prepend(this.panelBackdrop);
            this.initPanelMediaPicker();
            const root=document.getElementById('main');
            this.panelVideoObserver=new MutationObserver(records=>{
                if(this.settings.lyricsSource==='off'||document.hidden||(this.panelBackdrop.dataset.source==='canvas'&&this.panelMediaChoice?.mode!=='auto'))return;
                const changed=records.some(record=>record.type==='attributes'?record.target.tagName==='VIDEO':
                    [...record.addedNodes].some(node=>node.nodeType===1&&(node.tagName==='VIDEO'||node.querySelector('video'))));
                if(changed&&!this.panelVideoCheck)this.panelVideoCheck=setTimeout(()=>{this.panelVideoCheck=null;this.findPanelClip();},250);
            });
            this.panelObserverRoot=root;this.refreshPanelBackdrop();
            this.panelLayoutObserver=new ResizeObserver(()=>{
                this.updatePanelMediaGeometry();
                if(this.panelLyricLines?.length)this.schedulePanelAnchor();
            });
            this.panelLayoutObserver.observe(this.lyricsPanel);
            this.panelLayoutObserver.observe(this.panelBackdrop);
        },
        initPanelMediaPicker() {
            const button=document.createElement('button');
            button.type='button';button.dataset.mediaPicker='';
            button.textContent='Фон';button.setAttribute('aria-label','Фон этой песни');
            button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','cbp-media-picker');
            this.lyricsPanel.querySelector('header').prepend(button);
            const menu=document.createElement('div');
            menu.id='cbp-media-picker';menu.className='cbp-media-picker';menu.hidden=true;
            menu.innerHTML='<label>Фон этой песни <select></select></label><button type="button" data-start-clip hidden>Включить клип в Spotify</button><button type="button" data-sync-text hidden></button><button type="button" data-reset-sync hidden>Сбросить привязки текста</button><button type="button" data-upload>Выбрать видео</button><button type="button" data-remove>Удалить свой ролик</button><input type="file" accept="video/*,.mp4,.webm,.m4v,.mkv,.mov,.avi" hidden><output aria-live="polite"></output>';
            const select=menu.querySelector('select'),input=menu.querySelector('input');
            for(const [value,label] of Object.entries(panelMediaOptions))select.add(new Option(label,value));
            this.lyricsPanel.append(menu);
            this.panelMediaPicker={button,menu,select,output:menu.querySelector('output'),upload:menu.querySelector('[data-upload]'),remove:menu.querySelector('[data-remove]'),startClip:menu.querySelector('[data-start-clip]'),syncText:menu.querySelector('[data-sync-text]'),resetSync:menu.querySelector('[data-reset-sync]')};
            this.panelMediaPicker.startClip.onclick=async()=>{
                await this.startPanelNativeClip(true);
            };
            const toggle=()=>{
                if(button.disabled)return;
                menu.hidden=!menu.hidden;button.setAttribute('aria-expanded',String(!menu.hidden));
                if(!menu.hidden)select.focus();
            };
            this.panelMediaPicker.syncText.onclick=()=>{
                this.panelClipAnchorArmed=true;
                this.setLyricReading('browse');
                toggle();
                this.notify('Нажми на строку в момент, когда она звучит в клипе');
            };
            this.panelMediaPicker.resetSync.onclick=()=>{this.panelClipAnchorArmed=false;this.setPanelClipAnchors([]).catch(error=>this.report(error));};
            button.onclick=toggle;
            this.panelBackdrop.onclick=toggle;
            document.addEventListener('pointerdown',event=>{
                if(!menu.hidden&&!menu.contains(event.target)&&!button.contains(event.target)&&!this.panelBackdrop.contains(event.target)){
                    menu.hidden=true;button.setAttribute('aria-expanded','false');
                }
            },true);
            menu.addEventListener('keydown',event=>{
                if(event.key==='Escape'){event.stopPropagation();if(!menu.hidden)toggle();button.focus();}
            });
            select.onchange=()=>{
                this.panelMediaUpload?.abort();
                this.savePanelMediaChoice(this.panelAudioURI(),{mode:select.value}).catch(error=>this.report(error));
            };
            let uploadURI='';
            this.panelMediaPicker.upload.onclick=()=>{uploadURI=this.panelAudioURI();input.click();};
            this.panelMediaPicker.remove.onclick=()=>{
                this.panelMediaUpload?.abort();
                this.savePanelMediaChoice(this.panelAudioURI(),{video:null}).catch(error=>this.report(error));
            };
            input.onchange=async()=>{
                const file=input.files[0];input.value='';
                const uri=uploadURI,type=file&&backgroundVideoType(file);
                if(!file||!uri)return;
                if(!type){this.notify('Выбери видеофайл',true);return;}
                this.panelMediaUpload?.abort();
                const controller=this.panelMediaUpload=new AbortController();
                let video=file.type===type?file:file.slice(0,file.size,type);
                try{
                    try{await validateMedia(video);}
                    catch{
                        controller.signal.throwIfAborted();
                        this.notify('Подготавливаю ролик для этой песни');
                        video=await convertBackgroundVideo(file,AbortSignal.any([controller.signal,AbortSignal.timeout(180000)]));
                        await validateMedia(video);
                    }
                    controller.signal.throwIfAborted();
                    await this.savePanelMediaChoice(uri,{mode:'custom',video});
                    if(this.panelAudioURI()!==uri)this.notify('Ролик сохранён для выбранной песни');
                }catch(error){if(!controller.signal.aborted)this.report(error);}
                finally{if(this.panelMediaUpload===controller)this.panelMediaUpload=null;}
            };
            this.updatePanelMediaPicker();
        },
        panelAudioURI() {
            const uri=panelTrackURI();
            return this.panelVideoEditions?.get(uri)?.uri||uri;
        },
        rememberPanelVideoEdition(uri,edition) {
            const editions=this.panelVideoEditions||=new Map();
            editions.set(uri,edition);
            if(editions.size>20)editions.delete(editions.keys().next().value);
        },
        isPanelVideoTrack(item=Spicetify.Player.data?.item) {
            const type=item?.mediaType||item?.metadata?.media_type;
            return /^video$/i.test(type||'')||validPanelTrackURI(item?.associatedAudioUri)
                ||Boolean(Spicetify.Player.origin?.canSendSignal?.('switch-to-audio'));
        },
        async restorePanelVideoEdition(uri) {
            const existing=this.panelVideoEditions?.get(uri);
            if(existing||!validPanelTrackURI(uri)||panelTrackURI()!==uri||!this.isPanelVideoTrack())return existing;
            const item=Spicetify.Player.data.item;
            const linked=item.associatedAudioUri||item.metadata?.audio_association_uri;
            if(validPanelTrackURI(linked)&&linked!==uri){
                return this.savePanelVideoEdition(uri,{uri:linked,cover:item.metadata?.audio_association_image||''});
            }
            let lookup=this.panelEditionLookup;
            if(lookup?.uri!==uri){
                lookup=this.panelEditionLookup={uri,task:this.lookupPanelVideoEdition(uri)};
            }
            return lookup.task;
        },
        savePanelVideoEdition(uri,edition) {
            this.rememberPanelVideoEdition(uri,edition);
            images.run('readwrite',edition,'lyrics-edition:'+uri).catch(()=>{});
            return edition;
        },
        async lookupPanelVideoEdition(uri) {
            const stored=await images.run('readonly',undefined,'lyrics-edition:'+uri).catch(()=>null);
            if(validPanelTrackURI(stored?.uri)&&stored.uri!==uri){
                this.rememberPanelVideoEdition(uri,stored);
                return stored;
            }
            const gql=Spicetify.GraphQL;
            if(!gql?.Request||panelTrackURI()!==uri)return;
            const result=await this.withPrefetchSignal(
                Promise.resolve().then(()=>gql.Request(gql.Definitions?.getTrack||panelTrackQuery,{uri})),
                AbortSignal.timeout(2500)
            ).catch(()=>null);
            const items=result?.data?.trackUnion?.associationsV3?.audioAssociations?.items;
            if(!Array.isArray(items))return;
            for(const entry of items){
                const trackAudio=entry?.trackAudio;
                const audio=trackAudio?.data;
                const linked=audio?.uri||trackAudio?._uri;
                if(validPanelTrackURI(linked)&&linked!==uri&&audio?.playability?.playable!==false){
                    const cover=audio?.albumOfTrack?.coverArt?.sources?.[0]?.url||'';
                    return this.savePanelVideoEdition(uri,{uri:linked,cover});
                }
            }
        },
        async startPanelNativeClip(manual=false) {
            const player=Spicetify.Player.origin,uri=panelTrackURI(),item=Spicetify.Player.data?.item;
            if(!player?.canSendSignal?.('switch-to-video')||this.panelClipTransition)return;
            const transition=this.panelClipTransition={uri,name:panelTrackName(item),item,until:Date.now()+8000};
            this.mountPanelClipHost();
            this.updatePanelMediaPicker('Spotify переключается на клип…',true);
            try{
                await player.sendSignal('switch-to-video');
                if(uri===panelTrackURI())this.findPanelClip();
            }catch(error){
                if(uri===panelTrackURI()){
                    this.releasePanelClipHost();
                    this.updatePanelMediaPicker();
                    if(manual)this.report(error);
                }
            }finally{
                setTimeout(()=>{if(this.panelClipTransition===transition)this.panelClipTransition=null;},8000);
            }
        },
        async readPanelMediaChoice(uri) {
            const stored=await images.run('readonly',undefined,panelMediaStorageKey(uri));
            const video=stored?.video instanceof Blob?stored.video:null;
            const mode=Object.hasOwn(panelMediaOptions,stored?.mode)?stored.mode:'auto';
            return {mode:mode==='custom'&&!video?'auto':mode,video};
        },
        async savePanelMediaChoice(uri,change) {
            if(!/^spotify:track:[a-zA-Z0-9]+$/.test(uri))return;
            const operation=(this.panelMediaWrite||Promise.resolve()).catch(()=>{}).then(async()=>{
                const choice={...await this.readPanelMediaChoice(uri),...change};
                if(choice.mode==='custom'&&!choice.video)choice.mode='auto';
                await images.run('readwrite',choice,panelMediaStorageKey(uri));
            });
            this.panelMediaWrite=operation;
            await operation;
            if(this.panelAudioURI()===uri)await this.refreshPanelBackdrop(true);
        },
        updatePanelMediaPicker(message,switching=false) {
            const picker=this.panelMediaPicker;
            if(!picker)return;
            const choice=this.panelMediaChoice;
            const source=this.panelBackdrop.dataset.source||'cover';
            const caption=source==='cover'&&!this.panelBackdrop.querySelector('img')?'Фон недоступен':'Сейчас: '+panelMediaOptions[source];
            picker.button.disabled=!choice;
            picker.select.disabled=picker.upload.disabled=!choice;
            picker.select.value=choice?.mode||'auto';
            picker.select.querySelector('[value="custom"]').disabled=!choice?.video;
            picker.remove.hidden=!choice?.video;
            picker.startClip.hidden=switching||choice?.mode!=='clip'||source==='clip'||!Spicetify.Player.origin?.canSendSignal?.('switch-to-video');
            picker.output.textContent=message||caption;
            this.updatePanelClipTimingControls(picker);
        },
        clearPanelVideo() {
            this.hideNativePanelClip();
            this.panelClipReadyAbort?.abort();this.panelClipReadyAbort=null;
            if(this.panelContrastSample?.media===this.panelVideo)this.panelContrastSample=null;
            if(this.panelVideo){this.panelVideo.pause();this.panelVideo.srcObject=null;this.panelVideo.removeAttribute('src');this.panelVideo.load();this.panelVideo.remove();this.panelVideo=null;}
            this.panelVideoStream?.getTracks().forEach(t=>t.stop());this.panelVideoStream=null;
            if(this.panelVideoObjectURL)URL.revokeObjectURL(this.panelVideoObjectURL);this.panelVideoObjectURL=null;this.panelClipSource=null;this.panelPlaybackVideo=null;this.panelWaitingSource=null;
        },
        syncPanelBackdropPlayback() {
            const video=this.panelVideo;if(!video){this.updatePanelContrast();return;}
            const playing=!document.hidden&&this.settings.lyricsSource!=='off'&&playerValue('isPlaying',false);
            if(!playing){if(!video.paused)video.pause();}
            else if(video.paused&&this.panelPlaybackVideo!==video){this.panelPlaybackVideo=video;video.play().catch(()=>{}).finally(()=>{if(this.panelPlaybackVideo===video)this.panelPlaybackVideo=null;});}
            this.updatePanelContrast();
        },
        async refreshPanelBackdrop(force=false) {
            if(!this.panelBackdrop)return;
            const item=Spicetify.Player.data?.item,uri=item?.uri||'',enabled=this.settings.lyricsSource!=='off',key=enabled+':'+uri;
            const transition=this.panelClipTransition;
            const switched=transition&&uri!==transition.uri&&transition.until>=Date.now()&&transition.name&&panelTrackName(item)===transition.name;
            if(switched){
                const metadata=transition.item?.metadata||{};
                const edition={uri:transition.uri,cover:metadata.image_xlarge_url||metadata.image_large_url||metadata.image_url||''};
                this.savePanelVideoEdition(uri,edition);
            }
            if(transition&&(uri!==transition.uri||transition.until<Date.now()))this.panelClipTransition=null;
            let original=this.panelVideoEditions?.get(uri);
            if(!force&&key===this.panelBackdropKey){this.syncPanelBackdropPlayback();return;}
            this.panelBackdropKey=key;this.panelMediaAbort?.abort();
            if(switched&&this.panelClipHostKey)this.panelClipHostKey=key;
            if(!enabled||key!==this.panelClipHostKey)this.releasePanelClipHost();
            this.panelMediaAbort=new AbortController();
            const signal=this.panelMediaAbort.signal;this.panelCanvasPending=true;this.panelClipURL='';this.clearPanelVideo();clearTimeout(this.panelVideoCheck);this.panelVideoCheck=null;this.panelVideoObserver.disconnect();
            this.panelContrastSample=null;this.lyricsPanel.style.removeProperty('--cbp-media-ambient');this.lyricsPanel.style.removeProperty('--cbp-media-edges');this.lyricsPanel.style.removeProperty('--cbp-lyric-surface');this.lyricsPanel.style.setProperty('--cbp-media-ratio','1');this.panelBackdrop.replaceChildren();this.panelBackdrop.dataset.source='cover';
            this.panelMediaChoice=null;this.updatePanelMediaPicker();
            if(!enabled){this.panelCanvasPending=false;return;}
            const meta=item?.metadata||{};
            const insertCover=()=>{
                const cover=panelMediaURL(meta.image_xlarge_url||meta.image_large_url||meta.image_url||item?.album?.images?.[0]?.url||original?.cover);
                if(cover){const img=document.createElement('img');img.alt='';img.crossOrigin='anonymous';img.onload=()=>{if(this.panelBackdrop.contains(img))this.updatePanelContrast();};img.src=cover;this.panelBackdrop.append(img);}
                this.updatePanelContrast();
            };
            insertCover();

            const current=()=>!signal.aborted&&Spicetify.Player.data?.item?.uri===uri&&this.settings.lyricsSource!=='off';
            if(!/^spotify:track:[a-zA-Z0-9]+$/.test(uri)){this.panelCanvasPending=false;return;}
            try{
                if(!original&&this.isPanelVideoTrack(item)){
                    original=await this.restorePanelVideoEdition(uri);
                    if(!current())return;
                    if(original&&!this.panelBackdrop.querySelector('img'))insertCover();
                }
                const choice=await this.readPanelMediaChoice(original?.uri||uri).catch(()=>({mode:'auto',video:null}));
                if(!current())return;
                this.panelMediaChoice=choice;
                this.updatePanelMediaPicker();
                if(!['clip','auto'].includes(choice.mode))this.releasePanelClipHost();
                if(choice.mode==='cover')return;
                if(choice.mode==='custom'){
                    const url=URL.createObjectURL(choice.video);
                    try{
                        await this.playPanelURL(url,'custom',signal);
                        if(current())this.panelVideoObjectURL=url;
                        else URL.revokeObjectURL(url);
                    }catch{
                        URL.revokeObjectURL(url);
                        if(current()){
                            this.clearPanelVideo();
                            this.updatePanelMediaPicker('Ролик недоступен. Показываю обложку.');
                        }
                    }
                    return;
                }
                if(choice.mode!=='canvas'&&this.panelObserverRoot){
                    this.panelVideoObserver.observe(this.panelObserverRoot,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
                }
                if(choice.mode==='clip'||choice.mode==='auto'){
                    const clip=panelMediaURL(meta.video_url||meta['video.url']||meta.music_video_url);
                    if(clip){
                        this.panelClipURL=clip;
                        try{await this.playPanelURL(clip,'clip',signal);return;}
                        catch{if(!current())return;this.restorePanelCover('clip');}
                    }
                    if(choice.mode==='clip')return;
                    this.panelCanvasPending=false;
                    if(this.findPanelClip())return;
                    this.panelCanvasPending=true;
                }
                const prepared=this.getPreparedTrack?.(uri);
                if(prepared?.blob){try{await this.playPreparedCanvas(prepared,signal);if(current())return;}catch{if(!current())return;this.prefetchBytes-=prepared.blob?.size||0;prepared.blob=null;this.clearPanelVideo();}}
                let canvas=prepared?.canvas|| (meta['canvas.fileId']||meta['canvas.url']?{fileId:meta['canvas.fileId'],url:meta['canvas.url'],type:meta['canvas.type']}:null);
                if(!canvas&&Spicetify.GraphQL?.Definitions?.canvas&&Spicetify.GraphQL?.Request){
                    let timeout;try{const result=await Promise.race([Spicetify.GraphQL.Request(Spicetify.GraphQL.Definitions.canvas,{trackUri:uri}),new Promise((_,reject)=>timeout=setTimeout(()=>reject(Error('Canvas timeout')),6000))]);canvas=result?.data?.trackUnion?.canvas;}finally{clearTimeout(timeout);}
                }
                if(!current())return;
                if(canvas&&(!canvas.type||/^VIDEO/i.test(canvas.type))){
                    if(/^[a-zA-Z0-9_-]{8,160}$/.test(canvas.fileId||'')){
                        try{await this.playPanelCanvas(canvas.fileId,signal);if(current())return;}catch{if(!current())return;this.clearPanelVideo();}
                    }
                    const url=panelMediaURL(canvas.url);
                    if(url){try{await this.playPanelURL(url,'canvas',signal);if(current())return;}catch{if(!current())return;this.clearPanelVideo();}}
                }
            }catch{if(!current())return;}
            finally{
                if(current()){
                    this.panelCanvasPending=false;
                    if(this.panelMediaChoice?.mode==='clip'||this.panelMediaChoice?.mode==='auto')this.findPanelClip();
                    if(this.panelMediaChoice?.mode==='canvas'&&this.panelBackdrop.dataset.source!=='canvas'){
                        this.updatePanelMediaPicker('Canvas недоступен. Показываю обложку.');
                    }
                }
            }
        },
        updatePanelMediaGeometry() {
            const media=this.panelNativeClip|| (this.panelVideo?.readyState>=1?this.panelVideo:this.panelBackdrop?.querySelector('img'));
            this.positionNativePanelClip();
            const width=media?.videoWidth||media?.naturalWidth,height=media?.videoHeight||media?.naturalHeight;
            if(width&&height){const ratio=String(width/height);if(this.lyricsPanel.style.getPropertyValue('--cbp-media-ratio')!==ratio){this.lyricsPanel.style.setProperty('--cbp-media-ratio',ratio);this.schedulePanelAnchor();}}
        },
        newPanelVideo() {
            const video=document.createElement('video');video.muted=true;video.playsInline=true;video.loop=true;video.preload='auto';video.disablePictureInPicture=true;
            const updateGeometry=()=>{if(this.panelVideo===video)this.updatePanelMediaGeometry();};
            video.addEventListener('loadedmetadata',updateGeometry,{once:true});
            video.addEventListener('resize',updateGeometry);
            video.addEventListener('loadeddata',()=>{if(this.panelVideo===video)this.updatePanelContrast();},{once:true});
            this.panelBackdrop.append(video);this.panelVideo=video;return video;
        },
        paintPanelMediaColors(media) {
            const width=24,height=48;
            if(!this.panelContrastCanvas){
                this.panelContrastCanvas=document.createElement('canvas');
                this.panelContrastCanvas.height=height;
                this.panelContrastContext=this.panelContrastCanvas.getContext('2d',{willReadFrequently:true});
            }
            // Reset the origin-clean flag after encountering cross-origin media.
            this.panelContrastCanvas.width=width;
            const ctx=this.panelContrastContext;
            ctx.drawImage(media,0,0,width,height);
            const pixels=ctx.getImageData(0,0,width,height).data;
            const average=(x0,x1,y0,y1)=>{
                const rgb=[0,0,0];
                for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
                    const i=(y*width+x)*4;
                    for(let c=0;c<3;c++)rgb[c]+=pixels[i+c];
                }
                return rgb.map(value=>value/((x1-x0)*(y1-y0)));
            };
            const bottom=average(0,width,30,height);
            const surface=hex(bottom.map((value,index)=>[15,17,21][index]+value*.24));
            const left=hex(average(0,6,0,height).map(value=>12+value*.78));
            const right=hex(average(18,width,0,height).map(value=>12+value*.78));
            this.lyricsPanel.style.setProperty('--cbp-lyric-surface',surface);
            this.lyricsPanel.style.setProperty('--cbp-media-edges',`linear-gradient(90deg,${left},${right})`);
            this.lyricsPanel.style.setProperty('--cbp-media-ambient','url("'+this.panelContrastCanvas.toDataURL()+'")');
            let sum=0;
            for(let i=0;i<pixels.length;i+=4)sum+=.2126*linearRGB[pixels[i]]+.7152*linearRGB[pixels[i+1]]+.0722*linearRGB[pixels[i+2]];
            return {mean:sum/(pixels.length/4),palette:analyzePixels(pixels,true).accent};
        },
        updatePanelContrast() {
            if(!this.panelBackdrop||this.settings.lyricsSource==='off')return;
            this.updatePanelMediaGeometry();
            const s=this.settings,split=s.lyricsLayout!=='overlay';let mean=null,palette=null;
            {
                const media=this.panelVideo?.readyState>=2?this.panelVideo:this.panelBackdrop.querySelector('img');
                if(media){
                    const iw=media.videoWidth||media.naturalWidth,ih=media.videoHeight||media.naturalHeight;
                    let sample=this.panelContrastSample;
                    const source=media.currentSrc||media.src||media.srcObject;
                    const changed=!sample||sample.media!==media||sample.source!==source;
                    if(iw&&ih&&changed){
                        sample=this.panelContrastSample={media,source,mean:null,failed:false};
                        try{
                            Object.assign(sample,this.paintPanelMediaColors(media));
                        }catch{sample.failed=true;}
                    }
                    if(sample?.failed&&media===this.panelVideo&&!sample.coverPainted){
                        const cover=this.panelBackdrop.querySelector('img');
                        if(cover?.naturalWidth){
                            sample.coverPainted=true;
                            try{Object.assign(sample,this.paintPanelMediaColors(cover));}catch{}
                        }
                    }
                    if(sample?.media===media){mean=sample.mean;palette=sample.palette;}
                }
            }
            const surfaceColor=this.lyricsPanel.style.getPropertyValue('--cbp-lyric-surface')||'#15171d';
            const inputs=split+':'+s.lyricsDim+':'+mean+':'+palette+':'+surfaceColor;
            if(this.panelContrastKey&&this.panelContrastInputs===inputs)return;
            this.panelContrastInputs=inputs;
            const rgb=color=>color.match(/[0-9a-f]{2}/gi).map(value=>parseInt(value,16));
            const base=rgb(palette||'#f5f7ff');
            const surface=rgb(surfaceColor);
            const background=split?luminance(surface):(mean??0)*Math.pow(1-s.lyricsDim,2.2);
            const contrast=(color)=>{
                const foreground=luminance(color);
                return (Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05);
            };
            const target=(1.05/(background+.05)>=(background+.05)/.05)?255:0;
            const inkFor=(weight,threshold)=>{
                const tint=base.map(value=>Math.round(target+(value-target)*weight));
                for(let step=0;step<=10;step++){
                    const candidate=tint.map(value=>Math.round(value+(target-value)*step/10));
                    if(contrast(candidate)>=threshold)return hex(candidate);
                }
                return hex([target,target,target]);
            };
            const colors={ink:inkFor(.4,7),muted:inkFor(.96,4.5)};
            this.lyricsPanel.dataset.adaptive='true';
            const key=colors.ink+':'+colors.muted+':'+s.lyricsDim;
            if(this.panelContrastKey===key)return;this.panelContrastKey=key;
            this.lyricsPanel.style.setProperty('--cbp-panel-ink',colors.ink);
            this.lyricsPanel.style.setProperty('--cbp-panel-muted-ink',colors.muted);
            this.lyricsPanel.style.setProperty('--cbp-panel-scrim',`rgba(0,0,0,${s.lyricsDim})`);
            this.lyricsPanel.style.textShadow='none';
        },
        async playPanelURL(url,kind,signal) {
            this.clearPanelVideo();const video=this.newPanelVideo();video.style.opacity='0';
            const ready=panelMediaEvent(video,'loadeddata',signal);video.src=url;await ready;
            if(signal.aborted)throw Error('Cancelled');video.style.opacity='1';this.panelBackdrop.dataset.source=kind;this.updatePanelMediaPicker();
            video.onerror=()=>{if(this.panelVideo===video){this.restorePanelCover(this.panelBackdrop.dataset.source);this.findPanelClip();}};
            this.syncPanelBackdropPlayback();
        },
        showNativePanelClip(source,signal) {
            if(this.settings.lyricsLayout==='overlay'||typeof source.showPopover!=='function'||source.hasAttribute('popover'))return false;
            this.clearPanelVideo();
            source.setAttribute('popover','manual');
            source.dataset.cbpNativeClip='';
            this.panelNativeClip=source;
            this.panelClipSource=source;
            this.panelBackdrop.dataset.nativeClip='';
            try{source.showPopover();}
            catch{this.hideNativePanelClip();return false;}
            this.panelBackdrop.dataset.source='clip';
            this.updatePanelMediaGeometry();
            this.updatePanelMediaPicker();
            source.addEventListener('emptied',()=>{
                if(this.panelNativeClip===source)this.restorePanelCover('clip');
            },{once:true,signal});
            return true;
        },
        hideNativePanelClip() {
            const video=this.panelNativeClip;
            if(!video)return;
            video.hidePopover();
            video.removeAttribute('popover');
            delete video.dataset.cbpNativeClip;
            delete this.panelBackdrop.dataset.nativeClip;
            for(const name of ['left','top','width','height'])video.style.removeProperty('--cbp-native-'+name);
            this.panelNativeClip=null;this.panelNativeRect=null;
        },
        positionNativePanelClip() {
            const video=this.panelNativeClip;
            if(!video)return;
            const rect=this.panelBackdrop.getBoundingClientRect();
            const previous=this.panelNativeRect;
            const next=[rect.left,rect.top,rect.width,rect.height];
            if(previous?.video===video&&next.every((value,i)=>value===previous.rect[i]))return;
            this.panelNativeRect={video,rect:next};
            for(const [index,name] of ['left','top','width','height'].entries())video.style.setProperty('--cbp-native-'+name,next[index]+'px');
        },
        followPanelVideo(source,kind,signal) {
            if(source.readyState<2||signal.aborted)return false;
            if(this.showNativePanelClip(source,signal))return true;
            try{
                const capture=source.captureStream||source.mozCaptureStream;if(!capture)return false;
                const original=capture.call(source),tracks=original.getVideoTracks();
                if(!tracks.length){original.getTracks().forEach(t=>t.stop());return false;}
                const stream=new MediaStream(tracks.map(t=>t.clone()));original.getTracks().forEach(t=>t.stop());
                this.clearPanelVideo();this.panelVideoStream=stream;const video=this.newPanelVideo();video.srcObject=stream;this.panelClipSource=source;
                this.panelBackdrop.dataset.source=kind;this.updatePanelMediaPicker();this.syncPanelBackdropPlayback();
                stream.getVideoTracks().forEach(t=>t.addEventListener('ended',()=>{if(this.panelVideoStream===stream)this.restorePanelCover(kind);},{once:true}));return true;
            }catch{return false;}
        },
        mountPanelClipHost() {
            if(this.panelClipHostKey===this.panelBackdropKey)return;
            this.panelClipHostKey=this.panelBackdropKey;
            document.body.classList.add('cbp-clip-loading');
            const button=document.querySelector('[data-testid="control-button-npv"]');
            if(button?.getAttribute('aria-pressed')==='false'){
                this.panelClipOpenedNPV=true;
                button.click();
            }
        },
        releasePanelClipHost() {
            if(!this.panelClipHostKey)return;
            if(this.panelClipOpenedNPV){
                const button=document.querySelector('[data-testid="control-button-npv"]');
                if(this.spicyLoaderOwner!=null)this.spicyOpenedNPV=true;
                else if(button?.getAttribute('aria-pressed')==='true')button.click();
            }
            this.panelClipHostKey=null;
            this.panelClipOpenedNPV=false;
            document.body.classList.remove('cbp-clip-loading');
        },
        findPanelClip() {
            if(!['auto','clip'].includes(this.panelMediaChoice?.mode)||!this.panelBackdrop||this.settings.lyricsSource==='off'||document.hidden||this.panelMediaAbort.signal.aborted||this.panelCanvasPending)return false;
            const signal=this.panelMediaAbort.signal;
            const clipSelected=this.panelMediaChoice.mode==='clip';
            const playingNativeClip=this.isPanelVideoTrack();
            if(playingNativeClip)this.mountPanelClipHost();
            if(!clipSelected&&!playingNativeClip&&!this.panelClipTransition&&!this.panelAutoClipTried?.has(panelTrackURI())
                &&playerValue('isPlaying',false)&&Spicetify.Player.origin?.canSendSignal?.('switch-to-video')){
                const tried=this.panelAutoClipTried||=new Set();
                tried.add(panelTrackURI());
                if(tried.size>20)tried.delete(tried.values().next().value);
                this.startPanelNativeClip().catch(()=>{});
            }
            const source=document.querySelector(`:is(${nativeClipSelectors}) video,video:is(${nativeClipSelectors})`);
            if(source&&source!==this.panelClipSource){
                if(this.followPanelVideo(source,'clip',signal))return true;
                if(source.readyState<2&&this.panelWaitingSource!==source){
                    this.panelClipReadyAbort?.abort();this.panelWaitingSource=source;
                    const ready=this.panelClipReadyAbort=new AbortController();
                    source.addEventListener('loadeddata',()=>{this.panelWaitingSource=null;this.findPanelClip();},{once:true,signal:AbortSignal.any([signal,ready.signal])});
                }
            }
            if(this.panelBackdrop.dataset.source==='clip')return true;
            const meta=Spicetify.Player.data?.item?.metadata||{},url=panelMediaURL(meta.video_url||meta['video.url']||meta.music_video_url);
            if(url&&url!==this.panelClipURL){
                this.panelClipURL=url;
                if(this.panelMediaChoice.mode==='clip')this.updatePanelMediaPicker('Загружаю клип…');
                this.playPanelURL(url,'clip',signal).catch(()=>{
                    if(!signal.aborted&&this.panelBackdrop.dataset.source!=='clip')this.restorePanelCover('clip');
                });
            }else if(!url&&this.panelMediaChoice.mode==='clip'){
                this.updatePanelMediaPicker(playingNativeClip?'Ожидаю видео из плеера Spotify…':'Клип пока недоступен. Показываю обложку.');
            }
        },
        restorePanelCover(source) {
            this.clearPanelVideo();
            this.panelBackdrop.dataset.source='cover';
            this.updatePanelContrast();
            const explicit=this.panelMediaChoice?.mode===source;
            this.updatePanelMediaPicker(explicit?panelMediaOptions[source]+' недоступен. Показываю обложку.':undefined);
        },
        async getPanelAccessToken() {
            let token;try{token=Spicetify.Platform?.AuthorizationAPI?.getState?.()?.token?.accessToken;}catch{}
            if(!token){
                let provider,timer;try{provider=Spicetify.Platform?.Registry?.resolve?.(Symbol.for('TokenProvider'));}catch{}
                provider??=Spicetify.Platform?.AuthorizationAPI?._tokenProvider;
                try{token=(await Promise.race([provider?.getToken?.(),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Token timeout')),3000))]))?.accessToken;}finally{clearTimeout(timer);}
            }
            return token;
        },
        async getPanelCanvasPlan(fileId,signal) {
            if(!/^[a-zA-Z0-9_-]{8,160}$/.test(fileId||''))throw Error('Invalid Canvas id');
            const endpoint=`https://spclient.wg.spotify.com/manifests/v9/json/sources/${fileId}/options/supports_drm`;
            const token=await this.getPanelAccessToken();
            if(!token||signal.aborted)throw Error('Canvas unavailable');
            const requestSignal=AbortSignal.any([signal,AbortSignal.timeout(15000)]);
            const response=await fetch(endpoint,{headers:{Authorization:'Bearer '+token},signal:requestSignal});if(!response.ok)throw Error('Canvas manifest unavailable');
            const manifest=await response.json(),part=manifest.contents?.[0],base=manifest.base_urls?.[0];
            if(!part||!base||!manifest.initialization_template||!manifest.segment_template)throw Error('Invalid canvas manifest');
            const profiles=(part.profiles||[]).filter(profile=>{
                const mime=profile.mime_type||'video/'+profile.file_type;
                return profile.video_codec&&/^video\/(webm|mp4)$/.test(mime)
                    &&MediaSource.isTypeSupported(mime+'; codecs="'+profile.video_codec+'"');
            });
            const webm=profiles.filter(profile=>(profile.mime_type||'video/'+profile.file_type)==='video/webm');
            const supported=webm.length?webm:profiles;
            supported.sort((a,b)=>a.video_height-b.video_height);
            const profile=supported.find(candidate=>candidate.video_height>=480)||supported.at(-1);
            if(!profile)throw Error('No playable Canvas');
            const mime=(profile.mime_type||'video/'+profile.file_type)+'; codecs="'+profile.video_codec+'"';
            const variables={...part,...profile,file_type:profile.file_type||mime.split(/[\/;]/)[1]};
            const build=(template,time=0)=>new URL(template.replace(/{{(\w+)}}/g,(token,key)=>{
                if(key==='profile_id')return profile.id;
                if(key==='segment_timestamp')return time;
                return variables[key]??token;
            }),base).href;
            const step=Number(part.segment_length)*1000,start=Number(part.start_time_millis),end=Number(part.end_time_millis);
            if(!(step>0&&end>start&&end-start<=60000))throw Error('Canvas bounds invalid');
            const urls=[build(manifest.initialization_template)];for(let t=start;t<end;t+=step){if(urls.length>60)throw Error('Canvas too large');urls.push(build(manifest.segment_template,Math.round(t/1000)));}
            if(urls.some(url=>new URL(url).protocol!=='https:'))throw Error('Invalid media URL');
            return {urls,mime,requestSignal};
        },
        async playPanelCanvas(fileId,signal) {
            const {urls,mime,requestSignal}=await this.getPanelCanvasPlan(fileId,signal);
            if(signal.aborted)throw Error('Cancelled');this.clearPanelVideo();const video=this.newPanelVideo();video.style.opacity='0';
            const media=new MediaSource(),objectURL=URL.createObjectURL(media);this.panelVideoObjectURL=objectURL;
            const opened=panelMediaEvent(media,'sourceopen',requestSignal);video.src=objectURL;await opened;
            const buffer=media.addSourceBuffer(mime);let bytes=0;
            // Reveal the first decoded segment immediately; remaining segments keep buffering.
            const ready=panelMediaEvent(video,'loadeddata',requestSignal).then(()=>{if(!signal.aborted&&this.panelVideo===video){video.style.opacity='1';this.panelBackdrop.dataset.source='canvas';this.updatePanelMediaPicker();this.syncPanelBackdropPlayback();}});
            ready.catch(()=>{});
            for(const url of urls){
                if(new URL(url).protocol!=='https:')throw Error('Invalid media URL');
                const res=await fetch(url,{signal:requestSignal});if(!res.ok)throw Error('Canvas segment unavailable');
                const data=await res.arrayBuffer();bytes+=data.byteLength;if(bytes>20*1024*1024)throw Error('Canvas too large');
                const updated=panelMediaEvent(buffer,'updateend',requestSignal);buffer.appendBuffer(data);await updated;
            }
            if(media.readyState==='open')media.endOfStream();
            await ready;if(signal.aborted)throw Error('Cancelled');
            video.style.opacity='1';this.panelBackdrop.dataset.source='canvas';this.updatePanelMediaPicker();this.syncPanelBackdropPlayback();
            video.onerror=()=>{if(this.panelVideo===video){this.restorePanelCover(this.panelBackdrop.dataset.source);this.findPanelClip();}};
        }
    });
