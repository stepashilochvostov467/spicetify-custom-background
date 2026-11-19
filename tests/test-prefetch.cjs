const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const source = fs.readFileSync('custom-bg.js','utf8');
fs.mkdirSync('test-results', {recursive:true});
(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport:{width:1440,height:1000} });
    const errors=[];page.on('pageerror', e=>errors.push(e.message));
    // A local test origin with no external network calls.
    await page.route('https://cbp.test/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><style>body{margin:0;background:#121212;color:white}#main{display:grid;grid-template-columns:260px 1fr;gap:8px;height:100vh}.yQCyOSVcMCen_NJKPHB6{padding:24px}.R1kU6b2KxZc8FWfbYf3m{padding:40px}.XvuTwlgQRqJ5NnVLN9ZH{position:fixed;bottom:0;height:90px;width:100%}h1{font-size:64px}.main-trackList-rowTitle{margin-top:40px;font-size:24px}</style></head><body><div id="main"><nav class="yQCyOSVcMCen_NJKPHB6"><h3>Моя медиатека</h3><p>Любимые треки</p></nav><main class="R1kU6b2KxZc8FWfbYf3m"><h1>Любимые треки</h1><p class="main-trackList-rowTitle">Музыка для тебя</p></main><footer class="XvuTwlgQRqJ5NnVLN9ZH"><div data-testid="now-playing-bar">Название трека</div></footer></div></body></html>`}));
    await page.goto('https://cbp.test/');
    await page.evaluate(async()=>{
        const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><defs><linearGradient id="g"><stop stop-color="#f5ead0"/><stop offset="1" stop-color="#829ee0"/></linearGradient></defs><path fill="url(#g)" d="M0 0h1200v800H0z"/></svg>';
        window.testImage='data:image/svg+xml;base64,'+btoa(svg);
        const db=await new Promise((r,j)=>{const q=indexedDB.open('CBP_Storage',1);q.onupgradeneeded=()=>q.result.createObjectStore('images');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});
        await new Promise(r=>{const t=db.transaction('images','readwrite');t.objectStore('images').put(window.testImage,'cbp_bg_image');t.oncomplete=r;});db.close();
        localStorage.setItem('cbp_bg_opacity','0.32');localStorage.setItem('cbp_ai_color','true');
        window.notifications=[];window.calls=[];window.playerEvents={};
        const area=document.querySelector('.R1kU6b2KxZc8FWfbYf3m');
        area.insertAdjacentHTML('afterbegin','<div class="main-entityHeader-container"><div class="uP1rcUSIWCFaOZaoH0ZG" style="background-color:rgb(80,56,160)"></div></div><div class="P1kwly6O5plr1VQVdOLV" style="background:rgba(53,53,53,.7)"></div><div class="r8bczAWCEgb9_L0iyIcc" style="background-image:linear-gradient(#353535b3,transparent)"></div><header class="main-topBar-container"><div class="main-topBar-background"></div></header><div class="rrn0EjHTu7eCxn9G0Rrc iPo4a2lbrsxW9Iedav3h" style="background:#2d2b3c"></div>');
        window.Spicetify={LocalStorage:{get:k=>localStorage.getItem(k),set:(k,v)=>localStorage.setItem(k,v)},showNotification:(m,e)=>notifications.push([m,e]),Topbar:{Button:class {constructor(label,icon,fn){this.element=document.createElement('button');this.element.title=label;this.element.onclick=fn;document.body.append(this.element);}}},Player:{data:{item:{metadata:{title:'Тестовый трек',artist_name:'Исполнитель',image_url:window.testImage}}},addEventListener:(type,fn)=>playerEvents[type]=fn,isPlaying:()=>false,getProgress:()=>60000,getDuration:()=>180000,back:()=>calls.push('back'),next:()=>calls.push('next'),togglePlay:()=>calls.push('play'),seek:v=>calls.push(['seek',v])}};
    });
    await page.addScriptTag({content:source});
    await page.waitForFunction(()=>window.CBP?.app.theme?.textContent.length>100);


    const result=await page.evaluate(async()=>{
        const a=CBP.app,checks=[],ok=(v,m)=>{if(!v)throw Error(m);checks.push(m);},wait=ms=>new Promise(r=>setTimeout(r,ms));
        clearTimeout(a.initialTrackTimer);a.initialTrackTimer=null;
        const c=document.createElement('canvas');c.width=32;c.height=32;const ctx=c.getContext('2d'),st=c.captureStream(0),parts=[],rec=new MediaRecorder(st,{mimeType:'video/webm'});rec.ondataavailable=e=>parts.push(e.data);const stopped=new Promise(r=>rec.onstop=r);rec.start();for(let i=0;i<10;i++){ctx.fillStyle=i%2?'#453388':'#48baca';ctx.fillRect(0,0,32,32);st.getVideoTracks()[0].requestFrame();await wait(100);}rec.stop();await stopped;st.getTracks().forEach(t=>t.stop());const videoBlob=new Blob(parts,{type:'video/webm'});
        let network=0,translations=0,graph=0;const companion=!!a.fetchCompanionLyrics,source=companion?'spicy':'spotify';
        const payload=id=>companion?{Type:'Syllable',Language:'en',Content:[{Lead:{StartTime:0,Syllables:[{Text:'I see the '+id,StartTime:0,EndTime:1}]}}]}:{lyrics:{language:'en',syncType:'LINE_SYNCED',lines:[{startTimeMs:'0',words:'I see the '+id}]}};
        const packed=value=>{const values=[],stream=[],ptr=v=>{let i=values.indexOf(v);if(i<0){i=values.length;values.push(v);}return i;};function emit(v){if(v===null||typeof v!=='object'){stream.push(ptr(v));return;}if(Array.isArray(v)){stream.push(-2,v.length);for(const item of v)emit(item);return;}const keys=Object.keys(v);stream.push(-1,keys.length,...keys.map(ptr));for(const k of keys)emit(v[k]);}emit(value);return [values,stream];};
        if(companion){a.readSpicy=async()=>null;a.getPanelAccessToken=async()=>'fixture-token';ok(a.unpackPreparedLyrics([['a',1,2],[-3,2,1,0,1,2]])[1].a===2,'companion decoder supports schema-array wire payloads');const fixture=packed(payload('DECODER'));ok(a.unpackPreparedLyrics(fixture).Content.length===1,'companion wire decoder roundtrips nested syllables');let rejected=false;try{a.unpackPreparedLyrics([['__proto__'],[-1,1,0,-6]]);}catch{rejected=true;}ok(rejected,'companion decoder rejects prototype keys');}
        Spicetify.CosmosAsync={get:async url=>{network++;await wait(80);return payload(url.split('/track/')[1].split('?')[0]);}};
        Spicetify.GraphQL={Definitions:{canvas:{}},Request:async(_,vars)=>{graph++;await wait(80);return {data:{trackUnion:{canvas:{url:'https://media.test/'+vars.trackUri.split(':')[2]+'.webm',type:'VIDEO'}}}};}};
        window.fetch=async(url,options)=>{network++;await wait(80);if(url==='https://api.spicylyrics.org/query'){ok(options.headers['SpicyLyrics-WebAuth']==='Bearer fixture-token','companion auth is only attached to the fixed companion endpoint');const id=JSON.parse(options.body).queries[0].variables.id;return new Response(JSON.stringify({queries:[{operationId:'0',result:{httpStatus:200,data:packed(payload(id))}}]}),{headers:{'content-type':'application/json'}});}ok(!options?.headers?.Authorization,'media requests carry no Spotify bearer token');return new Response(url.includes('big.webm')?new Blob([new Uint8Array(20*1024*1024)]):videoBlob,{headers:{'content-type':'video/webm'}});};
        a.requestLocalRussianTranslation=async(text,signal)=>{translations++;await wait(10);if(signal.aborted)throw Error('cancelled');return 'Русский перевод '+text;};
        Spicetify.Player.data.item={uri:'spotify:track:CURRENT',metadata:{image_url:testImage}};
        Spicetify.Queue={nextTracks:[{uri:'spotify:episode:IGNORE'},{uri:'spotify:track:NEXT1'},{uri:'spotify:track:NEXT1'},{contextTrack:{uri:'spotify:track:NEXT2'}},{uri:'spotify:track:NEXT3'}]};
        a.settings.lyricsSource=source;a.settings.lyricsTranslation=true;a.settings.lyricsTranslationEngine='local';a.panelTranslationDone=true;a.panelTranslationAbort=null;
        await a.runTrackPrefetch();
        await Promise.all([...a.preparedTracks.values()].flatMap(e=>[e.lyricsTask,e.mediaTask]));
        for(let i=0;i<200&&!a.getPreparedTrack('spotify:track:NEXT2').translationComplete;i++)await wait(10);
        ok(a.preparedTracks.size===2&&!a.getPreparedTrack('spotify:track:NEXT3'),'only two unique upcoming tracks are prepared');
        ok([...a.preparedTracks.values()].every(e=>e.blob?.size&&e.lyrics),'lyrics and actual Canvas bytes are cached in RAM');
        ok(a.getPreparedTrack('spotify:track:NEXT2').translationComplete&&translations===2,'both upcoming translations are ready before playback');
        clearTimeout(a.prefetchTimer);a.prefetchTimer=null;
        const requestsBefore=network,graphBefore=graph,translationsBefore=translations;

        const started=performance.now();Spicetify.Player.data.item={uri:'spotify:track:NEXT1',metadata:{image_url:testImage}};a.lyricsPanel.hidden=false;
        await Promise.all([a.loadPanelLyrics(),a.refreshPanelBackdrop(true)]);
        for(let i=0;i<40&&a.lyricsPanel.querySelector('.cbp-translation').hidden;i++)await wait(5);
        await new Promise(requestAnimationFrame);const warmSwitchMs=performance.now()-started;
        ok(warmSwitchMs<500,'prepared track text + translation + decoded video appear in under 500ms in browser fixture: '+Math.round(warmSwitchMs));
        ok(network===requestsBefore&&graph===graphBefore&&translations===translationsBefore,'prepared switch makes no new lyric/media requests or inference calls');
        ok(a.panelVideo.readyState>=2&&!a.lyricsPanel.querySelector('.cbp-translation').hidden,'actual decoded warm video and translated text are visible together');
        clearTimeout(a.prefetchTimer);a.prefetchTimer=null;a.clearPanelVideo();
        const removed=a.getPreparedTrack('spotify:track:NEXT2');Spicetify.Queue.nextTracks=[{uri:'spotify:track:OTHER'}];a.scheduleTrackPrefetch();
        ok(removed.controller.signal.aborted&&!a.getPreparedTrack('spotify:track:NEXT2'),'queue replacement aborts and evicts stale lookahead');
        clearTimeout(a.prefetchTimer);a.prefetchTimer=null;a.clearTrackPrefetch();
        const controller=new AbortController();a.preparedTracks.set('big1',{controller,blob:new Blob([new Uint8Array(20*1024*1024)])});a.prefetchBytes=20*1024*1024;
        a.preparedTracks.set('big2',{controller});await a.prepareTrackMedia({uri:'spotify:track:MEMORY',metadata:{'canvas.url':'https://media.test/big.webm'}},a.preparedTracks.get('big2'));
        ok(a.prefetchBytes<=32*1024*1024&&!a.preparedTracks.get('big1').blob,'media cache evicts older bytes before exceeding 32 MiB');
        a.settings.lyricsSource='off';await a.render();
        ok(a.preparedTracks.size===0&&a.prefetchBytes===0&&!a.prefetchTimer,'closing lyrics clears RAM lookahead and cancels jobs');
        return {checks,warmSwitchMs};
    });
    assert.deepEqual(errors,[]);console.log(JSON.stringify(result,null,2));
    fs.writeFileSync('test-results/prefetch.json',JSON.stringify(result,null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
