# Layout guide for the Manhattan map: real lat/lon, rotated so the island runs
# bottom-left (Battery) to top-right (Central Park), widened 1.6x across its axis.
import math, sys
from PIL import Image, ImageDraw, ImageFont
W,H = 2048,1360
LAT0,LON0 = 40.745,-73.985
def km(lat,lon): return ((lon-LON0)*math.cos(math.radians(LAT0))*111.32, (lat-LAT0)*110.57)
ROT = math.radians(-12)          # clockwise
AX = math.radians(61)            # island axis after rotation is ~35deg above horizontal
WIDEN = 1.3
def P(lat,lon):
    x,y = km(lat,lon)
    x,y = x*math.cos(ROT)-y*math.sin(ROT), x*math.sin(ROT)+y*math.cos(ROT)
    # widen perpendicular to axis (axis angle after rotation = 35deg)
    a = math.radians(49); ux,uy = math.cos(a),math.sin(a)
    along = x*ux+y*uy; perp = -x*uy+y*ux
    perp *= WIDEN
    x,y = along*ux - perp*uy, along*uy + perp*ux
    S = 150; return (W*0.60 + x*S, H*0.498 - y*S*0.87)   # 0.78: slight 3/4 tilt
manh = [(40.7003,-74.0153),(40.7040,-74.0185),(40.7100,-74.0172),(40.7180,-74.0140),(40.7300,-74.0112),
 (40.7400,-74.0100),(40.7500,-74.0080),(40.7600,-74.0005),(40.7700,-73.9935),(40.7800,-73.9875),
 (40.7900,-73.9800),(40.8050,-73.9700),(40.8300,-73.9530),(40.8300,-73.9330),(40.8000,-73.9290),
 (40.7850,-73.9420),(40.7750,-73.9430),(40.7650,-73.9530),(40.7550,-73.9610),(40.7450,-73.9700),
 (40.7380,-73.9730),(40.7280,-73.9715),(40.7180,-73.9745),(40.7110,-73.9790),(40.7085,-73.9960),
 (40.7045,-74.0045),(40.7012,-74.0110)]
bk = [(40.7030,-73.9905),(40.6990,-73.9960),(40.6950,-73.9990),(40.6880,-74.0020),(40.6800,-74.0100),
 (40.6700,-74.0200),(40.6300,-74.0400),(40.6000,-73.9000),(40.7400,-73.8500),(40.7350,-73.9600),
 (40.7200,-73.9620),(40.7080,-73.9700),(40.7050,-73.9820)]
lib = [(40.6905,-74.0465),(40.6905,-74.0425),(40.6880,-74.0420),(40.6878,-74.0462)]
park = [(40.7681,-73.9819),(40.8003,-73.9582),(40.7968,-73.9496),(40.7644,-73.9730)]
img = Image.new('RGB',(W,H),(64,150,220)); d = ImageDraw.Draw(img)
nj = [(40.6700,-74.0700),(40.6900,-74.0560),(40.7000,-74.0520),(40.7140,-74.0330),(40.7270,-74.0290),(40.7370,-74.0270),
 (40.7500,-74.0240),(40.7650,-74.0150),(40.7800,-74.0050),(40.8000,-73.9950),(40.8400,-73.9750),(40.9000,-74.1000),(40.6500,-74.2000)]
d.polygon([(x-300,y-230) for x,y in (P(*p) for p in nj)], fill=(185,175,160))
d.polygon([(x+110,y+70) for x,y in (P(*p) for p in bk)], fill=(200,190,170))
d.polygon([P(*p) for p in manh], fill=(215,215,215), outline=(40,40,60), width=4)
d.polygon([P(*p) for p in lib], fill=(120,190,120))
d.polygon([P(*p) for p in park], fill=(70,170,70), outline=(30,90,30), width=4)
d.line([P(40.7396,-74.0080),P(40.7480,-74.0058),P(40.7540,-74.0020)], fill=(40,120,40), width=12)  # High Line
d.line([P(40.7115,-74.0020),(P(40.7030,-73.9905)[0]+110,P(40.7030,-73.9905)[1]+70)], fill=(150,110,60), width=14)                 # Brooklyn Bridge
d.line([P(40.7010,-74.0150),P(40.6930,-74.0400)], fill=(255,255,255), width=4)                 # ferry route
F = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 26)
pts = {
 'LIBERTY':(40.6892,-74.0445),'BATTERY':(40.7033,-74.0170),'ONE WORLD TRADE':(40.7127,-74.0134),
 'WALL ST':(40.7065,-74.0110),'BROOKLYN BRIDGE':(40.7073,-73.9975),
 'CHINATOWN':(40.7158,-73.9970),'SOHO':(40.7233,-74.0030),'HOT DOG CART':(40.7300,-73.9940),'CHELSEA MARKET':(40.7424,-74.0061),
 'HIGH LINE':(40.7470,-74.0070),'VESSEL':(40.7560,-74.0030),'EMPIRE STATE':(40.7484,-73.9857),
 'TIMES SQUARE':(40.7580,-73.9855),'GRAND CENTRAL':(40.7527,-73.9772),'ROCKEFELLER':(40.7587,-73.9787),
 '5TH AVE':(40.7625,-73.9740),'THE MET':(40.7794,-73.9632),'PARK LAKE':(40.7760,-73.9720),
 'SUBWAY':(40.7350,-73.9900),'SUBWAY ':(40.7200,-74.0060),'SUBWAY  ':(40.7650,-73.9830),'SUBWAY   ':(40.7450,-73.9800),
}
for name,(la,lo) in pts.items():
    x,y = P(la,lo); r=11
    d.ellipse([x-r,y-r,x+r,y+r], fill=(230,40,40), outline=(255,255,255), width=3)
    off = {'BATTERY':(-130,6),'GRAND CENTRAL':(15,8),'5TH AVE':(15,-40),'PARK LAKE':(-150,-40)}.get(name.strip(),(15,-14))
    d.text((x+off[0],y+off[1]), name.strip(), font=F, fill=(10,10,30), stroke_width=3, stroke_fill=(255,255,255))
img.save(sys.argv[1]); print({k:tuple(round(v) for v in P(*c)) for k,c in pts.items()})
