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
    const overlay=document.createElement('div');overlay.style.cssText='position:fixed;inset:0 0 auto;height:95px;z-index:1000;-webkit-app-region:drag';document.body.append(overlay);
    const close=a.lyricsPanel.querySelector('[data-close]'),rect=close.getBoundingClientRect();
    ok(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)===close,'header controls are above competing top-bar layers');
    ok(getComputedStyle(close).getPropertyValue('-webkit-app-region')==='no-drag','header buttons are excluded from native window dragging');
    ok(a.translationWithTone('This is fucking me up.','Это меня наебает.')==='Это меня разъёбывает.','phrasal profanity keeps its destructive meaning and explicit tone');
    ok(a.translationWithTone('Someone lied to me.','Кто-то меня наебал.')==='Кто-то меня наебал.','idiom correction does not replace unrelated profanity');
    return checks;
}
