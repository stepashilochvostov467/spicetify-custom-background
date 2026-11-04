    Object.assign(APP, {
        initTransferUI() {
            const dialog=document.createElement('section');dialog.id='cbp-transfer';dialog.hidden=true;
            dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','cbp-transfer-title');
            dialog.innerHTML='<article><header><h2 id="cbp-transfer-title">Импорт и экспорт</h2><button data-transfer="close" aria-label="Закрыть импорт и экспорт">✕</button></header><p>Сохрани текущий фон и все настройки в файл или открой ранее сохранённый файл.</p><button data-transfer="export">Сохранить в файл</button><button data-transfer="import">Импортировать файл</button><input id="cbp-import" type="file" accept=".json,application/json" hidden><p role="status"></p></article>';
            dialog.addEventListener('click',e=>{const action=e.target.closest('[data-transfer]')?.dataset.transfer;if(action==='close'||e.target===dialog)this.showTransfer(false);if(action==='import')dialog.querySelector('input').click();if(action==='export')this.exportAppearance().catch(error=>this.report(error));});
            dialog.querySelector('input').addEventListener('change',async e=>{try{const file=e.target.files[0];if(file){if(file.size>45*1024*1024)throw Error('Файл оформления слишком большой (максимум 45 МБ)');await this.previewImport(JSON.parse(await file.text()));}}catch(error){dialog.querySelector('[role="status"]').textContent=error.message;}finally{e.target.value='';}});
            document.body.append(dialog);this.transferDialog=dialog;
        },
        showTransfer(show=this.transferDialog.hidden) {
            if(show){if(!this.menu.hidden)this.showMenu(false);this.transferFocus=document.activeElement;this.transferDialog.querySelector('[role="status"]').textContent='';}
            this.transferDialog.hidden=!show;
            if(show)this.transferDialog.querySelector('[data-transfer="export"]').focus();else this.transferFocus?.focus?.();
        },
        async appearanceBundle() {
            await this.mediaUpload;await this.writeQueue;
            return {format:'custom-background-preset',version:1,name:'Моё оформление',settings:normalize(this.settings),image:this.image};
        },
        async exportAppearance() {
            const bundle=await this.appearanceBundle();
            const url=URL.createObjectURL(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'}));
            const link=document.createElement('a');link.href=url;link.download='custom-background.json';
            document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
            this.notify('Фон и настройки сохранены в файл');
        },
        async importAppearance(raw) {
            const bundle=this.validateBundle(raw),token=++this.imageToken;
            if(bundle.image)await validateMedia(bundle.image);
            if(token!==this.imageToken)return;
            await this.queueImage(bundle.image,token);if(token!==this.imageToken)return;
            this.settings=bundle.settings;this.save();this.syncUI();await this.render();
            this.notify('Оформление применено');return bundle;
        }
    });
