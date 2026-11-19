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

    await page.evaluate(async()=>{
        const a=CBP.app;Spicetify.Player.data.item={uri:'spotify:track:ANCHOR',metadata:{image_url:testImage}};
        Spicetify.CosmosAsync={get:async()=>({lyrics:{language:'en',syncType:'LINE_SYNCED',lines:Array.from({length:15},(_,i)=>({startTimeMs:String(i*1000),words:'Line '+i+' · A longer original line that can wrap naturally'}))}})};
        a.settings.lyricsSource='spotify';a.settings.lyricsLayout='above';a.settings.lyricsTranslation=false;
        await a.render();await a.loadPanelLyrics(true);window.fixtureProgress=0;Spicetify.Player.getProgress=()=>fixtureProgress;
    });
    for(const viewport of [{width:1440,height:1000},{width:1100,height:720},{width:900,height:900}]){
        await page.setViewportSize(viewport);await page.waitForTimeout(60);
        const checks=await page.evaluate(async()=>{
            const a=CBP.app,results=[],ok=(v,m)=>{if(!v)throw Error(m);results.push(m);};
            a.settings.lyricsWidth=460;a.renderStudio();await new Promise(requestAnimationFrame);
            for(const index of [0,5,14,3]){
                fixtureProgress=index*1000+100;a.panelLyricIndex=-1;a.syncPanelLyrics(fixtureProgress);
                const list=a.lyricsPanel.querySelector('.cbp-lines'),row=list.children[index],bounds=list.getBoundingClientRect();
                const frame=a.panelBackdrop.querySelector('img').getBoundingClientRect();
                ok(Math.abs(bounds.top-frame.bottom-16)<1.5,'lyrics start just below the visible media frame');
                ok(Math.abs(row.getBoundingClientRect().top-bounds.top)<1.5,'current row is pinned at anchor including last line and backward seek: '+index);
                if(index)ok(getComputedStyle(list.children[index-1]).visibility==='hidden','previous row disappears above anchor');
                if(index===3)ok(parseFloat(getComputedStyle(row).fontSize)>parseFloat(getComputedStyle(list.children[index+1]).fontSize),'line-synced lyrics enlarge only the sung line');
            }
            const row=a.panelList.children[3],translation=row.querySelector('.cbp-translation');translation.hidden=false;translation.textContent='Перевод строки, который переносится и остаётся вместе с оригиналом';a.panelLyricIndex=-1;a.syncPanelLyrics(fixtureProgress);
            ok(Math.abs(row.getBoundingClientRect().top-a.panelList.getBoundingClientRect().top)<1.5,'translation height cannot move the active anchor');
            const panel=a.lyricsPanel.getBoundingClientRect();
            ok(panel.top===0&&Math.abs(panel.bottom-innerHeight)<1&&Math.abs(panel.right-innerWidth)<1,'panel touches top bottom and right screen edges');
            ok(getComputedStyle(a.lyricsPanel.querySelector('header strong')).display==='none','redundant title is hidden');
            ok(getComputedStyle(a.lyricsPanel.querySelector('p[role=status]')).display==='none','routine source status is hidden');
            ok(getComputedStyle(a.panelBackdrop.querySelector('img')).maskImage.includes('gradient'),'media edge fades into matching ambient colors');
            ok(getComputedStyle(a.panelBackdrop,'::after').backgroundImage.includes('gradient'),'upper media fades into dark lyric area');
            ok(a.lyricsPanel.style.getPropertyValue('--cbp-media-ambient').startsWith('url('),'static sampled image extends matching media colors');
            ok(getComputedStyle(row).backgroundColor==='rgba(0, 0, 0, 0)','anchored lyrics have no opaque row cards');
            return results;
        });console.log(viewport,checks);
    }
    const syllableSizes=await page.evaluate(async()=>{
        const list=CBP.app.panelList,row=list.querySelector('[aria-current=true]');
        const base=parseFloat(getComputedStyle(list).fontSize);
        const phrase=document.createElement('span');
        phrase.innerHTML='<span class="cbp-syllable">The</span> <span class="cbp-syllable">sky</span> <span class="cbp-syllable">is</span>';
        const original=[...row.childNodes];
        row.replaceChildren(phrase);
        const [before,syllable,after]=phrase.children;
        const size=parseFloat(getComputedStyle(row).fontSize);
        const bounds=()=>{
            const current=syllable.getBoundingClientRect();
            return [current.width,current.height,current.left-before.getBoundingClientRect().right,after.getBoundingClientRect().left-current.right];
        };
        const resting=bounds();
        syllable.classList.add('cbp-syllable-active');
        syllable.style.setProperty('--cbp-segment-emphasis','1');
        await new Promise(resolve=>setTimeout(resolve,220));
        const active=bounds(),underline=getComputedStyle(syllable,'::after').content;
        row.replaceChildren(...original);
        return {base,size,resting,active,underline};
    });
    assert.equal(syllableSizes.size,syllableSizes.base);
    assert.ok(syllableSizes.active[1]>syllableSizes.resting[1]*1.04);
    assert.ok(syllableSizes.active[0]<syllableSizes.resting[0]*1.07);
    assert.ok(syllableSizes.active[2]>0&&syllableSizes.active[3]>0);
    assert.equal(syllableSizes.underline,'none');
    await page.setViewportSize({width:1440,height:1000});
    const grip=page.getByRole('separator',{name:'Ширина панели текста'});
    const box=await grip.boundingBox();
    assert.equal(box.height,1000);
    assert.equal(await grip.evaluate(el=>getComputedStyle(el,'::after').opacity),'0');
    assert.equal(await grip.evaluate(el=>document.elementFromPoint(el.getBoundingClientRect().left+1,32)===el),true);
    assert.equal(await grip.evaluate(el=>document.elementFromPoint(el.getBoundingClientRect().left+1,968)===el),true);
    const readWidth=()=>page.evaluate(()=>({
        panel:CBP.app.lyricsPanel.getBoundingClientRect().width,
        main:document.getElementById('main').getBoundingClientRect().width,
        setting:Number(CBP.app.settingControls.get('lyricsWidth').input.value),
        saved:JSON.parse(localStorage.getItem('cbp_v2_settings')||'{}').lyricsWidth
    }));
    await page.mouse.move(box.x+1,box.y+32);
    await page.mouse.down();
    await page.mouse.move(box.x-139,box.y+32,{steps:5});
    assert.equal((await readWidth()).setting,600);
    await page.mouse.up();
    assert.deepEqual(await readWidth(),{panel:600,main:840,setting:600,saved:600});
    const mediaSizes=await page.evaluate(()=>{
        const app=CBP.app,media=app.panelBackdrop.querySelector('img');
        return [9/16,16/9,1].map(ratio=>{
            app.lyricsPanel.style.setProperty('--cbp-media-ratio',String(ratio));
            const bounds=media.getBoundingClientRect();
            return [bounds.width,bounds.height,app.panelList.getBoundingClientRect().top];
        });
    });
    assert.ok(Math.abs(mediaSizes[0][0]/mediaSizes[0][1]-9/16)<.01);
    assert.ok(Math.abs(mediaSizes[1][0]/mediaSizes[1][1]-16/9)<.01);
    assert.ok(Math.abs(mediaSizes[2][0]-mediaSizes[2][1])<1);
    assert.ok(mediaSizes.every(([width,height,top])=>width<=600&&top<=667&&Math.abs(top-height-16)<1));
    assert.ok(mediaSizes[0][2]>mediaSizes[2][2]&&mediaSizes[2][2]>mediaSizes[1][2]);
    await page.evaluate(()=>CBP.app.updatePanelMediaGeometry());
    await page.waitForFunction(()=>{
        const app=CBP.app;
        return Math.abs(app.panelList.querySelector('[aria-current=true]').getBoundingClientRect().top-app.panelList.getBoundingClientRect().top)<1.5;
    });
    const wideTop=await page.locator('.cbp-lines').evaluate(list=>list.getBoundingClientRect().top);
    await grip.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal((await readWidth()).saved,584);
    await page.setViewportSize({width:800,height:720});
    assert.deepEqual(await readWidth(),{panel:480,main:320,setting:584,saved:584});
    const narrowTop=await page.locator('.cbp-lines').evaluate(list=>list.getBoundingClientRect().top);
    assert.ok(narrowTop<wideTop-60);
    await page.screenshot({path:'test-results/focus-layout.png'});
    await page.evaluate(()=>{
        const app=CBP.app;
        app.settings.lyricsLayout='below';
        app.renderStudio();
    });
    for(const progress of [100,5100,14100,3100]){
        await page.evaluate(progress=>{window.fixtureProgress=progress;CBP.app.syncPanelLyrics(progress);},progress);
        await page.waitForFunction(()=>{
            const app=CBP.app,list=app.panelList,row=list.querySelector('[aria-current=true]');
            const next=row.nextElementSibling;
            const end=next||row;
            return Math.abs(end.getBoundingClientRect().bottom-list.getBoundingClientRect().bottom)<1.5
                && (!next||getComputedStyle(next).visibility==='visible')
                && (!next?.nextElementSibling||getComputedStyle(next.nextElementSibling).visibility==='hidden')
                && list.getBoundingClientRect().bottom<=app.panelBackdrop.getBoundingClientRect().top
                && Math.abs(app.panelBackdrop.getBoundingClientRect().bottom-innerHeight)<1.5;
        },null,{timeout:2000});
    }
    await page.evaluate(()=>{CBP.app.settings.lyricsLayout='above';CBP.app.renderStudio();});
    await page.evaluate(()=>{window.fixtureProgress=5100;CBP.app.syncPanelLyrics(5100);});
    await page.keyboard.down('Alt');
    await page.keyboard.down('KeyR');
    await page.evaluate(()=>{window.fixtureProgress=8100;CBP.app.syncPanelLyrics(8100);});
    assert.equal(await page.evaluate(()=>CBP.app.panelLyricIndex),5);
    await page.keyboard.up('KeyR');
    await page.keyboard.up('Alt');
    assert.equal(await page.evaluate(()=>CBP.app.panelLyricIndex),8);
    const lyricsList=page.locator('.cbp-lines');
    await lyricsList.hover({position:{x:70,y:40}});
    const beforeWheel=await lyricsList.evaluate(list=>list.scrollTop);
    await page.mouse.wheel(0,-145);
    await page.waitForFunction(before=>CBP.app.lyricsPanel.dataset.reading==='browse'&&CBP.app.panelList.scrollTop<before,beforeWheel,{timeout:3000});
    const browsingPosition=await lyricsList.evaluate(list=>list.scrollTop);
    await page.evaluate(()=>{window.fixtureProgress=11100;CBP.app.syncPanelLyrics(11100);});
    assert.equal(await lyricsList.evaluate(list=>list.scrollTop),browsingPosition);
    await page.mouse.wheel(0,80);
    await page.waitForFunction(before=>CBP.app.panelList.scrollTop>before,browsingPosition,{timeout:3000});
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>CBP.app.lyricsPanel.dataset.reading),undefined);
    const scrollModes=await page.evaluate(()=>{
        const app=CBP.app,list=app.panelList,original=list.scrollTo,playing=Spicetify.Player.isPlaying;
        const modes=[];
        list.scrollTo=options=>{modes.push(options.behavior);original.call(list,{...options,behavior:'instant'});};
        Spicetify.Player.isPlaying=()=>true;
        app.panelTimelineProgress=null;app.panelLyricIndex=null;
        for(const progress of [100,450,800,1100,5100,3100])app.syncPanelLyrics(progress);
        list.scrollTo=original;Spicetify.Player.isPlaying=playing;
        app.panelTimelineProgress=null;
        return modes;
    });
    assert.deepEqual(scrollModes,['instant','smooth','instant','instant']);
    const countdown = await page.evaluate(async()=>{
        const a=CBP.app;
        Spicetify.CosmosAsync.get=async()=>({lyrics:{syncType:'LINE_SYNCED',lines:[
            {startTimeMs:'12000',endTimeMs:'15000',words:'First line'},
            {startTimeMs:'25000',words:'Second line'},
            {startTimeMs:'45000',words:'Last line'}
        ]}});
        fixtureProgress=4000;
        await a.loadPanelLyrics(true);
        const at=time=>{
            a.syncPanelLyrics(time);
            const list=a.panelList;
            const row=list.querySelector('.cbp-vocal-countdown,[aria-current=true]');
            return [row?.textContent,Math.round(row.getBoundingClientRect().top-list.getBoundingClientRect().top)];
        };
        return [at(4000),at(11999),at(12000),at(14999),at(15000),at(24999),at(25000),at(38000),at(46000),at(4000)];
    });
    assert.deepEqual(countdown,[
        ['Вокал через 8 с',0],['Вокал через 1 с',0],['First line',0],['First line',0],
        ['Вокал через 10 с',0],['Вокал через 1 с',0],['Second line',0],
        ['Second line',0],['Last line',0],['Вокал через 8 с',0]
    ]);
    await page.setViewportSize({width:760,height:360});
    const translatedCountdown=await page.evaluate(()=>{
        const app=CBP.app;
        app.settings.lyricsLayout='below';
        app.settings.lyricsFont=36;
        app.renderStudio();
        fixtureProgress=4000;
        const translation=app.panelList.querySelector('.cbp-translation');
        translation.hidden=false;
        translation.textContent='Это достаточно длинная строка перевода, чтобы она заняла несколько строк по ширине панели.';
        app.panelLyricIndex=null;
        app.syncPanelLyrics(fixtureProgress);
        const list=app.panelList.getBoundingClientRect();
        const translated=translation.getBoundingClientRect();
        const countdown=app.panelVocalCountdown.getBoundingClientRect();
        const media=app.panelBackdrop.getBoundingClientRect();
        return countdown.top>=list.top-1&&translated.bottom<=list.bottom+1&&media.height>0&&list.bottom<=media.top;
    });
    assert.ok(translatedCountdown,'countdown and wrapped translation fit above media in a short window');
    await page.setViewportSize({width:1440,height:1000});
    const cinema=await page.evaluate(()=>{
        const app=CBP.app,previousVideo=app.panelVideo;
        app.settings.lyricsCinema=true;
        app.settings.lyricsLayout='above';
        app.renderStudio();
        const video=document.createElement('video');
        Object.defineProperty(video,'readyState',{value:2});
        app.panelVideo=video;
        const state=time=>{
            fixtureProgress=time;
            app.syncPanelLyrics(time);
            return app.lyricsPanel.dataset.cinematic;
        };
        const states=[state(1000),state(8499),state(8500),state(12000)];
        app.panelVideo=previousVideo;
        return states;
    });
    assert.deepEqual(cinema,['true','true','false','false']);
    assert.deepEqual(errors,[]);await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
