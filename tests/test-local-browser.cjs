const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
fs.mkdirSync('test-results',{recursive:true});
(async()=>{
    const context=await chromium.launchPersistentContext(process.argv[2]||'test-results/local-translation-profile',{headless:true,channel:'chrome'});
    try{
        const page=await context.newPage(),requests=[],errors=[];
        context.on('request',request=>{if(request.url().startsWith('https:')&&!request.url().startsWith('https://cbp.test/'))requests.push({url:request.url(),body:request.postData()||''});});
        page.on('pageerror',error=>errors.push(error.message));
        await page.route('https://cbp.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><div id="main"></div></body></html>'}));
        await page.goto('https://cbp.test/');
        await page.evaluate(source=>{
            window.testLyricSource=source;
            window.SpicyLyrics={db:{objectStores:{lyricsStore:{manager:{get:async()=>({Type:'Syllable',Language:'und',Content:[{Lead:{StartTime:0,Syllables:currentSynthetic.split(' ').map((text,i)=>({Text:text,StartTime:i*.1,EndTime:(i+1)*.1}))}}]})}}}}};
            window.currentSynthetic='I see a small violet fox and we walk near the quiet river.';
            window.Spicetify={LocalStorage:{get:key=>localStorage.getItem(key),set:(key,value)=>localStorage.setItem(key,value)},showNotification:()=>{},Topbar:{Button:class{constructor(){this.element=document.createElement('button');}}},Platform:{History:{location:{pathname:'/search'},listen:()=>()=>{}}},Player:{data:{item:{uri:'spotify:track:LOCALBROWSER',metadata:{}}},isPlaying:()=>false,getProgress:()=>1000,addEventListener:()=>{},seek:()=>{}},CosmosAsync:{get:async()=>({lyrics:{language:'en',syncType:'LINE_SYNCED',lines:[{startTimeMs:'0',words:currentSynthetic}]}})}};
            window.heartbeats=0;setInterval(()=>heartbeats++,100);
        },process.argv[4]||'spotify');
        await page.addScriptTag({content:fs.readFileSync(process.argv[3]||'custom-bg.js','utf8')});
        await page.waitForFunction(()=>window.CBP?.app.panelBackdrop);
        const start=Date.now();
        await page.evaluate(()=>{const a=CBP.app;a.translationCache=new Map();a.translationCachePromise=null;a.settings.lyricsSource=testLyricSource;a.settings.lyricsTranslation=true;a.settings.lyricsTranslationEngine='local';a.render();});
        const translated=()=>{const el=document.querySelector('.cbp-translation');return el&&!el.hidden&&/[а-яё]/i.test(el.textContent);};
        await page.waitForFunction(translated,null,{timeout:240000});
        assert.ok(await page.evaluate(()=>heartbeats>=5),'UI should stay responsive during loading and inference');
        console.log(JSON.stringify({firstTranslationMs:Date.now()-start,text:await page.locator('.cbp-translation').textContent()}));
        assert.ok(!requests.some(r=>/violet|quiet%20river|small%20violet|small\+violet/i.test(r.url+r.body)),'lyric text must never enter network requests');
        await page.evaluate(()=>{CBP.app.settings.lyricsTranslation=false;CBP.app.updatePanelTranslation();CBP.app.closeLocalTranslator();});
        // Both the worker and the translation text are new. This cannot pass by
        // reusing the previous worker or the translated-line cache.
        await context.setOffline(true);const before=requests.length,offlineStart=Date.now();
        await page.evaluate(async()=>{currentSynthetic='The bright green tree grows in my peaceful garden.';Spicetify.Player.data.item.uri='spotify:track:LOCALOFFLINE';CBP.app.settings.lyricsTranslation=true;await CBP.app.loadPanelLyrics(true);});
        await page.waitForFunction(translated,null,{timeout:60000});
        assert.equal(requests.length,before,'cached model and runtime must work without any network requests');
        assert.ok((await page.locator('.cbp-original').textContent()).includes('bright green tree'));
        console.log(JSON.stringify({offlineTranslationMs:Date.now()-offlineStart,text:await page.locator('.cbp-translation').textContent(),offlineRequests:requests.length-before}));
        const explicit=await page.evaluate(async()=>{const source='This confusion is fucking me up.';const raw=await CBP.app.requestLocalRussianTranslation(source,new AbortController().signal);return CBP.app.translationWithTone(source,raw);});console.log(JSON.stringify({explicitIdiomTranslation:explicit}));assert.ok(/[а-яё]/i.test(explicit));
        await page.evaluate(()=>{CBP.app.settings.lyricsSource='off';CBP.app.settings.lyricsTranslation=false;CBP.app.render();CBP.app.closeLocalTranslator();});
        assert.deepEqual(errors,[]);
        console.log('Real local model: online setup, UI responsiveness, no lyric transmission, fresh-worker offline translation passed');
    }finally{await context.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
