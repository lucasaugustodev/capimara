export class BrowserTranscriber{
 constructor(onProgress){this.onProgress=onProgress;this.worker=null;this.sequence=0;this.pending=new Map();this.ready=null;this.progress=new Map();}
 request(type,audio){
  if(!this.worker){
   this.worker=new Worker(new URL('./transcribe-worker.js?v=5',import.meta.url),{type:'module'});
   this.worker.onmessage=({data})=>{
    if(data.type==='progress'){
     this.progress.set(data.file,{loaded:data.loaded||0,total:data.total||0});
     const values=[...this.progress.values()],total=values.reduce((n,v)=>n+v.total,0),loaded=values.reduce((n,v)=>n+v.loaded,0);
     this.onProgress(total?Math.min(99,Math.round(loaded/total*100)):0);return;
    }
    const pending=this.pending.get(data.id);if(!pending)return;this.pending.delete(data.id);
    if(data.type==='error')pending.reject(Error('Não consegui preparar o reconhecimento da fala. Recarregue a página e tente novamente.'));
    else pending.resolve(data);
   };
   this.worker.onerror=()=>{for(const pending of this.pending.values())pending.reject(Error('O reconhecimento da fala parou. Recarregue a página.'));this.pending.clear();};
  }
  const id=++this.sequence;
  return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.worker.postMessage({id,type,audio},audio?[audio.buffer]:[]);});
 }
 prepare(){if(!this.ready)this.ready=this.request('prepare').catch(error=>{this.ready=null;throw error;});return this.ready;}
 async transcribe(file){
  await this.prepare();
  // ConversationMicrophone encodes a fixed mono PCM16 WAV at 16 kHz.
  const buffer=await file.arrayBuffer(),data=new DataView(buffer),audio=new Float32Array((buffer.byteLength-44)/2);
  for(let i=0;i<audio.length;i++)audio[i]=data.getInt16(44+i*2,true)/32768;
  return this.request('transcribe',audio);
 }
}
