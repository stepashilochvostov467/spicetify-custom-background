async () => {
    const a=CBP.app,checks=[],ok=(value,message)=>{if(!value)throw Error(message);checks.push(message);};
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const settled=async()=>{for(let i=0;i<150;i++){if(a.lyricsPanel.querySelector('.cbp-translation-status').textContent.startsWith('Локальный перевод ·'))return;await wait(20);}throw Error('Local translation did not finish');};
    const originalWorker=window.Worker,originalFetch=window.fetch;let remote=0,requests=[],cancellations=[],closed=0;
    window.fetch=async()=>{remote++;throw Error('Local lyrics must never leave the device');};
    window.Worker=class{
        postMessage(data){
            if(data.type==='cancel'){cancellations.push(data.id);return;}
            requests.push(data);setTimeout(()=>this.onmessage?.({data:{type:'progress',phase:'ready',cacheFailed:false}}),5);
            setTimeout(()=>this.onmessage?.({data:{type:'result',id:data.id,text:'Русский локальный перевод'}}),15);
        }
        terminate(){closed++;}
    };
    const english=[{text:"But I still keep their number and their necklace, kisses to my exes"}];
    for(const tag of ['und','unknown','',null,'EN_us','en-Latn-US','eng','English'])ok(a.lyricLanguage(tag,english)==='en','English lyrics normalize language tag '+tag);
    ok(a.lyricLanguage('es',[{text:'Esta noche quiero bailar contigo'}])==='es','explicit non-English metadata remains authoritative');
    ok(a.lyricLanguage('pcm',english)==='en','incorrect provider language does not block clearly English lyrics');
    ok(a.lyricLanguage('und',[{text:'Esta noche quiero bailar contigo'}])==='autodetect','unknown Latin text is not automatically labeled English');
    ok(a.lyricLanguage('und',[{text:'Это песня на русском языке'}])==='ru','unknown Cyrillic lyrics are identified as Russian');
    ok(CBP.normalize({}).lyricsTranslationEngine==='local','local translation is the default engine');
    ok(CBP.normalize({lyricsTranslationEngine:'unsafe-url'}).lyricsTranslationEngine==='local','unknown translator engines are rejected');
    Spicetify.Player.data.item={uri:'spotify:track:LOCALTEST',metadata:{image_url:testImage}};
    Spicetify.Player.getProgress=()=>1200;
    Spicetify.CosmosAsync={get:async()=>({lyrics:{language:'en',syncType:'LINE_SYNCED',lines:[{startTimeMs:'0',words:'A synthetic silver fox'},{startTimeMs:'1000',words:'A synthetic silver fox'},{startTimeMs:'2000',words:'Another synthetic silver fox'}]}})};
    a.settings.lyricsSource='spotify';a.settings.lyricsTranslation=true;a.settings.lyricsTranslationEngine='local';
    await a.render();await settled();
    ok(remote===0,'local mode does not call an online translation API');
    ok(requests.length===2,'local model handles each unique original once');
    ok(a.lyricsPanel.querySelector('[aria-current=true] .cbp-translation').textContent==='Русский локальный перевод','local result stays in the synchronized original row');
    ok(a.lyricsPanel.querySelector('.cbp-translation-status').textContent.includes('без дневной квоты'),'local mode is labeled separately from the online provider');
    const before=requests.length;await a.loadPanelLyrics(true);await settled();
    ok(requests.length===before,'local translations are reused from their own cache');
    a.panelLyricLanguage='es';await a.updatePanelTranslation();
    ok(requests.length===before&&remote===0&&a.lyricsPanel.querySelector('.cbp-translation-status').textContent.includes('только английский'),'unsupported language never silently falls back to an online service');
    await a.loadPanelLyrics(true);await settled();
    Spicetify.CosmosAsync.get=async()=>({lyrics:{language:'en',syncType:'LINE_SYNCED',lines:Array.from({length:3},(_,i)=>({startTimeMs:String(i*1000),words:String(i)+' '+'z'.repeat(6000)}))}});
    await a.loadPanelLyrics(true);await settled();
    ok([...a.lyricsPanel.querySelectorAll('.cbp-translation')].every(el=>!el.hidden),'local mode has no inherited daily-provider character cap');
    Spicetify.CosmosAsync.get=async()=>({lyrics:{language:'en',syncType:'LINE_SYNCED',lines:[{startTimeMs:'0',words:'Cancellation synthetic row'}]}});
    await a.loadPanelLyrics(true);await wait(1);
    a.settings.lyricsTranslation=false;await a.updatePanelTranslation();await wait(30);
    ok(cancellations.length>0&&a.lyricsPanel.querySelector('.cbp-translation').hidden,'disabling local translation cancels inference and hides stale output');
    a.closeLocalTranslator();ok(!a.localWorker&&a.localPending.size===0&&closed===1,'releasing local model terminates its worker and clears pending jobs');
    a.settings.lyricsSource='off';await a.render();window.Worker=originalWorker;window.fetch=originalFetch;
    return checks;
}
