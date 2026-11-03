async () => {
    const a=CBP.app,checks=[],ok=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
    const originalImage=a.image;
    a.settings.lyricsSource='spotify';Spicetify.CosmosAsync={get:async()=>({lyrics:{lines:[]}})};
    Spicetify.Player.data.item={uri:'spotify:track:COVER',metadata:{image_url:testImage}};
    await a.render();await new Promise(r=>setTimeout(r,20));
    ok(a.panelBackdrop.dataset.source==='cover'&&a.panelBackdrop.querySelector('img').src===testImage,'cover is immediate fallback when Canvas and clip are absent');
    ok(a.image===originalImage,'lyric media does not replace the main wallpaper');
    const originalURL=a.playPanelURL,originalCanvas=a.playPanelCanvas;
    let selected=[];
    a.playPanelURL=async(url,kind,signal)=>{if(signal.aborted)throw Error('aborted');selected.push(kind);a.panelBackdrop.dataset.source=kind;};
    Spicetify.Player.data.item={uri:'spotify:track:CANVAS',metadata:{image_url:testImage,'canvas.url':'https://media.test/canvas.webm',video_url:'https://media.test/clip.webm'}};
    await a.refreshPanelBackdrop(true);
    ok(selected.join(',')==='canvas'&&a.panelBackdrop.dataset.source==='canvas','Canvas wins over a music video');
    a.playPanelURL=async(url,kind,signal)=>{selected.push(kind);if(kind==='canvas')throw Error('unsupported');a.panelBackdrop.dataset.source=kind;};selected=[];
    await a.refreshPanelBackdrop(true);await new Promise(r=>setTimeout(r,0));
    ok(selected.join(',')==='canvas,clip'&&a.panelBackdrop.dataset.source==='clip','failed Canvas falls back to available clip');
    a.playPanelURL=async()=>{throw Error('unavailable');};
    await a.refreshPanelBackdrop(true);await new Promise(r=>setTimeout(r,0));
    ok(a.panelBackdrop.dataset.source==='cover'&&a.panelBackdrop.querySelector('img'),'failed Canvas and clip retain cover');
    let release;
    a.playPanelURL=async(url,kind,signal)=>{await new Promise(r=>release=r);if(!signal.aborted)a.panelBackdrop.dataset.source=kind;};
    const old=a.refreshPanelBackdrop(true);await new Promise(r=>setTimeout(r,0));
    Spicetify.Player.data.item={uri:'spotify:track:NEW',metadata:{image_url:testImage}};
    await a.refreshPanelBackdrop(true);release();await old;
    ok(a.panelBackdrop.dataset.source==='cover','late Canvas for previous track is discarded');
    a.playPanelURL=originalURL;
    // Make a playable WebM in the fixture; no external media or network.
    const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const ctx=canvas.getContext('2d'),stream=canvas.captureStream(10),chunks=[];
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}),recorded=new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=()=>resolve(new Blob(chunks,{type:'video/webm'}));});
    recorder.start();for(let i=0;i<5;i++){ctx.fillStyle=i%2?'red':'blue';ctx.fillRect(0,0,32,32);await new Promise(r=>setTimeout(r,80));}recorder.stop();const blob=await recorded;stream.getTracks().forEach(t=>t.stop());
    const url=URL.createObjectURL(blob);
    Spicetify.Player.data.item={uri:'spotify:track:REALVIDEO',metadata:{image_url:testImage,'canvas.url':url}};
    await a.refreshPanelBackdrop(true);
    ok(a.panelVideo instanceof HTMLVideoElement&&a.panelVideo.muted&&a.panelVideo.loop&&a.panelBackdrop.dataset.source==='canvas','real Canvas video decodes as muted looping backdrop: '+JSON.stringify({source:a.panelBackdrop.dataset.source,hasVideo:!!a.panelVideo,blobSize:blob.size}));
    ok(getComputedStyle(a.panelVideo).filter==='none','panel video is not blurred');
    const panelBounds=a.lyricsPanel.getBoundingClientRect(),videoBounds=a.panelVideo.getBoundingClientRect();
    ok(Math.abs(panelBounds.top-8)<1&&Math.abs(panelBounds.bottom-(innerHeight-8))<1,'lyric panel spans the window height with small edge margins');
    ok(Math.abs(videoBounds.height-panelBounds.height)<2&&Math.abs(videoBounds.width-panelBounds.width)<2&&getComputedStyle(a.panelVideo).objectFit==='cover','video fills the full panel without changing its aspect ratio');
    ok(getComputedStyle(a.panelBackdrop.querySelector('img')).display==='none','album cover is hidden underneath Canvas');
    ok(getComputedStyle(a.panelBackdrop,'::after').content==='none','Canvas has no gradient overlay');
    Spicetify.Player.isPlaying=()=>true;a.syncPanelBackdropPlayback();await new Promise(r=>setTimeout(r,60));
    ok(!a.panelVideo.paused,'panel video plays with music');
    Spicetify.Player.isPlaying=()=>false;a.syncPanelBackdropPlayback();ok(a.panelVideo.paused,'panel video pauses with music');
    // Exercise manifest selection, authenticated lookup and segment assembly separately
    // from the real browser decoder above, without contacting Spotify.
    const savedFetch=window.fetch,savedMediaSource=window.MediaSource,savedCreateURL=URL.createObjectURL;
    const requests=[],appended=[];
    try{
        a.clearPanelVideo();
        Spicetify.Platform={AuthorizationAPI:{getState:()=>({token:{accessToken:'fixture-token'}})}};
        window.MediaSource=class extends EventTarget{
            static isTypeSupported(){return true;}
            constructor(){super();this.readyState='open';setTimeout(()=>this.dispatchEvent(new Event('sourceopen')),0);}
            addSourceBuffer(){const buffer=new EventTarget();buffer.appendBuffer=bytes=>{appended.push(bytes.byteLength);setTimeout(()=>buffer.dispatchEvent(new Event('updateend')),0);};return buffer;}
            endOfStream(){this.readyState='ended';}
        };
        URL.createObjectURL=()=>url;
        window.fetch=async(target,options)=>{
            requests.push([target,options?.headers?.Authorization]);
            if(target.includes('/manifests/'))return {ok:true,json:async()=>({base_urls:['https://media.test/'],initialization_template:'init-{{profile_id}}.{{file_type}}',segment_template:'seg-{{segment_timestamp}}-{{profile_id}}.{{file_type}}',contents:[{segment_length:2,start_time_millis:0,end_time_millis:4000,profiles:[{id:1,file_type:'mp4',video_height:1080,video_codec:'avc1'},{id:2,file_type:'webm',video_height:480,video_codec:'vp9'}]}]})};
            return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};
        };
        Spicetify.Player.data.item={uri:'spotify:track:MANIFEST',metadata:{image_url:testImage,'canvas.fileId':'fixtureCanvas123'}};
        await a.refreshPanelBackdrop(true);
        ok(requests[0][1]==='Bearer fixture-token','Canvas manifest uses Spotify authorization');
        ok(requests.slice(1).map(r=>r[0]).join(',')==='https://media.test/init-2.webm,https://media.test/seg-0-2.webm,https://media.test/seg-2-2.webm','Canvas selects WebM and builds segment URLs');
        ok(appended.length===3&&a.panelBackdrop.dataset.source==='canvas','Canvas buffers initialization and all segments');
    }finally{window.fetch=savedFetch;window.MediaSource=savedMediaSource;URL.createObjectURL=savedCreateURL;}
    a.settings.lyricsSource='off';await a.render();ok(!a.panelVideo&&!a.panelBackdrop.children.length,'closing lyrics releases media');
    URL.revokeObjectURL(url);a.playPanelCanvas=originalCanvas;
    return checks;
}
