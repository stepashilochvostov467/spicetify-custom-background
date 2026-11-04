    // Runs in its own Web Worker: model inference never blocks Spotify's UI.
    function localTranslatorWorker() {
        const runtimeBase='https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/';
        const assets=[
            ['transformers.min.js','aa5002b70e789798da263f5f99c62bd3e8fcd0c119258a493c40c180648365fa'],
            ['ort-wasm-simd-threaded.jsep.mjs','08fb86ec433c78bfb032c5d84a68b8e8e5a8d81268fa39e24314179a5767a5b9'],
            ['ort-wasm-simd-threaded.jsep.wasm','c46655e8a94afc45338d4cb2b840475f88e5012d524509916e505079c00bfa39']
        ];
        const model='Xenova/opus-mt-en-ru',revision='e050376e960175e8ddc5cff85025dc8436cddd68';
        const modelBase=`https://huggingface.co/${model}/resolve/${revision}/`;
        const modelFiles=['tokenizer.json','tokenizer_config.json','config.json','generation_config.json','onnx/encoder_model_quantized.onnx','onnx/decoder_model_merged_quantized.onnx'];
        const nativeFetch=self.fetch.bind(self),blobs=[],pendingCache=new Set();
        let enginePromise,library,cache,lastProgress=0,cacheFailed=false,active=null,queue=[],working=false;
        const modelProgress=new Map();
        const notify=data=>self.postMessage(data);
        const progress=data=>{const now=Date.now();if(now-lastProgress>200||data.phase==='ready'){lastProgress=now;notify({type:'progress',...data});}};
        const cancelled=job=>job.cancelled;
        async function cachedFetch(url) {
            if(typeof url!=='string')url=url.url;
            if(blobs.includes(url))return nativeFetch(url);
            const trusted=assets.some(([name])=>url===runtimeBase+name)||modelFiles.some(name=>url===modelBase+name);
            if(!trusted)throw Error('Unexpected model resource');
            const saved=await cache.match(url);if(saved)return saved;
            progress({phase:'download',file:url.split('/').at(-1)});
            const response=await nativeFetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(180000)});
            if(!response.ok)throw Error('Model download failed: HTTP '+response.status);
            const writing=cache.put(url,response.clone()).catch(()=>{cacheFailed=true;}).finally(()=>pendingCache.delete(writing));
            pendingCache.add(writing);return response;
        }
        function blobURL(bytes,type) {const url=URL.createObjectURL(new Blob([bytes],{type}));blobs.push(url);return url;}
        async function runtimeAsset([name,expected]) {
            const url=runtimeBase+name,response=await cachedFetch(url),bytes=await response.arrayBuffer();
            const digest=await crypto.subtle.digest('SHA-256',bytes);
            const actual=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
            if(actual!==expected){await cache.delete(url);throw Error('Runtime integrity check failed');}
            return bytes;
        }
        async function engine() {
            if(!enginePromise)enginePromise=(async()=>{
                cache=await caches.open('cbp-local-en-ru-v1');
                const [runtime,module,wasm]=await Promise.all(assets.map(runtimeAsset));
                library=await import(blobURL(runtime,'text/javascript'));
                const env=library.env;env.allowLocalModels=false;env.useBrowserCache=false;
                env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
                env.backends.onnx.wasm.wasmPaths={mjs:blobURL(module,'text/javascript'),wasm:blobURL(wasm,'application/wasm')};
                // Only fixed model assets can leave this worker; lyric text is never sent.
                self.fetch=cachedFetch;
                const pipe=await library.pipeline('translation',model,{device:'wasm',dtype:'q8',revision,progress_callback:data=>{
                    if(data.status==='progress'&&data.file?.endsWith('.onnx')){
                        modelProgress.set(data.file,data.progress);
                        progress({phase:'model',progress:[...modelProgress.values()].reduce((sum,value)=>sum+value,0)/2});
                    }
                    else if(data.status==='initiate')progress({phase:'model'});
                }});
                await Promise.all([...pendingCache]);
                progress({phase:'ready',cacheFailed});return pipe;
            })();
            return enginePromise;
        }
        async function drain() {
            if(working)return;working=true;
            try{
                while(queue.length){
                    const job=queue.shift();if(cancelled(job))continue;active=job;
                    try{
                        const pipe=await engine();if(cancelled(job))continue;
                        const stop=new library.InterruptableStoppingCriteria();job.stop=stop;
                        const criteria=new library.StoppingCriteriaList();criteria.push(stop);
                        const result=await pipe(job.text,{max_new_tokens:128,stopping_criteria:criteria,num_beams:3});
                        if(!cancelled(job))notify({type:'result',id:job.id,text:result?.[0]?.translation_text});
                    }catch(error){if(!cancelled(job))notify({type:'error',id:job.id,message:String(error.message||error).slice(0,300)});}
                    finally{active=null;}
                }
            }finally{working=false;}
        }
        self.onmessage=({data})=>{
            if(data.type==='cancel'){
                const queued=queue.find(job=>job.id===data.id);if(queued)queued.cancelled=true;
                if(active?.id===data.id){active.cancelled=true;active.stop?.interrupt();}
            }else if(data.type==='translate'&&Number.isSafeInteger(data.id)&&typeof data.text==='string'&&data.text.length<=2000){
                queue.push({id:data.id,text:data.text,cancelled:false});drain();
            }
        };
    }
