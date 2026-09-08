let settings;
try{
 sessionStorage.removeItem('capimara-access');
 if(new URLSearchParams(location.hash.slice(1)).has('access'))history.replaceState(null,'',location.pathname+location.search);
}catch{}
async function configuration(){
 if(!settings){const response=await fetch(new URL('./config.json',import.meta.url),{cache:'no-cache'});if(!response.ok)throw Error('Não consegui conectar a conversa agora. Tente novamente em instantes.');settings=await response.json();}
 return settings;
}
export async function apiFetch(path,options={}){
 const config=await configuration();
 if(!config.apiBase)throw Error('A conversa ainda está sendo preparada. Volte em instantes.');
 const base=new URL(config.apiBase);
 if(base.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(base.hostname))throw Error('Não consegui abrir uma conexão segura com a conversa.');
 return fetch(new URL(path,base),{...options,credentials:'omit'});
}
