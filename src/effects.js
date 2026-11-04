    async function validateMedia(src) {
        if (!src.startsWith('data:video/')) return decodeImage(src);
        return new Promise((resolve,reject)=>{
            const v=document.createElement('video'); v.muted=true; v.preload='metadata';
            const done=error=>{clearTimeout(timer);v.removeAttribute('src');v.load();error?reject(error):resolve();};
            const timer=setTimeout(()=>done(Error('Видео не загрузилось')),10000);
            v.onloadedmetadata=()=>done();v.onerror=()=>done(Error('Не удалось открыть видео'));v.src=src;
        });
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
                this.bgSource=this.image;this.backgroundStyleKey=null;
                const old=this.media;
                if(this.image) {
                    const video=this.image.startsWith('data:video/');
                    const media=document.createElement(video?'video':'img');
                    media.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none';
                    if(video){media.muted=true;media.loop=true;media.playsInline=true;}
                    media.src=this.image;this.bg.append(media);this.media=media;
                    old?.pause?.();old?.remove();
                    for(const el of [...this.bg.children])if(el!==media){el.pause?.();el.remove();}
                    media.onerror=()=>this.notify('Фон не удалось воспроизвести. Выбери другой файл.',true);
                } else {for(const el of [...this.bg.children]){el.pause?.();el.remove();}this.media=null;}
            }
            const styleKey=[this.imageToken,s.zoom,s.x,s.y,s.blur].join(':');
            if(this.media&&styleKey!==this.backgroundStyleKey){this.backgroundStyleKey=styleKey;this.media.style.transform=`scale(${s.zoom/100})`;this.media.style.objectPosition=`${s.x}% ${s.y}%`;this.media.style.transformOrigin=`${s.x}% ${s.y}%`;this.media.style.filter=`blur(${s.blur}px)`;}
            if(this.media?.tagName==='VIDEO'){const media=this.media;if(document.hidden||this.reduced.matches){if(!media.paused)media.pause();}else if(media.paused&&this.backgroundPlaybackVideo!==media){this.backgroundPlaybackVideo=media;media.play().catch(()=>{}).finally(()=>{if(this.backgroundPlaybackVideo===media)this.backgroundPlaybackVideo=null;});}}

            const display=this.image?'block':'none';if(this.bg.style.display!==display)this.bg.style.display=display;
        }
    });
