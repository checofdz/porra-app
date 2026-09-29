import json,math,collections
F=json.load(open('streets_bbox.json'))['features']
md=json.load(open('mapdata.json'))
C=md['course']  # [lat,lng,km]
Bw,Bn=-87.683,41.958
K=111320*math.cos(41.892*math.pi/180)/10;KY=110574/10
def P(lng,lat):return ((lng-Bw)*K,(Bn-lat)*KY)   # units = 10 m
CP=[P(c[1],c[0]) for c in C];CK=[c[2] for c in C]
WALK={'2','3','4','5','E','S'}
nid={};pos=[];adj=collections.defaultdict(dict)
def node(x,y):
    k=(round(x*2),round(y*2))  # 5 m grid
    if k not in nid:nid[k]=len(pos);pos.append((x,y))
    return nid[k]
NAMES=['calle'];NIDX={'calle':0}
def nm(p):
    n=(p['STREET_NAM'] or '').title().replace('La Salle','LaSalle');t=(p['STREET_TYP'] or '').title()
    k=(n+' '+t).strip()
    if k not in NIDX:NIDX[k]=len(NAMES);NAMES.append(k)
    return NIDX[k]
CUR=[0]
def addE(a,b,L):
    if a==b:return
    if b not in adj[a] or adj[a][b][0]>L:adj[a][b]=(L,CUR[0]);adj[b][a]=(L,CUR[0])
for f in F:
    p=f['properties']
    if p['CLASS'] not in WALK:continue
    cs=[P(*q) for q in f['geometry']['coordinates']]
    CUR[0]=nm(p)
    L=sum(math.hypot(cs[i+1][0]-cs[i][0],cs[i+1][1]-cs[i][1]) for i in range(len(cs)-1))*10
    # keep intermediate vertices if edge long & curvy: split every vertex that deviates
    a=node(*cs[0]);b=node(*cs[-1])
    # split polyline at interior vertices spaced > 60 m to keep geometry for curved roads
    pts=[cs[0]];acc=0;last=a
    for i in range(1,len(cs)-1):
        acc+=math.hypot(cs[i][0]-cs[i-1][0],cs[i][1]-cs[i-1][1])*10
        if acc>60:
            n=node(*cs[i]);addE(last,n,acc);last=n;acc=0
    acc+=math.hypot(cs[-1][0]-cs[-2][0],cs[-1][1]-cs[-2][1])*10 if len(cs)>1 else 0
    addE(last,b,acc)
N0=len(pos);print('nodes',N0,'edges',sum(len(v) for v in adj.values())//2)
# bridge tiny gaps (<9 m) between dead-ends and nearby nodes
grid=collections.defaultdict(list)
for i,(x,y) in enumerate(pos):grid[(int(x//2),int(y//2))].append(i)
nb=0
for i,(x,y) in enumerate(pos):
    if len(adj[i])>1:continue
    for gx in range(int(x//2)-1,int(x//2)+2):
        for gy in range(int(y//2)-1,int(y//2)+2):
            for j in grid[(gx,gy)]:
                if j!=i and j not in adj[i]:
                    d=math.hypot(pos[j][0]-x,pos[j][1]-y)*10
                    if d<9:CUR[0]=0;addE(i,j,d);nb+=1
print('bridges',nb)
# projection onto course
def proj(x,y):
    best=(1e9,0,0)
    for i in range(len(CP)-1):
        ax,ay=CP[i];bx,by=CP[i+1];dx,dy=bx-ax,by-ay;L2=dx*dx+dy*dy or 1e-9
        t=max(0,min(1,((x-ax)*dx+(y-ay)*dy)/L2));qx,qy=ax+dx*t,ay+dy*t
        d=math.hypot(qx-x,qy-y)*10
        if d<best[0]:best=(d,CK[i]+(CK[i+1]-CK[i])*t,i)
    return best
def ptAtKm(k):
    k=max(0,min(CK[-1],k))
    for i in range(1,len(CK)):
        if k<=CK[i]:
            f=(k-CK[i-1])/((CK[i]-CK[i-1]) or 1);return (CP[i-1][0]+(CP[i][0]-CP[i-1][0])*f,CP[i-1][1]+(CP[i][1]-CP[i-1][1])*f)
    return CP[-1]
# course bbox prefilter
xs=[p[0] for p in CP];ys=[p[1] for p in CP]
onc={}
for i,(x,y) in enumerate(pos):
    if x<min(xs)-3 or x>max(xs)+3 or y<min(ys)-3 or y>max(ys)+3:continue
    d,km,si=proj(x,y)
    if d<9:onc[i]=km
print('course nodes',len(onc))
def ang(v):return math.atan2(v[1],v[0])
def ccw_between(t,a2,a1):
    # is angle t in CCW sweep from a2 to a1 (note y axis down -> flip)
    s=(t-a2)%(2*math.pi);e=(a1-a2)%(2*math.pi);return 0<s<e
L={};R={}
newpos=list(pos);newadj=collections.defaultdict(dict)
def nn(p):newpos.append(p);return len(newpos)-1
for u,km in onc.items():
    L[u]=nn(pos[u]);R[u]=nn(pos[u])
cross_edges=[]
def is_course_edge(u,v):
    if u in onc and v in onc:
        mx=(pos[u][0]+pos[v][0])/2;my=(pos[u][1]+pos[v][1])/2
        return proj(mx,my)[0]<9
    return False
def side(u,v):
    km=onc[u];p=ptAtKm(km-0.035);n=ptAtKm(km+0.035);ux,uy=pos[u]
    # use math coords (flip y)
    a1=ang((p[0]-ux,-(p[1]-uy)));a2=ang((n[0]-ux,-(n[1]-uy)));t=ang((pos[v][0]-ux,-(pos[v][1]-uy)))
    if km<0.04: a1=a2+math.pi
    if km>CK[-1]-0.04: a2=a1+math.pi
    return 'L' if ccw_between(t,a2,a1) else 'R'
def seg_int(a,b,c,d):
    den=(b[0]-a[0])*(d[1]-c[1])-(b[1]-a[1])*(d[0]-c[0])
    if abs(den)<1e-12:return None
    t=((c[0]-a[0])*(d[1]-c[1])-(c[1]-a[1])*(d[0]-c[0]))/den;s=((c[0]-a[0])*(b[1]-a[1])-(c[1]-a[1])*(b[0]-a[0]))/den
    return (t,s) if 0<t<1 and 0<=s<=1 else None
def add2(a,b,Lm,flag=-1):
    Lm,nmi=Lm if isinstance(Lm,tuple) else (Lm,0)
    newadj[a][b]=(Lm,flag,nmi);newadj[b][a]=(Lm,flag,nmi)
done=set()
for u in list(adj):
    for v,Lm in adj[u].items():
        if (v,u) in done:continue
        done.add((u,v))
        uc,vc=u in onc,v in onc
        if uc and vc and is_course_edge(u,v):
            add2(L[u],L[v] if side(v,u)!=None else L[v],Lm);  # placeholder
            continue
        a=u if not uc else (L[u] if side(u,v)=='L' else R[u])
        b=v if not vc else (L[v] if side(v,u)=='L' else R[v])
        flag=-1
        if not uc and not vc:
            # geometric crossing of course in the middle of an edge
            for i in range(len(CP)-1):
                r=seg_int(pos[u],pos[v],CP[i],CP[i+1])
                if r and 0.02<r[0]<0.98:flag=CK[i]+(CK[i+1]-CK[i])*r[1];break
        add2(a,b,Lm,flag)
# course edges: sidewalks need consistent L/R: L[u]-L[v] and R[u]-R[v] given same orientation along course
for u in onc:
    for v,Lm in adj[u].items():
        if v in onc and is_course_edge(u,v) and u<v:
            # orientation: left side of course is same label at both nodes (labels computed relative to course direction)
            newadj[L[u]].pop(L[v],None);newadj[L[v]].pop(L[u],None)
            add2(L[u],L[v],Lm);add2(R[u],R[v],Lm)
# crossing at each course node
for u,km in onc.items():add2(L[u],R[u],(12,0),km)
# drop orphan original course nodes
N=len(newpos)
keep=[i for i in range(N) if newadj.get(i)]
remap={o:i for i,o in enumerate(keep)}
nodes=[[round(newpos[o][0],1),round(newpos[o][1],1)] for o in keep]
edges=[]
for o in keep:
    for p,(Lm,fl,nmi) in newadj[o].items():
        if p in remap and remap[o]<remap[p]:edges.append([remap[o],remap[p],round(Lm),round(fl,2) if fl>=0 else -1,nmi])
print('final nodes',len(nodes),'edges',len(edges),'crossing edges',sum(1 for e in edges if e[3]>=0))
# spots side nodes
spots={}
for sid,(la,ln,km) in md['spots'].items():
    x,y=P(ln,la)
    cands=[u for u,k in onc.items() if math.hypot(pos[u][0]-x,pos[u][1]-y)<6]
    u=min(cands,key=lambda u:math.hypot(pos[u][0]-x,pos[u][1]-y))
    spots[sid]=[remap[L[u]],remap[R[u]]]
hx,hy=P(md['hotel'][1],md['hotel'][0])
hn=min((i for i in range(len(nodes)) if keep[i]<N0 and keep[i] not in onc),key=lambda i:math.hypot(nodes[i][0]-hx,nodes[i][1]-hy))
print('hotel node dist m',math.hypot(nodes[hn][0]-hx,nodes[hn][1]-hy)*10)
json.dump(dict(nodes=nodes,edges=edges,spots=spots,hotel=hn,names=NAMES),open('walkgraph.json','w'),separators=(',',':'))
import os;print('size',os.path.getsize('walkgraph.json'))
