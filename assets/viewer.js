import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { VoicePlayer } from './native-sound.js?v=3';

const weights={X:[0,0,0,0,0,0],A:[0,0,0,0,0,0],B:[0,.1,.45,0,0,0],C:[0,.72,.08,0,0,0],D:[.88,0,0,0,0,0],E:[0,0,0,.9,0,0],F:[0,0,0,0,.85,0],G:[0,0,0,0,0,.85],H:[.35,.2,0,0,0,0]};
function decode(s,Type=Float32Array){const raw=atob(s),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Type(bytes.buffer);}
function smooth(t){return t*t*(3-2*t);}

export async function mount(element,assetBase){
 const stage=element.querySelector('.capi-stage'),status=element.querySelector('.capi-status');
 const scene=new THREE.Scene();scene.background=new THREE.Color('#cce5d9');
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
 stage.appendChild(renderer.domElement);
 const camera=new THREE.PerspectiveCamera(35,1,.01,20);camera.up.set(0,0,1);camera.position.set(1.95,-.47,.58);
 const orbit=new OrbitControls(camera,renderer.domElement);orbit.target.set(0,0,.015);orbit.enableDamping=true;orbit.enablePan=false;orbit.minDistance=1.0;orbit.maxDistance=3.5;orbit.maxPolarAngle=Math.PI*.56;orbit.update();
 scene.add(new THREE.HemisphereLight(0xfff3de,0x52877b,2));
 const key=new THREE.DirectionalLight(0xffedda,3.1);key.position.set(2,-2,3);key.castShadow=true;
 key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-1;key.shadow.camera.right=1;key.shadow.camera.top=1;key.shadow.camera.bottom=-1;key.shadow.normalBias=.006;key.shadow.autoUpdate=false;key.shadow.needsUpdate=true;scene.add(key);
 const fill=new THREE.DirectionalLight(0xd9f5ef,1.5);fill.position.set(-1,2,1.7);scene.add(fill);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x92c4b1,roughness:1}));floor.position.z=-.507;floor.receiveShadow=true;scene.add(floor);
 const group=new THREE.Group();scene.add(group);
 const response=await fetch(assetBase+'/capimara.json');if(!response.ok)throw Error('Avatar '+response.status);
 const data=await response.json(),meshes=[];
 for(const part of data.meshes){
  const geometry=new THREE.BufferGeometry();const positions=decode(part.positions);
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(decode(part.normals),3));geometry.setAttribute('color',new THREE.BufferAttribute(decode(part.colors),3));geometry.setIndex(new THREE.BufferAttribute(decode(part.indices,Uint32Array),1));
  geometry.morphTargetsRelative=true;geometry.morphAttributes.position=[];geometry.morphAttributes.normal=[];
  const wavePoses=part.type==='arm'?[{p:positions.slice(),n:geometry.attributes.normal.array.slice()}]:null;
  for(const pose of part.morphs){
   const ids=decode(pose.indices,Uint32Array),dp=decode(pose.positions),dn=decode(pose.normals),p=new Float32Array(positions.length),n=new Float32Array(positions.length);
   for(let i=0;i<ids.length;i++){p.set(dp.subarray(i*3,i*3+3),ids[i]*3);n.set(dn.subarray(i*3,i*3+3),ids[i]*3);}
   if(wavePoses){
    const normals=geometry.attributes.normal.array;
    for(let i=0;i<p.length;i++){p[i]+=positions[i];n[i]+=normals[i];}
    wavePoses.push({p,n});
   }else{
    const pa=new THREE.BufferAttribute(p,3),na=new THREE.BufferAttribute(n,3);pa.name=na.name=pose.name;geometry.morphAttributes.position.push(pa);geometry.morphAttributes.normal.push(na);
   }
  }
  if(wavePoses)geometry.morphAttributes={};
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:part.type==='iris'?.4:.72,metalness:0});
  if(part.type==='iris'){
   const sign=part.side==='E'?1:-1;
   material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec2 capiEye;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','capiEye=transformed.xy;\n#include <project_vertex>');
    shader.fragmentShader='varying vec2 capiEye;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 iris=(capiEye-vec2(${(-sign*.004).toFixed(4)},-.014))/vec2(.037,.041);
      vec2 lightSpot=(capiEye-vec2(${(-sign*.019).toFixed(4)},.012))/vec2(.010,.013);
      float edge=1.-smoothstep(.985,1.015,dot(iris,iris));
      diffuseColor.rgb=mix(vec3(.989,.977,.922),vec3(.155,.051,.027),edge);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.),(1.-smoothstep(.96,1.04,dot(lightSpot,lightSpot)))*edge);
    `);
   };
   material.customProgramCacheKey=()=>`capimara-eye-${sign}`;
  }
  const mesh=new THREE.Mesh(geometry,material);mesh.name=part.name;mesh.castShadow=true;mesh.receiveShadow=part.type==='body';mesh.matrixAutoUpdate=false;mesh.matrix.fromArray(part.matrix);mesh.userData={type:part.type,side:part.side,wavePoses,waveFrames:part.wave_frames};
  if(wavePoses){geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);geometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;}
  group.add(mesh);meshes.push(mesh);
 }
 const audio=new VoicePlayer();let cues=[],phase='idle',lastPayload=null,turn=0,waveStart=-100,blinkStart=-100,nextBlink=performance.now()/1000+2,waveWasActive=false,lastShadow=0;
 const resize=()=>{const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};
 const observer=new ResizeObserver(resize);observer.observe(stage);resize();
 const labels={idle:'Estou aqui com você',thinking:'Estou pensando…',preparing:'Preparando minha voz…',speaking:'Conversando com você',transcribing:'Estou ouvindo…',error:'Tente novamente.'};
 function setStatus(value){phase=value;status.textContent=labels[value]||value;}
 function stop(){turn++;audio.stop();cues=[];setStatus('idle');}
 function beginSpeech(){stop();audio.beginStream();setStatus('preparing');}
 function appendSpeech(payload){
  cues.push(...(payload.cues||[]));audio.enqueuePCM(payload.audio_base64,payload.sample_rate,payload.offset);
 }
 function endSpeech(){return audio.finish();}
 async function play(payload){
  stop();const current=turn;lastPayload=payload;cues=payload.cues||[];
  try{const played=await audio.play(payload.audio);if(current===turn&&played)setStatus('speaking');}
  catch(error){if(current===turn){status.textContent=error.message;throw error;}}
 }
 audio.addEventListener('ended',()=>setStatus('idle'));
 audio.addEventListener('playing',()=>setStatus('speaking'));
 element.querySelector('.capi-stop')?.addEventListener('click',stop);
 element.querySelector('.capi-replay')?.addEventListener('click',()=>{audio.unlock();if(lastPayload)play(lastPayload);});
 function wave(){if(performance.now()/1000-waveStart<4.2)return;waveStart=performance.now()/1000;}
 element.querySelector('.capi-wave')?.addEventListener('click',wave);
 function update(payload){
  if(typeof payload==='string'){try{payload=JSON.parse(payload);}catch{return;}}
  if(!payload)return;
  if(payload.phase==='speaking'&&payload.audio)return play(payload);
  else{stop();setStatus(payload.phase||'idle');}
 }
 function mouthAt(t){
  let lo=0,hi=cues.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(cues[mid].end<=t)lo=mid+1;else hi=mid;}
  const cue=cues[lo];if(!cue||t<cue.start)return weights.X;
  const current=weights[cue.value]||weights.X,previous=weights[cues[lo-1]?.value]||weights.X;
  const f=smooth(Math.max(0,Math.min(1,(t-cue.start)/Math.min(.045,(cue.end-cue.start)*.4))));
  return current.map((v,i)=>previous[i]*(1-f)+v*f);
 }
 // Dense local poses preserve the shoulder. Cubic interpolation keeps velocity continuous.
 function animateArm(mesh,progress){
  const poses=mesh.userData.wavePoses,u=Math.min(1,Math.max(0,progress))*(poses.length-1),k=Math.min(poses.length-2,Math.floor(u)),f=u-k;
  const a=poses[Math.max(0,k-1)],b=poses[k],c=poses[k+1],d=poses[Math.min(poses.length-1,k+2)],f2=f*f,f3=f2*f;
  const c0=-.5*f+f2-.5*f3,c1=1-2.5*f2+1.5*f3,c2=.5*f+2*f2-1.5*f3,c3=-.5*f2+.5*f3;
  const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal;
  for(let i=0;i<p.array.length;i++){p.array[i]=c0*a.p[i]+c1*b.p[i]+c2*c.p[i]+c3*d.p[i];n.array[i]=c0*a.n[i]+c1*b.n[i]+c2*c.n[i]+c3*d.n[i];}
  p.needsUpdate=true;n.needsUpdate=true;
 }
 let frames=0,measureStart=performance.now(),fps=60;
 function animate(now){
  if(!element.isConnected){audio.stop();observer.disconnect();orbit.dispose();renderer.dispose();return;}
  requestAnimationFrame(animate);const t=now/1000;
  if(document.hidden)return;
  frames++;if(now-measureStart>2000){fps=frames*1000/(now-measureStart);frames=0;measureStart=now;if(fps<38&&renderer.getPixelRatio()>1){renderer.setPixelRatio(1);resize();}}
  if(t>nextBlink){blinkStart=t;nextBlink=t+3+Math.random()*3;}
  const bt=t-blinkStart;let blink=0;if(bt<.085)blink=smooth(bt/.085);else if(bt<.125)blink=1;else if(bt<.255)blink=1-smooth((bt-.125)/.13);
  const mouth=!audio.paused?mouthAt(audio.currentTime):weights.X;
  const waveProgress=(t-waveStart)/4.2,waveActive=waveProgress>=0&&waveProgress<=1;
  for(const mesh of meshes){
   const part=mesh.userData;
   if(part.type==='arm'){
    if(waveActive||waveWasActive)animateArm(mesh,waveActive?waveProgress:0);
    continue;
   }
   const infl=mesh.morphTargetInfluences;if(!infl)continue;infl.fill(0);
   if(part.type==='body')mouth.forEach((v,i)=>infl[i]=v);
   if(part.type==='rim')infl[0]=blink;
   if(part.type==='iris'){
    const p=blink*8,lo=Math.floor(p),f=p-lo;if(lo>0)infl[lo-1]=1-f;if(lo<8)infl[lo]=f;mesh.visible=blink<.999;
   }
  }
  if((waveActive&&t-lastShadow>.06)||waveWasActive&&!waveActive){key.shadow.needsUpdate=true;lastShadow=t;}
  waveWasActive=waveActive;
  group.position.z=.003*Math.sin(t*1.7);orbit.update();renderer.render(scene,camera);
 }
 requestAnimationFrame(animate);setStatus('idle');
 const controller={update,stop,play,beginSpeech,appendSpeech,endSpeech,wave,unlock:()=>audio.unlock(),meshes,audio,renderer,camera,scene,orbit,
  home:()=>{camera.position.set(1.95,-.47,.58);orbit.target.set(0,0,.015);orbit.update();},
  inspect:()=>({fps,triangles:renderer.info.render.triangles,waveActive:waveWasActive,audioState:audio.state}),
  poseWave:progress=>animateArm(meshes.find(m=>m.userData.type==='arm'),progress)};
 window.capimaraViewer=controller;return controller;
}
