import sys, numpy as np
from PIL import Image
from rembg import remove, new_session
src = sys.argv[1]; x1,y1,x2,y2 = map(float, sys.argv[2:6]); pts = [tuple(map(float,p.split(','))) for p in sys.argv[6:]]
im = Image.open(src).convert('RGB'); k = im.width/1000
crop = im.crop((int(x1*k),int(y1*k),int(x2*k),int(y2*k)))
s = new_session('sam')
ip = np.array([[(px-x1)*k,(py-y1)*k] for px,py in pts]); il = np.array([1]*len(pts))
out = remove(crop, session=s, sam_prompt=[{"type":"point","data":list(map(int,p)),"label":1} for p in ip])
bg = Image.new('RGBA', out.size, (255,0,255,255)); bg.alpha_composite(out); bg.convert('RGB').save('/tmp/cut_sam.jpg'); print(out.size)
