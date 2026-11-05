const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/extension.js','utf8');
const current=source.slice(source.indexOf('    const linearRGB='),source.indexOf('    function baseStyles'));
const clamp='const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));';
const optimized=vm.runInNewContext(clamp+current+';analyzePixels');
const ink=[];
for(const color of [[255,20,40],[20,90,255],[20,220,60],[255,255,255],[0,0,0]]){
 const pixels=new Uint8ClampedArray(4000*4);for(let i=0;i<pixels.length;i+=4)pixels.set([...color,255],i);
 const result=optimized(pixels),rgb=result.text.match(/[a-f0-9]{2}/gi).map(v=>parseInt(v,16));
 assert.ok(Math.max(...rgb)-Math.min(...rgb)>5,'automatic ink retains an actual tint');
 assert.notEqual(result.text,'#ffffff');assert.ok(result.minDim>=0&&result.minDim<=.9);ink.push(result.text);
}
assert.ok(new Set(ink).size>=4,'different backgrounds yield different palettes');
console.log('Automatic palette retains chromatic color across red, blue, green and monochrome backgrounds');
