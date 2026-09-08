import {mount} from '../assets/viewer.js?v=3';
import {ConversationMicrophone,prepareMicrophone} from './microphone.js?v=7';
import {apiFetch} from './api.js?v=6';
import {BrowserTranscriber} from './transcriber.js?v=5';

const $=s=>document.querySelector(s);
let view,history=[],job=null,turn=0,busy=false,voiceMode=false,microphone=null,listenTimer=null;
const state={ready:false,voiceMode:false,events:[],lastReply:null,recognitionReady:false,recognitionLoading:false};
let audioPreparation=null;
const transcriber=new BrowserTranscriber(progress=>{
 if(!state.recognitionReady){$('#preparation-progress').value=Math.max($('#preparation-progress').value,progress);$('#preparation-label').textContent=progress<99?'Preparando nossa conversa…':'Quase pronto para conversar…';}
});
window.capimaraApp={state,get viewer(){return view;},get history(){return history;},
 inspect:()=>({busy,voiceMode,microphoneActive:microphone?.stream?.active,recording:microphone?.listening?'recording':'inactive',micReady:microphone?.ready,micFrames:microphone?.frames,micRms:microphone?.rms,speechProbability:microphone?.probability,audioPaused:view?.audio.paused,audioTime:view?.audio.currentTime,audioState:view?.audio.state})};

function activity(text=''){$('#activity').hidden=!text;$('#activity-text').textContent=text;}
function error(message=''){$('#error').hidden=!message;$('#error').textContent=message;}
function controls(){
 $('#voice-mode').disabled=!state.ready;
 $('#stop').hidden=!(busy||view&&!view.audio.paused);
 $('#voice-mode').setAttribute('aria-pressed',String(voiceMode));
 $('#voice-label').textContent=voiceMode?'Encerrar conversa por voz':'Conversar por voz';
 $('#voice-hint').textContent=voiceMode?(state.recognitionReady?'Faça uma pausa para eu responder. Depois continuo ouvindo.':'Estou preparando tudo. Já vamos conversar.'):(state.recognitionReady?'Tudo pronto. Ative o microfone e fale comigo.':'Já estou preparando tudo para você.');
 $('#mic-settings').hidden=!voiceMode;
 state.voiceMode=voiceMode;
}
function cancelRecording(){
 clearTimeout(listenTimer);microphone?.pause();
 $('#voice-mode').classList.remove('listening');
}
function stopVoiceMode(){
 voiceMode=false;cancelRecording();const previous=microphone;microphone=null;previous?.close();micStatus('off');controls();
}
function cancelTurn(){
 turn++;job?.abort();job=null;view?.stop();busy=false;activity();controls();
}
async function* readEvents(response){
 if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(body.error||'Não consegui enviar sua mensagem. Tente novamente.');}
 const reader=response.body.getReader(),decoder=new TextDecoder();let pending='';
 try{
  while(true){
   const {value,done}=await reader.read();pending+=decoder.decode(value,{stream:!done});
   let newline;while((newline=pending.indexOf('\n'))!==-1){const line=pending.slice(0,newline).trim();pending=pending.slice(newline+1);if(line)yield JSON.parse(line);}
   if(done){if(pending.trim())yield JSON.parse(pending);break;}
  }
 }finally{reader.releaseLock();}
}
async function converse(message,audioFile=null){
 if(!state.ready||(!audioFile&&!message.trim()))return;
 // Called synchronously from the first gesture, before the API round trip.
 const unlocked=view.unlock();cancelRecording();cancelTurn();error();busy=true;controls();
 const current=turn;let replyText='',gotAudio=false,textOnly=false,noSpeech=false;
 activity(audioFile?'Entendendo o que você disse…':'Estou pensando…');
 view.update({phase:audioFile?'transcribing':'thinking'});
 try{
  await unlocked;if(current!==turn)return;
  if(audioFile){
   const result=await transcriber.transcribe(audioFile);if(current!==turn)return;
   message=result.text;state.lastTranscriptionSeconds=result.seconds;
   if(!message){noSpeech=true;activity('Pode repetir, continuo ouvindo.');view.stop();return;}
   activity('Estou pensando…');view.update({phase:'thinking'});
  }
  job=new AbortController();const body=JSON.stringify({message,history}),headers={'Content-Type':'application/json'};
  const response=await apiFetch('/api/talk',{method:'POST',body,headers,signal:job.signal});
  for await(const payload of readEvents(response)){
   if(current!==turn)return;
   state.events.push({phase:payload.phase,time:performance.now(),sequence:payload.sequence});
   if(state.events.length>120)state.events.shift();
   if(payload.phase==='error')throw Error(payload.message||'Não consegui responder agora. Tente de novo.');
   if(payload.phase==='no_speech'){noSpeech=true;activity(payload.message);view.stop();}
   if(payload.phase==='preparing'){
    replyText=payload.reply;history=payload.history;activity('Já vou falar com você…');
    view.update({phase:'preparing'});
   }
   if(payload.phase==='audio_chunk'){
    if(!replyText)replyText=payload.reply;
    if(!gotAudio){view.beginSpeech();gotAudio=true;}
    view.appendSpeech(payload);controls();
   }
   if(payload.phase==='audio_done'){await view.endSpeech();if(current!==turn)return;activity();state.lastReply={reply:replyText,duration:payload.duration,chunks:payload.chunks,tts_seconds:payload.tts_total_seconds};controls();}
   if(payload.phase==='audio_unavailable'){textOnly=true;error(payload.message);activity();view.stop();if(voiceMode)stopVoiceMode();}
   if(payload.phase==='done'){history=payload.history;state.totalSeconds=payload.total_seconds;}
  }
  if(current===turn&&!gotAudio&&!textOnly&&!noSpeech)throw Error('A resposta não terminou de carregar. Tente novamente.');
 }catch(exc){
  if(current!==turn)return;
  error(exc.message||'A conexão falhou. Tente novamente.');activity();view.stop();
  if(voiceMode)stopVoiceMode();
 }finally{
  if(current===turn){job=null;busy=false;controls();if(voiceMode&&view.audio.paused)scheduleListening();}
 }
}

$('#stop').addEventListener('click',()=>{cancelTurn();if(voiceMode)scheduleListening();});
$('#new-chat').addEventListener('click',()=>{const resume=voiceMode;cancelRecording();cancelTurn();history=[];state.lastReply=null;error();if(resume)scheduleListening();});
$('#home-camera').addEventListener('click',()=>view?.home());

function prepareAudio(){
 if(audioPreparation)return audioPreparation;
 state.recognitionLoading=true;state.recognitionError=false;$('#preparation').hidden=false;
 $('#preparation-label').textContent='Preparando nossa conversa…';$('#preparation-progress').value=0;
 audioPreparation=Promise.all([transcriber.prepare(),prepareMicrophone()]).then(([recognition])=>{
  state.recognitionReady=true;state.recognitionLoading=false;state.recognitionDevice=recognition.device;
  $('#preparation').hidden=true;controls();return recognition;
 }).catch(exc=>{
  audioPreparation=null;state.recognitionLoading=false;state.recognitionError=true;
  $('#preparation-label').textContent='Toque em conversar para tentar preparar novamente.';throw exc;
 });
 return audioPreparation;
}

function scheduleListening(){
 clearTimeout(listenTimer);
 if(voiceMode&&!busy&&view.audio.paused)listenTimer=setTimeout(startListening,300);
}
async function startListening(){
 if(!voiceMode||busy||!view.audio.paused||!microphone?.ready)return;
 try{await view.unlock();if(voiceMode&&!busy&&view.audio.paused)await microphone?.resume();}catch(exc){microphoneError(exc);}
}
function micStatus(status){
 state.microphoneStatus=status;
 state.events.push({phase:'mic_'+status,time:performance.now()});if(state.events.length>120)state.events.shift();
 $('#voice-mode').classList.toggle('listening',['listening','speaking','no-signal'].includes(status));
 $('#voice-mode').classList.toggle('detecting',status==='speaking');
 const labels={connecting:'Conectando o microfone…',listening:'Pode falar. Estou ouvindo…',speaking:'Estou ouvindo você…',sending:'Entendendo o que você disse…','no-signal':'O microfone está sem sinal. Confira o dispositivo abaixo ou se ele está no mudo.'};
 if(labels[status])activity(labels[status]);
}
function microphoneError(exc){
 stopVoiceMode();activity();
 const messages={NotAllowedError:'Permita o microfone no ícone ao lado do endereço e ative a conversa.',NotFoundError:'Não encontrei um microfone conectado.',NotReadableError:'Não consegui acessar o microfone. Confira se ele está conectado e disponível.',OverconstrainedError:'O microfone escolhido não está disponível. Ative novamente para usar o padrão.'};
 if(exc.name==='OverconstrainedError')try{localStorage.removeItem('capimara-microphone');}catch{}
 error(messages[exc.name]||exc.message||'Não consegui conectar o microfone. Tente novamente.');
}
async function microphoneList(){
 const current=microphone;if(!current?.stream)return;
 const devices=await navigator.mediaDevices.enumerateDevices(),select=$('#microphone-device');
 if(microphone!==current)return;
 const selected=current.stream.getAudioTracks()[0]?.getSettings().deviceId;
 select.replaceChildren();
 for(const device of devices.filter(d=>d.kind==='audioinput')){const option=new Option(device.label||'Microfone',device.deviceId);select.add(option);}
 if([...select.options].some(option=>option.value===selected))select.value=selected;
}
async function connectMicrophone(deviceId){
 const unlocked=view.unlock();error();voiceMode=true;controls();
 if(deviceId===undefined)try{deviceId=localStorage.getItem('capimara-microphone')||'';}catch{deviceId='';}
 const current=new ConversationMicrophone({
  onStatus:status=>{if(microphone===current&&voiceMode)micStatus(status);},
  onLevel:level=>{if(microphone===current)$('#mic-meter').style.setProperty('--mic-level',String(level));},
  onSpeech:file=>{if(microphone===current&&voiceMode&&!busy&&view.audio.paused)converse('',file);},
  onError:exc=>{if(microphone===current)microphoneError(exc);}
 });
 microphone=current;
 try{
  await unlocked;if(microphone!==current||!voiceMode)return;
  // Permission and capture setup can run while the page's existing warmup finishes.
  await Promise.all([prepareAudio(),current.open(view.audio.context,deviceId)]);
  if(microphone!==current||!voiceMode)return;
  await microphoneList();if(!busy&&view.audio.paused)startListening();
 }catch(exc){if(microphone===current)microphoneError(exc);}
}
$('#voice-mode').addEventListener('click',()=>{
 if(voiceMode){stopVoiceMode();cancelTurn();return;}
 connectMicrophone();
});
$('#microphone-device').addEventListener('change',()=>{const id=$('#microphone-device').value;try{localStorage.setItem('capimara-microphone',id);}catch{}stopVoiceMode();connectMicrophone(id);});
navigator.mediaDevices?.addEventListener('devicechange',()=>microphoneList().catch(()=>{}));
window.addEventListener('pagehide',()=>{stopVoiceMode();cancelTurn();});

async function connectService(){
 activity('Conectando a conversa…');
 try{
  const response=await apiFetch('/api/status',{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('A conversa está acordando. Tente conectar novamente em instantes.');
  const status=await response.json();state.voiceReady=status.voice_ready;
  state.ready=status.ready;controls();activity();
  if(!status.ready)throw Error('A conversa está se preparando. Tente conectar novamente em instantes.');
  $('#reconnect').hidden=true;
  if(!state.recognitionError)error();
 }catch(exc){activity();error(exc.message);$('#reconnect').hidden=false;}
}
$('#reconnect').addEventListener('click',()=>{connectService();prepareAudio().catch(exc=>error(exc.message));});
// Download and warm recognition immediately, before any microphone gesture.
prepareAudio().catch(()=>{});
try{
 view=await mount($('#avatar'),new URL('../assets',import.meta.url).href);$('#loading').hidden=true;controls();
 view.audio.addEventListener('ended',()=>{controls();scheduleListening();});view.audio.addEventListener('playing',controls);
 connectService();
}catch(exc){$('#loading').textContent='Não consegui abrir agora. Recarregue a página.';error(exc.message);}
