    Object.assign(APP,{
        validateBundle(bundle) {
            if(!bundle||bundle.format!=='custom-background-preset'||bundle.version!==1||typeof bundle.name!=='string'||!bundle.name.trim()||!bundle.settings||typeof bundle.settings!=='object'||Array.isArray(bundle.settings))throw Error('Это не файл оформления Custom Background');
            const image=bundle.image??'';
            if(typeof image!=='string'||image.length>43*1024*1024||(image&&!/^data:(?:video\/(?:mp4|webm)|image\/(?:png|jpeg|jpg|webp|gif|avif|bmp|x-icon|svg\+xml));base64,[a-z0-9+/=\s]+$/i.test(image)))throw Error('В оформлении должен быть встроенный фон, а не ссылка');
            return {...bundle,name:bundle.name.trim().slice(0,40),settings:normalize(bundle.settings),image};
        },
        async previewImport(raw) {
            const bundle=this.validateBundle(raw);if(bundle.image)await validateMedia(bundle.image);
            this.importPreview?.remove();
            const modal=document.createElement('section');modal.id='cbp-import-preview';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Предпросмотр оформления');
            modal.innerHTML='<article><h2></h2><div class="cbp-preview-media"></div><p></p><label><input type="radio" name="cbp-import-mode" value="all" checked> Всё оформление</label><label><input type="radio" name="cbp-import-mode" value="colors"> Только фон и цвета — сохранить мои панели и размеры</label><button data-confirm>Импортировать и применить</button><button data-cancel>Отмена</button><p role="status"></p></article>';
            modal.querySelector('h2').textContent=bundle.name;
            if(bundle.image){const el=document.createElement(bundle.image.startsWith('data:video/')?'video':'img');el.className='cbp-import-art';el.src=bundle.image;el.alt='Предпросмотр фона';if(el.tagName==='VIDEO'){el.muted=true;el.controls=true;el.preload='metadata';}modal.querySelector('.cbp-preview-media').append(el);}
            const s=bundle.settings;modal.querySelector('article>p').textContent=`Текст ${s.color} · затемнение ${Math.round(s.dim*100)}% · масштаб ${s.zoom}%`;
            const beforeFocus=document.activeElement;
            const close=()=>{modal.querySelector('video')?.pause();modal.remove();document.removeEventListener('keydown',key,true);this.importPreview=null;beforeFocus?.focus();};
            const key=e=>{if(e.key==='Escape'){e.stopImmediatePropagation();e.preventDefault();close();}if(e.key==='Tab'){const nodes=[...modal.querySelectorAll('button:not(:disabled),input,video[controls]')];const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};document.addEventListener('keydown',key,true);
            modal.querySelector('[data-cancel]').onclick=close;
            modal.querySelector('[data-confirm]').onclick=async()=>{
                const button=modal.querySelector('[data-confirm]');button.disabled=true;
                try{
                    const mode=modal.querySelector('input:checked').value;
                    const settings=mode==='colors'?{...this.settings,...Object.fromEntries(['blur','dim','zoom','x','y','readable','accent','custom','colorMode','color','trackColor','buttonColor'].map(k=>[k,s[k]]))}:s;
                    await this.importAppearance({...bundle,settings});close();
                }catch(error){modal.querySelector('[role="status"]').textContent=error.message;button.disabled=false;}
            };
            document.body.append(modal);this.importPreview=modal;modal.querySelector('input').focus();return modal;
        }
    });
