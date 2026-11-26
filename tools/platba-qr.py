"""Generate public/uploads/platba-qr.svg (QR Platba / SPD for the association account, emblem in the centre).
Usage: pip install segno; python3 tools/platba-qr.py "#D3242B" 0 0.05 0.13 public/uploads/platba-qr.svg
Keep finder squares sharp: rounded finders stop some readers from decoding."""
import segno,re,sys,subprocess
ring,rx,dotgap,emb=sys.argv[1],float(sys.argv[2]),float(sys.argv[3]),float(sys.argv[4])
out_path=sys.argv[5]
spd='SPD*1.0*ACC:CZ5255000000000250250256*CC:CZK*RN:CESKA CARROMOVA ASOCIACE'
q=segno.make(spd,error='h',micro=False)
m=[list(r) for r in q.matrix]; n=len(m)
B=4; S=n+2*B; navy='#0E1B3D'
def finder(r,c): return r<7 and c<7 or r<7 and c>=n-7 or r>=n-7 and c<7
cz=n/2; er=n*emb
g=dotgap; w=1-2*g
dots=''.join(f'M{c+B+g:g} {r+B+g:g}h{w:g}v{w:g}h-{w:g}z' for r in range(n) for c in range(n)
  if m[r][c] and not finder(r,c) and (er==0 or ((r+.5-cz)**2+(c+.5-cz)**2)**.5>er+0.8))
fp=''
for (r,c) in ((0,0),(0,n-7),(n-7,0)):
  x,y=c+B,r+B
  fp+=f'<rect x="{x+.5}" y="{y+.5}" width="6" height="6" rx="{rx}" fill="none" stroke="{ring}" stroke-width="1"/><rect x="{x+2}" y="{y+2}" width="3" height="3" rx="{rx/2}" fill="{navy}"/>'
emsvg=''
if er:
  em=open('public/brand/emblem.svg').read()
  vb=re.search(r'viewBox="([^"]+)"',em).group(1)
  inner=re.sub(r'(?s)<metadata.*?</metadata>','',em[em.index('>')+1:em.rindex('</svg>')])
  emsvg=f'<circle cx="{S/2}" cy="{S/2}" r="{er+.4}" fill="#fff"/><svg x="{S/2-er}" y="{S/2-er}" width="{2*er}" height="{2*er}" viewBox="{vb}">{inner}</svg>'
svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}"><title>QR platba – Česká carromová asociace, účet 250250256/5500</title><rect width="{S}" height="{S}" rx="3" fill="#fff"/><path fill="{navy}" d="{dots}"/>{fp}{emsvg}</svg>'
open(out_path,'w').write(svg)
