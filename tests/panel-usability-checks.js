async () => {
    const a=CBP.app,checks=[],ok=(value,message)=>{if(!value)throw Error(message);checks.push(message);};
    window.retryCount=0;
    Spicetify.CosmosAsync={get:async()=>{retryCount++;return {lyrics:{language:'en',syncType:'LINE_SYNCED',lines:[{startTimeMs:'0',words:'Synthetic usability line'}]}};}};
    window.fetch=async()=>({ok:true,status:200,json:async()=>({responseStatus:200,responseData:{translatedText:'Тестовая строка'}})});
    a.settings=CBP.normalize({...a.settings,colorMode:'auto',lyricsSource:'spotify',lyricsTranslation:false,lyricsTranslationEngine:'mymemory'});
    const canvas=document.createElement('canvas');canvas.width=canvas.height=80;const ctx=canvas.getContext('2d');
    for(const [name,color,expected] of [['LIGHT','#ffffff','#10151d'],['DARK','#000000','#f8faff']]){
        ctx.fillStyle=color;ctx.fillRect(0,0,80,80);
        Spicetify.Player.data.item={uri:'spotify:track:'+name,metadata:{image_url:canvas.toDataURL()}};await a.render();await a.refreshPanelBackdrop(true);
        await a.panelBackdrop.querySelector('img').decode();a.updatePanelContrast();
        ok(a.lyricsPanel.style.getPropertyValue('--cbp-panel-ink')===expected,'panel text adapts to its own '+name.toLowerCase()+' cover');
    }
    const luminance=rgb=>rgb.map(v=>{const c=v/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
    const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
    a.settings.colorMode='custom';
    for(const color of ['#979523','#777777','#12ab34'])for(const background of [0,255]){
        a.settings.color=color;ctx.fillStyle=background?'#ffffff':'#000000';ctx.fillRect(0,0,80,80);
        Spicetify.Player.data.item={uri:'spotify:track:CONTRAST'+color.slice(1)+background,metadata:{image_url:canvas.toDataURL()}};
        await a.render();await a.refreshPanelBackdrop(true);await a.panelBackdrop.querySelector('img').decode();a.updatePanelContrast();
        const muted=a.lyricsPanel.style.getPropertyValue('--cbp-panel-muted-ink').match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16));
        const scrim=a.lyricsPanel.style.getPropertyValue('--cbp-panel-scrim').match(/[0-9.]+/g).map(Number),bg=[0,1,2].map(i=>background*(1-scrim[3])+scrim[i]*scrim[3]);
        ok(scrim[3]===.12,'automatic contrast does not black out '+(background?'light':'dark')+' cover for '+color);
        ok(muted.some(c=>c>60),'resting text keeps a visible solid color for '+color);
        ok(a.lyricsPanel.style.getPropertyValue('--cbp-panel-outline')&&a.lyricsPanel.style.textShadow,'text has local contrast without a heavy full-panel overlay');
        ok(a.lyricsPanel.style.getPropertyValue('--cbp-panel-ink')===color,'selected lyric color is preserved: '+color);
    }
    a.settings.lyricsDim=0;await a.render();ok(a.lyricsPanel.style.getPropertyValue('--cbp-panel-scrim')==='rgba(0,0,0,0)','panel dimming can be disabled completely');
    a.settings.lyricsDim=.35;await a.render();ok(a.lyricsPanel.style.getPropertyValue('--cbp-panel-scrim')==='rgba(0,0,0,0.35)','panel dimming follows the explicit setting');
    a.settings.lyricsDim=.12;await a.render();
    document.documentElement.style.setProperty('--font-family','Arial, sans-serif');
    ok(getComputedStyle(a.lyricsPanel).fontFamily.includes('Arial'),'sidebar inherits the Spotify font variable');
    ok(parseFloat(getComputedStyle(a.lyricsPanel.querySelector('.cbp-original')).webkitTextStrokeWidth)===0,'lyric glyphs have no artificial stroke');
    const row=a.lyricsPanel.querySelector('.cbp-line');
    ok(getComputedStyle(row).opacity==='1','lyric rows do not compound opacity with syllables or translations');
    const overlay=document.createElement('div');overlay.style.cssText='position:fixed;inset:0 0 auto;height:95px;z-index:1000;-webkit-app-region:drag';document.body.append(overlay);
    const close=a.lyricsPanel.querySelector('[data-close]'),rect=close.getBoundingClientRect();
    ok(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)===close,'header controls are above competing top-bar layers');
    ok(getComputedStyle(close).getPropertyValue('-webkit-app-region')==='no-drag','header buttons are excluded from native window dragging');
    ok(a.translationWithTone('This is fucking me up.','Это меня наебает.')==='Это меня разъёбывает.','phrasal profanity keeps its destructive meaning and explicit tone');
    ok(a.translationWithTone('Someone lied to me.','Кто-то меня наебал.')==='Кто-то меня наебал.','idiom correction does not replace unrelated profanity');
    return checks;
}
