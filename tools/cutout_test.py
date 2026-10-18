import sys
from PIL import Image
from rembg import remove, new_session
src, model = sys.argv[1], sys.argv[2]
x1,y1,x2,y2 = map(float, sys.argv[3:7])
im = Image.open(src).convert('RGB'); k = im.width/1000
crop = im.crop((int(x1*k),int(y1*k),int(x2*k),int(y2*k)))
s = new_session(model)
out = remove(crop, session=s)
out.save(f'/tmp/cut_{model}.png')
bg = Image.new('RGBA', out.size, (255,0,255,255)); bg.alpha_composite(out); bg.convert('RGB').save(f'/tmp/cut_{model}.jpg')
print(model, out.size)
