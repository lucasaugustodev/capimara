import {apiFetch} from './api.js?v=6';

export class ElevenTranscriber{
 prepare(){return Promise.resolve({device:'elevenlabs',model:'scribe_v2'});}
 async transcribe(file,signal){
  const started=performance.now();
  const response=await apiFetch('/api/transcribe',{
   method:'POST',body:file,headers:{'Content-Type':'audio/wav'},
   signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000)
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.error||'Não consegui entender agora. Pode repetir?');
  if(typeof result.text!=='string')throw Error('A escuta não terminou. Pode repetir?');
  return {...result,seconds:(performance.now()-started)/1000};
 }
}
