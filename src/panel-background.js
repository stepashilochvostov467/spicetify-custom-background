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
            this.panelVideoObserver=new MutationObserver(()=>{
                if(this.settings.lyricsSource==='off'||document.hidden||this.panelBackdrop.dataset.source==='canvas')return;
                clearTimeout(this.panelVideoCheck);this.panelVideoCheck=setTimeout(()=>this.findPanelClip(),250);
            });
            this.panelObserverRoot=root;this.refreshPanelBackdrop();
        },
        clearPanelVideo() {
            clearTimeout(this.panelContrastTimer);this.panelContrastTimer=null;
            if(this.panelVideo){this.panelVideo.pause();this.panelVideo.srcObject=null;this.panelVideo.removeAttribute('src');this.panelVideo.load();this.panelVideo.remove();this.panelVideo=null;}
            this.panelVideoStream?.getTracks().forEach(t=>t.stop());this.panelVideoStream=null;
            if(this.panelVideoObjectURL)URL.revokeObjectURL(this.panelVideoObjectURL);this.panelVideoObjectURL=null;this.panelClipSource=null;
        },
        syncPanelBackdropPlayback() {
            if(!this.panelVideo)return;
            if(document.hidden||this.settings.lyricsSource==='off'||!playerValue('isPlaying',false))this.panelVideo.pause();
            else this.panelVideo.play().catch(()=>{});
            this.updatePanelContrast();
            clearTimeout(this.panelContrastTimer);
            if(!document.hidden&&this.settings.lyricsSource!=='off'&&playerValue('isPlaying',false))this.panelContrastTimer=setTimeout(()=>this.syncPanelBackdropPlayback(),1800);
        },
        async refreshPanelBackdrop(force=false) {
            if(!this.panelBackdrop)return;
            const item=Spicetify.Player.data?.item,uri=item?.uri||'',enabled=this.settings.lyricsSource!=='off',key=enabled+':'+uri;
            if(!force&&key===this.panelBackdropKey){this.syncPanelBackdropPlayback();return;}
            this.panelBackdropKey=key;this.panelMediaAbort?.abort();this.panelMediaAbort=new AbortController();
            const signal=this.panelMediaAbort.signal;this.panelCanvasPending=true;this.panelClipURL='';this.clearPanelVideo();clearTimeout(this.panelVideoCheck);this.panelVideoObserver.disconnect();
            this.panelBackdrop.replaceChildren();this.panelBackdrop.dataset.source='cover';
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
            const media=this.panelVideo?.readyState>=2?this.panelVideo:this.panelBackdrop.querySelector('img');
            let pixels;
            try{
                if(!media)throw Error('No media');
                const w=media.videoWidth||media.naturalWidth,h=media.videoHeight||media.naturalHeight;if(!w||!h)throw Error('Not ready');
                const canvas=this.panelContrastCanvas||=document.createElement('canvas');canvas.width=24;canvas.height=48;
                const ctx=canvas.getContext('2d',{willReadFrequently:true}),ratio=(this.lyricsPanel.clientWidth||360)/(this.lyricsPanel.clientHeight||900);
                const cropW=Math.min(w,h*ratio),cropH=Math.min(h,w/ratio);
                ctx.drawImage(media,(w-cropW)/2,(h-cropH)/2,cropW,cropH,0,0,24,48);pixels=ctx.getImageData(0,0,24,48).data;
            }catch{}
            const lum=rgb=>{const v=rgb.map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});return .2126*v[0]+.7152*v[1]+.0722*v[2];};
            let mean=0;if(pixels)for(let i=0;i<pixels.length;i+=4)mean+=lum([...pixels.slice(i,i+3)])/(pixels.length/4);
            const ink=this.settings.colorMode==='custom'?this.settings.color:(pixels&&mean>.45?'#10151d':'#f8faff');
            const rgb=ink.match(/[0-9a-f]{2}/gi).map(x=>parseInt(x,16)),light=lum(rgb)>.18,scrim=light?0:255;
            let alpha=pixels?0:.65;
            if(pixels)for(alpha=0;alpha<.78;alpha+=.03){
                const scores=[];for(let i=0;i<pixels.length;i+=16){const bg=[0,1,2].map(n=>pixels[i+n]*(1-alpha)+scrim*alpha),text=bg.map((c,n)=>c*.26+rgb[n]*.74),a=lum(bg),b=lum(text);scores.push((Math.max(a,b)+.05)/(Math.min(a,b)+.05));}
                scores.sort((a,b)=>a-b);if(scores[Math.floor(scores.length*.08)]>=4.5)break;
            }
            this.lyricsPanel.style.setProperty('--cbp-panel-ink',ink);
            this.lyricsPanel.style.setProperty('--cbp-panel-scrim',`rgba(${scrim},${scrim},${scrim},${alpha.toFixed(2)})`);
            this.lyricsPanel.style.textShadow=light?'0 1px 3px #000a':'0 1px 2px #ffffff60';
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
            if(source&&source!==this.panelClipSource&&this.followPanelVideo(source,'clip',signal))return;
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
            let bytes=0;const buffers=[];
            for(const url of urls){if(new URL(url).protocol!=='https:')throw Error('Invalid media URL');const res=await fetch(url,{signal:requestSignal});if(!res.ok)throw Error('Canvas segment unavailable');const buffer=await res.arrayBuffer();bytes+=buffer.byteLength;if(bytes>20*1024*1024)throw Error('Canvas too large');buffers.push(buffer);}
            if(signal.aborted)throw Error('Cancelled');this.clearPanelVideo();const video=this.newPanelVideo();video.style.opacity='0';
            const media=new MediaSource(),objectURL=URL.createObjectURL(media);this.panelVideoObjectURL=objectURL;
            const opened=panelMediaEvent(media,'sourceopen',requestSignal);video.src=objectURL;await opened;
            const buffer=media.addSourceBuffer(`video/webm; codecs="${profile.video_codec}"`);
            for(const bytes of buffers){const updated=panelMediaEvent(buffer,'updateend',requestSignal);buffer.appendBuffer(bytes);await updated;}
            if(media.readyState==='open')media.endOfStream();if(signal.aborted)throw Error('Cancelled');
            video.style.opacity='1';this.panelBackdrop.dataset.source='canvas';this.syncPanelBackdropPlayback();
            video.onerror=()=>{if(this.panelVideo===video){this.clearPanelVideo();this.panelBackdrop.dataset.source='cover';this.findPanelClip();}};
        }
    });
