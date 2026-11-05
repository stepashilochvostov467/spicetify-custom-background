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
            const s=this.settings;let mean=null,palette=null;
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
                            sample.mean=sum/(pixels.length/4);sample.palette=analyzePixels(pixels).text;
                        }catch{sample.failed=true;}
                    }
                    if(sample?.media===media){mean=sample.mean;palette=sample.palette;}
                }
            }
            const automatic=s.colorMode!=='custom',ink=automatic?(palette||'#b1d4f5'):s.color,key=ink+':'+s.lyricsDim+':'+automatic;
            this.lyricsPanel.dataset.adaptive=String(automatic);
            if(this.panelContrastKey===key)return;this.panelContrastKey=key;
            const rgb=ink.match(/[0-9a-f]{2}/gi).map(x=>parseInt(x,16)),light=luminance(rgb)>.179,scrim=light?0:255;
            let muted=rgb;
            for(let weight=.82;weight<=1.001;weight+=.02){muted=rgb.map(c=>Math.round(c*weight+scrim*(1-weight)));const m=luminance(muted);if((Math.max(m,scrim?1:0)+.05)/(Math.min(m,scrim?1:0)+.05)>=4.5)break;}
            this.lyricsPanel.style.setProperty('--cbp-panel-ink',ink);
            this.lyricsPanel.style.setProperty('--cbp-panel-muted-ink','#'+muted.map(c=>c.toString(16).padStart(2,'0')).join(''));
            this.lyricsPanel.style.setProperty('--cbp-panel-scrim',`rgba(0,0,0,${s.lyricsDim})`);
            this.lyricsPanel.style.setProperty('--cbp-panel-outline',light?'#000c':'#ffffffd9');
            this.lyricsPanel.style.textShadow=light?'0 1px 2px #0008':'0 1px 2px #ffffff99';
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
