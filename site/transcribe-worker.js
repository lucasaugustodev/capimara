import {env,pipeline} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/dist/transformers.min.js';

env.allowLocalModels=false;
env.useBrowserCache=true;
env.backends.onnx.wasm.numThreads=1;
env.backends.onnx.wasm.wasmPaths=new URL('../assets/vendor/transformers/',import.meta.url).href;
let modelPromise,device='wasm';
const MODELS={webgpu:{name:'onnx-community/whisper-base',revision:'1846881b6b3a3024392c1eea3ad983695bc23925'},wasm:{name:'onnx-community/whisper-tiny',revision:'ff4177021cc41f7db950912b73ea4fdf7d01d8e7'}};
async function prepare(){
 if(!modelPromise)modelPromise=(async()=>{
  try{const adapter=new URL(import.meta.url).searchParams.has('wasm')?null:await navigator.gpu?.requestAdapter();if(adapter&&!adapter.info?.isFallbackAdapter&&!/swiftshader|software/i.test(adapter.info?.description||''))device='webgpu';}catch{}
  const options={dtype:'q4',progress_callback:event=>{if(event.status==='progress')self.postMessage({type:'progress',file:event.file,progress:event.progress,loaded:event.loaded,total:event.total});}};
  let transcribe;
  try{transcribe=await pipeline('automatic-speech-recognition',MODELS[device].name,{...options,revision:MODELS[device].revision,device});}
  catch(error){if(device==='wasm')throw error;device='wasm';transcribe=await pipeline('automatic-speech-recognition',MODELS[device].name,{...options,revision:MODELS[device].revision,device});}
  await transcribe(new Float32Array(16000),{language:'portuguese',task:'transcribe',max_new_tokens:1});
  return transcribe;
 })().catch(error=>{modelPromise=null;throw error;});
 return modelPromise;
}
let queue=Promise.resolve();
self.onmessage=event=>{
 const {id,type,audio}=event.data;
 queue=queue.then(async()=>{
  const started=performance.now();
  try{
   const transcribe=await prepare();
   if(type==='prepare'){self.postMessage({id,type:'ready',device,seconds:(performance.now()-started)/1000});return;}
   let peak=0;for(const sample of audio)peak=Math.max(peak,Math.abs(sample));
   if(peak<.0001){self.postMessage({id,type:'result',text:'',seconds:0});return;}
   if(peak<.25){const gain=Math.min(20,.25/peak);for(let i=0;i<audio.length;i++)audio[i]*=gain;}
   const result=await transcribe(audio,{language:'portuguese',task:'transcribe',chunk_length_s:30,stride_length_s:3,return_timestamps:false,max_new_tokens:128});
   self.postMessage({id,type:'result',text:result.text.trim().replace(/\bcapimar(?:a|o)?\b/gi,'Capimara'),seconds:(performance.now()-started)/1000});
  }catch(error){self.postMessage({id,type:'error',message:String(error.message||error)});}
 });
};
