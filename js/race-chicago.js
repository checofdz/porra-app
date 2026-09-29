// Chicago Marathon 2026 — race configuration (course data lives in /data/*.json)
export const RACE = {
  id: "chicago-2026",
  name: "Bank of America Chicago Marathon",
  short: "Chicago 2026",
  date: "2026-10-11",
  tz: "America/Chicago",
  officialApp: {
    ios: "https://apps.apple.com/app/id718145625",
    android: "https://play.google.com/store/apps/details?id=com.tcs.chicagomarathon2013",
    web: "https://results.chicagomarathon.com/2026/"
  },
  bounds: { w: -87.683, e: -87.600, n: 41.958, s: 41.826 },
  defaultStart: { name: "Hotel Felix", address: "111 W Huron St" }
};

export const WAVES = {
  pro: { n: "Profesional (7:30)", t: 450 },
  w1: { n: "Ola 1 (7:35)", t: 455 },
  w2: { n: "Ola 2 (8:00)", t: 480 },
  w3: { n: "Ola 3 (8:35)", t: 515 }
};

// Official timing mats (every 5K + half + finish)
export const CPS = [
  { k: "0", km: 0, n: "Salida" }, { k: "5", km: 5, n: "5K" }, { k: "10", km: 10, n: "10K" },
  { k: "15", km: 15, n: "15K" }, { k: "20", km: 20, n: "20K" }, { k: "21", km: 21.0975, n: "Medio" },
  { k: "25", km: 25, n: "25K" }, { k: "30", km: 30, n: "30K" }, { k: "35", km: 35, n: "35K" },
  { k: "40", km: 40, n: "40K" }, { k: "42", km: 42.195, n: "Meta" }
];

export const SPOTM = {
  grand: { name: "Grand y State", tip: "Primer vistazo cerca del Loop. Hay mucha gente: busca la esquina norte." },
  lashuron: { name: "LaSalle y Huron", tip: "Tramo recto de LaSalle en River North, a pasos de la Línea Roja (Chicago/State)." },
  lp8k: { name: "Lincoln Park · zona 8K", tip: "Zona oficial de ánimo del 8K. Bonita, pero lejos del metro." },
  lsdadd: { name: "Inner Lake Shore Dr (Lakeview)", tip: "Tramo tranquilo con poca gente, ideal para verlos bien." },
  broadadd: { name: "Broadway y Addison (Northalsted)", tip: "De los tramos con más ambiente (música, show)." },
  broadbel: { name: "Broadway y Belmont", tip: "Belmont tiene Roja y Café: buena salida hacia Wells o el Loop." },
  sednorth: { name: "Sedgwick y North Ave (Old Town)", tip: "La estación Sedgwick (Café) está en la misma esquina." },
  wells: { name: "Wells y Huron", tip: "Si llegas en la Café a Chicago/Franklin, quédate en la banqueta oeste de Wells." },
  half: { name: "Wacker y Washington · medio maratón", tip: "Zona de ánimo del medio maratón. Se llena: llega con minutos de sobra." },
  adamshal: { name: "Adams y Halsted (Greektown)", tip: "A 5 cuadras de UIC-Halsted (Azul)." },
  ashland: { name: "Adams y Ashland · Charity Block Party", tip: "Zona de fundaciones cerca del United Center, mucho ambiente." },
  jackhal: { name: "Jackson y Halsted", tip: "A 2 cuadras de UIC-Halsted. Fácil irte al sur por Azul + Roja." },
  taylor: { name: "Taylor y Loomis (Little Italy)", tip: "Tramo de barrio, menos gente." },
  pilsen: { name: "Loomis y 18th (Pilsen)", tip: "Mariachis y mucho ambiente. 18th (Rosa) queda a 6 cuadras al oeste." },
  china: { name: "Cermak y Wentworth (Chinatown)", tip: "Dragones y leones. La Roja te deja a una cuadra." },
  m29s: { name: "Michigan y 29th · bajando", tip: "Entre 26th y 31st pasan por Michigan en ambos sentidos: te quedas y los ves bajar y luego subir." },
  m29n: { name: "Michigan y 29th · subiendo", tip: "Mismo lugar que “bajando”: los vuelves a ver ~2.5 km después." },
  michcer: { name: "Michigan y Cermak", tip: "A 10 min a pie de Chinatown: combina milla 21 y milla 25 casi sin moverte." },
  m26: { name: "Michigan y Roosevelt · milla 26", tip: "Zona de ánimo de la milla 26, junto a la estación Roosevelt." }
};

// CTA stations [name, lat, lng]
export const ST = {sheridan:["Sheridan",41.95378,-87.65493],addison:["Addison",41.94743,-87.65363],belmont:["Belmont",41.93975,-87.65338],wellington:["Wellington",41.93603,-87.65327],diversey:["Diversey",41.93273,-87.65313],fullerton:["Fullerton",41.92505,-87.65287],armitage:["Armitage",41.91822,-87.65264],northcly:["North/Clybourn",41.91066,-87.64918],sedgwick:["Sedgwick",41.91041,-87.6393],clarkdiv:["Clark/Division",41.90392,-87.63141],chicagoR:["Chicago (State)",41.89667,-87.62818],chicagoB:["Chicago (Franklin)",41.89681,-87.63592],grandR:["Grand (State)",41.89167,-87.62802],grandBl:["Grand (Milwaukee)",41.89119,-87.64758],mart:["Merchandise Mart",41.88897,-87.63392],lakeR:["Lake (State)",41.88481,-87.62781],stateLake:["State/Lake",41.88574,-87.62784],clarkLake:["Clark/Lake",41.88574,-87.63089],washWells:["Washington/Wells",41.8827,-87.63378],washBl:["Washington (Dearborn)",41.88316,-87.62944],washWab:["Washington/Wabash",41.88322,-87.62619],monroeR:["Monroe (State)",41.88075,-87.6277],monroeBl:["Monroe (Dearborn)",41.8807,-87.62938],adamsWab:["Adams/Wabash",41.87951,-87.62604],quincy:["Quincy",41.87872,-87.63374],jacksonR:["Jackson (State)",41.87815,-87.6276],jacksonBl:["Jackson (Dearborn)",41.87818,-87.6293],hwl:["Harold Washington Library",41.87686,-87.6282],lasalleVB:["LaSalle/Van Buren",41.8768,-87.63174],lasalleBl:["LaSalle (Congress)",41.87557,-87.63172],clintonBl:["Clinton (Congress)",41.87554,-87.64098],clintonPG:["Clinton (Lake)",41.88568,-87.64178],morgan:["Morgan",41.88559,-87.65219],ashlandLake:["Ashland/Lake",41.88527,-87.66697],uic:["UIC-Halsted",41.87547,-87.64971],racine:["Racine",41.87592,-87.65946],imd:["Illinois Medical District",41.87571,-87.67393],polk:["Polk",41.87155,-87.66953],p18:["18th",41.85791,-87.66915],harrison:["Harrison",41.87404,-87.62748],roosevelt:["Roosevelt",41.86737,-87.6270],cermakCT:["Cermak-Chinatown",41.85321,-87.63097],cermakMc:["Cermak-McCormick Place",41.85312,-87.6264],sox35:["Sox-35th",41.83119,-87.63064],bronze35:["35th-Bronzeville-IIT",41.83168,-87.62583],halstedOr:["Halsted (Naranja)",41.84678,-87.64809]};
export const LC = { red: "#C60C30", blue: "#00A1DE", brown: "#62361B", pink: "#E27EA6", green: "#009B3A", orange: "#F9461C" };
export const LN = { red: "Roja", blue: "Azul", brown: "Café", pink: "Rosa", green: "Verde", orange: "Naranja" };
export const HW = { red: 8, blue: 8, brown: 10, green: 10, pink: 12, orange: 12 }; // Sunday-morning headways (min)
export const RUNS = [
 ["red","hacia 95th/Dan Ryan (sur)",[["sheridan",0],["addison",2],["belmont",2],["fullerton",3],["northcly",2],["clarkdiv",2],["chicagoR",1],["grandR",1],["lakeR",1],["monroeR",1],["jacksonR",1],["harrison",1],["roosevelt",2],["cermakCT",3],["sox35",3]]],
 ["blue","hacia Forest Park (oeste)",[["grandBl",0],["clarkLake",3],["washBl",1],["monroeBl",1],["jacksonBl",1],["lasalleBl",1],["clintonBl",2],["uic",2],["racine",1],["imd",2]]],
 ["green","hacia Harlem/Lake (norte, Loop)",[["bronze35",0],["cermakMc",3],["roosevelt",2],["adamsWab",3],["washWab",1],["stateLake",1],["clarkLake",1],["clintonPG",2]]],
 ["brown","hacia el Loop",[["belmont",0],["wellington",1],["diversey",1],["fullerton",2],["armitage",2],["sedgwick",2],["chicagoB",2],["mart",2],["washWells",2],["quincy",1],["lasalleVB",1],["hwl",1],["adamsWab",1],["washWab",1],["stateLake",1],["clarkLake",1]],"bo"],
 ["brown","hacia Kimball (norte)",[["clarkLake",0],["mart",2],["chicagoB",2],["sedgwick",2],["armitage",2],["fullerton",2],["diversey",2],["wellington",1],["belmont",1]],"bo2"],
 ["pink","hacia el Loop",[["p18",0],["polk",3],["ashlandLake",4],["morgan",2],["clintonPG",1],["clarkLake",2],["stateLake",1],["washWab",1],["adamsWab",1],["hwl",1],["lasalleVB",1],["quincy",1],["washWells",1]],"po"],
 ["pink","hacia 54th/Cermak (oeste)",[["washWells",0],["clintonPG",2],["morgan",1],["ashlandLake",2],["polk",4],["p18",3]],"po2"],
 ["orange","hacia el Loop",[["halstedOr",0],["roosevelt",4],["adamsWab",3],["washWab",1],["stateLake",1],["clarkLake",1],["washWells",1],["quincy",1],["lasalleVB",1],["hwl",1]],"oo"],
 ["orange","hacia Midway (suroeste)",[["hwl",0],["roosevelt",3],["halstedOr",4]],"oo2"]
];
export const BIDIR = { red: "hacia Howard (norte)", blue: "hacia O'Hare (noroeste)", green: "hacia Ashland/63rd (sur)" };
export const LOOP_CONT = [["bo","bo2","clarkLake"],["po","po2","washWells"],["oo","oo2","hwl"]];
export const XFERS = [["jacksonR","jacksonBl",3],["jacksonR","hwl",3],["jacksonBl","hwl",3],["lakeR","stateLake",2],["monroeR","monroeBl",3],["washBl","clarkLake",3]];
const LL = k => [ST[k][1], ST[k][2]];
export const CTAG = {
 red:[[41.958,-87.6549],LL("sheridan"),LL("addison"),LL("belmont"),LL("fullerton"),[41.9165,-87.6527],LL("northcly"),[41.9039,-87.6440],LL("clarkdiv"),[41.9036,-87.6283],LL("chicagoR"),LL("grandR"),LL("lakeR"),LL("monroeR"),LL("jacksonR"),LL("harrison"),LL("roosevelt"),[41.8620,-87.6277],[41.8575,-87.6310],LL("cermakCT"),LL("sox35"),[41.826,-87.6306]],
 brown:[[41.958,-87.6760],[41.9520,-87.6600],[41.9440,-87.6535],LL("belmont"),LL("wellington"),LL("diversey"),LL("fullerton"),LL("armitage"),[41.9106,-87.6497],LL("sedgwick"),[41.9040,-87.6358],LL("chicagoB"),LL("mart"),[41.8857,-87.6338]],
 loop:[[41.8857,-87.6338],[41.8857,-87.6260],[41.8768,-87.6260],[41.8768,-87.6338],[41.8857,-87.6338]],
 blue:[[41.9100,-87.6810],[41.9030,-87.6670],[41.8960,-87.6560],LL("grandBl"),[41.8857,-87.6395],LL("clarkLake"),[41.8857,-87.6294],LL("washBl"),LL("monroeBl"),LL("jacksonBl"),[41.8757,-87.6294],LL("lasalleBl"),LL("clintonBl"),LL("uic"),LL("racine"),LL("imd"),[41.8757,-87.6840]],
 pink:[[41.8857,-87.6338],LL("clintonPG"),LL("morgan"),LL("ashlandLake"),[41.8852,-87.6695],LL("polk"),LL("p18"),[41.8540,-87.6840]],
 green:[LL("clintonPG"),[41.8857,-87.6418],[41.8857,-87.6338]],
 green2:[[41.8768,-87.6260],[41.8740,-87.6263],LL("roosevelt"),LL("cermakMc"),LL("bronze35"),[41.826,-87.6258]],
 orange:[LL("roosevelt"),[41.8625,-87.6290],[41.8580,-87.6355],[41.8520,-87.6420],LL("halstedOr"),[41.8420,-87.6620],[41.8370,-87.6840]]
};
export const CTAC = { red: LC.red, brown: LC.brown, loop: "#8A8F98", blue: LC.blue, pink: LC.pink, green: LC.green, green2: LC.green, orange: LC.orange };
export const VIEWS = { all: [41.958, 41.826, -87.683, -87.600], north: [41.957, 41.888, -87.662, -87.618], center: [41.900, 41.852, -87.682, -87.615], south: [41.872, 41.827, -87.672, -87.612] };
export const RUNNER_COLORS = ["#E2552B","#7A4BD0","#0E9F6E","#D97706","#DB2777","#0891B2","#65A30D","#9333EA","#B45309","#2563EB"];
export const FACTS = [
 "Salidas: silla de ruedas 7:20, élite 7:30, Ola 1 7:35, Ola 2 8:00, Ola 3 8:35. Cada corredor cruza el tapete unos minutos después según su corral.",
 "Salida y meta en Grant Park (Columbus Dr). El parque abre a espectadores a las 9:30; la fiesta post-carrera es de 9:30 a 16:00.",
 "Tapetes de cronometraje oficiales: salida, cada 5K, medio maratón y meta. Son los puntos donde la app oficial manda notificación.",
 "Las calles del recorrido cierran desde las 6:00 y reabren cuando pasa el último corredor. Solo puedes cruzar en los cruces con policía.",
 "El metro (“L”) pasa por arriba o por debajo del recorrido: es la mejor forma de moverte. Uber y taxi sirven poco cerca de la ruta.",
 "Tiempos de metro: estimados de domingo en la mañana (Roja y Azul cada ~8 min, Café y Verde ~10, Rosa y Naranja ~12)."
];
