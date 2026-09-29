import json,math,collections
F=json.load(open('streets_bbox.json'))['features']
cr=json.load(open('course_real.json'))
Bw,Be,Bn,Bs=-87.683,-87.600,41.958,41.826
K=111320*math.cos(41.892*math.pi/180)/10;KY=110574/10
def P(lng,lat):return (round((lng-Bw)*K,1),round((Bn-lat)*KY,1))
def hv(a,b):
    R=6371000;t=math.pi/180;dl=(b[1]-a[1])*t;dg=(b[0]-a[0])*t
    x=math.sin(dl/2)**2+math.cos(a[1]*t)*math.cos(b[1]*t)*math.sin(dg/2)**2;return 2*R*math.asin(math.sqrt(x))
def dp(pts,tol):
    if len(pts)<3:return pts
    a,b=pts[0],pts[-1];ax,ay=a;bx,by=b;L=math.hypot(bx-ax,by-ay) or 1e-9
    md,mi=0,0
    for i in range(1,len(pts)-1):
        px,py=pts[i];d=abs((bx-ax)*(ay-py)-(ax-px)*(by-ay))/L
        if d>md:md,mi=d,i
    if md>tol:return dp(pts[:mi+1],tol)[:-1]+dp(pts[mi:],tol)
    return [a,b]
cls_map={'1':'x','2':'a','3':'c','4':'l','E':'l'}
paths=collections.defaultdict(list);river=[]
lab=collections.defaultdict(list)
def nice(p):
    n=(p['STREET_NAM'] or '').title();t=(p['STREET_TYP'] or '').title()
    n=n.replace('La Salle','LaSalle')
    return (n+' '+t).strip()
maxlng=collections.defaultdict(lambda:-999)
for f in F:
    p=f['properties'];cs=f['geometry']['coordinates'];c=p['CLASS']
    for x,y in cs:
        b=round(y,3)
        if x>maxlng[b]:maxlng[b]=x
    if c=='RIV':
        river.append([P(*q) for q in cs]);continue
    if c not in cls_map:continue
    pts=dp([P(*q) for q in cs],0.25)
    paths[cls_map[c]].append(pts)
    L=sum(hv(cs[i],cs[i+1]) for i in range(len(cs)-1))
    if L>55 and p['STREET_NAM']:
        m=len(cs)//2
        if len(cs)==2: mx,my=(cs[0][0]+cs[1][0])/2,(cs[0][1]+cs[1][1])/2;a,b=cs[0],cs[1]
        else: mx,my=cs[m];a,b=cs[m-1],cs[m] if m< len(cs) else cs[m-1]
        X,Y=P(mx,my);ax,ay=P(*a);bx,by=P(*b)
        ang=math.degrees(math.atan2(by-ay,bx-ax))
        if ang>90:ang-=180
        if ang<-90:ang+=180
        lab[nice(p)].append((X,Y,round(ang),cls_map[c],L))
# thin labels
rank={'x':0,'a':1,'c':2,'l':3};spacing={'x':120,'a':90,'c':70,'l':45}
labels=[]
for name,L in lab.items():
    L.sort(key=lambda t:(rank[t[3]],-t[4]))
    kept=[]
    for t in L:
        sp=spacing[t[3]]
        if all(math.hypot(t[0]-k[0],t[1]-k[1])>sp for k in kept):kept.append(t)
    for t in kept:labels.append([name,t[0],t[1],t[2],rank[t[3]]])
def enc(pl):
    out=[]
    for pts in pl:
        s='M'+' '.join(f'{x:g} {y:g}' for x,y in pts[:1])
        prev=pts[0]
        for x,y in pts[1:]:
            s+=f'l{round(x-prev[0],1):g} {round(y-prev[1],1):g}';prev=(x,y)
        out.append(s)
    return ''.join(out)
# shoreline
bins=sorted(maxlng);shore=[]
for b in bins:
    if 41.822<=b<=41.962: shore.append([b,maxlng[b]+0.0009])
# smooth: running max over window 3 then mean
sm=[]
for i in range(len(shore)):
    w=[shore[j][1] for j in range(max(0,i-2),min(len(shore),i+3))]
    sm.append([shore[i][0],max(w)])
shoreP=[P(l,b) for b,l in sm[::-1]]  # north->south
# course
course=cr['course']
cum=[0]
for i in range(1,len(course)):cum.append(cum[-1]+hv(course[i-1],course[i]))
MI=1609.344
def proj(lat,lng,lo,hi):
    best=None;k=math.cos(math.radians(41.9))
    for i in range(len(course)-1):
        if not(lo<=cum[i]/MI<=hi):continue
        a,b=course[i],course[i+1];ax,ay=a;bx,by=b
        dx,dy=(bx-ax)*k,by-ay;L2=dx*dx+dy*dy or 1e-12
        t=max(0,min(1,(((lng-ax)*k)*dx+(lat-ay)*dy)/L2))
        q=(ax+(bx-ax)*t,ay+(by-ay)*t);dd=hv(q,(lng,lat))
        if best is None or dd<best[0]:best=(dd,(cum[i]+hv(a,q))/MI,q)
    return best
anch=[(0,0),(proj(41.8833,-87.6370,12,15)[1],13.1),(proj(41.8674,-87.6242,25,27)[1],26.0),(cum[-1]/MI,26.2)]
def cal(r):
    for i in range(1,len(anch)):
        if r<=anch[i][0]+1e-9:
            a0,m0=anch[i-1];a1,m1=anch[i];return m0+(r-a0)/(a1-a0)*(m1-m0)
    return 26.2
# simplify course for display but keep calibrated km per vertex
ckm=[round(cal(c/MI)*1.609344,3) for c in cum]
# keep every vertex after DP in lat/lng space
idxs=[0]
def dpi(i0,i1,tol=1.5):
    a,b=course[i0],course[i1]
    md,mi=0,None
    for i in range(i0+1,i1):
        q=course[i]
        # meters approx
        ax,ay=a[0]*83000,a[1]*111000;bx,by=b[0]*83000,b[1]*111000;px,py=q[0]*83000,q[1]*111000
        L=math.hypot(bx-ax,by-ay) or 1e-9
        d=abs((bx-ax)*(ay-py)-(ax-px)*(by-ay))/L
        if d>md:md,mi=d,i
    if mi is not None and md>tol:
        dpi(i0,mi,tol);dpi(mi,i1,tol)
    else: idxs.append(i1)
dpi(0,len(course)-1)
C=[[round(course[i][1],5),round(course[i][0],5),ckm[i]] for i in idxs]
spots=[("grand",41.8918,-87.6279,0,2),("lashuron",41.8946,-87.6323,2,5),("lp8k",41.9180,-87.6340,4,6),("lsdadd",41.9475,-87.6405,6.5,8),
("broadadd",41.9470,-87.6448,8,9.5),("broadbel",41.9398,-87.6443,8.5,10),("sednorth",41.9108,-87.6388,10.5,11.5),("wells",41.8946,-87.6340,11.5,13),
("half",41.8833,-87.6370,12.5,14),("adamshal",41.8794,-87.6470,13.5,15),("ashland",41.8794,-87.6666,14.5,16),("jackhal",41.8779,-87.6470,16.5,18),
("taylor",41.8695,-87.6608,18,19.5),("pilsen",41.8578,-87.6607,19,20),("china",41.8528,-87.6318,21,22.5),("m29s",41.8415,-87.6236,22.5,23.5),
("m29n",41.8415,-87.6236,24.3,25.5),("michcer",41.8528,-87.6240,24.5,26),("m26",41.8674,-87.6242,25.5,26.8)]
S={}
for sid,la,ln,lo,hi in spots:
    d,r,q=proj(la,ln,lo,hi);S[sid]=[round(q[1],5),round(q[0],5),round(cal(r)*1.609344,3)];print(sid,round(d),round(cal(r),2))
# hotel from address range on Huron
hot=None
for f in F:
    p=f['properties']
    if p['STREET_NAM']=='HURON' and p['PRE_DIR']=='W':
        lo=min(p['L_F_ADD'],p['R_F_ADD'],p['L_T_ADD'] or 1e9,p['R_T_ADD'] or 1e9);hi=max(p['L_T_ADD'],p['R_T_ADD'],p['L_F_ADD'],p['R_F_ADD'])
        if lo<=111<=hi:
            cs=f['geometry']['coordinates'];print('huron seg',lo,hi,cs[0],cs[-1],p['L_F_ADD'],p['L_T_ADD'],p['R_F_ADD'],p['R_T_ADD'])
            fa=min(p['L_F_ADD'],p['R_F_ADD']);ta=max(p['L_T_ADD'],p['R_T_ADD'])
            t=(111-fa)/((ta-fa) or 1);hot=[cs[0][1]+(cs[-1][1]-cs[0][1])*t+0.0001,cs[0][0]+(cs[-1][0]-cs[0][0])*t]
print('hotel',hot)
out=dict(course=C,spots=S,hotel=hot,streets={k:enc(v) for k,v in paths.items()},river=enc(river),shore=shoreP,labels=labels)
s=json.dumps(out,separators=(',',':'))
open('mapdata.json','w').write(s);print('size',len(s),{k:len(v) for k,v in out['streets'].items()},len(labels),len(C),len(river))
names={"start":"Columbus Dr","grandcol":"Grand Ave","granddear":"Dearborn St","jackdear":"Jackson Blvd","jacklasalle":"LaSalle St","lasclark":"Stockton Dr","stockfull":"Fullerton Dr","cannon":"Cannon Dr","diversey":"Sheridan Rd","belmontsher":"Inner Lake Shore Dr","lsdsher":"Sheridan Rd","broadsher":"Broadway","clarkdiv":"Clark St","clarkweb":"Webster Ave","sedweb":"Sedgwick St","sednorth":"North Ave","wellsnorth":"Wells St","wellswacker":"Wacker Dr","wackeradams":"Adams St","adamsdamen":"Damen Ave","jackdamen":"Jackson Blvd","jackhalsted":"Halsted St","taylorhalsted":"Taylor St","taylorloomis":"Loomis St","loomis18":"18th St","halsted18":"Halsted St","halsted21":"21st St","canal21":"Canalport Ave","canalcermak":"Cermak Rd","cermakwent":"Wentworth Ave","went26":"26th St","mich26s":"Michigan Ave","mich35":"35th St","ind35":"Indiana Ave","ind31":"31st St","mich31n":"Michigan Ave","michroos":"Roosevelt Rd","rooscol":"Columbus Dr"}
seg=sorted([[round(ckm[v],3),names[k]] for k,v in cr['marks'].items() if k in names])
out['segs']=seg
s=json.dumps(out,separators=(',',':'));open('mapdata.json','w').write(s);print(seg[:5],len(s))
