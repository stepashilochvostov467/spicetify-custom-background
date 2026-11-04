async () => {
    const a=CBP.app,checks=[],ok=(condition,message)=>{if(!condition)throw Error(message);checks.push(message);};
    a.settings.lyricsTranslationEngine='mymemory';
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const settle=async()=>{for(let i=0;i<100;i++){if(!a.lyricsPanel.querySelector('.cbp-translation-status').textContent.includes('Перевожу'))return;await wait(20);}throw Error('Translation did not finish');};
    let calls=0,requested=[];
    const fetchOriginal=window.fetch;
    window.fetch=async(url,options)=>{
        calls++;const q=new URL(url);requested.push(q);
        ok(options.credentials==='omit'&&!options.headers,'translation request contains no Spotify credentials');
        return {ok:true,status:200,json:async()=>({responseStatus:200,responseData:{translatedText:'Перевод: '+q.searchParams.get('q')}})};
    };
    Spicetify.CosmosAsync={get:async()=>({lyrics:{language:'en',syncType:'LINE_SYNCED',lines:[{startTimeMs:'0',words:'Synthetic blue bird'},{startTimeMs:'1000',words:'Synthetic blue bird'},{startTimeMs:'2000',words:'Synthetic silver river'}]}})};
    Spicetify.Player.data.item={uri:'spotify:track:TRANSLATION',metadata:{image_url:testImage}};
    Spicetify.Player.getProgress=()=>1100;
    a.settings.lyricsSource='spotify';a.settings.lyricsTranslation=false;await a.render();await wait(40);
    ok(calls===0,'disabled translation never contacts a translation service');
    a.lyricsPanel.querySelector('[data-translation]').click();await wait(40);await settle();
    const rows=[...a.lyricsPanel.querySelectorAll('.cbp-line')];
    ok(calls===2,'chorus repetitions are translated once');
    ok(requested.every(q=>q.origin==='https://api.mymemory.translated.net'&&q.searchParams.get('langpair')==='en|ru'),'native Spotify language and Russian destination are used');
    ok(rows[0].querySelector('.cbp-original').textContent==='Synthetic blue bird'&&rows[0].querySelector('.cbp-translation').textContent==='Перевод: Synthetic blue bird','Russian translation is attached below its original line');
    ok(!rows[1].querySelector('.cbp-translation').hidden&&rows[1].getAttribute('aria-current')==='true','original and translated line share playback highlighting');
    rows[2].querySelector('.cbp-translation').click();
    ok(window.calls.some(c=>Array.isArray(c)&&c[0]==='seek'&&c[1]===2000),'clicking translation seeks the original line timestamp');
    a.settings=CBP.normalize({...a.settings,colorMode:'custom',color:'#12ab34'});await a.render();
    ok(getComputedStyle(rows[0].querySelector('.cbp-translation')).color==='rgb(18, 171, 52)','translation follows the selected appearance text color');
    ok(rows[0].querySelector('.cbp-translation').getBoundingClientRect().top>=rows[0].querySelector('.cbp-original').getBoundingClientRect().bottom,'translation appears underneath the original');
    await a.loadPanelLyrics(true);await settle();ok(calls===2,'reload reuses cached translations');
    await wait(550);a.translationCache=null;a.translationCachePromise=null;
    await a.loadPanelLyrics(true);await settle();ok(calls===2,'translation cache persists in local IndexedDB');
    a.lyricsPanel.querySelector('[data-translation]').click();await wait(30);
    ok([...a.lyricsPanel.querySelectorAll('.cbp-translation')].every(el=>el.hidden),'turning translation off hides all translated lines');
    ok(JSON.parse(localStorage.getItem('cbp_v2_settings')).lyricsTranslation===false,'translation preference is saved');
    const chunks=a.translationChunks(('😀 longword '.repeat(90))+'я'.repeat(900));
    ok(chunks.length>1&&chunks.every(part=>new TextEncoder().encode(part).length<=480),'Unicode translation chunks respect provider byte limits');

    let release,started;
    const pending=new Promise(resolve=>started=resolve);
    window.fetch=async()=>{started();return new Promise(resolve=>release=()=>resolve({ok:true,status:200,json:async()=>({responseStatus:200,responseData:{translatedText:'LATE TRANSLATION'}})}));};
    Spicetify.CosmosAsync.get=async()=>({lyrics:{language:'en',syncType:'LINE_SYNCED',lines:[{startTimeMs:'0',words:'Synthetic old request'}]}});
    a.settings.lyricsTranslation=true;await a.loadPanelLyrics(true);await pending;
    a.settings.lyricsTranslation=false;await a.updatePanelTranslation();release();await wait(30);
    ok(a.lyricsPanel.querySelector('.cbp-translation').hidden&&!a.lyricsPanel.textContent.includes('LATE TRANSLATION'),'late result after disabling translation is discarded');

    let oldRelease,oldStarted;const oldPending=new Promise(resolve=>oldStarted=resolve);
    window.fetch=async()=>{oldStarted();return new Promise(resolve=>oldRelease=()=>resolve({ok:true,status:200,json:async()=>({responseStatus:200,responseData:{translatedText:'PREVIOUS TRACK TRANSLATION'}})}));};
    a.settings.lyricsTranslation=true;await a.loadPanelLyrics(true);await oldPending;
    Spicetify.Player.data.item.uri='spotify:track:NEWTRANSLATION';
    Spicetify.CosmosAsync.get=async()=>({lyrics:{language:'ru',syncType:'LINE_SYNCED',lines:[{startTimeMs:'0',words:'Синтетическая русская строка'}]}});
    await a.loadPanelLyrics(true);oldRelease();await wait(30);
    ok(!a.lyricsPanel.textContent.includes('PREVIOUS TRACK')&&a.lyricsPanel.querySelector('.cbp-translation-status').textContent==='Песня уже на русском','previous track response cannot replace Russian-track status');

    let quotaCalls=0;
    window.fetch=async()=>{quotaCalls++;return {ok:true,status:200,json:async()=>({quotaFinished:true,responseStatus:429,responseData:{translatedText:'MYMEMORY QUOTA ERROR'}})};};
    Spicetify.CosmosAsync.get=async()=>({lyrics:{language:'en',syncType:'LINE_SYNCED',lines:Array.from({length:10},(_,i)=>({startTimeMs:String(i*1000),words:'Synthetic quota row '+i}))}});
    await a.loadPanelLyrics(true);await wait(50);await settle();
    ok(quotaCalls<=2&&a.lyricsPanel.querySelector('.cbp-translation-status').textContent.includes('Лимит'),'quota response stops the request queue and shows its cause');
    ok(!a.lyricsPanel.querySelector('.cbp-lines').textContent.includes('QUOTA ERROR'),'provider quota text is never rendered as translated lyrics');
    a.settings.lyricsSource='off';a.settings.lyricsTranslation=false;await a.render();window.fetch=fetchOriginal;
    return checks;
}
