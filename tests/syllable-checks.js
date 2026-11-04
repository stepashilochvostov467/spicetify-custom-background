async () => {
    const a=CBP.app,checks=[];
    const ok=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    let spotifyCalls=0,toggles=0;
    Spicetify.CosmosAsync={get:async()=>{spotifyCalls++;throw Error('Must not call Spotify for Spicy source');}};
    Spicetify.Platform={History:{location:{pathname:'/playlist/keepThisPage'},listen:()=>()=>{}}};
    window.SpicyLyrics={db:{objectStores:{lyricsStore:{manager:{get:async()=>null}}}}};
    const payload={uri:'spotify:track:COLD123',Type:'Syllable',Content:[
        {Lead:{StartTime:0,EndTime:2,Syllables:[{Text:'Те',StartTime:0,EndTime:1,IsPartOfWord:true},{Text:'ст',StartTime:1,EndTime:2,IsPartOfWord:false}]}},
        {Lead:{StartTime:2,EndTime:3,Syllables:[{Text:'Дальше',StartTime:2,EndTime:3}]}}
    ]};
    const side=document.createElement('aside');side.id='Desktop_PanelContainer_Id';
    side.innerHTML='<div id="SpicyLyricsNPVCard" class="Collapsed"><button id="NPVCardToggle">Native lyrics</button></div>';
    document.getElementById('main').append(side);
    const card=side.firstChild;
    card.querySelector('button').onclick=async()=>{toggles++;card.classList.toggle('Collapsed');if(!card.classList.contains('Collapsed')){
        const cache=await caches.open('SpicyLyrics_LyricsStore_g1');await cache.put('/COLD123',new Response(JSON.stringify({CacheVersion:6,ExpiresAt:Date.now()+60000,Content:payload})));
    }};
    Spicetify.Player.data.item.uri=payload.uri;Spicetify.Player.getProgress=()=>500;Spicetify.Player.isPlaying=()=>false;
    a.settings=CBP.normalize({...a.settings,lyricsSource:'spicy',colorMode:'custom',color:'#12ab34'});
    await a.render();await wait(600);
    ok(a.lyricsPanel.querySelectorAll('.cbp-syllable').length===3,'uncached song loaded automatically through native Spicy card');
    ok(toggles===2&&card.classList.contains('Collapsed'),'native loader restored after fetch');
    ok(spotifyCalls===0,'Spicy source never silently requests Spotify lyrics');
    ok(Spicetify.Platform.History.location.pathname==='/playlist/keepThisPage','automatic fetch preserves current playlist page');
    ok(!document.body.classList.contains('cbp-spicy-loading'),'temporary loader layout cleaned up');
    const spans=a.lyricsPanel.querySelectorAll('.cbp-syllable');
    a.syncPanelLyrics(500);ok(spans[0].style.getPropertyValue('--cbp-fill')==='50%','half syllable filled at its timestamp midpoint');
    a.syncPanelLyrics(750);ok(spans[0].style.getPropertyValue('--cbp-fill')==='75%','fill advances within syllable rather than jumping by word');
    a.syncPanelLyrics(1250);ok(spans[1].style.getPropertyValue('--cbp-fill')==='25%','next syllable follows separate timing');
    a.syncPanelLyrics(250);ok(spans[0].style.getPropertyValue('--cbp-fill')==='25%'&&spans[1].style.getPropertyValue('--cbp-fill')==='0%','backward seek resets syllable fills');
    ok(getComputedStyle(a.lyricsPanel).getPropertyValue('--cbp-lyric-ink').trim()==='#12ab34','lyrics use selected extension text color');
    ok(getComputedStyle(spans[0]).backgroundImage.includes('18, 171, 52'),'syllable gradient uses chosen color instead of white');
    const resting=getComputedStyle(spans[1]);ok(!resting.backgroundImage.includes('color(srgb')&&resting.backgroundImage.includes('rgb('),'resting syllables use solid readable color instead of transparent black');
    ok(getComputedStyle(spans[1].closest('.cbp-line')).opacity==='1','future syllable lines keep full opacity');
    Spicetify.Player.isPlaying=()=>true;a.updateLyricsClock();ok(!!a.lyricFrame&&!a.lyricsTimer,'smooth animation starts only for timed lyrics during playback');
    await wait(60);ok(parseFloat(spans[0].style.getPropertyValue('--cbp-fill'))>25,'animation frames interpolate progress');
    Spicetify.Player.isPlaying=()=>false;a.updateLyricsClock();ok(!a.lyricFrame&&!a.lyricsTimer,'pause stops all lyric animation callbacks');
    Spicetify.Player.getProgress=()=>2200;a.syncPanelLyrics();ok(a.lyricsPanel.querySelector('[aria-current=true]').textContent==='Дальше','smooth line following still works');
    const plain=a.panelLines({Type:'Line',Content:[{Text:'Без слогов',StartTime:1}]},'spicy');
    ok(plain[0].syllables.length===0&&plain[0].start===1000,'line-only data remains honest without invented syllable timings');
    const localTranslate=a.requestLocalRussianTranslation;
    a.requestLocalRussianTranslation=async()=> 'Перевод строки';
    SpicyLyrics.db.objectStores.lyricsStore.manager.get=async()=>({uri:payload.uri,Language:'en',Type:'Syllable',Content:[{Lead:{StartTime:0,Syllables:[{Text:'Hel',StartTime:0,EndTime:1,IsPartOfWord:true},{Text:'lo',StartTime:1,EndTime:2}]}}]});
    a.settings.lyricsTranslation=true;await a.loadPanelLyrics(true);await wait(80);
    ok(a.lyricsPanel.querySelector('.cbp-translation').textContent==='Перевод строки','Russian translation remains available alongside Spicy syllables');
    a.syncPanelLyrics(500);ok(a.lyricsPanel.querySelector('.cbp-syllable').style.getPropertyValue('--cbp-fill')==='50%','translation does not replace or interrupt syllable animation');
    a.settings.lyricsTranslation=false;a.requestLocalRussianTranslation=localTranslate;
    a.togglePanelLyrics();ok(a.settings.lyricsLastSource==='spicy'&&a.settings.lyricsSource==='off','Alt+V remembers Spicy when closing');
    a.togglePanelLyrics();ok(a.settings.lyricsSource==='spicy','Alt+V reopens the selected Spicy source');
    a.settings.lyricsSource='off';await a.render();side.remove();
    const button=document.createElement('button');button.dataset.testid='control-button-npv';button.setAttribute('aria-pressed','false');let opened=0;
    button.onclick=()=>{opened++;button.setAttribute('aria-pressed',button.getAttribute('aria-pressed')==='true'?'false':'true');};document.body.append(button);
    a.ensureSpicyLoader(a.lyricRequest);a.ensureSpicyLoader(a.lyricRequest);
    ok(opened===1,'closed native sidebar opened once without repeated toggles');
    a.releaseSpicyLoader();ok(opened===2&&button.getAttribute('aria-pressed')==='false','sidebar state restored after loader release');button.remove();
    let startReads=0;
    const originalLines=a.panelLyricLines;
    a.settings.lyricsSource='spotify';
    a.panelLyricLines=Array.from({length:2000},(_,i)=>({get start(){startReads++;return i*1000;},text:'Line '+i,syllables:[],background:[]}));
    a.syncPanelLyrics(1500000);startReads=0;
    for(let i=0;i<100;i++)a.syncPanelLyrics(1500000+i);
    ok(startReads===0&&a.panelLyricIndex===1500,'animation reuses indexed line timings instead of scanning 2000 lines per frame');
    const oldSyllables=a.panelSyllableNodes;let segmentReads=0;
    const longLine=Array.from({length:1000},(_,i)=>({el:document.createElement('span'),get start(){segmentReads++;return i*1000;},end:(i+1)*1000}));
    a.panelSyllableNodes=[longLine];a.syllableCursor=null;a.syncPanelSyllables(0,0);segmentReads=0;
    for(let i=1;i<=200;i++)a.syncPanelSyllables(0,i);
    ok(segmentReads<2000,'smooth frames update active syllables instead of rescanning 1000 future syllables');
    const overlap=[{start:100,end:600},{start:0,end:0},{start:0,end:300},{start:200,end:400}].map(word=>({...word,el:document.createElement('span')}));
    a.panelSyllableNodes=[overlap];a.syllableCursor=null;
    for(const time of [0,150,350,800,250,0,600,199,450]){
        a.syncPanelSyllables(0,time);
        ok(overlap.every(word=>word.fill===Math.round((time<word.start?0:word.end===word.start?1:Math.max(0,Math.min(1,(time-word.start)/(word.end-word.start))))*1000)/10),'overlapping and zero-duration syllables follow seek timestamp '+time);
    }
    a.panelSyllableNodes=oldSyllables;a.panelLyricLines=originalLines;a.settings.lyricsSource='off';await a.loadPanelLyrics(true);
    ok(!a.syllableCursor&&a.panelRowNodes.length===0,'closing lyrics releases old row and syllable references');

    return checks;
}
