const ASSETS=new URL('../assets/vendor/vad/',import.meta.url).href;
let libraries;
function script(src){return new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=src;tag.onload=resolve;tag.onerror=()=>{tag.remove();reject(Error('Não consegui preparar o microfone. Recarregue a página.'));};document.head.append(tag);});}
export function prepareMicrophone(){
 if(!libraries)libraries=(async()=>{if(!window.ort)await script(ASSETS+'ort.wasm.min.js');if(!window.vad)await script(ASSETS+'bundle.min.js');})().catch(error=>{libraries=null;throw error;});
 return libraries;
}
function wavFile(samples){
 const data=new ArrayBuffer(44+samples.length*2),v=new DataView(data);
 const word=(offset,text)=>{for(let i=0;i<text.length;i++)v.setUint8(offset+i,text.charCodeAt(i));};
 word(0,'RIFF');v.setUint32(4,36+samples.length*2,true);word(8,'WAVE');word(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);word(36,'data');v.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++){const x=Math.max(-1,Math.min(1,samples[i]));v.setInt16(44+i*2,Math.round(x*(x<0?32768:32767)),true);}
 return new File([data],'fala.wav',{type:'audio/wav'});
}

// Speech detection stays local. Keep the same microphone stream between turns,
// disconnecting detection while the answer plays to avoid hearing our own voice.
export class ConversationMicrophone{
 constructor({onStatus,onLevel,onSpeech,onError}){
  Object.assign(this,{onStatus,onLevel,onSpeech,onError});this.stream=null;this.detector=null;this.closed=false;this.listening=false;this.wanted=false;this.ready=false;this.queue=Promise.resolve();this.frames=0;this.probability=0;this.rms=0;
 }
 async open(context,deviceId=''){
  if(!navigator.mediaDevices?.getUserMedia)throw Error('Este navegador não oferece acesso ao microfone. Abra esta página no Chrome ou Edge.');
  this.onStatus('connecting');
  const capture=navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true,...(deviceId?{deviceId:{exact:deviceId}}:{})},video:false}).then(stream=>{this.stream=stream;if(this.closed)stream.getTracks().forEach(track=>track.stop());return stream;});
  await Promise.all([capture,prepareMicrophone()]);if(this.closed)return;
  for(const track of this.stream.getAudioTracks())track.addEventListener('ended',()=>{if(!this.closed)this.onError(Error('O microfone foi desconectado. Conecte-o e inicie a conversa de novo.'));});
  this.detector=await window.vad.MicVAD.new({
   model:'v5',audioContext:context,baseAssetPath:ASSETS,onnxWASMBasePath:ASSETS,
   ortConfig:ort=>{ort.env.wasm.numThreads=1;ort.env.logLevel='error';},
   positiveSpeechThreshold:.45,negativeSpeechThreshold:.25,redemptionMs:750,preSpeechPadMs:400,minSpeechMs:160,
   startOnLoad:true,submitUserSpeechOnPause:false,
   getStream:async()=>this.stream,pauseStream:async()=>{},resumeStream:async()=>this.stream,
   onFrameProcessed:(probabilities,frame)=>{
    if(!this.listening||this.closed)return;
    let energy=0;for(const value of frame)energy+=value*value;
    this.rms=Math.sqrt(energy/frame.length);this.probability=probabilities.isSpeech;this.frames++;
    if(this.rms>.00003)this.lastSignal=performance.now();
    this.onLevel(Math.min(1,Math.sqrt(this.rms)*4));
    if(performance.now()-this.lastSignal>8000&&!this.noSignal){this.noSignal=true;this.onStatus('no-signal');}
    if(this.noSignal&&this.rms>.00003){this.noSignal=false;this.onStatus('listening');}
   },
   onSpeechStart:()=>{},
   onSpeechRealStart:()=>{
    if(!this.listening||this.closed)return;
    clearTimeout(this.maxSpeech);this.onStatus('speaking');
    this.maxSpeech=setTimeout(()=>this.flush(),35000);
   },
   onVADMisfire:()=>{if(this.listening&&!this.closed)this.onStatus('listening');},
   onSpeechEnd:samples=>{
    if(!this.listening||this.closed)return;
    this.pause();this.onStatus('sending');this.onSpeech(wavFile(samples));
   }
  });
  await this.detector.pause();
  if(this.closed){await this.detector.destroy();this.detector=null;return;}
  this.ready=true;
 }
 transition(action){const result=this.queue.then(action);this.queue=result.catch(error=>{if(!this.closed)this.onError(error);});return result;}
 resume(){
  this.wanted=true;
  return this.transition(async()=>{
   if(this.closed||!this.wanted||!this.ready)return;
   await this.detector.start();
   if(this.closed||!this.wanted){await this.detector.pause();return;}
   this.listening=true;this.lastSignal=performance.now();this.noSignal=false;this.onStatus('listening');
  });
 }
 pause(){
  this.wanted=false;this.listening=false;clearTimeout(this.maxSpeech);this.onLevel(0);
  return this.transition(async()=>{if(this.detector)await this.detector.pause();});
 }
 flush(){
  return this.transition(async()=>{
   if(this.closed||!this.wanted||!this.detector)return;
   this.detector.setOptions({submitUserSpeechOnPause:true});
   try{await this.detector.pause();}finally{this.detector.setOptions({submitUserSpeechOnPause:false});}
   if(this.wanted&&!this.closed)this.resume();
  });
 }
 close(){
  this.closed=true;this.wanted=false;this.listening=false;clearTimeout(this.maxSpeech);this.stream?.getTracks().forEach(track=>track.stop());this.onLevel(0);
  return this.transition(async()=>{if(this.ready&&this.detector){await this.detector.destroy();this.detector=null;}this.ready=false;});
 }
}
