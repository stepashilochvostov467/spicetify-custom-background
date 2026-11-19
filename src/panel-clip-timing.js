    Object.assign(APP,{
        async preparePanelClipTiming(clip, audio) {
            if(!clip||clip===audio||this.panelClipSync?.uri===clip)return;
            const anchors=await images.run('readonly',undefined,'lyrics-sync:'+clip).catch(()=>null);
            if(Spicetify.Player.data?.item?.uri!==clip||this.panelClipSync?.uri===clip)return;
            this.panelClipSync={uri:clip,anchors:Array.isArray(anchors)?anchors:[]};
        },
        panelUsesAudioTiming() {
            const clip=Spicetify.Player.data?.item?.uri;
            return Boolean(clip&&this.panelLyricTimingURI&&this.panelLyricTimingURI!==clip&&this.panelAudioURI()===this.panelLyricTimingURI);
        },
        panelTimingAnchors() {
            const clip=Spicetify.Player.data?.item?.uri;
            return this.panelUsesAudioTiming()&&this.panelClipSync?.uri===clip?this.panelClipSync.anchors:null;
        },
        panelLyricProgress(progress) {
            const anchors=this.panelTimingAnchors();
            if(!anchors?.length)return progress;
            let anchor=anchors[0];
            for(const point of anchors){if(point.video>progress)break;anchor=point;}
            return progress-anchor.video+anchor.audio;
        },
        bindCurrentClipLine(start) {
            const anchors=this.panelTimingAnchors();
            const progress=playerValue('getProgress');
            if(!anchors||!Number.isFinite(start)||start<0||!Number.isFinite(progress)||progress<0)return false;
            this.panelClipAnchorArmed=false;
            const video=Math.floor(progress);
            const updated=anchors.filter(point=>Math.abs(point.video-video)>250);
            updated.push({video,audio:start});
            updated.sort((a,b)=>a.video-b.video);
            this.setPanelClipAnchors(updated).catch(error=>this.report(error));
            return true;
        },
        seekPanelLyric(start) {
            if(this.panelClipAnchorArmed&&this.bindCurrentClipLine(start))return;
            const anchors=this.panelTimingAnchors();
            let target=start;
            if(anchors?.length){
                let nearest=Infinity;
                const now=playerValue('getProgress');
                for(let i=0;i<anchors.length;i++){
                    const {video,audio}=anchors[i];
                    const from=i?video:0,to=(anchors[i+1]?.video??Infinity)-1;
                    const candidate=clamp(start+video-audio,from,to);
                    const error=Math.abs(start-(candidate-video+audio))*1e6+Math.abs(now-candidate);
                    if(error<nearest){target=candidate;nearest=error;}
                }
            }
            this.panelClock=null;this.panelTimelineProgress=null;
            Spicetify.Player.seek(Math.max(0,target));
        },
        async setPanelClipAnchors(anchors) {
            const uri=Spicetify.Player.data?.item?.uri;
            if(!this.panelUsesAudioTiming())return;
            const state=this.panelClipSync={uri,anchors};
            const previous=this.panelClipSyncWrite||Promise.resolve();
            const write=this.panelClipSyncWrite=previous.catch(()=>{}).then(()=>images.run('readwrite',anchors,'lyrics-sync:'+uri));
            this.panelClock=null;
            this.panelTimelineProgress=null;
            this.panelLyricIndex=null;
            this.setLyricReading('',false);
            this.syncPanelLyrics();
            this.updatePanelMediaPicker();
            await write;
            if(this.panelClipSync===state)this.notify(anchors.length?'Привязка текста сохранена':'Привязки текста сброшены');
        },
        updatePanelClipTimingControls(picker) {
            const anchors=this.panelTimingAnchors();
            const available=Boolean(anchors&&this.panelLyricLines?.some(line=>line.start!==null));
            picker.syncText.hidden=!available;
            picker.syncText.title='Alt+S — привязать строку под курсором';
            picker.resetSync.hidden=!available||!anchors.length;
            picker.syncText.textContent=anchors?.length?'Добавить точку синхронизации':'Синхронизировать текст';
            const clip=Spicetify.Player.data?.item?.uri;
            if(clip&&clip!==this.panelAudioURI()&&this.panelLyricTimingURI===clip)picker.output.textContent+=' · Тайминги клипа';
        },
        async panelSpotifyTiming(uri,playingURI,force=false) {
            if(playingURI===uri)return {data:await this.spotifyPanelData(uri,force),timingURI:uri};
            const clip=this.spotifyPanelData(playingURI,force).catch(()=>null);
            const audio=this.spotifyPanelData(uri,force);
            audio.catch(()=>{});
            const native=await clip;
            if(this.panelLines(native,'spotify').some(line=>line.start!==null))return {data:native,timingURI:playingURI};
            const fallback=await audio.catch(error=>{if(this.panelLines(native,'spotify').length)return native;throw error;});
            return {data:fallback,timingURI:fallback===native?playingURI:uri};
        }
    });
