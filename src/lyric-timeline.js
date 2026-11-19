    const MIN_VOCAL_BREAK_MS=8000;
    Object.assign(APP,{
        schedulePanelAnchor() {
            if(this.settings.lyricsLayout==='overlay'||this.panelAnchorFrame)return;
            this.panelAnchorFrame=requestAnimationFrame(()=>{
                this.panelAnchorFrame=0;
                if(this.settings.lyricsSource==='off'||this.lyricsPanel.hidden||this.lyricsPanel.dataset.reading==='hold')return;
                this.panelLyricIndex=null;this.syncPanelLyrics();
            });
        },
        syncPanelTimeline(progress) {
            const previousProgress=this.panelTimelineProgress;
            const continuous=Number.isFinite(previousProgress)&&progress>=previousProgress&&progress-previousProgress<500;
            this.panelTimelineProgress=progress;
            const animate=continuous&&this.panelLyricIndex!==null&&playerValue('isPlaying',false)&&!this.reduced.matches;
            if(this.panelTimelineSource!==this.panelLyricLines){
                this.panelTimelineSource=this.panelLyricLines;
                this.panelTimeline=this.panelLyricLines.map((line,index)=>({
                    start:line.start,end:line.end,index,background:line.background
                })).filter(line=>line.start!==null).sort((a,b)=>a.start-b.start||a.index-b.index);
                let vocalEnd=0;
                for(const line of this.panelTimeline){
                    if(line.end!=null)vocalEnd=Math.max(vocalEnd,line.end);
                    for(const voice of line.background||[]){
                        for(const syllable of voice)vocalEnd=Math.max(vocalEnd,syllable.end);
                    }
                    line.vocalEnd=line.end==null?null:vocalEnd;
                }
                this.panelList=this.lyricsPanel.querySelector('.cbp-lines');
                this.panelRowNodes=Array.from(this.panelList.querySelectorAll('.cbp-line'));this.panelStateIndex=undefined;
            }
            let lo=0,hi=this.panelTimeline.length;
            while(lo<hi){const mid=(lo+hi)>>>1;if(this.panelTimeline[mid].start<=progress)lo=mid+1;else hi=mid;}
            const index=lo?this.panelTimeline[lo-1].index:-1,previous=this.panelStateIndex,rows=this.panelRowNodes;
            const upcoming=this.panelTimeline[lo],end=lo?this.panelTimeline[lo-1].vocalEnd:0;
            const counting=!!upcoming&&end!==null&&progress>=end&&upcoming.start-end>=MIN_VOCAL_BREAK_MS;
            const cinematic=String(!!(this.lyricsPanel.dataset.reading!=='browse'&&this.settings.lyricsCinema&&counting&&upcoming.start-progress>3500
                &&this.settings.lyricsLayout!=='overlay'&&this.panelVideo?.readyState>=2));
            if(this.lyricsPanel.dataset.cinematic!==cinematic){
                this.lyricsPanel.dataset.cinemaMotion=String(animate);
                this.lyricsPanel.dataset.cinematic=cinematic;
                this.panelLyricIndex=null;
            }
            const list=this.panelList;
            const wasCounting=this.panelVocalCountdown?.parentElement===list;
            let countdownMoved=false;
            if(counting){
                if(!this.panelVocalCountdown){
                    const countdown=this.panelVocalCountdown=document.createElement('div');
                    countdown.className='cbp-vocal-countdown';
                    this.panelCountdownTime=document.createTextNode('');
                    this.panelCountdownVoice=document.createElement('span');
                    this.panelCountdownVoice.className='cbp-vocal-name';
                    countdown.append(this.panelCountdownTime,this.panelCountdownVoice);
                }
                const countdown=this.panelVocalCountdown;
                const nextRow=rows[upcoming.index];
                countdownMoved=!wasCounting||countdown.nextElementSibling!==nextRow;
                if(countdownMoved)list.insertBefore(countdown,nextRow);
                const label=`Вокал через ${Math.ceil((upcoming.start-progress)/1000)} с`;
                if(this.panelCountdownTime.data!==label)this.panelCountdownTime.data=label;
                const name=this.panelLyricLines[upcoming.index].vocalist;
                const voice=name?' · '+name:'';
                if(this.panelCountdownVoice.textContent!==voice)this.panelCountdownVoice.textContent=voice;
            }else if(wasCounting){
                this.panelVocalCountdown.remove();
            }
            if(index!==previous||counting!==wasCounting){
                const first=previous===undefined?0:Math.max(0,Math.min(previous,index));
                const last=previous===undefined?rows.length-1:Math.min(rows.length-1,Math.max(previous,index));
                for(let i=first;i<=last;i++){
                    const el=rows[i],current=i===index&&!counting,state=current?'current':i<=index?'past':'future';
                    if(el.getAttribute('aria-current')!==String(current))el.setAttribute('aria-current',String(current));
                    if(el.dataset.state!==state)el.dataset.state=state;
                }
                this.panelStateIndex=index;
            }
            const anchor=this.syncDuetAnchor?.(index,progress)??index;
            this.updatePanelVoiceCue(index,counting?null:upcoming,progress);
            if(index!==this.panelLyricIndex||anchor!==this.panelDuetAnchor||counting!==wasCounting||countdownMoved){
                this.panelLyricIndex=index;
                this.panelDuetAnchor=anchor;
                if(this.lyricsPanel.dataset.reading==='browse')return index;
                const el=counting?this.panelVocalCountdown:rows[anchor];
                if(el){
                    const layout=this.settings.lyricsLayout;
                    const fixed=layout!=='overlay';

                    const next=layout==='below'
                        ? (counting?el:rows[index]).nextElementSibling
                        : null;
                    const preview=next?.dataset.state==='future'?next:el;
                    if(layout==='below'){
                        const height=preview===el?el.offsetHeight:preview.offsetTop-el.offsetTop+preview.offsetHeight;
                        const reserve=height+'px';
                        if(this.lyricsPanel.style.getPropertyValue('--cbp-visible-lyrics-height')!==reserve){
                            this.lyricsPanel.style.setProperty('--cbp-visible-lyrics-height',reserve);
                        }
                    }
                    const row=el.getBoundingClientRect(),viewport=list.getBoundingClientRect();
                    // Keep the sung line visible even when two long translated lines exceed the viewport.
                    const offset=layout==='below'?Math.min(preview.getBoundingClientRect().bottom-viewport.bottom,row.top-viewport.top):row.top-viewport.top;
                    const top=fixed?list.scrollTop+offset:el.offsetTop-list.offsetTop-list.clientHeight/2+el.clientHeight/2;
                    list.scrollTo({top,behavior:animate?'smooth':'instant'});
                }else if(index===-1&&this.panelTimeline.length){
                    list.scrollTo({top:0,behavior:'instant'});
                }
            }
            return index;
        }
    });
