const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { minify } = require('terser');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const source = read('src/extension.js');
for (const marker of ['__BASE_STYLES__', '__EFFECTS__']) {
    if (source.split(marker).length !== 2) throw Error('Expected one build marker: ' + marker);
}
const surfaces = read('src/base-surfaces.css') + read('src/surface-fix.css');
const features = ['features', 'effects', 'studio', 'lyric-timeline', 'panel-duet', 'panel-lyrics', 'panel-translation', 'local-translator-worker', 'panel-local', 'prefetch', 'panel-background', 'panel-clip-timing', 'import-preview', 'song-map'].map(name => read('src/' + name + '.js')).join('\n');
const output = source.replace('__BASE_STYLES__', () => surfaces).replace('__EFFECTS__', () => features);
async function build() {
    const { code } = await minify(output, {
        compress: { passes: 2 },
        format: { comments: /^!|@license|@preserve/i }
    });
    if (!code) throw Error('Empty extension build');
    new vm.Script(code, {filename:'custom-bg.js'});
    fs.writeFileSync(path.join(root, 'custom-bg.js'), code + '\n');
    console.log('Built custom-bg.js (' + Buffer.byteLength(code) + ' bytes)');
}

build().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
