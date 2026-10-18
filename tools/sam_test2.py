import sys, numpy as np
from PIL import Image
from rembg import remove, new_session
src = sys.argv[1]; x1,y1,x2,y2 = map(float, sys.argv[2:6])
im = Image.open(src).convert('RGB'); k = im.width/1000
pad=10
crop = im.crop((int((x1-pad)*k),int((y1-pad)*k),int((x2+pad)*k),int((y2+pad)*k)))
s = new_session('sam')
box=[int(pad*k),int(pad*k),int((x2-x1+pad)*k),int((y2-y1+pad)*k)]
out = remove(crop, session=s, sam_prompt=[{"type":"rectangle","data":box,"label":1}])
bg = Image.new('RGBA', out.size, (255,0,255,255)); bg.alpha_composite(out); bg.convert('RGB').save('/tmp/cut_sam2.jpg'); print(out.size)
