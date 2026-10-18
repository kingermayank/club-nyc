import sys, numpy as np
from PIL import Image
from ultralytics import SAM
src = sys.argv[1]; model = sys.argv[2]; x1,y1,x2,y2 = map(float, sys.argv[3:7])
im = Image.open(src).convert('RGB'); k = im.width/1000
m = SAM(model)
r = m(np.array(im), bboxes=[[x1*k,y1*k,x2*k,y2*k]], verbose=False)[0]
mask = r.masks.data[0].cpu().numpy().astype(np.uint8)*255
M = Image.fromarray(mask).resize(im.size)
rgba = im.copy().convert('RGBA'); rgba.putalpha(M)
pad=10; box=(int((x1-pad)*k),int((y1-pad)*k),int((x2+pad)*k),int((y2+pad)*k))
c = rgba.crop(box); bg = Image.new('RGBA', c.size, (255,0,255,255)); bg.alpha_composite(c); bg.convert('RGB').save(f'/tmp/cut_{model}.jpg'); print('ok', c.size)
