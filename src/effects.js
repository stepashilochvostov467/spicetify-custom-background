    const backgroundVideoTypes={
        mp4:'video/mp4',m4v:'video/mp4',mov:'video/quicktime',webm:'video/webm',
        mkv:'video/x-matroska',avi:'video/x-msvideo',ogv:'video/ogg',ogg:'video/ogg',
        mpg:'video/mpeg',mpeg:'video/mpeg',ts:'video/mp2t',wmv:'video/x-ms-wmv',
        '3gp':'video/3gpp',flv:'video/x-flv'
    };
    const isBackgroundVideo=value=>value instanceof Blob||typeof value==='string'&&value.startsWith('data:video/');
    const backgroundVideoType=file=>backgroundVideoTypes[file.name.split('.').at(-1).toLowerCase()]
        ||(file.type.startsWith('video/')?file.type:'');
    function readBackgroundDataURL(file) {
        return new Promise((resolve,reject)=>{
            const reader=new FileReader();
            reader.onload=()=>resolve(reader.result);
            reader.onerror=()=>reject(reader.error);
            reader.readAsDataURL(file);
        });
    }
    async function validateMedia(src) {
        if (!isBackgroundVideo(src)) return decodeImage(src);
        const url=src instanceof Blob?URL.createObjectURL(src):src;
        return new Promise((resolve,reject)=>{
            const v=document.createElement('video'); v.muted=true; v.preload='auto';
            const done=error=>{clearTimeout(timer);v.onloadeddata=v.onerror=null;v.removeAttribute('src');v.load();if(src instanceof Blob)URL.revokeObjectURL(url);error?reject(error):resolve();};
            const timer=setTimeout(()=>done(Error('Видео не загрузилось')),10000);
            v.onloadeddata=()=>done(v.videoWidth?null:Error('В файле нет видеодорожки'));
            v.onerror=()=>done(Error('Spotify не декодирует это видео.'));v.src=url;
        });
    }
    async function convertBackgroundVideo(file,signal) {
        const root='https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/';
        const load=async(name,expected)=>{
            const response=await fetch(root+name,{signal,credentials:'omit',referrerPolicy:'no-referrer'});
            if(!response.ok)throw Error('Не удалось загрузить конвертер видео');
            const data=await response.arrayBuffer();
            const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),value=>value.toString(16).padStart(2,'0')).join('');
            if(hash!==expected)throw Error('Не совпала контрольная сумма конвертера видео');
            return data;
        };
        const [core,wasm]=await Promise.all([
            load('ffmpeg-core.js','b266ab5b952555881dd6310663986994a182acb2b7ff25cf10a25f7a37ac2b21'),
            load('ffmpeg-core.wasm','9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7')
        ]);
        const input=await file.arrayBuffer();
        signal.throwIfAborted();
        const convert=async({data})=>{
            try{
                const ffmpeg=await self.createFFmpegCore({wasmBinary:new Uint8Array(data.wasm)});
                ffmpeg.FS.writeFile('input',new Uint8Array(data.input));
                const exit=ffmpeg.exec('-i','input','-map','0:v:0','-map','0:a:0?',
                    '-vf',"scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
                    '-c:v','libvpx','-pix_fmt','yuv420p','-deadline','realtime','-cpu-used','5','-b:v','2M',
                    '-c:a','libvorbis','-b:a','96k','output.webm');
                if(exit!==0)throw Error('FFmpeg завершился с кодом '+exit);
                const bytes=ffmpeg.FS.readFile('output.webm');
                self.postMessage({video:new Blob([bytes],{type:'video/webm'})});
            }catch(error){self.postMessage({error:error.message});}
        };
        const workerURL=URL.createObjectURL(new Blob([core,'\nself.onmessage='+convert.toString()+';'],{type:'text/javascript'}));
        let worker;
        try{
            worker=new Worker(workerURL);
            return await new Promise((resolve,reject)=>{
                const abort=()=>reject(signal.reason);
                signal.addEventListener('abort',abort,{once:true});
                worker.onmessage=({data})=>data.video?resolve(data.video):reject(Error('Не удалось конвертировать видео: '+data.error));
                worker.onerror=()=>reject(Error('Не удалось запустить конвертер видео в Spotify'));
                worker.postMessage({wasm,input},[wasm,input]);
            });
        }finally{
            worker?.terminate();
            URL.revokeObjectURL(workerURL);
        }
    }
    Object.assign(APP, {
        initEffects() {
            this.bg.style.cssText='position:fixed;inset:0;z-index:-2;pointer-events:none;overflow:hidden;background:#121212';
            this.reduced=matchMedia('(prefers-reduced-motion: reduce)');
            document.addEventListener('visibilitychange',()=>{if(document.hidden)this.media?.pause?.();else this.renderBackground();});
        },
        renderBackground() {
            const s=this.settings;
            if(this.bgSource!==this.image) {
                this.bgSource=this.image;this.backgroundStyleKey=null;this.backgroundSoundBlocked=null;
                const old=this.media,oldURL=this.backgroundObjectURL;
                this.backgroundObjectURL=this.image instanceof Blob?URL.createObjectURL(this.image):null;
                if(this.image) {
                    const video=isBackgroundVideo(this.image);
                    const media=document.createElement(video?'video':'img');
                    media.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none';
                    if(video){media.muted=true;media.loop=true;media.playsInline=true;}
                    media.src=this.backgroundObjectURL||this.image;this.bg.append(media);this.media=media;
                    old?.pause?.();old?.remove();
                    for(const el of [...this.bg.children])if(el!==media){el.pause?.();el.remove();}
                    media.onerror=()=>this.notify('Фон не удалось воспроизвести. Выбери другой файл.',true);
                } else {for(const el of [...this.bg.children]){el.pause?.();el.remove();}this.media=null;}
                if(oldURL)URL.revokeObjectURL(oldURL);
            }
            const styleKey=[this.imageToken,s.zoom,s.x,s.y,s.blur].join(':');
            if(this.media&&styleKey!==this.backgroundStyleKey){this.backgroundStyleKey=styleKey;this.media.style.transform=`scale(${s.zoom/100})`;this.media.style.objectPosition=`${s.x}% ${s.y}%`;this.media.style.transformOrigin=`${s.x}% ${s.y}%`;this.media.style.filter=`blur(${s.blur}px)`;}
            this.syncBackgroundPlayback();

            const display=this.image?'block':'none';if(this.bg.style.display!==display)this.bg.style.display=display;
        },
        syncBackgroundPlayback() {
            const media=this.media;
            if(media?.tagName!=='VIDEO')return;
            const withSound=this.settings.backgroundVideoSound;
            media.muted=!withSound||this.backgroundSoundBlocked===media;
            if(document.hidden||this.reduced.matches){if(!media.paused)media.pause();return;}
            if(!media.paused||this.backgroundPlaybackVideo===media)return;
            this.backgroundPlaybackVideo=media;
            media.play().catch(error=>{
                if(error.name==='NotAllowedError'&&this.media===media&&this.settings.backgroundVideoSound&&!document.hidden&&!this.reduced.matches){
                    this.backgroundSoundBlocked=media;
                    media.muted=true;
                    return media.play().catch(()=>{});
                }
            }).finally(()=>{if(this.backgroundPlaybackVideo===media)this.backgroundPlaybackVideo=null;});
        }
    });
