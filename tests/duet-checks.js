async()=>{
 const a=CBP.app,checks=[],ok=(v,m)=>{if(!v)throw Error(m);checks.push(m);},wait=ms=>new Promise(r=>setTimeout(r,ms));
 const vocal=(text,start,end,opposite=false)=>({Type:'Vocal',OppositeAligned:opposite,Lead:{StartTime:start,EndTime:end,Syllables:[{Text:text,StartTime:start,EndTime:end}]}});
 const data={Type:'Syllable',Language:'en',Content:[vocal('First voice',0,2),{...vocal('Second voice',2,4,true),Background:[{StartTime:2,EndTime:4,Syllables:[{Text:'Ech',StartTime:2,EndTime:3,IsPartOfWord:true},{Text:'o',StartTime:3,EndTime:4}]}]},vocal('Both',4,6),vocal('Both',4,6,true),vocal('Last voice',6,8)]};const fullContent=data.Content;
 ok(CBP.normalize({}).lyricsDuet===true,'duet is enabled by default and persisted as a normal setting');
 const raw=a.panelLines(data,'spicy');ok(raw[1].opposite&&raw[1].end===4000&&raw[1].background.length===1,'documented alignment, duration and backing metadata survive parsing');
 const arranged=a.arrangePanelDuet(raw);ok(arranged.length===4&&arranged[0].voice==='left'&&arranged[1].voice==='right'&&arranged[2].voice==='joint','opposing voices alternate sides and exact unison becomes one centered row');
 const repeat=a.arrangePanelDuet(a.panelLines({Type:'Syllable',Content:[vocal('Repeat',0,2),vocal('Repeat',3,5,true)]},'spicy'));ok(repeat.length===2,'a later chorus repetition cannot be mistaken for simultaneous unison');
 const different=a.arrangePanelDuet(a.panelLines({Type:'Syllable',Content:[vocal('Different words',0,2),vocal('Other words',0,2,true)]},'spicy'));ok(different.length===2,'different simultaneous words are preserved');
 window.SpicyLyrics={db:{objectStores:{lyricsStore:{manager:{get:async()=>data}}}}};
 Spicetify.Player.data.item={uri:'spotify:track:DUETFIXTURE',metadata:{title:'Duet fixture',image_url:testImage}};Spicetify.Player.getProgress=()=>2500;
 a.requestLocalRussianTranslation=async text=>'Перевод '+text;
 a.settings.lyricsDuet=true;a.settings.lyricsSource='spicy';a.settings.lyricsTranslation=true;a.settings.lyricsTranslationEngine='local';await a.render();
 for(let i=0;i<100;i++){if(a.lyricsPanel.querySelectorAll('.cbp-line').length===4&&a.panelTranslationDone&&!a.lyricsPanel.querySelector('.cbp-translation')?.hidden)break;await wait(10);}
 const rows=[...a.lyricsPanel.querySelectorAll('.cbp-line')];
 ok(rows.length===4&&rows[1].dataset.voice==='right'&&rows[2].dataset.voice==='joint','rendering uses parsed roles without performer-name guesses');
 ok(getComputedStyle(rows[0]).textAlign==='left'&&getComputedStyle(rows[1]).textAlign==='right'&&getComputedStyle(rows[2]).textAlign==='center','left, right and joint have distinct actual layout');
 ok(!rows[1].querySelector('.cbp-translation').hidden&&rows[1].querySelector('.cbp-translation').textContent==='Перевод Second voice','Russian translation remains attached to its vocal part');
 ok(rows[1].querySelector('.cbp-backing').getAttribute('aria-label')==='Бэк-вокал'&&parseFloat(getComputedStyle(rows[1].querySelector('.cbp-backing')).fontSize)<parseFloat(getComputedStyle(rows[1]).fontSize),'backing vocal is retained as a smaller secondary part');
 a.syncPanelLyrics(2500);ok(rows[1].querySelector('.cbp-backing .cbp-syllable').style.getPropertyValue('--cbp-fill')==='50%','backing syllable animation retains original timing');
 a.syncPanelLyrics(5000);ok(a.panelLyricIndex===2&&rows[2].querySelector('.cbp-syllable').style.getPropertyValue('--cbp-fill')==='50%','merged unison retains real syllable timing');
 rows[2].click();ok(calls.some(c=>Array.isArray(c)&&c[0]==='seek'&&c[1]===4000),'joint line seeks its original timestamp');
 a.settings.lyricsDuet=false;await a.loadPanelLyrics();ok(a.lyricsPanel.dataset.duet==='false'&&a.panelLyricLines.length===5,'turning duet off immediately restores original rows');
 a.settings.lyricsDuet=true;data.Content=[vocal('Solo line',0,2)];await a.loadPanelLyrics(true);ok(a.lyricsPanel.dataset.duet==='false'&&!a.lyricsPanel.querySelector('[data-voice]'),'unmarked solo songs keep ordinary layout');
 data.Content=[vocal('Long first part',0,3),vocal('Overlapping reply',1,2,true)];await a.loadPanelLyrics(true);a.syncPanelLyrics(1500);
 const overlapRows=[...a.lyricsPanel.querySelectorAll('.cbp-line')];ok(overlapRows.every(row=>row.getAttribute('aria-current')==='true')&&a.panelDuetAnchor===0,'simultaneous different voices remain visible together at the fixed anchor');
 ok(overlapRows.every(row=>[...row.querySelectorAll('.cbp-syllable')].some(span=>parseFloat(span.style.getPropertyValue('--cbp-fill'))>0)),'both simultaneous vocal parts animate with their own real timings');
 a.syncPanelLyrics(3500);ok(overlapRows[0].dataset.state==='past'&&a.panelDuetAnchor===1,'expired overlap releases the previous voice and restores the anchor');
 data.Content=[
  {...vocal('Lead voice',0,5),Background:[{Syllables:[{Text:'Echo now',StartTime:2,EndTime:3}]}]},
  {...vocal('Reply next',5,7,true),Vocalist:'Макс'}
 ];
 await a.loadPanelLyrics(true);
 a.syncPanelLyrics(1000);
 ok(a.panelVoiceCue?.textContent==='Скоро бэк-вокал · Echo now','backing cue previews the timed backing phrase');
 a.syncPanelLyrics(4000);
 ok(a.panelVoiceCue?.textContent==='Макс · Reply next','the incoming singer and phrase are shown when the next part has timing');
 a.syncPanelLyrics(5000);
 ok(!a.panelVoiceCue?.isConnected,'the cue clears at the start of the incoming vocal');
 Spicetify.CosmosAsync={get:async()=>({lyrics:{language:'en',syncType:'LINE_SYNCED',lines:[{words:'Spotify line',startTimeMs:'0',OppositeAligned:true}]}})};a.settings.lyricsSource='spotify';await a.loadPanelLyrics();ok(a.lyricsPanel.dataset.duet==='false','Spotify fallback never invents vocalist roles');
 data.Content=[
   {...vocal('Opening',10,12),Vocalist:'Лена'},
   {...vocal('Same voice',12,14),Vocalist:'Лена'},
   {...vocal('Reply',24,26,true),Vocalist:'Макс'},
   {...vocal('Returns',26,28),Vocalist:'Лена'}
 ];
 a.settings.lyricsSource='spicy';await a.loadPanelLyrics(true);
 const labels=()=>[...a.lyricsPanel.querySelectorAll('.cbp-line')].map(row=>row.querySelector('.cbp-vocal-name')?.textContent);
 ok(JSON.stringify(labels())===JSON.stringify(['Лена',undefined,'Макс','Лена']),'a quiet name appears only when the named voice changes');
 a.syncPanelLyrics(2000);ok(a.panelVocalCountdown.textContent==='Вокал через 8 с · Лена','intro countdown names the first voice');
 a.syncPanelLyrics(16000);ok(a.panelVocalCountdown.textContent==='Вокал через 8 с · Макс','instrumental break names the upcoming voice');
 a.syncPanelLyrics(24000);ok(!a.panelVocalCountdown.isConnected,'the voice label takes over when the countdown ends');
 const withCredits=a.panelLines({Type:'Line',Content:[
   {Text:'[Verse 1: Лена]',StartTime:0},
   {Text:'Opening',StartTime:10},
   {Text:'[Chorus]',StartTime:14},
   {Text:'Uncredited chorus',StartTime:15}
 ]},'spicy');
 ok(withCredits.length===2&&withCredits[0].vocalist==='Лена'&&!withCredits[1].vocalist,'only an explicitly named section supplies a section credit');
 data.Content=fullContent;
 Spicetify.Player.data.item.uri='spotify:track:OTHERDUET';
 Spicetify.LocalStorage.set('cbp_vocal_names:spotify:track:OTHERDUET','{"left":"Лена","right":"Макс"}');
 await a.loadPanelLyrics(true);
 ok(labels().every(name=>!name),'uncredited parts have no labels even with legacy saved names');
 ok(!a.menu.querySelector('[data-vocal-editor]'),'manual name editor is gone');
 a.syncPanelLyrics(0);return checks;
}
