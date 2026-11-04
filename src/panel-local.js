    Object.assign(APP,{
        closeLocalTranslator() {
            clearTimeout(this.localUnloadTimer);this.localUnloadTimer=null;
            this.localWorker?.terminate();this.localWorker=null;this.localWorkerReady=false;
            if(this.localWorkerURL)URL.revokeObjectURL(this.localWorkerURL);this.localWorkerURL=null;
            for(const entry of this.localPending?.values()||[])entry.reject(Error('Local translator closed'));
            this.localPending?.clear();
        },
        scheduleLocalUnload() {
            if(!this.localWorker)return;clearTimeout(this.localUnloadTimer);
            this.localUnloadTimer=setTimeout(()=>this.closeLocalTranslator(),60000);
        },
        getLocalTranslator() {
            clearTimeout(this.localUnloadTimer);this.localUnloadTimer=null;
            if(this.localWorker)return this.localWorker;
            this.localPending=new Map();
            this.localWorkerURL=URL.createObjectURL(new Blob(['('+localTranslatorWorker.toString()+')();'],{type:'text/javascript'}));
            const worker=new Worker(this.localWorkerURL,{type:'module',name:'cbp-local-translation'});this.localWorker=worker;
            worker.onmessage=({data})=>{
                if(this.localWorker!==worker)return;
                if(data.type==='progress'){
                    if(data.phase==='ready'){this.localWorkerReady=true;this.localCacheFailed=!!data.cacheFailed;}
                    const status=this.lyricsPanel?.querySelector('.cbp-translation-status');
                    if(status&&this.panelTranslationAbort&&!this.panelTranslationAbort.signal.aborted&&this.settings.lyricsTranslation&&this.settings.lyricsTranslationEngine==='local'){
                        status.textContent=data.phase==='ready'?'Перевожу на этом компьютере…':data.phase==='download'?'Скачиваю движок локального перевода…':Number.isFinite(data.progress)?`Подготовка языковой модели · ${Math.round(data.progress)}%`:'Подготовка языковой модели…';
                    }
                    return;
                }
                const entry=this.localPending.get(data.id);if(!entry)return;
                if(data.type==='result'&&typeof data.text==='string'&&data.text.trim()&&data.text.length<=15000)entry.resolve(data.text.trim());
                else if(data.type==='error'){
                    entry.reject(Error(this.localWorkerReady?'Локальный перевод не получился':'Не удалось подготовить локальную модель. Проверь интернет и нажми ↻.'));
                    if(!this.localWorkerReady)this.closeLocalTranslator();
                }else entry.reject(Error('Локальная модель не вернула перевод'));
            };
            worker.onerror=event=>{event.preventDefault();this.closeLocalTranslator();};return worker;
        },
        async localTranslationLine(text,signal) {
            if(signal.aborted)throw new DOMException('Cancelled','AbortError');
            const worker=this.getLocalTranslator(),id=this.localRequestId=(this.localRequestId||0)+1;
            return new Promise((resolve,reject)=>{
                let timer;
                const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);this.localPending.delete(id);};
                const abort=()=>{worker.postMessage({type:'cancel',id});cleanup();reject(new DOMException('Cancelled','AbortError'));};
                this.localPending.set(id,{resolve:value=>{cleanup();resolve(value);},reject:error=>{cleanup();reject(error);}});
                signal.addEventListener('abort',abort,{once:true});
                timer=setTimeout(()=>{abort();this.closeLocalTranslator();},this.localWorkerReady?60000:240000);
                worker.postMessage({type:'translate',id,text});
            });
        },
        async requestLocalRussianTranslation(text,signal) {
            const result=[];
            for(const chunk of this.translationChunks(text))result.push(await this.localTranslationLine(chunk,signal));
            return result.join(' ');
        }
    });
