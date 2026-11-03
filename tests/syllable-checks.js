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
    Spicetify.Player.isPlaying=()=>true;a.updateLyricsClock();ok(!!a.lyricFrame&&!a.lyricsTimer,'smooth animation starts only for timed lyrics during playback');
    await wait(60);ok(parseFloat(spans[0].style.getPropertyValue('--cbp-fill'))>25,'animation frames interpolate progress');
    Spicetify.Player.isPlaying=()=>false;a.updateLyricsClock();ok(!a.lyricFrame&&!a.lyricsTimer,'pause stops all lyric animation callbacks');
    Spicetify.Player.getProgress=()=>2200;a.syncPanelLyrics();ok(a.lyricsPanel.querySelector('[aria-current=true]').textContent==='Дальше','smooth line following still works');
    const plain=a.panelLines({Type:'Line',Content:[{Text:'Без слогов',StartTime:1}]},'spicy');
    ok(plain[0].syllables.length===0&&plain[0].start===1000,'line-only data remains honest without invented syllable timings');
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
    a.panelLyricLines=originalLines;a.settings.lyricsSource='off';
    return checks;
}
