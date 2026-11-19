async()=>{
 const a=CBP.app,checks=[],ok=(v,m)=>{if(!v)throw Error(m);checks.push(m);},wait=ms=>new Promise(r=>setTimeout(r,ms));
 const lines=[{text:'First distinct lyric',start:10000,end:14000},{text:'Second distinct lyric',start:15000,end:19000},{text:'New verse lyric',start:30000,end:34000},{text:'First distinct lyric',start:40000,end:44000},{text:'Second distinct lyric',start:45000,end:49000}];
 ok(a.songChapters(lines,60000).some(m=>m.label==='Повтор'&&m.start===40000),'repeated multi-line passage is identified without audio analysis');
 ok(a.songChapters(lines,60000).some(m=>m.label==='Пауза в тексте'&&m.start===19000),'known vocal end creates an honest lyric-gap marker');
 ok(a.songChapters(lines.map(l=>({...l,end:null})),60000).every(m=>m.label!=='Пауза в тексте'),'missing end timing never invents instrumental sections');
 ok(a.songChapters([{text:'Untimed',start:null}],60000).length===0,'untimed lyrics do not invent a song structure');
 const host=document.createElement('div');host.className='playback-bar';host.style.cssText='position:fixed;bottom:20px;left:200px;width:600px;height:20px';document.body.append(host);
 a.settings.lyricsSource='spotify';Spicetify.Player.data.item.uri='spotify:track:MAPTEST';Spicetify.Player.getDuration=()=>60000;Spicetify.Player.getProgress=()=>41000;a.panelLyricLines=lines;a.renderSongMap();await a.songMapRead;
 ok(a.songMap.isConnected&&a.songMap.querySelector('[data-current]').textContent==='Повтор','map renders and highlights the playing chapter');
 a.songMap.querySelector('button').click();ok(calls.some(c=>Array.isArray(c)&&c[0]==='seek'&&c[1]===0),'clicking a chapter seeks its timestamp');
 a.editSongMap();const editor=a.songMapEditor;editor.querySelector('.cbp-map-rows input:not([type=number])').value='Куплет 1';editor.querySelector('[data-save]').click();for(let i=0;i<100&&a.songMapEditor;i++)await wait(10);
 ok(a.songMapStore.find(r=>r.uri==='spotify:track:MAPTEST').marks[0].label==='Куплет 1','manual section name is saved');
 ok(a.songMap.querySelector('button').textContent==='Куплет 1','saved section replaces the automatic label');
 a.editSongMap();a.settings.lyricsSongMap=false;a.renderSongMap();
 ok(!a.songMap&&!a.songMapEditor&&!a.songMapStore&&!a.songMapRead,'disabling the map closes its editor and releases loaded chapter data');
 let durationReads=0;Spicetify.Player.getDuration=()=>{durationReads++;return 60000;};playerEvents.onprogress?.();a.renderSongMap();
 ok(durationReads===0&&!a.songMapRead,'disabled map neither reads storage nor computes progress on events');
 a.settings.lyricsSongMap=true;a.renderSongMap();await a.songMapRead;
 ok(a.songMap.querySelector('button').textContent==='Куплет 1','reenabling the map reloads the saved manual chapters');
 const db=await new Promise(r=>{const q=indexedDB.open('CBP_Storage',1);q.onsuccess=()=>r(q.result);});const saved=await new Promise(r=>{const q=db.transaction('images').objectStore('images').get('cbp_song_maps_v1');q.onsuccess=()=>r(q.result);});db.close();ok(saved[0].marks[0].label==='Куплет 1','manual map persists in IndexedDB');
 a.editSongMap();a.songMapEditor.querySelector('[data-reset]').click();for(let i=0;i<100&&a.songMapEditor;i++)await wait(10);ok(!a.songMapStore.some(r=>r.uri==='spotify:track:MAPTEST'),'reset removes manual overrides');
 a.editSongMap();Spicetify.Player.data.item.uri='spotify:track:OTHER';a.renderSongMap();ok(!a.songMapEditor,'track switch closes stale editor');
 a.settings.lyricsSource='off';a.renderSongMap();ok(!document.querySelector('#cbp-song-map'),'closing lyrics removes the map without idle timers');host.remove();return checks;
}
