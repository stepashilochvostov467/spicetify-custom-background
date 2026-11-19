    const normalizeVocalLine=text=>text.toLowerCase().normalize('NFKC').replace(/['’]/g,'').replace(/[^\p{L}\p{N}]+/gu,'');
    Object.assign(APP,{
        async applyOnlineVocalists(lines,list) {
            const item=Spicetify.Player.data?.item,metadata=item?.metadata;
            if(!metadata?.title||!metadata.artist_name||!lines.length||lines.every(line=>line.vocalist))return;
            const feature=metadata.title.match(/\s*[([](?:with|feat\.?|ft\.?)\s+([^()[\]]+)[)\]]$/i);
            const title=feature?metadata.title.slice(0,feature.index).trim():metadata.title;
            const artists=[...new Set([metadata.artist_name,metadata['artist_name:1']||feature?.[1]?.trim()].filter(Boolean))];
            if(artists.length<2&&!lines.some(line=>line.opposite))return;
            const uri=item.uri;
            if(this.onlineVocalLookup?.uri!==uri){
                this.onlineVocalLookup?.controller.abort();
                const controller=new AbortController();
                const query=new URLSearchParams({title,artist:artists[0],other:artists[1]||''});
                const result=fetch('http://127.0.0.1:18766/vocals?'+query,{
                    signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)]),
                    credentials:'omit',referrerPolicy:'no-referrer'
                }).then(response=>response.ok?response.json():[]).catch(()=>[]);
                this.onlineVocalLookup={uri,controller,result};
            }
            const reference=await this.onlineVocalLookup.result;
            if(!reference.length||this.panelLyricLines!==lines||Spicetify.Player.data?.item?.uri!==uri||this.settings.lyricsSource==='off')return;
            const credits=new Map(),pairs=new Map();
            const add=(map,key,name)=>{
                const names=map.get(key)||new Set();
                names.add(name);
                map.set(key,names);
            };
            for(let i=0;i<reference.length;i++){
                const [text,name]=reference[i];
                const next=reference[i+1]?.[0];
                add(credits,text,name);
                if(next)add(pairs,text+':'+next,name);
            }
            const normalized=lines.map(line=>normalizeVocalLine(line.text));
            const unique=names=>names?.size===1?[...names][0]:'';
            for(let i=0;i<lines.length;i++){
                const text=normalized[i];
                if(!lines[i].vocalist&&text.length>=8){
                    lines[i].vocalist=unique(pairs.get(text+':'+normalized[i+1]))||unique(credits.get(text));
                }
            }
            this.renderPanelVocalists(list,lines);
            this.panelLyricIndex=-1;
            this.syncPanelLyrics();
        },
        renderPanelVocalists(list,lines) {
            const rows=list.querySelectorAll('.cbp-line');
            let previous='';
            lines.forEach((line,index)=>{
                const name=line.vocalist;
                const row=rows[index];
                row.querySelector('.cbp-vocal-name')?.remove();
                if(name&&name!==previous){
                    const label=document.createElement('span');
                    label.className='cbp-vocal-name';
                    label.textContent=name;
                    row.prepend(label);
                }
                if(name)previous=name;
            });
        },
        updatePanelVoiceCue(index,upcoming,progress) {
            const row=this.panelRowNodes[index],current=this.panelLyricLines[index];
            const next=this.panelLyricLines[upcoming?.index];
            const startsSoon=start=>start>progress&&start-progress<=2500;
            let label='',text='';
            if(row&&current&&this.settings.lyricsDuet&&this.lyricsPanel.dataset.reading!=='browse'){
                const voice=current.background?.find(parts=>startsSoon(parts[0]?.start));
                const changesParty=current.voice&&next?.voice&&current.voice!==next.voice&&next.voice!=='joint';
                const changesSinger=current.vocalist&&next?.vocalist&&current.vocalist!==next.vocalist;
                if(voice){
                    label='Скоро бэк-вокал';
                    text=voice.map(part=>part.text+(part.space?' ':'')).join('');
                }else if(startsSoon(upcoming?.start)&&(changesParty||changesSinger)){
                    label=next.vocalist||'Другой голос';
                    text=next.text;
                }
            }
            const cue=this.panelVoiceCue;
            if(!text){
                if(cue?.isConnected){cue.remove();this.schedulePanelAnchor();}
                return;
            }
            const content=label+' · '+text;
            if(cue?.parentElement===row&&cue.textContent===content)return;
            const element=cue||document.createElement('span');
            element.className='cbp-voice-cue';
            element.textContent=content;
            row.append(element);
            this.panelVoiceCue=element;
            this.schedulePanelAnchor();
        },
        syncDuetAnchor(index,progress) {
            if(this.lyricsPanel.dataset.duet!=='true')return index;
            const current=this.panelLyricLines[index],previous=this.panelLyricLines[index-1],rows=this.panelRowNodes;
            const overlap=previous&&current&&previous.voice!==current.voice&&previous.voice!=='joint'&&current.voice!=='joint'&&previous.end>progress&&previous.start<=progress;
            const live=overlap?rows[index-1]:null;
            if(this.duetLiveRow!==live){
                if(this.duetLiveRow?.isConnected&&this.duetLiveRow!==rows[index]){this.duetLiveRow.dataset.state='past';this.duetLiveRow.setAttribute('aria-current','false');}
                this.duetLiveRow=live;this.duetBackingCursor=null;
                if(live){live.dataset.state='current';live.setAttribute('aria-current','true');}
            }
            return overlap?index-1:index;
        },
        arrangePanelDuet(lines) {
            if(!this.settings.lyricsDuet||!lines.some(line=>line.opposite===true))return lines;
            const result=[];
            for(const line of lines){
                line.voice=line.opposite?'right':'left';
                const previous=result.at(-1);
                // Only combine explicitly opposing parts with identical text and timing.
                // No performer names or unison timing are inferred from the track title.
                if(previous&&previous.voice!==line.voice&&previous.voice!=='joint'&&previous.start!==null&&previous.end!==null&&previous.end>previous.start&&previous.start===line.start&&previous.end===line.end&&previous.text===line.text){
                    previous.voice='joint';
                    previous.vocalist=previous.vocalist&&line.vocalist
                        ? [...new Set([previous.vocalist,line.vocalist])].join(' и ')
                        : '';
                    const seen=new Set(previous.background.map(parts=>JSON.stringify(parts)));
                    for(const parts of line.background){const key=JSON.stringify(parts);if(!seen.has(key)){previous.background.push(parts);seen.add(key);}}
                }else result.push(line);
            }
            return result;
        }
    });
