globalThis.self=globalThis;
import * as THREE from '/Users/alappatel/Documents/GitHub/kbve/node_modules/three/build/three.core.js';
import fs from 'fs';
import { GLTFLoader } from '/Users/alappatel/Documents/GitHub/kbve/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
const IN='/Users/alappatel/Documents/GitHub/kbve/apps/herbmail/herbmail-game/public/models/character-anim.glb';
const OUT=process.argv[2];
const CLIPS=process.argv.slice(3);
const _bw=new THREE.Vector3(),_cur=new THREE.Vector3(),_des=new THREE.Vector3(),_q=new THREE.Quaternion(),_wq=new THREE.Quaternion(),_pq=new THREE.Quaternion();
const _H=new THREE.Vector3(),_K=new THREE.Vector3(),_A=new THREE.Vector3(),_T=new THREE.Vector3(),_dir=new THREE.Vector3(),_pole=new THREE.Vector3(),_tmp=new THREE.Vector3();
const FWD=new THREE.Vector3(0,0,1);
function aim(b,cw,dw){b.getWorldPosition(_bw);_cur.copy(cw).sub(_bw);_des.copy(dw).sub(_bw);if(_cur.lengthSq()<1e-10||_des.lengthSq()<1e-10)return;_cur.normalize();_des.normalize();_q.setFromUnitVectors(_cur,_des);b.getWorldQuaternion(_wq);_q.multiply(_wq);b.parent.getWorldQuaternion(_pq).invert();b.quaternion.copy(_pq.multiply(_q));b.updateWorldMatrix(false,true);}
function setWQ(b,q){b.parent.getWorldQuaternion(_pq).invert();b.quaternion.copy(_pq.multiply(q));b.updateWorldMatrix(false,true);}
function legIK(L,ah,flatQ,tx,tz){
  L.hip.getWorldPosition(_H);L.knee.getWorldPosition(_K);L.ankle.getWorldPosition(_A);
  _T.set(tx==null?_A.x:tx,ah,tz==null?_A.z:tz);
  const l1=_K.distanceTo(_H),l2=_A.distanceTo(_K); let d=_H.distanceTo(_T); d=Math.max(Math.abs(l1-l2)+1e-3,Math.min(l1+l2-1e-3,d));
  _dir.copy(_T).sub(_H).normalize(); _pole.copy(FWD); _pole.addScaledVector(_dir,-_pole.dot(_dir)); if(_pole.lengthSq()<1e-6)_pole.set(0,0,1); _pole.normalize();
  const ck=THREE.MathUtils.clamp((l1*l1+d*d-l2*l2)/(2*l1*d),-1,1),ang=Math.acos(ck);
  _tmp.copy(_H).addScaledVector(_dir,Math.cos(ang)*l1).addScaledVector(_pole,Math.sin(ang)*l1);
  aim(L.hip,_K,_tmp); L.knee.getWorldPosition(_K);L.ankle.getWorldPosition(_A); aim(L.knee,_A,_T);
  setWQ(L.ankle,flatQ);   // clean flat foot orientation (de-twist)
}
// --- parse glb ---
const data=fs.readFileSync(IN);
const dv=new DataView(data.buffer,data.byteOffset,data.byteLength);
let off=12,json,binOff=0;
while(off<data.byteLength){const len=dv.getUint32(off,true),t=dv.getUint32(off+4,true);off+=8;if(t===0x4E4F534A)json=JSON.parse(new TextDecoder().decode(data.subarray(off,off+len)));else if(t===0x004E4942)binOff=off;off+=len;}
const bin=data.subarray(binOff);
function accF32(i){const a=json.accessors[i],bv=json.bufferViews[a.bufferView];const start=(bv.byteOffset||0)+(a.byteOffset||0);const n={SCALAR:1,VEC3:3,VEC4:4}[a.type];return new Float32Array(bin.buffer,bin.byteOffset+start,a.count*n);}
const nodeName=i=>json.nodes[i].name;
// --- three for IK ---
const ab=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
const gltf=await new Promise((r,j)=>new GLTFLoader().parse(ab,'',r,j));
const sc=gltf.scene,mx=new THREE.AnimationMixer(sc),bn={};sc.traverse(o=>bn[o.name]=o);
const legs=['l','r'].map(s=>({hip:bn['thigh_'+s],knee:bn['calf_'+s],ankle:bn['foot_'+s],toe:bn['ball_'+s],side:s}));
// capture idle flat: ankle height + foot world quats
const idle=gltf.animations.find(a=>a.name==='Idle_Loop');
mx.stopAllAction();mx.clipAction(idle).reset().play();mx.setTime(0.5*idle.duration+1e-4);sc.updateMatrixWorld(true);
const AH=Math.min(...legs.map(l=>{l.ankle.getWorldPosition(_tmp);return _tmp.y;}));
const flat=legs.map(l=>l.ankle.getWorldQuaternion(new THREE.Quaternion()));
const idleAnchor=legs.map(l=>{l.ankle.getWorldPosition(_tmp);return {x:_tmp.x,z:_tmp.z};});
const ANCHOR=process.env.ANCHOR_IDLE==='1';
console.log('idle ankle height (target)=',AH.toFixed(4),ANCHOR?'ANCHOR_IDLE':'');
for(const clipName of CLIPS){
  const c=gltf.animations.find(a=>a.name.startsWith(clipName));
  const anim=json.animations.find(a=>a.name.startsWith(clipName));
  // map bone -> output accessor (rotation)
  const outAcc={};
  for(const ch of anim.channels){ if(ch.target.path!=='rotation'){continue;} const nm=nodeName(ch.target.node); if(['thigh_l','thigh_r','calf_l','calf_r','foot_l','foot_r'].includes(nm)) outAcc[nm]=anim.samplers[ch.sampler]; }
  // shared time accessor (from thigh_l rotation)
  const times=accF32(outAcc['thigh_l'].input);
  mx.stopAllAction();const act=mx.clipAction(c);act.reset().play();
  const bones={thigh_l:bn.thigh_l,calf_l:bn.calf_l,foot_l:bn.foot_l,thigh_r:bn.thigh_r,calf_r:bn.calf_r,foot_r:bn.foot_r};
  const buf={}; for(const k in outAcc) buf[k]=accF32(outAcc[k].output);
  const lock=legs.map(()=>({x:0,z:0}));
  if(ANCHOR){lock[0].x=idleAnchor[0].x;lock[0].z=idleAnchor[0].z;lock[1].x=idleAnchor[1].x;lock[1].z=idleAnchor[1].z;}
  else{
    for(let fi=0;fi<times.length;fi++){mx.setTime(times[fi]+1e-5);sc.updateMatrixWorld(true);legs.forEach((l,li)=>{l.ankle.getWorldPosition(_tmp);lock[li].x+=_tmp.x;lock[li].z+=_tmp.z;});}
    lock.forEach(p=>{p.x/=times.length;p.z/=times.length;});
  }
  for(let fi=0;fi<times.length;fi++){
    mx.setTime(times[fi]+1e-5);sc.updateMatrixWorld(true);
    legIK(legs[0],AH,flat[0],lock[0].x,lock[0].z); legIK(legs[1],AH,flat[1],lock[1].x,lock[1].z);
    for(const k in bones){
      const qq=bones[k].quaternion;const o=fi*4;
      let x=qq.x,y=qq.y,z=qq.z,w=qq.w;
      // hemisphere continuity so SLERP takes the short path (no long-way spin)
      if(fi>0){const p=o-4;if(x*buf[k][p]+y*buf[k][p+1]+z*buf[k][p+2]+w*buf[k][p+3]<0){x=-x;y=-y;z=-z;w=-w;}}
      buf[k][o]=x;buf[k][o+1]=y;buf[k][o+2]=z;buf[k][o+3]=w;
    }
  }
  console.log('baked',clipName,times.length,'frames');
}
fs.writeFileSync(OUT,data);
console.log('wrote',OUT);
