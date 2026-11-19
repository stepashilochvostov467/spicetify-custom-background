async () => {
    const a=CBP.app,checks=[],ok=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
    const originalImage=a.image;
    a.settings.lyricsLayout='overlay';a.settings.lyricsSource='spotify';Spicetify.CosmosAsync={get:async()=>({lyrics:{lines:[]}})};
    Spicetify.Player.data.item={uri:'spotify:track:COVER',metadata:{image_url:testImage}};
    await a.render();await new Promise(r=>setTimeout(r,20));
    ok(a.panelBackdrop.dataset.source==='cover'&&a.panelBackdrop.querySelector('img').src===testImage,'cover is immediate fallback when Canvas and clip are absent');
    ok(a.image===originalImage,'lyric media does not replace the main wallpaper');
    const originalURL=a.playPanelURL,originalCanvas=a.playPanelCanvas;
    let selected=[];
    a.playPanelURL=async(url,kind,signal)=>{if(signal.aborted)throw Error('aborted');selected.push(kind);a.panelBackdrop.dataset.source=kind;};
    Spicetify.Player.data.item={uri:'spotify:track:CANVAS',metadata:{image_url:testImage,'canvas.url':'https://media.test/canvas.webm',video_url:'https://media.test/clip.webm'}};
    await a.refreshPanelBackdrop(true);
    ok(selected.join(',')==='clip'&&a.panelBackdrop.dataset.source==='clip','automatic mode plays clip before Canvas');
    a.playPanelURL=async(url,kind,signal)=>{selected.push(kind);if(kind==='clip')throw Error('unsupported');a.panelBackdrop.dataset.source=kind;};selected=[];
    await a.refreshPanelBackdrop(true);await new Promise(r=>setTimeout(r,0));
    ok(selected.join(',')==='clip,canvas'&&a.panelBackdrop.dataset.source==='canvas','failed clip falls back to Canvas');
    a.playPanelURL=async()=>{throw Error('unavailable');};
    await a.refreshPanelBackdrop(true);await new Promise(r=>setTimeout(r,0));
    ok(a.panelBackdrop.dataset.source==='cover'&&a.panelBackdrop.querySelector('img'),'failed Canvas and clip retain cover');
    delete Spicetify.Player.data.item.metadata.video_url;
    let release,started;
    const canvasStarted=new Promise(resolve=>started=resolve);
    a.playPanelURL=async(url,kind,signal)=>{await new Promise(r=>{release=r;started();});if(!signal.aborted)a.panelBackdrop.dataset.source=kind;};
    const old=a.refreshPanelBackdrop(true);await canvasStarted;
    Spicetify.Player.data.item={uri:'spotify:track:NEW',metadata:{image_url:testImage}};
    await a.refreshPanelBackdrop(true);release();await old;
    ok(a.panelBackdrop.dataset.source==='cover','late Canvas for previous track is discarded');
    a.playPanelURL=originalURL;
    // Make a playable WebM in the fixture; no external media or network.
    const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const ctx=canvas.getContext('2d'),stream=canvas.captureStream(0),chunks=[];
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}),recorded=new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=()=>resolve(new Blob(chunks,{type:'video/webm'}));});
    recorder.start();for(let i=0;i<10;i++){ctx.fillStyle=i%2?'red':'blue';ctx.fillRect(0,0,32,32);stream.getVideoTracks()[0].requestFrame();await new Promise(r=>setTimeout(r,100));}recorder.stop();const blob=await recorded;stream.getTracks().forEach(t=>t.stop());
    const url=URL.createObjectURL(blob);
    Spicetify.Player.data.item={uri:'spotify:track:REALVIDEO',metadata:{image_url:testImage,'canvas.url':url}};
    const videoLoad=a.refreshPanelBackdrop(true);
    const placeholder=a.panelBackdrop.querySelector('img');
    await placeholder.decode();a.updatePanelContrast();
    const initialInk=a.lyricsPanel.style.getPropertyValue('--cbp-panel-ink');
    await videoLoad;
    ok(a.lyricsPanel.style.getPropertyValue('--cbp-panel-ink')!==initialInk,'Canvas selects its own ink when it replaces the cover');
    ok(a.panelVideo instanceof HTMLVideoElement&&a.panelVideo.muted&&a.panelVideo.loop&&a.panelBackdrop.dataset.source==='canvas','real Canvas video decodes as muted looping backdrop: '+JSON.stringify({source:a.panelBackdrop.dataset.source,hasVideo:!!a.panelVideo,blobSize:blob.size}));
    ok(getComputedStyle(a.panelVideo).filter==='none','panel video is not blurred');
    const panelBounds=a.lyricsPanel.getBoundingClientRect(),videoBounds=a.panelVideo.getBoundingClientRect();
    ok(Math.abs(panelBounds.top)<1&&Math.abs(panelBounds.bottom-innerHeight)<1,'lyric panel reaches both screen edges with no outer strips');
    ok(Math.abs(videoBounds.height-panelBounds.height)<2&&Math.abs(videoBounds.width-panelBounds.width)<2&&getComputedStyle(a.panelVideo).objectFit==='cover','video fills the full panel without changing its aspect ratio');
    ok(getComputedStyle(a.panelBackdrop.querySelector('img')).display==='none','album cover is hidden underneath Canvas');
    ok(!getComputedStyle(a.panelBackdrop,'::after').backgroundImage.includes('gradient'),'Canvas uses no gradient overlay');
    ok(CBP.normalize({}).lyricsLayout==='above','new default puts media above lyrics');
    ok(CBP.normalize({lyricsLayout:'invalid'}).lyricsLayout==='above','untrusted layout values use a safe default');
    for(const layout of ['above','below']){
        a.settings.lyricsLayout=layout;a.renderStudio();await new Promise(requestAnimationFrame);
        const media=a.panelBackdrop.getBoundingClientRect(),lines=a.lyricsPanel.querySelector('.cbp-lines').getBoundingClientRect();
        ok(layout==='above'?media.bottom<=lines.top+1:lines.bottom<=media.top+1,layout+' media and scrolling lyrics never overlap');
        ok(lines.height>150,'split layout leaves useful space for lyrics: '+layout);
        ok(getComputedStyle(a.panelVideo).objectFit==='contain','split video is displayed whole without cropping: '+layout);
        ok(getComputedStyle(a.panelBackdrop,'::after').backgroundImage.includes('gradient'),'media blends into the lyric surface: '+layout);
        const surface=a.lyricsPanel.style.getPropertyValue('--cbp-lyric-surface');
        ok(/^#[0-9a-f]{6}$/.test(surface)&&surface!=='#15171d','lyrics use a dark tone sampled from Canvas: '+layout);
        const expected=document.createElement('span');expected.style.color=surface;a.lyricsPanel.append(expected);
        ok(getComputedStyle(a.lyricsPanel).backgroundColor===getComputedStyle(expected).color,'sampled color is applied under the lyrics: '+layout);
        expected.remove();
        if(layout==='above')ok(getComputedStyle(a.panelBackdrop).backgroundImage.includes('linear-gradient'),'side fields use the media edge palette');
    }
    a.settings.lyricsLayout='overlay';a.renderStudio();await new Promise(requestAnimationFrame);
    ok(Math.abs(a.panelVideo.getBoundingClientRect().height-panelBounds.height)<2,'previous full-background layout is still available');
    Spicetify.Player.isPlaying=()=>true;a.syncPanelBackdropPlayback();await new Promise(r=>setTimeout(r,60));
    ok(!a.panelVideo.paused,'panel video plays with music');
    a.updatePanelContrast();const videoSample=a.panelContrastSample,videoInk=a.lyricsPanel.style.getPropertyValue('--cbp-panel-ink');
    await new Promise(resolve=>setTimeout(resolve,720));a.syncPanelBackdropPlayback();a.updatePanelContrast();
    ok(a.panelContrastSample===videoSample&&a.lyricsPanel.style.getPropertyValue('--cbp-panel-ink')===videoInk,'playing Canvas retains its initial pixel sample and text color');
    ok(!a.panelContrastTimer,'video playback creates no color resampling timer');
    Spicetify.Player.isPlaying=()=>false;a.syncPanelBackdropPlayback();ok(a.panelVideo.paused,'panel video pauses with music');
    a.settings.lyricsLayout='below';a.renderStudio();
    const checkFrame=(media,ratio,label)=>{
        a.updatePanelMediaGeometry();const box=a.panelBackdrop.getBoundingClientRect(),rect=media.getBoundingClientRect();
        const scale=Math.min(box.width/ratio,box.height);
        ok(Math.abs(Math.min(rect.width/ratio,rect.height)-scale)<1,label+' preview frame matches native aspect ratio without CSS letterboxing');
        ok(Math.abs(box.width-rect.width)<1&&Math.abs(box.height-rect.height)<1,label+' media fills its own frame');
        ok(Math.abs(box.height-Math.min(box.width/ratio,innerHeight*.60))<1,label+' preview height follows width up to 60% of the panel');
    };
    for(const [w,h] of [[90,160],[160,90]]){
        const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#35a4c7';x.fillRect(0,0,w,h);
        const st=c.captureStream(0),parts=[],rec=new MediaRecorder(st,{mimeType:'video/webm'});rec.ondataavailable=e=>parts.push(e.data);
        const stopped=new Promise(resolve=>rec.onstop=resolve);rec.start();st.getVideoTracks()[0].requestFrame();await new Promise(resolve=>setTimeout(resolve,80));rec.stop();await stopped;st.getTracks().forEach(t=>t.stop());
        const mediaURL=URL.createObjectURL(new Blob(parts,{type:'video/webm'}));await a.playPanelURL(mediaURL,w<h?'canvas':'clip',a.panelMediaAbort.signal);await new Promise(requestAnimationFrame);
        checkFrame(a.panelVideo,w/h,w<h?'vertical Canvas':'wide music video');URL.revokeObjectURL(mediaURL);
    }
    const picker=a.panelMediaPicker;
    a.settings.lyricsLayout='above';a.renderStudio();a.panelBackdrop.click();
    ok(!picker.menu.hidden&&picker.button.getAttribute('aria-expanded')==='true','clicking Canvas opens the track media chooser');
    const track=Spicetify.Player.data.item,other={uri:'spotify:track:OTHER',metadata:{image_url:testImage}};
    track.metadata.video_url=url;
    picker.select.value='cover';picker.select.dispatchEvent(new Event('change'));
    await a.panelMediaWrite;
    await a.refreshPanelBackdrop(true);
    ok((await a.readPanelMediaChoice(track.uri)).mode==='cover'&&a.panelBackdrop.dataset.source==='cover'&&!a.panelVideo,'explicit cover is saved and overrides Canvas');
    await a.savePanelMediaChoice(track.uri,{mode:'clip'});
    for(let i=0;i<50&&a.panelBackdrop.dataset.source!=='clip';i++)await new Promise(r=>setTimeout(r,20));
    ok(a.panelBackdrop.dataset.source==='clip'&&a.panelVideo.muted,'explicit clip overrides Canvas');
    const input=picker.menu.querySelector('input'),files=new DataTransfer();
    files.items.add(new File([blob],'test.webm',{type:'video/webm'}));
    picker.upload.click();input.files=files.files;await input.onchange();
    ok(a.panelBackdrop.dataset.source==='custom'&&a.panelVideo.muted&&a.panelVideo.loop,'uploaded local video plays muted on a loop');
    Spicetify.Player.data.item=other;await a.refreshPanelBackdrop(true);
    ok(a.panelBackdrop.dataset.source==='cover'&&picker.select.value==='auto','another track uses its own setting');
    Spicetify.Player.data.item=track;await a.refreshPanelBackdrop(true);
    ok(a.panelBackdrop.dataset.source==='custom'&&picker.select.value==='custom','returning to a track restores its saved video');
    await a.savePanelMediaChoice(track.uri,{video:null});
    ok(a.panelBackdrop.dataset.source==='clip'&&(await a.readPanelMediaChoice(track.uri)).video===null,'removing the video restores automatic media');
    delete track.metadata['canvas.url'];
    await a.savePanelMediaChoice(track.uri,{mode:'canvas'});
    ok(a.panelBackdrop.dataset.source==='cover'&&picker.output.textContent.includes('недоступен'),'unavailable explicit Canvas falls back to cover and skips clip');
    picker.select.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    ok(picker.menu.hidden,'Escape closes the media chooser');
    a.settings.lyricsLayout='below';a.renderStudio();
    a.clearPanelVideo();a.panelBackdrop.dataset.source='cover';
    for(const [w,h] of [[300,300],[400,300],[200,350]]){
        const img=document.createElement('img');img.src='data:image/svg+xml;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><path fill="#ab786a" d="M0 0h'+w+'v'+h+'H0z"/></svg>');a.panelBackdrop.replaceChildren(img);await img.decode();a.updatePanelMediaGeometry();await new Promise(requestAnimationFrame);checkFrame(img,w/h,'photo '+w+'x'+h);
    }
    // Exercise manifest selection, authenticated lookup and segment assembly separately
    // from the real browser decoder above, without contacting Spotify.
    const savedFetch=window.fetch,savedMediaSource=window.MediaSource,savedCreateURL=URL.createObjectURL;
    const requests=[],appended=[];let earlyVideoVisible=false,mp4Only=false;
    try{
        a.clearPanelVideo();
        Spicetify.Platform={AuthorizationAPI:{getState:()=>({token:{accessToken:'fixture-token'}})}};
        window.MediaSource=class extends EventTarget{
            static isTypeSupported(mime){return !mp4Only||mime.startsWith("video/mp4");}
            constructor(){super();this.readyState='open';setTimeout(()=>this.dispatchEvent(new Event('sourceopen')),0);}
            addSourceBuffer(){const buffer=new EventTarget();buffer.appendBuffer=bytes=>{appended.push(bytes.byteLength);if(appended.length===2)a.panelVideo.dispatchEvent(new Event('loadeddata'));setTimeout(()=>buffer.dispatchEvent(new Event('updateend')),0);};return buffer;}
            endOfStream(){this.readyState='ended';}
        };
        URL.createObjectURL=()=>url;
        window.fetch=async(target,options)=>{
            requests.push([target,options?.headers?.Authorization]);
            if(target.includes('/manifests/'))return {ok:true,json:async()=>({base_urls:['https://media.test/'],initialization_template:'init-{{profile_id}}.{{file_type}}',segment_template:'seg-{{segment_timestamp}}-{{profile_id}}.{{file_type}}',contents:[{segment_length:2,start_time_millis:0,end_time_millis:4000,profiles:[{id:1,file_type:'mp4',video_height:1080,video_codec:'avc1'},{id:2,file_type:'webm',video_height:480,video_codec:'vp9'}]}]})};
            if(target.includes('seg-2-')){await new Promise(resolve=>setTimeout(resolve,20));earlyVideoVisible=a.panelVideo.style.opacity==='1'&&a.panelBackdrop.dataset.source==='canvas';await new Promise(resolve=>setTimeout(resolve,600));}
            return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};
        };
        Spicetify.Player.data.item={uri:'spotify:track:MANIFEST',metadata:{image_url:testImage,'canvas.fileId':'fixtureCanvas123'}};
        await a.refreshPanelBackdrop(true);
        ok(requests[0][1]==='Bearer fixture-token','Canvas manifest uses Spotify authorization');
        ok(requests.slice(1).map(r=>r[0]).join(',')==='https://media.test/init-2.webm,https://media.test/seg-0-2.webm,https://media.test/seg-2-2.webm','Canvas selects WebM and builds segment URLs');
        ok(earlyVideoVisible,'Canvas first frame is visible before a slow final segment finishes');
        ok(appended.length===3&&a.panelBackdrop.dataset.source==='canvas','Canvas buffers initialization and all segments');
        mp4Only=true;
        const mp4Plan=await a.getPanelCanvasPlan('fixtureCanvas123',new AbortController().signal);
        ok(mp4Plan.mime.startsWith('video/mp4')&&mp4Plan.urls[0].endsWith('/init-1.mp4'),'Canvas accepts a supported MP4 when WebM is unavailable');
    }finally{window.fetch=savedFetch;window.MediaSource=savedMediaSource;URL.createObjectURL=savedCreateURL;}
    const player=document.createElement('div');player.dataset.testid='video-player-npv';const slowVideo=document.createElement('video');player.append(slowVideo);
    let decoded=false,scanCount=0;Object.defineProperty(slowVideo,'readyState',{get:()=>decoded?2:0});
    const savedFollow=a.followPanelVideo,savedFind=a.findPanelClip;
    a.followPanelVideo=(source,kind)=>{if(source!==slowVideo||source.readyState<2)return false;a.panelClipSource=source;a.panelBackdrop.dataset.source=kind;return true;};
    document.getElementById('main').append(player);
    Spicetify.Player.data.item={uri:'spotify:track:SLOWCLIP',metadata:{image_url:testImage}};await a.refreshPanelBackdrop(true);
    decoded=true;slowVideo.dispatchEvent(new Event('loadeddata'));
    ok(a.panelBackdrop.dataset.source==='clip','slow native video is picked up when decoding completes without unrelated DOM changes');
    await new Promise(r=>setTimeout(r,300));
    a.findPanelClip=()=>{scanCount++;return savedFind.call(a);};const unrelated=document.createElement('span');unrelated.textContent='Track count';document.getElementById('main').append(unrelated);
    await new Promise(r=>setTimeout(r,300));ok(scanCount===0,'unrelated Spotify DOM changes do not rescan video players');
    a.findPanelClip=savedFind;a.followPanelVideo=savedFollow;player.remove();unrelated.remove();
    const nativeMeta={title:'Fixture song',artist_name:'Fixture artist',image_url:testImage};
    const nativeToggle=document.createElement('button');
    nativeToggle.dataset.testid='control-button-npv';nativeToggle.setAttribute('aria-pressed','false');
    nativeToggle.onclick=()=>nativeToggle.setAttribute('aria-pressed',String(nativeToggle.getAttribute('aria-pressed')!=='true'));
    document.getElementById('main').append(nativeToggle);
    let videoMode=false,switches=0;
    Spicetify.Player.origin={
        canSendSignal:signal=>signal===(videoMode?'switch-to-audio':'switch-to-video'),
        sendSignal:async()=>{
            switches++;videoMode=true;decoded=true;document.getElementById('main').append(player);
            Spicetify.Player.data.item={uri:'spotify:track:NATIVEVIDEO',metadata:nativeMeta};
            await a.refreshPanelBackdrop(true);
        }
    };
    player.remove();player.removeAttribute('data-testid');player.dataset.videoContainer='';
    Spicetify.Player.data.item={uri:'spotify:track:NATIVECLIP',metadata:nativeMeta};
    a.followPanelVideo=(source,kind)=>{if(source!==slowVideo)return false;a.panelClipSource=source;a.panelBackdrop.dataset.source=kind;a.updatePanelMediaPicker();return true;};
    await a.savePanelMediaChoice('spotify:track:NATIVECLIP',{mode:'clip'});
    ok(!a.panelMediaPicker.startClip.hidden&&switches===0,'clip preference exposes Spotify video switch without changing playback by itself');
    await a.panelMediaPicker.startClip.onclick();
    ok(switches===1&&a.panelBackdrop.dataset.source==='clip'&&nativeToggle.getAttribute('aria-pressed')==='true'&&document.body.classList.contains('cbp-clip-loading'),'explicit switch mounts the native video and picks it even with the alternate host');
    ok(a.panelMediaChoice.mode==='clip'&&a.panelAudioURI()==='spotify:track:NATIVECLIP','switching to Spotify video URI retains the original song and choice');
    await a.savePanelMediaChoice(a.panelAudioURI(),{mode:'cover'});
    ok(nativeToggle.getAttribute('aria-pressed')==='false'&&!document.body.classList.contains('cbp-clip-loading'),'leaving clip mode restores the hidden native sidebar state');
    a.followPanelVideo=savedFollow;delete Spicetify.Player.origin;nativeToggle.remove();player.remove();
    a.settings.lyricsSource='off';await a.render();ok(!a.panelVideo&&!a.panelBackdrop.children.length,'closing lyrics releases media');
    URL.revokeObjectURL(url);a.playPanelCanvas=originalCanvas;
    return checks;
}
