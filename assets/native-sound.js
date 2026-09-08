// Assemble the received PCM without altering samples, then let the browser's
// native media player decode and play one complete WAV, as on the comparison page.
export class VoicePlayer extends EventTarget {
 constructor(){
  super();this.mode='native-wav';this.context=null;this.element=new Audio();this.element.preload='auto';
  this.sources=new Set();this.parts=[];this.bytes=0;this.duration=0;this.paused=true;this.version=0;this.chunks=0;this.firstStartedAt=null;this.underruns=0;this.url='';this.blob=null;
  for(const event of ['waiting','stalled'])this.element.addEventListener(event,()=>{if(!this.paused&&this.firstStartedAt!==null)this.underruns++;});
 }
 unlock(){
  // The shared context is used by the microphone analyser; playback uses <audio>.
  if(!this.context)this.context=new (window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'});
  return this.context.resume();
 }
 get currentTime(){return this.paused?0:this.element.currentTime;}
 get state(){return this.context?.state||'locked';}
 beginStream(){this.stop();}
 enqueuePCM(encoded,sampleRate=24000,offset=this.duration){
  if(sampleRate!==24000)throw Error('Formato de áudio incompatível.');
  if(Math.abs(offset-this.duration)>1/24000)throw Error('Os trechos de áudio chegaram fora de ordem. Tente novamente.');
  const raw=atob(encoded),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  if(!bytes.length)return;if(bytes.length%2)throw Error('O áudio recebido está incompleto.');
  this.parts.push(bytes);this.bytes+=bytes.length;this.duration=this.bytes/48000;this.chunks++;
 }
 async finish(){
  if(!this.bytes)throw Error('A resposta veio sem áudio.');
  const header=new ArrayBuffer(44),view=new DataView(header);
  const word=(offset,text)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};
  word(0,'RIFF');view.setUint32(4,36+this.bytes,true);word(8,'WAVE');word(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
  view.setUint32(24,24000,true);view.setUint32(28,48000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
  word(36,'data');view.setUint32(40,this.bytes,true);
  this.blob=new Blob([header,...this.parts],{type:'audio/wav'});this.parts=[];
  this.url=URL.createObjectURL(this.blob);return this.start(this.url);
 }
 async start(url){
  const version=this.version;this.element.src=url;
  this.element.onended=()=>{
   if(version!==this.version)return;
   this.paused=true;this.sources.clear();this.dispatchEvent(new Event('ended'));
  };
  try{await this.element.play();}
  catch(error){if(version!==this.version)return false;throw error;}
  if(version!==this.version)return false;
  this.paused=false;this.sources.add(this.element);this.firstStartedAt=performance.now()-this.element.currentTime*1000;
  if(Number.isFinite(this.element.duration))this.duration=this.element.duration;
  this.dispatchEvent(new Event('playing'));return true;
 }
 async play(url){
  this.stop();const version=this.version;await this.unlock();if(version!==this.version)return false;this.url=url;return this.start(url);
 }
 stop(){
  this.version++;this.paused=true;this.element.onended=null;this.element.pause();this.element.removeAttribute('src');this.element.load();
  if(this.url.startsWith('blob:'))URL.revokeObjectURL(this.url);
  this.sources.clear();this.parts=[];this.bytes=0;this.duration=0;this.chunks=0;this.firstStartedAt=null;this.underruns=0;this.url='';this.blob=null;
 }
}
