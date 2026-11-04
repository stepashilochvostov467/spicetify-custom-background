    Object.assign(APP,{
        syncPanelTimeline(progress) {
            if(this.panelTimelineSource!==this.panelLyricLines){
                this.panelTimelineSource=this.panelLyricLines;
                this.panelTimeline=this.panelLyricLines.map((line,index)=>({start:line.start,index})).filter(l=>l.start!==null).sort((a,b)=>a.start-b.start||a.index-b.index);
                this.panelList=this.lyricsPanel.querySelector('.cbp-lines');
                this.panelRowNodes=Array.from(this.panelList.children);this.panelStateIndex=undefined;
            }
            let lo=0,hi=this.panelTimeline.length;
            while(lo<hi){const mid=(lo+hi)>>>1;if(this.panelTimeline[mid].start<=progress)lo=mid+1;else hi=mid;}
            const index=lo?this.panelTimeline[lo-1].index:-1,previous=this.panelStateIndex,rows=this.panelRowNodes;
            if(index!==previous){
                const first=previous===undefined?0:Math.max(0,Math.min(previous,index));
                const last=previous===undefined?rows.length-1:Math.min(rows.length-1,Math.max(previous,index));
                for(let i=first;i<=last;i++){
                    const el=rows[i],current=String(i===index),state=i<index?'past':i===index?'current':'future';
                    if(el.getAttribute('aria-current')!==current)el.setAttribute('aria-current',current);
                    if(el.dataset.state!==state)el.dataset.state=state;
                }
                this.panelStateIndex=index;
            }
            if(index!==this.panelLyricIndex){
                this.panelLyricIndex=index;
                const el=rows[index],list=this.panelList;
                if(el)list.scrollTo({top:el.offsetTop-list.offsetTop-list.clientHeight/2+el.clientHeight/2,behavior:this.reduced.matches?'instant':'smooth'});
            }
            return index;
        }
    });
