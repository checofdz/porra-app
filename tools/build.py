import json,math,heapq,collections
d=json.load(open('streets_bbox.json'))['features']
def hv(a,b):
    R=6371000;t=math.pi/180
    dl=(b[1]-a[1])*t;dg=(b[0]-a[0])*t
    x=math.sin(dl/2)**2+math.cos(a[1]*t)*math.cos(b[1]*t)*math.sin(dg/2)**2
    return 2*R*math.asin(math.sqrt(x))
edges=[]
adj=collections.defaultdict(list)
nodepos={}
for f in d:
    p=f['properties'];cs=f['geometry']['coordinates']
    key=(p['STREET_NAM'] or '')+' '+(p['STREET_TYP'] or '')
    a,b=(round(cs[0][0],5),round(cs[0][1],5)),(round(cs[-1][0],5),round(cs[-1][1],5))
    L=sum(hv(cs[i],cs[i+1]) for i in range(len(cs)-1))
    e=dict(k=key.strip(),a=a,b=b,cs=cs,L=L,cl=p['CLASS'])
    edges.append(e);nodepos[a]=cs[0];nodepos[b]=cs[-1]
    adj[a].append((b,len(edges)-1));adj[b].append((a,len(edges)-1))
# bridge small gaps within same street
byk=collections.defaultdict(set)
for e in edges:
    if e['cl'] in ('7','9','RIV'):continue
    byk[e['k']].add(e['a']);byk[e['k']].add(e['b'])
nb=0
for k,ns in byk.items():
    ns=list(ns)
    for i in range(len(ns)):
        for j in range(i+1,len(ns)):
            dd=hv(nodepos[ns[i]],nodepos[ns[j]])
            if 0<dd<(75 if k=="18TH ST" else 35):
                edges.append(dict(k=k,a=ns[i],b=ns[j],cs=[nodepos[ns[i]],nodepos[ns[j]]],L=dd,cl='4'));ei=len(edges)-1
                adj[ns[i]].append((ns[j],ei));adj[ns[j]].append((ns[i],ei));nb+=1
print('bridges',nb)
nodes_by_street=collections.defaultdict(set)
for e in edges: nodes_by_street[e['k']].add(e['a']);nodes_by_street[e['k']].add(e['b'])
def nearest(keys,lat,lng,also=None):
    cand=set()
    for k in keys: cand|=nodes_by_street[k]
    if also:
        c2=set()
        for k in also: c2|=nodes_by_street[k]
        if cand&c2: cand=cand&c2
    return min(cand,key=lambda n:hv(nodepos[n],(lng,lat)))
def route(keys,s,t,excl=('1',),loose=False):
    dist={s:0};prev={};pq=[(0,s)]
    while pq:
        dd,u=heapq.heappop(pq)
        if u==t:break
        if dd>dist[u]:continue
        for v,ei in adj[u]:
            e=edges[ei]
            if e['cl'] in excl:continue
            if e['k'] not in keys and not loose:continue
            nd=dd+e['L']*(1 if e['k'] in keys else 4)
            if nd<dist.get(v,1e18):dist[v]=nd;prev[v]=(u,ei);heapq.heappush(pq,(nd,v))
    if t not in dist: return None
    pts=[];u=t;seq=[]
    while u!=s:
        pu,ei=prev[u];e=edges[ei];cs=e['cs'] if e['b']==u else e['cs'][::-1];seq.append(cs);u=pu
    out=[]
    for cs in reversed(seq):
        out+= cs if not out else cs[1:]
    return out
W=[ # name, lat,lng, street to next
("start",41.8807,-87.6205,["COLUMBUS DR"]),
("grandcol",41.8917,-87.6200,["GRAND AVE"]),
("granddear",41.8917,-87.6293,["DEARBORN ST"]),
("jackdear",41.8781,-87.6294,["JACKSON BLVD"]),
("jacklasalle",41.8781,-87.6323,["LA SALLE ST","LA SALLE DR"]),
("lasclark",41.9115,-87.6325,["STOCKTON DR"]),
("stockfull",41.9255,-87.6353,["FULLERTON PKWY","FULLERTON AVE","FULLERTON DR"]),
("cannon",41.9258,-87.6322,["CANNON DR"]),
("diversey",41.9330,-87.6370,["SHERIDAN RD"]),
("belmontsher",41.9398,-87.6388,["LAKE SHORE DR"]),
("lsdsher",41.9540,-87.6435,["SHERIDAN RD"]),
("broadsher",41.9542,-87.6495,["BROADWAY"]),
("clarkdiv",41.9326,-87.6428,["CLARK ST"]),
("clarkweb",41.9215,-87.6368,["WEBSTER AVE"]),
("sedweb",41.9215,-87.6388,["SEDGWICK ST"]),
("sednorth",41.9108,-87.6388,["NORTH AVE"]),
("wellsnorth",41.9108,-87.6348,["WELLS ST"]),
("wellswacker",41.8866,-87.6339,["WACKER DR"]),
("wackeradams",41.8794,-87.6370,["ADAMS ST"]),
("adamsdamen",41.8794,-87.6760,["DAMEN AVE"]),
("jackdamen",41.8779,-87.6760,["JACKSON BLVD"]),
("jackhalsted",41.8779,-87.6470,["HALSTED ST"]),
("taylorhalsted",41.8695,-87.6470,["TAYLOR ST"]),
("taylorloomis",41.8695,-87.6608,["LOOMIS ST"]),
("loomis18",41.8578,-87.6607,["18TH ST"]),
("halsted18",41.8578,-87.6466,["HALSTED ST"]),
("halsted21",41.8540,-87.6466,["21ST ST"]),
("canal21",41.8540,-87.6430,["CANALPORT AVE"]),
("canalcermak",41.8528,-87.6405,["CERMAK RD"]),
("cermakwent",41.8528,-87.6318,["WENTWORTH AVE"]),
("went26",41.8453,-87.6318,["26TH ST"]),
("mich26s",41.8453,-87.6242,["MICHIGAN AVE"]),
("mich35",41.8310,-87.6236,["35TH ST"]),
("ind35",41.8310,-87.6216,["INDIANA AVE"]),
("ind31",41.8385,-87.6216,["31ST ST"]),
("mich31n",41.8385,-87.6229,["MICHIGAN AVE"]),
("michroos",41.8674,-87.6242,["ROOSEVELT RD"]),
("rooscol",41.8674,-87.6210,["COLUMBUS DR"]),
("finish",41.8712,-87.6207,None)]
course=[];marks={}
prevstreet=None
snap=[]
for i,(n,la,ln,st) in enumerate(W):
    keys=st or prevstreet
    node=nearest(keys,la,ln,also=prevstreet if st else None)
    snap.append(node);prevstreet=st
for i in range(len(W)-1):
    keys=W[i][3];r=route(set(keys),snap[i],snap[i+1],excl=('1','7','9'))
    if r is None:
        r=None
    if r is None:
        print("FAIL",W[i][0],'->',W[i+1][0],keys, nodepos[snap[i]],nodepos[snap[i+1]]);r=[nodepos[snap[i]],nodepos[snap[i+1]]]
    marks[W[i][0]]=len(course) if not course else len(course)-1
    course+= r if not course else r[1:]
marks['finish']=len(course)-1
cum=[0]
for i in range(1,len(course)):cum.append(cum[-1]+hv(course[i-1],course[i]))
for k,v in marks.items(): print(k,round(cum[v]/1609.344,2),[round(course[v][1],5),round(course[v][0],5)])
print('total mi',cum[-1]/1609.344,len(course))
json.dump({'course':course,'marks':marks},open('course_real.json','w'))
