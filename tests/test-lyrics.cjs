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

    const result=await page.evaluate('('+fs.readFileSync('tests/syllable-checks.js','utf8')+')()');
    await page.keyboard.press('Alt+b');
    await page.getByText('Текст песни в правой панели',{exact:true}).click();
    await page.locator('[data-setting=lyricsHighlight]').selectOption('syllables');
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('cbp_v2_settings')).lyricsHighlight==='syllables');
    await page.locator('[data-setting=lyricsHighlight]').selectOption('letters');
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('cbp_v2_settings')).lyricsHighlight==='letters');
    await page.keyboard.press('Escape');
    await page.evaluate(()=>{
 const a=CBP.app;a.lyricsPanel.hidden=false;a.lyricsPanel.style.setProperty('--cbp-panel-ink','#ffffff');a.lyricsPanel.style.setProperty('--cbp-panel-muted-ink','#777777');
 const row=document.createElement('div');row.className='cbp-line';row.style.background='#000';
 row.innerHTML='<span class="cbp-original"><span id="sweep-pixels" class="cbp-syllable" style="font:40px monospace;--cbp-fill:0%">MMMMMMMM</span></span>';
 a.lyricsPanel.querySelector('.cbp-lines').replaceChildren(row);
});
const luminanceHalves=[];
for(const progress of [0,50,100]){
 await page.locator('#sweep-pixels').evaluate((el,p)=>el.style.setProperty('--cbp-fill',p+'%'),progress);
 const png=(await page.locator('#sweep-pixels').screenshot()).toString('base64');
 luminanceHalves.push(await page.evaluate(async base64=>{
  const img=new Image();img.src='data:image/png;base64,'+base64;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data,sums=[0,0];
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;sums[x<c.width/2?0:1]+=d[i]+d[i+1]+d[i+2];}return sums;
 },png));
}
assert.ok(luminanceHalves[1][0]>luminanceHalves[0][0]*1.5,'half-filled glyphs brighten on their left half');
assert.ok(Math.abs(luminanceHalves[1][1]-luminanceHalves[0][1])<luminanceHalves[0][1]*.12,'right half stays unfilled at 50 percent');
assert.ok(luminanceHalves[2][1]>luminanceHalves[1][1]*1.5,'fill subsequently reaches the right half');
console.log('Screenshot pixels confirm continuous left-to-right glyph fill at 0/50/100 percent');
assert.deepEqual(errors,[]);console.log(result.join('\n'));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
