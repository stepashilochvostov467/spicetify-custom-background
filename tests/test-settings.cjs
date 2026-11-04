const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url()==='https://cbp.test/'?r.fulfill({contentType:'text/html',body:'<!doctype html><html><body><div id="main"></div></body></html>'}):r.abort());
 await page.addInitScript(()=>{
  window.Spicetify={LocalStorage:{get:k=>localStorage.getItem(k),set:(k,v)=>localStorage.setItem(k,v)},showNotification:()=>{},Topbar:{Button:class{constructor(label,icon,fn){const b=document.createElement('button');b.title=label;b.onclick=fn;document.body.append(b);}}},Player:{data:{item:{uri:'spotify:track:TEST',metadata:{}}},addEventListener:()=>{},isPlaying:()=>false,getProgress:()=>0},CosmosAsync:{get:async()=>({lyrics:{syncType:'LINE_SYNCED',lines:[{words:'Fixture lyric',startTimeMs:'0'}]}})}};
 });
 const source=fs.readFileSync('custom-bg.js','utf8');
 const load=async()=>{await page.addScriptTag({content:source});await page.waitForFunction(()=>window.CBP?.app.lyricsPanel&&window.CBP?.app.menu);};
 await page.goto('https://cbp.test/');await load();await page.evaluate(()=>{CBP.app.settings.lyricsLastSource='spotify';});
 assert.equal(await page.locator('button[title*="Alt+P"]').count(),0);
 assert.equal(await page.locator('[data-action="cycle"]').count(),0);
 await page.keyboard.press('Alt+v');await page.waitForFunction(()=>!CBP.app.lyricsPanel.hidden);
 await page.keyboard.press('Alt+v');await page.waitForFunction(()=>CBP.app.lyricsPanel.hidden&&!document.body.classList.contains('cbp-panel-lyrics'));
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('cbp_v2_settings')).lyricsSource),'off');
 await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'м',code:'KeyV',altKey:true,bubbles:true})));
 await page.waitForFunction(()=>!CBP.app.lyricsPanel.hidden);
 await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'v',code:'KeyV',altKey:true,repeat:true,bubbles:true})));
 assert.equal(await page.evaluate(()=>CBP.app.lyricsPanel.hidden),false);
 await page.reload();await load();await page.waitForFunction(()=>!CBP.app.lyricsPanel.hidden);
 await page.locator('#cbp-lyrics [data-close]').click();await page.waitForFunction(()=>CBP.app.lyricsPanel.hidden);
 await page.keyboard.press('Alt+b');
 assert.equal(await page.locator('#cbp-settings-menu details[open]').count(),0);
 await page.getByText('Фон и положение',{exact:true}).click();
 assert.equal(await page.locator('#cbp-settings-menu details[open]').count(),1);
 await page.keyboard.press('Escape');await page.keyboard.press('Alt+b');
 assert.equal(await page.locator('#cbp-settings-menu details[open]').count(),0);
 await page.keyboard.press('Escape');await page.keyboard.press('Alt+p');
 await page.waitForFunction(()=>!CBP.app.transferDialog.hidden);
 const unchanged=await page.evaluate(()=>JSON.stringify(CBP.app.settings));
 await page.keyboard.press('Alt+p');await page.waitForFunction(()=>CBP.app.transferDialog.hidden);
 assert.equal(await page.evaluate(()=>JSON.stringify(CBP.app.settings)),unchanged);
 assert.equal(await page.locator('#cbp-settings-menu').getAttribute('hidden'),'');
 console.log('Real Alt+V toggles and persists lyrics; Russian layout and repeat work; Alt+P toggles file transfer without changing appearance; settings reopen collapsed');
 const expected=await page.evaluate(async()=>{
  const a=CBP.app;
  for(const input of a.menu.querySelectorAll('[data-setting]')){
   const k=input.dataset.setting;
   if(input.type==='checkbox')input.checked=true;
   else if(input.type==='color')input.value='#ca4872';
   else if(input.type==='range')input.value=Number(input.min)+(Number(input.max)-Number(input.min))*.6;
   else if(k==='lyricsSource')input.value='off';
   else if(k==='font')input.value='system';
   else if(k==='colorMode')input.value='custom';
   else if(k==='lyricsTranslationEngine')input.value='mymemory';
   input.dispatchEvent(new Event('input',{bubbles:true}));
  }
  a.menu.querySelector('#cbp-color').value='#ac34de';a.menu.querySelector('#cbp-color').dispatchEvent(new Event('input',{bubbles:true}));
  await a.render();return {...a.settings};
 });
 // Save immediately after a real file-input upload, while decoding/storage may still be pending.
 await page.locator('#cbp-image-upload').setInputFiles({name:'test.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="#2277aa"/></svg>')});
 const exported=await page.evaluate(()=>CBP.app.appearanceBundle());
 assert.match(exported.image,/^data:image\/svg/);
 await page.reload();await load();await page.waitForFunction(()=>!!CBP.app.image);
 assert.deepEqual(await page.evaluate(()=>CBP.app.settings),expected);
 assert.equal(await page.evaluate(()=>CBP.app.image),exported.image);
 await page.keyboard.press('Alt+p');const downloaded=page.waitForEvent('download');
 await page.getByRole('button',{name:'Сохранить в файл',exact:true}).click();
 const download=await downloaded;const bundle=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
 assert.deepEqual(bundle.settings,expected);assert.equal(bundle.image,exported.image);
 await page.evaluate(async()=>{const a=CBP.app;a.settings.rowHeight=41;a.settings.lyricsWidth=300;a.save();await a.queueImage('',++a.imageToken);});
 await page.locator('#cbp-import').setInputFiles({name:'old-format.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bundle))});
 await page.getByRole('button',{name:'Импортировать и применить',exact:true}).click();
 await page.waitForFunction(()=>!CBP.app.importPreview);
 assert.deepEqual(await page.evaluate(()=>CBP.app.settings),expected);assert.equal(await page.evaluate(()=>CBP.app.image),exported.image);
 await page.reload();await load();await page.waitForFunction(()=>!!CBP.app.image);
 assert.deepEqual(await page.evaluate(()=>CBP.app.settings),expected);
 assert.equal(await page.locator('#cbp-presets,#cbp-preset-name').count(),0);
 console.log('All settings and wallpaper survive reload; real JSON download and old-format file import restore every preference without saved preset lists');
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
