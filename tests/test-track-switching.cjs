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
        ok(!!a.runTrackPrefetch&&!a.fetchCompanionLyrics,'bounded prefetch is enabled without direct companion service requests');
        let translations=0,network=0;window.fetch=async()=>{network++;throw Error('Unexpected external request');};
        a.requestLocalRussianTranslation=async(text,signal)=>{translations++;await wait(5);if(signal.aborted)throw Error('cancelled');return 'Перевод '+text;};
        const full=!!a.readSpicy,source=full?'spicy':'spotify';
        const payload=async uri=>{const id=uri.split(':')[2];await wait(id==='SLOW'?120:5);return full?{uri,Language:'en',Type:'Syllable',Content:[{Lead:{StartTime:id==='VIDEOEDITION'?2:0,Syllables:[{Text:'Synthetic '+id,StartTime:id==='VIDEOEDITION'?2:0,EndTime:id==='VIDEOEDITION'?3:1}]}}]}:{lyrics:{language:'en',syncType:'LINE_SYNCED',lines:[{words:'Synthetic '+id,startTimeMs:id==='VIDEOEDITION'?'2000':'0'}]}};};
        if(full)window.SpicyLyrics={db:{objectStores:{lyricsStore:{manager:{get:payload}}}}};
        Spicetify.CosmosAsync={get:async url=>{if(full)throw Error('Spicy source must not fall back to Spotify');return payload('spotify:track:'+url.split('/track/')[1].split('?')[0]);}};
        a.settings.lyricsSource=source;a.settings.lyricsTranslation=true;a.settings.lyricsTranslationEngine='local';a.lyricsPanel.hidden=false;
        Spicetify.Player.getProgress=()=>100;Spicetify.Player.isPlaying=()=>false;
        const change=id=>{Spicetify.Player.data.item={uri:'spotify:track:'+id,metadata:{image_url:testImage}};playerEvents.songchange();};
        const ready=async id=>{for(let i=0;i<150;i++){const original=a.lyricsPanel.querySelector('.cbp-original'),ru=a.lyricsPanel.querySelector('.cbp-translation');if(original?.textContent.includes(id)&&ru&&!ru.hidden&&ru.textContent.includes(id))return;await wait(10);}throw Error('Missing original/translation after switch '+id+'; '+a.lyricsPanel.querySelector('[role=status]').textContent);};
        for(const id of ['FIRST','SECOND','THIRD','FOURTH','FIFTH']){change(id);await ready(id);ok(true,'songchange renders original and Russian translation for '+id);}
        change('SLOW');await wait(2);change('FAST');await ready('FAST');await wait(150);
        ok(a.lyricsPanel.querySelector('.cbp-original').textContent.includes('FAST'),'late previous response cannot blank or overwrite the newest song');
        if(full){
            const availableAt=Date.now()+800;
            a.readSpicy=async uri=>Date.now()<availableAt?null:payload(uri);
            Spicetify.CosmosAsync.get=async url=>({lyrics:{language:'en',syncType:'LINE_SYNCED',lines:[{words:'Preview '+url.split('/track/')[1].split('?')[0],startTimeMs:'0'}]}});
            change('DELAYED');await ready('DELAYED');
            ok(a.lyricsPanel.querySelector('.cbp-original').textContent.startsWith('Preview'),'delayed Spicy shows Spotify original and translation instead of empty panel');
            for(let i=0;i<180;i++){if(a.lyricsPanel.querySelector('.cbp-syllable')&&!a.lyricsPanel.querySelector('.cbp-translation').hidden)break;await wait(10);}
            ok(!!a.lyricsPanel.querySelector('.cbp-syllable')&&a.lyricsPanel.querySelector('.cbp-original').textContent.includes('DELAYED'),'Spicy syllables replace the preview automatically when available');
            ok(!a.lyricsPanel.querySelector('.cbp-translation').hidden,'translation survives preview to syllable transition');
            const now=Date.now,started=now();let shift=0,late=false,lateReads=0;
            try{
                Date.now=()=>now()+shift;
                a.readSpicy=async uri=>{if(!uri.endsWith(':LATE'))return payload(uri);lateReads++;if(now()-started>350)shift=25000;return late?payload(uri):null;};
                change('LATE');await ready('LATE');
                for(let i=0;i<100&&!a.spicyLateTimer;i++)await wait(20);
                ok(!!a.spicyLateTimer&&!a.lyricsPanel.querySelector('.cbp-syllable'),'Spotify preview stays visible after the initial Spicy wait expires');
                late=true;
                for(let i=0;i<160&&!a.lyricsPanel.querySelector('.cbp-syllable');i++)await wait(20);
                ok(!!a.lyricsPanel.querySelector('.cbp-syllable')&&a.spicyReadyTracks.has('spotify:track:LATE')&&!a.spicyLateTimer,'late syllables upgrade the preview and stop the timer');
                change('OTHER');await ready('OTHER');const before=lateReads;
                change('LATE');await ready('LATE');ok(lateReads===before&&!!a.lyricsPanel.querySelector('.cbp-syllable'),'returning to a ready track skips the Spicy cache read');
            }finally{Date.now=now;}
            const origin={pathname:'/playlist/keep-this',search:'?view=tracks',key:'fixture'};
            let opens=0,returns=0,loaded=null;
            const history={location:origin,push(location){opens++;this.location=location;loaded=payload('spotify:track:HELLOCOLD');},goBack(){returns++;this.location=origin;}};
            Spicetify.Platform={...Spicetify.Platform,History:history};
            const microphone=document.createElement('button');microphone.id='SpicyLyrics_PageButton';document.body.append(microphone);
            a.readSpicy=async uri=>uri.endsWith(':HELLOCOLD')?loaded:payload(uri);
            change('HELLOCOLD');await ready('HELLOCOLD');
            for(let i=0;i<180&&(!a.lyricsPanel.querySelector('.cbp-syllable')||a.lyricsPanel.querySelector('.cbp-translation').hidden);i++)await wait(20);
            ok(opens===1&&returns===1&&history.location===origin&&!!a.lyricsPanel.querySelector('.cbp-syllable')&&!a.lyricsPanel.querySelector('.cbp-translation').hidden,'cold track without a Spicy card opens the microphone route once, loads syllables and returns to the playlist');
            // A prefetched, line-only response must not prevent the automatic loader.
            opens=returns=0;loaded=null;
            const weak={uri:'spotify:track:LINEFIRST',Language:'en',Type:'Line',Content:[{Text:'Preview LINEFIRST',StartTime:0}]};
            history.push=function(location){opens++;this.location=location;loaded=payload(weak.uri);};
            a.preparedTracks.set(weak.uri,{at:Date.now(),spicyLyrics:weak,controller:new AbortController()});
            a.readSpicy=async uri=>uri===weak.uri?(loaded||weak):payload(uri);
            a.settings.lyricsHighlight='letters';
            change('LINEFIRST');await ready('LINEFIRST');
            ok(a.lyricsPanel.querySelector('.cbp-original').textContent.startsWith('Preview')&&!a.lyricsPanel.querySelector('.cbp-letter'),'line-only cache shows translated preview while fine timing is pending');
            for(let i=0;i<150&&!a.lyricsPanel.querySelector('.cbp-letter');i++)await wait(20);
            a.syncPanelLyrics(125);
            const letters=[...a.lyricsPanel.querySelectorAll('.cbp-letter')];
            ok(opens===1&&returns===1&&letters.length>1&&letters.some(el=>parseFloat(el.style.getPropertyValue('--cbp-fill'))>0)&&letters.some(el=>el.style.getPropertyValue('--cbp-fill')==='0%'),'line-only cache automatically upgrades to animated letter timing without opening the microphone manually');
                        microphone.remove();
        }
        if(full)a.readSpicy=payload;
        a.settings.lyricsLayout='below';a.renderStudio();
        const meta={title:'Fixture track',artist_name:'Fixture artist',image_url:testImage};
        const host=document.createElement('div');host.dataset.testid='video-player-npv';
        const video=document.createElement('video');
        Object.defineProperties(video,{readyState:{value:2},videoWidth:{value:640},videoHeight:{value:360}});
        host.append(video);
        let videoMode=false,switched=0;
        Spicetify.Player.origin={
            canSendSignal:signal=>signal===(videoMode?'switch-to-audio':'switch-to-video'),
            sendSignal:async()=>{
                switched++;videoMode=true;
                document.getElementById('main').append(host);
                Spicetify.Player.data.item={uri:'spotify:track:VIDEOEDITION',metadata:meta};
                playerEvents.songchange();
            }
        };
        Spicetify.Player.isPlaying=()=>true;
        Spicetify.Player.data.item={uri:'spotify:track:AUDIOEDITION',metadata:meta};
        playerEvents.songchange();
        await ready('VIDEOEDITION');
        for(let i=0;i<60&&a.panelBackdrop.dataset.source!=='clip';i++)await wait(20);
        ok(switched===1&&a.panelBackdrop.dataset.source==='clip'&&video.matches(':popover-open')&&a.panelAudioURI()==='spotify:track:AUDIOEDITION','default clip uses the native video and prefers the video edition lyrics and translation');
        if(full){
            for(let i=0;i<60&&!a.lyricsPanel.querySelector('.cbp-letter');i++)await wait(20);
            ok(!!a.lyricsPanel.querySelector('.cbp-letter'),'automatic video switch keeps Spicy letter timing');
        }
        a.syncPanelLyrics(1900);
        ok(a.panelLyricTimingURI==='spotify:track:VIDEOEDITION'&&a.panelLyricIndex===-1&&a.panelMediaPicker.syncText.hidden,'clip start time takes priority and hides manual audio corrections');
        a.syncPanelLyrics(2300);
        ok(a.panelLyricIndex===0,'the first clip line activates on its own timeline');
        a.panelVideoEditions.clear();a.panelEditionLookup=null;
        await a.loadPanelLyrics(true);await ready('VIDEOEDITION');
        ok(a.panelAudioURI()==='spotify:track:AUDIOEDITION','persisted edition association restores lyrics even without in-memory state');
        await a.savePanelMediaChoice(a.panelAudioURI(),{mode:'cover'});
        ok(!video.matches(':popover-open')&&!video.hasAttribute('popover'),'switching to artwork restores Spotify native video layout');
        host.remove();delete Spicetify.Player.origin;
        // Skip directly into a video URI which has never been played as audio.
        let editionRequests=0, spotifyRequests=[];
        Spicetify.GraphQL={
            Request:async(query,{uri})=>{
                if(query.name!=='getTrack'||uri!=='spotify:track:COLDVIDEO')throw Error('Unexpected video lookup');
                editionRequests++;
                await wait(45);
                return {data:{trackUnion:{associationsV3:{audioAssociations:{items:[
                    {trackAudio:{data:{uri:'spotify:track:COLDAUDIO'}}}
                ]}}}}};
            }
        };
        Spicetify.CosmosAsync.get=async url=>{
            const id=url.split('/track/')[1].split('?')[0];
            spotifyRequests.push(id);
            return {lyrics:{language:'en',syncType:'LINE_SYNCED',lines:id==='COLDVIDEO'?[]:[{words:'Preview '+id,startTimeMs:'0'},...(id==='COLDAUDIO'?[{words:'The second line',startTimeMs:'4000'},{words:'The third line',startTimeMs:'12000'}]:[])]}};
        };
        let spicyAvailable=false;
        if(full)a.readSpicy=async uri=>uri.endsWith(':COLDVIDEO')&&spicyAvailable?payload(uri):null;
        change('BEFOREVIDEO');
        Spicetify.Player.data.item={uri:'spotify:track:COLDVIDEO',mediaType:'video',metadata:meta};
        playerEvents.songchange();
        await ready('COLDAUDIO');
        ok(editionRequests===1&&a.panelAudioURI()==='spotify:track:COLDAUDIO'&&spotifyRequests.includes('COLDAUDIO')&&spotifyRequests.includes('COLDVIDEO'),'cold video skipped into resolves its official audio URI and displays Spotify lyrics');
        const picker=a.panelMediaPicker;
        ok(!picker.syncText.hidden&&a.panelLyricTimingURI==='spotify:track:COLDAUDIO','audio fallback exposes manual sync controls');
        const originalProgress=Spicetify.Player.getProgress;
        let stamp=8000;
        Spicetify.Player.getProgress=()=>stamp;
        const rows=a.lyricsPanel.querySelectorAll('.cbp-line');
        picker.button.click();picker.syncText.click();rows[1].click();
        await a.panelClipSyncWrite;
        ok(a.panelLyricProgress(9000)===5000,'choosing the line at the sung moment stores its clip offset');
        stamp=10000;picker.button.click();picker.syncText.click();rows[2].click();
        await a.panelClipSyncWrite;
        ok(a.panelLyricProgress(9999)===5999&&a.panelLyricProgress(10000)===12000,'second marker realigns only the portion after the edit');
        a.panelClipSync=null;
        await a.preparePanelClipTiming('spotify:track:COLDVIDEO','spotify:track:COLDAUDIO');
        ok(a.panelLyricProgress(11000)===13000,'clip markers survive reloading from storage');
        const savedSeek=Spicetify.Player.seek;
        let seekTarget;
        Spicetify.Player.seek=ms=>seekTarget=ms;
        rows[2].click();
        ok(seekTarget===10000,'clicking a timed line seeks to its clip time');
        Spicetify.Player.seek=savedSeek;Spicetify.Player.getProgress=originalProgress;
        if(full){
            spicyAvailable=true;
            for(let i=0;i<100&&!a.lyricsPanel.querySelector('.cbp-letter');i++)await wait(15);
            ok(a.lyricsPanel.querySelector('.cbp-original').textContent.includes('COLDVIDEO')&&!!a.lyricsPanel.querySelector('.cbp-letter'),'Spicy timings warmed under the video URI replace the audio preview');
        }
        const count=editionRequests;
        if(full)a.readSpicy=payload;
        Spicetify.Player.data.item={uri:'spotify:track:DIRECTVIDEO',associatedAudioUri:'spotify:track:DIRECTAUDIO',metadata:meta};
        playerEvents.songchange();
        await ready('DIRECTVIDEO');
        ok(editionRequests===count&&a.panelAudioURI()==='spotify:track:DIRECTAUDIO','player-supplied audio URI skips the network lookup');
        ok(network===0&&translations>=6,'each switched track translates with no lookahead traffic');
        a.settings.lyricsSource='spotify';
        Spicetify.Player.data.item={uri:'spotify:track:COLDVIDEO',mediaType:'video',metadata:meta};
        Spicetify.Player.getProgress=()=>19000;
        Spicetify.Player.isPlaying=()=>false;
        window.shortcutSeeks=0;
        Spicetify.Player.seek=()=>{shortcutSeeks++;};
        playerEvents.songchange();
        await ready('COLDAUDIO');
        a.setLyricReading('browse');
        return checks;
    });
    const row=page.locator('#cbp-lyrics .cbp-line[data-start-ms="4000"]');
    await row.hover({timeout:5000});
    await page.keyboard.press('Alt+s');
    const shortcut=await page.evaluate(async()=>{
        const a=CBP.app;
        await a.panelClipSyncWrite;
        const current=a.panelLyricIndex;
        a.syncPanelLyrics(26999);
        const before=a.panelLyricIndex;
        a.syncPanelLyrics(27000);
        return {current,before,after:a.panelLyricIndex,seeks:shortcutSeeks,browsing:a.lyricsPanel.dataset.reading};
    });
    assert.deepEqual(shortcut,{current:1,before:1,after:2,seeks:0,browsing:undefined});
    result.push('hover shortcut immediately anchors the selected line without seeking, then resumes the original line intervals');
    assert.deepEqual(errors,[]);console.log(result.join('\n'));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
