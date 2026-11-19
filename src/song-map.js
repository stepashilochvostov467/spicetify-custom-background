    function songChapters(lines,duration) {
        if(!Number.isFinite(duration)||duration<=0)return [];
        const timed=lines.filter(l=>Number.isFinite(l.start)&&l.start>=0&&l.start<duration).slice(0,2500).sort((a,b)=>a.start-b.start);
        if(!timed.length)return [];
        const normalize=text=>String(text).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
        const counts=new Map(),keys=timed.map((line,i)=>{const a=normalize(line.text),b=normalize(timed[i+1]?.text||'');const key=a.length>=8&&b.length>=8&&a!==b?a+'\n'+b:'';if(key)counts.set(key,(counts.get(key)||0)+1);return key;});
        const marks=[{start:0,label:timed[0].start>=8000?'До текста':'Начало'}];
        for(let i=0;i<timed.length&&marks.length<40;i++){
            const line=timed[i],previous=timed[i-1],last=marks.at(-1);
            if(previous&&Number.isFinite(previous.end)&&previous.end>previous.start&&line.start-previous.end>=10000){marks.push({start:previous.end,label:'Пауза в тексте'});marks.push({start:line.start,label:'Фрагмент'});}
            else if(keys[i]&&counts.get(keys[i])>=2&&line.start-last.start>=8000)marks.push({start:line.start,label:'Повтор'});
            else if(i===0&&line.start>=8000)marks.push({start:line.start,label:'Фрагмент'});
        }
        return marks.filter((m,i,all)=>i===0||m.start>all[i-1].start);
    }
    const mapInit=APP.init,mapLoad=APP.loadPanelLyrics,mapPresent=APP.presentPanelLyrics;
    Object.assign(APP,{
        songChapters,
        songMapEnabled(){return !!this.settings?.lyricsSongMap&&this.settings.lyricsSource!=='off';},
        async init(){
            await mapInit.call(this);
            Spicetify.Player.addEventListener('onprogress',()=>{if(!document.hidden&&this.songMapEnabled())this.renderSongMap();});
            document.addEventListener('visibilitychange',()=>{if(!document.hidden&&this.songMapEnabled())this.renderSongMap();});
            this.renderSongMap();
        },
        async loadPanelLyrics(...args){try{return await mapLoad.apply(this,args);}finally{this.renderSongMap();}},
        renderSongMap(){
            if(!this.songMapEnabled()){
                this.songMapEditor?.remove();this.songMapEditor=null;
                this.songMap?.remove();this.songMap=null;
                this.songMapData=null;this.songMapMarks=null;this.songMapStore=null;
                return;
            }
            if(!this.songMapStore){
                if(!this.songMapRead)this.songMapRead=images.run('readonly',undefined,'cbp_song_maps_v1').catch(()=>[]).then(saved=>{
                    this.songMapRead=null;
                    if(!this.songMapEnabled())return;
                    this.songMapStore=Array.isArray(saved)?saved.slice(-100):[];
                    this.renderSongMap();
                });
                return;
            }
            const uri=Spicetify.Player.data?.item?.uri||'',duration=playerValue('getDuration'),lines=this.panelLyricLines||[];
            if(this.songMapURI!==uri){this.songMapEditor?.remove();this.songMapEditor=null;}
            if(!/^spotify:track:/.test(uri)){this.songMap?.remove();this.songMap=null;this.songMapData=null;return;}
            const host=this.songMap?.isConnected?this.songMap.parentElement:document.querySelector('.playback-bar');if(!host)return;
            if(!this.songMap?.isConnected){this.songMap=document.createElement('div');this.songMap.id='cbp-song-map';this.songMap.setAttribute('aria-label','Карта песни');host.style.position='relative';host.append(this.songMap);this.songMapData=null;}
            if(this.songMapData!==lines||this.songMapURI!==uri||this.songMapDuration!==duration){
                this.songMapData=lines;this.songMapURI=uri;this.songMapDuration=duration;this.songMapActive=-1;
                const manual=this.songMapStore?.find(row=>row?.uri===uri)?.marks;
                const valid=Array.isArray(manual)?manual.filter(m=>Number.isFinite(m.start)&&m.start>=0&&m.start<duration&&typeof m.label==='string').slice(0,40).sort((a,b)=>a.start-b.start):null;
                this.songMapMarks=valid?.length?valid:songChapters(lines,duration);this.songMap.replaceChildren();
                this.songMap.hidden=!this.songMapMarks.length;
                this.songMapMarks.forEach((mark,i)=>{const button=document.createElement('button');button.textContent=mark.label;button.title=mark.label+' · '+Math.floor(mark.start/60000)+':'+String(Math.floor(mark.start/1000)%60).padStart(2,'0')+(valid?'':' · по тексту, можно исправить');button.style.left=mark.start/duration*100+'%';button.style.width=((this.songMapMarks[i+1]?.start??duration)-mark.start)/duration*100+'%';button.onclick=e=>{e.stopPropagation();Spicetify.Player.seek(mark.start);};button.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();this.editSongMap();};this.songMap.append(button);});
                if(this.songMapMarks.length){const edit=document.createElement('button');edit.className='cbp-map-edit';edit.textContent='⋯';edit.title='Изменить карту песни';edit.onclick=e=>{e.stopPropagation();this.editSongMap();};this.songMap.append(edit);}
            }
            const progress=playerValue('getProgress');let active=-1;for(let i=0;i<(this.songMapMarks?.length||0);i++)if(this.songMapMarks[i].start<=progress)active=i;
            if(active!==this.songMapActive){
                this.songMap.children[this.songMapActive]?.removeAttribute('data-current');
                this.songMap.children[active]?.setAttribute('data-current','');
                this.songMapActive=active;
            }
        },
        editSongMap(){
            if(!this.songMapEnabled())return;
            this.songMapEditor?.remove();const uri=this.songMapURI;if(!uri)return;
            const overlay=document.createElement('div');overlay.id='cbp-map-editor';overlay.innerHTML='<section role="dialog" aria-modal="true" aria-label="Карта песни"><h3>Карта песни</h3><p>Время — в секундах. Назови разделы: куплет, припев, инструментал. Автоматические отметки найдены только по тексту.</p><div class="cbp-map-rows"></div><button data-add>Добавить на текущем времени</button><footer><button data-reset>Вернуть автоматическую</button><button data-cancel>Отмена</button><button data-save>Сохранить</button></footer><p role="status"></p></section>';
            const rows=overlay.querySelector('.cbp-map-rows');
            const add=mark=>{if(rows.children.length>=40)return;const row=document.createElement('div'),time=document.createElement('input'),label=document.createElement('input'),remove=document.createElement('button');time.type='number';time.min='0';time.step='.1';time.value=String(mark.start/1000);time.setAttribute('aria-label','Начало в секундах');label.value=mark.label;label.maxLength=40;label.setAttribute('aria-label','Название раздела');remove.textContent='×';remove.setAttribute('aria-label','Удалить отметку');remove.onclick=()=>row.remove();row.append(time,label,remove);rows.append(row);};
            for(const mark of this.songMapMarks||[])add(mark);
            const close=()=>{overlay.remove();this.songMapEditor=null;};
            overlay.querySelector('[data-add]').onclick=()=>add({start:playerValue('getProgress'),label:'Раздел'});overlay.querySelector('[data-cancel]').onclick=close;
            const save=async marks=>{
                try{const stored=(this.songMapStore||[]).filter(row=>row?.uri!==uri);if(marks)stored.push({uri,marks});const next=stored.slice(-100);await images.run('readwrite',next,'cbp_song_maps_v1');this.songMapStore=next;this.songMapData=null;close();this.renderSongMap();}catch{overlay.querySelector('[role=status]').textContent='Не удалось сохранить. Попробуй ещё раз.';}
            };
            overlay.querySelector('[data-reset]').onclick=()=>save(null);
            overlay.querySelector('[data-save]').onclick=()=>{const marks=[...rows.children].map(row=>({start:Number(row.children[0].value)*1000,label:row.children[1].value.trim()})).sort((a,b)=>a.start-b.start);if(!marks.length||marks.some((m,i)=>!m.label||!Number.isFinite(m.start)||m.start<0||m.start>=this.songMapDuration||i>0&&m.start===marks[i-1].start)){overlay.querySelector('[role=status]').textContent='Укажи разные времена в пределах песни и названия разделов.';return;}save(marks);};
            overlay.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();close();}};overlay.onclick=e=>{if(e.target===overlay)close();};document.body.append(overlay);this.songMapEditor=overlay;overlay.querySelector('input,button').focus();
        }
    });
    if(mapPresent)APP.presentPanelLyrics=function(...args){const result=mapPresent.apply(this,args);this.renderSongMap();return result;};
    const mapStyle=document.createElement('style');mapStyle.textContent=`
        #cbp-song-map{position:absolute;bottom:100%;left:0;right:0;height:18px;z-index:5;color:var(--cbp-ui-ink,#fff);font:10px var(--font-family,sans-serif)}
        #cbp-song-map[hidden]{display:none}#cbp-song-map button{position:absolute;top:0;height:16px;border:0;border-inline-start:1px solid currentColor;background:transparent;color:inherit;font:inherit;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;text-align:left;padding:0 4px;cursor:pointer;opacity:.65}
        #cbp-song-map button:hover,#cbp-song-map [data-current]{opacity:1;text-decoration:underline}#cbp-song-map .cbp-map-edit{right:-24px;width:24px;text-align:center;border:0}
        #cbp-map-editor{position:fixed;inset:0;z-index:100005;display:grid;place-items:center;background:#0008;font:14px var(--font-family,sans-serif);color:#f5f5f5}
        #cbp-map-editor section{background:#181b23;border:1px solid #ffffff30;border-radius:16px;padding:24px;width:min(560px,90vw);max-height:85vh;overflow:auto}#cbp-map-editor p{font-size:12px;line-height:1.5}#cbp-map-editor .cbp-map-rows>div{display:flex;gap:8px;margin:8px 0}#cbp-map-editor input{min-width:0;padding:8px;background:#ffffff10;color:inherit;border:1px solid #ffffff30;border-radius:6px}#cbp-map-editor input[type=number]{width:90px}#cbp-map-editor input:not([type=number]){flex:1}#cbp-map-editor button{padding:8px;border-radius:6px;border:1px solid #ffffff30;background:transparent;color:inherit;cursor:pointer}#cbp-map-editor footer{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
    `;document.head.append(mapStyle);


