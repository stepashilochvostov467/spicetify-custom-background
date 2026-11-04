const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const source = fs.readFileSync(process.argv[2]||'custom-bg.js','utf8');
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
    await page.evaluate(()=>{
        Spicetify.Platform={History:{location:{pathname:'/search'},listen:()=>()=>{}}};
        window.perfCounts={frames:0,intervals:0};
        const raf=window.requestAnimationFrame.bind(window),interval=window.setInterval.bind(window);
        window.requestAnimationFrame=fn=>raf(now=>{perfCounts.frames++;fn(now);});
        window.setInterval=(fn,ms,...args)=>interval(()=>{perfCounts.intervals++;fn(...args);},ms);
    });
    await page.addScriptTag({content:source});
    await page.waitForFunction(()=>window.CBP?.app.theme?.textContent.length>100);

    const result=await page.evaluate(async()=>{
        const a=CBP.app;const rows=2000,steps=100;
        a.settings.lyricsSource='spotify';a.settings.lyricsTranslation=false;
        const list=a.lyricsPanel.querySelector('.cbp-lines');list.replaceChildren();
        const fragment=document.createDocumentFragment();
        a.panelLyricLines=Array.from({length:rows},(_,i)=>({text:'Line '+i,start:i*1000,syllables:[],background:[]}));
        for(let i=0;i<rows;i++){const el=document.createElement('button');el.className='cbp-line';const original=document.createElement('span');original.className='cbp-original';original.textContent='Line '+i;const translated=document.createElement('span');translated.className='cbp-translation';translated.hidden=true;el.append(original,translated);fragment.append(el);}list.append(fragment);
        // Isolate synchronization work from browser scrolling animations.
        list.scrollTo=()=>{};a.panelLyricIndex=-1;a.syncPanelLyrics(0);
        const observer=new MutationObserver(()=>{});observer.observe(list,{subtree:true,attributes:true});
        let begin=performance.now();for(let i=1;i<=steps;i++)a.syncPanelLyrics(i*1000+500);
        const forwardMs=performance.now()-begin,forwardMutations=observer.takeRecords().length;
        begin=performance.now();for(let i=steps-1;i>=0;i--)a.syncPanelLyrics(i*1000+500);
        const backwardMs=performance.now()-begin,backwardMutations=observer.takeRecords().length;observer.disconnect();
        if(list.querySelectorAll('[aria-current=true]').length!==1||list.children[0].getAttribute('aria-current')!=='true'||list.children[1].dataset.state!=='future')throw Error('Seek state regression');
        let meanReads=0,playCalls=0;
        const canvasProto=CanvasRenderingContext2D.prototype,originalRead=canvasProto.getImageData;
        canvasProto.getImageData=function(...args){meanReads++;return originalRead.apply(this,args);};
        const image=new Image();image.src=testImage;await image.decode();a.panelBackdrop.replaceChildren(image);a.panelCover=image;
        a.settings.colorMode='custom';a.settings.color='#979523';
        a.panelContrastSample=null;a.panelContrastKey=null;
        begin=performance.now();for(let i=0;i<100;i++)a.updatePanelContrast();const customContrastMs=performance.now()-begin,customPixelReads=meanReads;
        a.settings.colorMode='auto';a.panelContrastSample=null;a.panelContrastKey=null;meanReads=0;
        begin=performance.now();for(let i=0;i<100;i++)a.updatePanelContrast();const staticContrastMs=performance.now()-begin,staticPixelReads=meanReads;canvasProto.getImageData=originalRead;
        // A playing video must not receive repeated play() requests or recoloring work on every render.
        a.settings.colorMode='custom';const video=document.createElement('video');Object.defineProperty(video,'paused',{get:()=>false});video.play=()=>{playCalls++;return Promise.resolve();};a.panelVideo=video;Spicetify.Player.isPlaying=()=>true;
        a.panelBackdropKey='true:'+(Spicetify.Player.data.item.uri||'');
        for(let i=0;i<100;i++)a.syncPanelBackdropPlayback();clearTimeout(a.panelContrastTimer);a.panelContrastTimer=null;a.panelVideo=null;
        let translationLineReads=0;
        a.panelLyricLines=Array.from({length:rows},(_,i)=>({get text(){translationLineReads++;return 'Synthetic line '+(i%100);},start:i*1000,syllables:[],background:[]}));
        a.settings.lyricsTranslation=true;a.settings.lyricsTranslationEngine='mymemory';a.panelLyricLanguage='en';a.lyricRequest++;a.panelTranslationKey=null;a.translationCache=new Map();
        window.fetch=async()=>({ok:true,status:200,json:async()=>({responseStatus:200,responseData:{translatedText:'Перевод'}})});
        begin=performance.now();await a.updatePanelTranslation();const translationApplyMs=performance.now()-begin;a.settings.lyricsTranslation=false;a.cancelPanelTranslation();
        const root=document.querySelector('.R1kU6b2KxZc8FWfbYf3m'),viewport=document.createElement('div');viewport.className='os-viewport';viewport.style.cssText='height:40px;overflow:auto';
        const positions=[0,20,60],trace=[];for(const top of positions){const row=document.createElement('div');row.setAttribute('role','row');row.style.height='40px';row.getBoundingClientRect=()=>{trace.push('read');return {top,height:40};};const set=row.style.setProperty.bind(row.style);row.style.setProperty=(...args)=>{trace.push('write');set(...args);};viewport.append(row);}root.append(viewport);viewport.scrollTop=20;
        const topbar=root.querySelector('.main-topBar-container'),oldRect=topbar.getBoundingClientRect;topbar.getBoundingClientRect=()=>({bottom:40});
        a.syncStickyClipping();const firstWrite=trace.indexOf('write'),lastRead=trace.lastIndexOf('read'),geometryReadsBatched=firstWrite<0||lastRead<firstWrite;
        trace.length=0;a.syncStickyClipping();const repeatedClipWrites=trace.filter(v=>v==='write').length;
        viewport.scrollTop=0;a.syncStickyClipping();const restoredClipping=!viewport.querySelector('[data-cbp-clipped]');viewport.remove();topbar.getBoundingClientRect=oldRect;
        const pixels=new Uint8ClampedArray(16000);for(let i=0;i<pixels.length;i++)pixels[i]=i%4===3?255:(i*31)%256;
        begin=performance.now();for(let i=0;i<20;i++)CBP.analyzePixels(pixels);const backgroundAnalysisMs=performance.now()-begin;
        const line='Привет мир 😀 ';begin=performance.now();for(let i=0;i<100;i++)a.translationChunks(line.repeat(200));const chunkingMs=performance.now()-begin;
        a.settings.lyricsSource='off';a.updateLyricsClock();
        return {rows,steps,forwardMutations,backwardMutations,customPixelReads,staticPixelReads,playCalls,forwardMs,backwardMs,customContrastMs,staticContrastMs,chunkingMs,translationLineReads,translationApplyMs,geometryReadsBatched,repeatedClipWrites,restoredClipping,backgroundAnalysisMs};
    });
    console.log(JSON.stringify(result,null,2));
    fs.writeFileSync('test-results/active-'+(process.argv[3]||'after')+'.json',JSON.stringify(result,null,2));
    if(process.argv[3]!=='before'){
        assert.ok(result.forwardMutations<=500,'linear forward updates');assert.ok(result.backwardMutations<=500,'linear backward updates');
        assert.equal(result.customPixelReads,0,'custom ink never reads pixels');assert.ok(result.staticPixelReads<=1,'static cover analyzed once');assert.equal(result.playCalls,0,'no repeated play requests');
        assert.ok(result.translationLineReads<=2200,'translations use indexed rows');assert.equal(result.geometryReadsBatched,true,'measure rows before writing clips');assert.equal(result.repeatedClipWrites,0,'unchanged clipping is not written twice');assert.equal(result.restoredClipping,true,'scrolling to top restores rows');
    }
    assert.deepEqual(errors,[]);await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
