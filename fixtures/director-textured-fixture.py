"""Original generated 12-triangle crate with a 256px embedded PNG. No external assets."""
import json,struct,zlib
from pathlib import Path
root=Path(__file__).parent
size=256
pixels=bytearray()
for y in range(size):
 pixels.append(0)
 for x in range(size):
  border=min(x,y,size-1-x,size-1-y)<16
  marking=(108<x<148 and 48<y<208) or (48<x<208 and 108<y<148)
  hazard=border and ((x+y)//16)%2==0
  rgb=(239,222,180) if marking else (192,99,54) if border else (42,72,76)
  if hazard:rgb=(32,43,49)
  pixels.extend((*rgb,255))
def chunk(name,data):
 return struct.pack('>I',len(data))+name+data+struct.pack('>I',zlib.crc32(name+data)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(pixels))+chunk(b'IEND',b'')
faces=[([(-.8,0,.8),(.8,0,.8),(.8,1.6,.8),(-.8,1.6,.8)],(0,0,1)),([(.8,0,-.8),(-.8,0,-.8),(-.8,1.6,-.8),(.8,1.6,-.8)],(0,0,-1)),([(.8,0,.8),(.8,0,-.8),(.8,1.6,-.8),(.8,1.6,.8)],(1,0,0)),([(-.8,0,-.8),(-.8,0,.8),(-.8,1.6,.8),(-.8,1.6,-.8)],(-1,0,0)),([(-.8,1.6,.8),(.8,1.6,.8),(.8,1.6,-.8),(-.8,1.6,-.8)],(0,1,0)),([(-.8,0,-.8),(.8,0,-.8),(.8,0,.8),(-.8,0,.8)],(0,-1,0))]
positions=[];normals=[];uvs=[];indices=[]
for i,(vertices,normal) in enumerate(faces):
 for v,uv in zip(vertices,[(0,1),(1,1),(1,0),(0,0)]):positions.extend(v);normals.extend(normal);uvs.extend(uv)
 indices.extend([i*4+j for j in [0,1,2,0,2,3]])
parts=[struct.pack('<%sf'%len(positions),*positions),struct.pack('<%sf'%len(normals),*normals),struct.pack('<%sf'%len(uvs),*uvs),struct.pack('<%sH'%len(indices),*indices),png]
binary=bytearray();views=[]
for part in parts:
 while len(binary)%4:binary.append(0)
 views.append({'buffer':0,'byteOffset':len(binary),'byteLength':len(part)});binary.extend(part)
actual=len(binary)
while len(binary)%4:binary.append(0)
j={'asset':{'version':'2.0','generator':'Director original fixture'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0}],'meshes':[{'primitives':[{'attributes':{'POSITION':0,'NORMAL':1,'TEXCOORD_0':2},'indices':3,'material':0}]}],'buffers':[{'byteLength':actual}],'bufferViews':views,'accessors':[{'bufferView':0,'componentType':5126,'count':24,'type':'VEC3','min':[-.8,0,-.8],'max':[.8,1.6,.8]},{'bufferView':1,'componentType':5126,'count':24,'type':'VEC3'},{'bufferView':2,'componentType':5126,'count':24,'type':'VEC2'},{'bufferView':3,'componentType':5123,'count':36,'type':'SCALAR'}],'images':[{'bufferView':4,'mimeType':'image/png'}],'textures':[{'source':0,'sampler':0}],'samplers':[{'magFilter':9728,'minFilter':9984,'wrapS':10497,'wrapT':10497}],'materials':[{'pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'baseColorTexture':{'index':0},'roughnessFactor':.75,'metallicFactor':.05}}]}
encoded=json.dumps(j,separators=(',',':')).encode()
encoded+=b' '*(-len(encoded)%4)
glb=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary
(root/'director-textured-crate.glb').write_bytes(glb)
print(f'{len(glb)} bytes, 12 triangles, 256px PNG, 262144 decoded texture bytes')
# A second real static texture exercises browsers' JPEG decoding, too.
import subprocess
jpeg=subprocess.run(['ffmpeg','-v','error','-f','image2pipe','-i','pipe:0','-frames:v','1','-c:v','mjpeg','-q:v','2','-f','image2pipe','pipe:1'],input=png,capture_output=True,check=True).stdout
binary=bytearray(binary[:views[4]['byteOffset']])+jpeg
j['bufferViews'][4]['byteLength']=len(jpeg);j['buffers'][0]['byteLength']=len(binary);j['images'][0]['mimeType']='image/jpeg'
while len(binary)%4:binary.append(0)
encoded=json.dumps(j,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4)
glb=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary
(root/'director-jpeg-crate.glb').write_bytes(glb)
print(f'{len(glb)} bytes, 12 triangles, 256px JPEG, 262144 decoded texture bytes')
