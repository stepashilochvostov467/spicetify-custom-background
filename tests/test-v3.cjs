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
        const a=CBP.app, checks=[];
        const ok=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
        ok(!a.overlay&&!a.setImmersion&&!document.querySelector('#cbp-immersion-host'),'immersion removed');
        ok(!a.menu.textContent.includes('Погружение'),'immersion controls removed');
        ok(a.settings.dim===.32,'settings migrated');
        ok(!('visualizer' in CBP.normalize({visualizer:'wave'}))&&!a.connectAudio&&!document.querySelector('#cbp-visualizer'),'visualizer and audio capture removed');
        a.showMenu(true);await a.render();
        ok(a.bg.querySelector('img'),'image background rendered');
        const bundle=await a.appearanceBundle();
        ok(!('transitions' in bundle.settings),'removed transition setting is not exported');
        await a.importAppearance(bundle);ok(a.settings.dim===bundle.settings.dim,'preset imported');
        const prev=a.media;await a.queueImage(testImage+' ',++a.imageToken);
        ok(a.media!==prev&&a.bg.children.length===1&&!prev.isConnected,'background changes immediately with no crossfade layer');
        await a.queueImage('',++a.imageToken);ok(!a.media&&!a.theme.textContent,'background removal resets theme');

        const cv=document.createElement('canvas');cv.width=cv.height=32;cv.getContext('2d').fillRect(0,0,32,32);const stream=cv.captureStream(10);const rec=new MediaRecorder(stream,{mimeType:'video/webm'});const chunks=[];
        const recorded=new Promise(resolve=>{rec.ondataavailable=e=>chunks.push(e.data);rec.onstop=()=>resolve(new Blob(chunks,{type:'video/webm'}));});rec.start();for(let i=0;i<6;i++){cv.getContext("2d").fillStyle=i%2?"red":"blue";cv.getContext("2d").fillRect(0,0,32,32);await new Promise(r=>setTimeout(r,100));}rec.stop();const blob=await recorded;stream.getTracks().forEach(t=>t.stop());
        const video=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);});
        await a.queueImage(video,++a.imageToken);ok(a.media.tagName==='VIDEO'&&a.media.muted&&a.media.loop,'video is muted and looped');
        await a.importAppearance({format:'custom-background-preset',version:1,name:'Video',settings:{motion:true},image:video});ok(a.image===video,'video preset import validated');


        return checks;
    });
    assert.deepEqual(errors,[]);console.log(result.join('\n'));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
