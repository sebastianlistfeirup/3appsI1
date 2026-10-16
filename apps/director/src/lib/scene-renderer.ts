import * as THREE from 'three';
import type { Camera, SceneObject, SceneVersion } from '@tre/scene-format';

const mat=(color:string,metalness=.1,roughness=.65)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
function mesh(geometry:THREE.BufferGeometry,material:THREE.Material,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;return m;}
function box(w:number,h:number,d:number,material:THREE.Material,x=0,y=0,z=0){return mesh(new THREE.BoxGeometry(w,h,d),material,x,y,z);}
function emissive(color:string,intensity=1){return new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:intensity,roughness:.3});}
export function primitive(object:SceneObject){
 const group=new THREE.Group();group.name=object.id;group.userData.objectId=object.id;
 const body=mat(object.color,.18,.65),dark=mat('#17292e',.45,.4),trim=mat('#cbb99d',.5,.4);
 if(object.kind==='person'){
  const torso=mesh(new THREE.CylinderGeometry(.27,.22,.62,6),body,0,1.04,0);group.add(torso);
  group.add(mesh(new THREE.SphereGeometry(.205,12,8),trim,0,1.61,0));
  const visor=mesh(new THREE.SphereGeometry(.209,12,8,0,Math.PI),dark,0,1.63,.01);visor.scale.set(1,.55,1);group.add(visor);
  group.add(box(.38,.12,.3,dark,0,.68,0));
  for(const sign of [-1,1]){group.add(mesh(new THREE.CylinderGeometry(.09,.105,.55,6),body,sign*.15,.36,0));group.add(box(.18,.13,.3,dark,sign*.15,.075,.04));const arm=mesh(new THREE.CylinderGeometry(.075,.08,.55,6),body,sign*.34,1.02,.015);arm.rotation.z=sign*.09;group.add(arm);group.add(mesh(new THREE.SphereGeometry(.085,8,6),dark,sign*.365,.72,.015));}
  group.add(box(.22,.18,.025,trim,0,1.15,.24));group.add(box(.1,.04,.03,emissive('#b7e3c8'),.065,1.18,.26));group.add(box(.33,.45,.17,dark,0,1.05,-.25));
 }else if(object.kind==='console'){
  group.add(box(1.7,.15,.9,dark,0,.1,0),box(1.35,.8,.65,body,0,.5,0));const top=box(1.7,.12,.95,trim,0,.98,0);top.rotation.x=.18;group.add(top);
  const screen=box(1.1,.035,.53,emissive('#74c1ae',.8),0,1.055,-.06);screen.rotation.x=.18;group.add(screen);
  for(let i=0;i<6;i++)group.add(box(.08,.035,.08,emissive(i===0?'#e7a36e':'#a8b8ad',.4),-.45+i*.18,1.04,.31));
  const glow=new THREE.PointLight('#89dabd',2,3,2);glow.position.set(0,1.4,0);group.add(glow);
 }else if(object.kind==='crate'){
  group.add(box(1,.8,.9,body,0,.4,0));for(const x of [-.4,.4])group.add(box(.09,.86,.97,dark,x,.4,0));group.add(box(.3,.13,.02,trim,0,.45,.46));
 }else if(object.kind==='wall')group.add(box(2.4,2.8,.25,body,0,1.4,0));
 else {group.add(mesh(new THREE.CylinderGeometry(.19,.28,.13,12),dark,0,.065,0),mesh(new THREE.CylinderGeometry(.035,.035,1.8,8),trim,0,.95,0),mesh(new THREE.SphereGeometry(.17,12,8),emissive(object.color,3),0,1.9,0));const lamp=new THREE.PointLight(object.color,3,7,2);lamp.position.set(0,1.9,0);group.add(lamp);}
 group.position.fromArray(object.transform.position);group.quaternion.fromArray(object.transform.quaternion);group.scale.fromArray(object.transform.scale);return group;
}
export function buildScene(version:SceneVersion,selectedId?:string,grid=false){
 const scene=new THREE.Scene();scene.background=new THREE.Color('#18212c');scene.fog=new THREE.FogExp2('#27323c',.015);
 const ambient=new THREE.HemisphereLight('#a5bac4','#302d27',1.8);scene.add(ambient);
 const sunlight=new THREE.DirectionalLight(version.light.warmth==='amber'?'#ffd0a0':'#b6dbff',4.2*version.light.intensity);sunlight.position.set(-7,8,-12);sunlight.castShadow=true;sunlight.shadow.mapSize.set(2048,2048);sunlight.shadow.camera.left=-13;sunlight.shadow.camera.right=13;sunlight.shadow.camera.top=12;sunlight.shadow.camera.bottom=-12;sunlight.shadow.normalBias=.03;scene.add(sunlight);
 const fill=new THREE.DirectionalLight('#adcbdc',1.2);fill.position.set(5,5,8);scene.add(fill);
 // A fully procedural station. No stock images, remote textures or hidden assets.
 const floor=mat('#3e484b',.55,.45),structure=mat('#263339',.65,.42),edge=mat('#6f7975',.65,.4);
 scene.add(box(15,.3,15,floor,0,-.2,0));
 for(let i=-6;i<=6;i+=2){scene.add(box(.018,.008,14,structure,i,-.041,0),box(14,.008,.018,structure,0,-.041,i));}
 scene.add(box(15,.7,.5,structure,0,.2,-5),box(15,.12,.7,edge,0,.61,-5));
 scene.add(box(.5,7,11,structure,-6,3,-.3),box(.5,7,11,structure,6,3,-.3),box(12,.5,1,structure,0,5.8,-4.8));
 for(const x of [-5.5,-3.6,3.6,5.5]){const pillar=box(.19,6,.25,edge,x,2.7,-4.8);pillar.rotation.z=x>0?-.13:.13;scene.add(pillar);}
 for(const x of [-5.1,5.1])scene.add(box(.04,4.3,.04,emissive('#d9b07c',1.2),x,2.7,-4.65));
 for(const x of [-4.5,4.5])scene.add(box(.035,.01,11,emissive('#ab8a5e',.5),x,-.025,.5));
 const horizon=mesh(new THREE.PlaneGeometry(300,300),mat('#636c6c',.05,1),0,-.6,-60);horizon.rotation.x=-Math.PI/2;horizon.receiveShadow=false;scene.add(horizon);
 for(let i=0;i<23;i++){const h=2+((i*17)%13)*.6;const mountain=mesh(new THREE.ConeGeometry(4+((i*7)%5),h,4),mat(i%2?'#646c70':'#737872',.05,1),-65+i*6,-.5+h/2,-38-(i%4)*6);mountain.rotation.y=i*.7;scene.add(mountain);}
 const sun=mesh(new THREE.SphereGeometry(5.7,48,32),new THREE.MeshBasicMaterial({color:'#f3d0a0'}),-17,12,-66);sun.castShadow=false;scene.add(sun);
 const planet=mesh(new THREE.SphereGeometry(11,32,24),mat('#617478',.05,1),27,28,-110);planet.castShadow=false;scene.add(planet);
 const stars=new THREE.BufferGeometry();const coords=[];for(let i=0;i<170;i++){const x=Math.sin(i*72.31)*130;const y=10+((i*19)%100);coords.push(x,y,-140-((i*13)%25));}stars.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));scene.add(new THREE.Points(stars,new THREE.PointsMaterial({color:'#e5ded1',size:.16,transparent:true,opacity:.55})));
 for(const object of version.objects){const group=primitive(object);scene.add(group);if(object.id===selectedId){const bounds=new THREE.Box3().setFromObject(group);const helper=new THREE.Box3Helper(bounds,new THREE.Color('#e0a174'));scene.add(helper);}}
 if(grid){const helper=new THREE.GridHelper(14,28,'#c36536','#657574');helper.position.y=.002;scene.add(helper);}
 return scene;
}
export function makeCamera(value:Camera){const c=new THREE.PerspectiveCamera(value.verticalFov,16/9,value.near,value.far);c.position.fromArray(value.position);c.quaternion.fromArray(value.quaternion);c.updateMatrixWorld();return c;}
export function createRenderer(canvas?:HTMLCanvasElement){const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true,alpha:false,powerPreference:'low-power'});renderer.setPixelRatio(1);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;return renderer;}
export function disposeScene(scene:THREE.Scene){scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Points){o.geometry.dispose();for(const material of Array.isArray(o.material)?o.material:[o.material])material.dispose();}});}
export async function renderFrame(version:SceneVersion,camera:Camera,width=1280,height=720){const renderer=createRenderer();renderer.setSize(width,height);const scene=buildScene(version);try{renderer.render(scene,makeCamera(camera));return renderer.domElement.toDataURL('image/jpeg',.88);}finally{disposeScene(scene);renderer.dispose();renderer.forceContextLoss();}}
