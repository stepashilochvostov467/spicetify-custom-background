    Object.assign(APP, {
        async rememberPresetImage(id) {
            if (!this.presets().some(p => p.id === id)) return;
            await this.mediaUpload;
            await this.writeQueue;
            await images.run('readwrite', this.image, `cbp_preset_${id}`);
            this.presetImages[id] = true;
            storage.put('cbp_v2_preset_images', JSON.stringify(this.presetImages));
            this.notify('Картинка назначена выбранному оформлению');
        },
        async presetBundle(id) {
            const p = this.presets().find(p => p.id === id); if (!p) throw Error('Выбери оформление');
            await this.writeQueue;
            const savedImage = p.imageSaved || this.presetImages[id] === true;
            const image = savedImage ? await images.run('readonly', undefined, `cbp_preset_${id}`) : this.image;
            return { format: 'custom-background-preset', version: 1, name: p.name, settings: normalize({ ...p.settings,  }), image };
        },
        async exportPreset(id) {
            const bundle = await this.presetBundle(id);
            const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
            const link = document.createElement('a'); link.href = url; link.download = `custom-background-${bundle.name.replace(/[^\p{L}\p{N}_-]/gu, '_').slice(0,40)}.json`;
            document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
            this.notify('Оформление экспортировано вместе с картинкой');
        },
        async importPreset(bundle) {
            if (!bundle || bundle.format !== 'custom-background-preset' || bundle.version !== 1 || typeof bundle.name !== 'string' || !bundle.name.trim() || !bundle.settings || typeof bundle.settings !== 'object' || Array.isArray(bundle.settings)) throw Error('Это не файл оформления Custom Background');
            if (this.customPresets.length >= 30) throw Error('Можно сохранить до 30 оформлений');
            const image = bundle.image ?? '';
            if (typeof image !== 'string' || image.length > 43 * 1024 * 1024 || (image && !/^data:(?:video\/(?:mp4|webm)|image\/(png|jpeg|jpg|webp|gif|avif|bmp|x-icon|svg\+xml));base64,[a-z0-9+/=\s]+$/i.test(image))) throw Error('В файле должна быть встроенная картинка, а не ссылка');
            if (image) await validateMedia(image);
            const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
            await images.run('readwrite', image, `cbp_preset_${id}`);
            const p = { id, name: bundle.name.trim().slice(0,40), settings: normalize(bundle.settings), imageSaved: true };
            if (this.customPresets.length >= 30) throw Error('Можно сохранить до 30 оформлений');
            this.customPresets.push(p); storage.put('cbp_v2_presets', JSON.stringify(this.customPresets));
            this.fillPresets(id); await this.applyPreset(id); this.notify('Оформление импортировано'); return p;
        },
    });
