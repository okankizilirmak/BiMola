// Shared, immutable level definitions. Each room carries its own map id; no process-wide active map.
export const mapTypes={};
function type(id,name,model,w,h,d,extra={}){mapTypes[id]={name,model,w,d,height:h,radius:Math.hypot(w,d)/2,color:'#b99162',icon:'◈',...extra};}
type('marketStall','Pazar tezgâhı','stall',3.4,2.8,1.65,{surface:.9});
type('crate','Ahşap kasa','crate',.7,.5,.5);
type('marketScale','Pazar terazisi','scale',.5,.65,.42);
type('fountain','Meydan çeşmesi','fountain',2.8,1.35,2.8);
type('planterBox','Bitki kasası','planterBox',2.7,1.2,1.2,{surface:.72});
type('seedTray','Fide tepsisi','seedTray',.65,.15,.4);
type('soilBag','Toprak torbası','soilBag',.55,.6,.32);
type('arcadeCabinet','Arcade makinesi','arcade',.92,1.95,.9);
type('pinball','Pinball masası','pinball',.8,1.6,1.65,{surface:.95,under:.65});
type('washer','Çamaşır makinesi','washer',1,1.12,.85);
type('laundryCart','Çamaşır arabası','cart',.95,.95,.65);
type('robot','Model robot','robot',.5,.72,.38);
type('planet','Gezegen modeli','planet',.5,.65,.5);
type('plasma','Plazma küresi','plasma',.42,.62,.42);
type('paintJar','Boya kavanozu','paintJar',.15,.18,.15);
type('orrery','Güneş sistemi sergisi','orrery',3,3,3);
type('luggageCart','Bagaj arabası','luggageCart',1.2,1.8,.8);
type('parasol','Güneş şemsiyesi','parasol',2.7,2.65,2.7,{under:2.25});
type('receptionBell','Resepsiyon zili','bell',.18,.13,.18);
type('exhibitShelf','Sergi kitaplığı','exhibitShelf',2.5,1.8,.65);
// Cargo-port disguises have their own silhouettes and never enter the older maps.
type('cargoDrum','Liman varili','cargoDrum',.65,.94,.65,{harborOnly:true});
type('trafficCone','Trafik konisi','trafficCone',.48,.72,.48,{harborOnly:true});
type('cableReel','Kablo makarası','cableReel',1.15,.9,1.15,{harborOnly:true,surface:.9});
type('pallet','Yük paleti','pallet',1.4,.22,1.1,{harborOnly:true,surface:.22});
type('toolChest','Takım sandığı','toolChest',.85,.65,.5,{harborOnly:true});
type('mooringBollard','Bağlama babası','mooringBollard',.7,.62,.55,{harborOnly:true});
type('lifeBuoy','Can simidi','lifeBuoy',.58,.68,.24,{harborOnly:true});
type('cargoBox','Sevkiyat kolisi','cargoBox',.62,.58,.5,{harborOnly:true});
// Workstation furniture and role-specific tools for the technology office.
type('techDesk','Çalışma masası','techDesk',2.6,.78,1.3,{surface:.78,under:.63});
type('executiveDesk','Yönetici masası','executiveDesk',3.2,.8,1.55,{surface:.8,under:.63});
type('codeMonitor','Kod ekranı','codeMonitor',1.08,.68,.32);
type('phoneRack','Telefon test standı','phoneRack',.88,.43,.35);
type('tabletStand','Tablet standı','tabletStand',.38,.43,.28);
type('kanbanBoard','İş takip panosu','kanbanBoard',2.2,1.95,.65);
type('diagramBoard','Sistem şeması','diagramBoard',2.2,1.95,.65);
type('binderStack','Analiz dosyaları','binderStack',.5,.34,.32);
type('serverRack','Sunucu kabini','serverRack',.85,2.15,.9);
type('storageArray','Disk ünitesi','storageArray',.65,.45,.55);
type('networkSwitch','Ağ anahtarı','networkSwitch',.75,.18,.35);
type('award','Başarı ödülü','award',.28,.5,.24);
type('drawingTablet','Çizim tableti','drawingTablet',.72,.12,.48);
type('testRig','Donanım test seti','testRig',.72,.4,.45);

const boundary=(h=4.8)=>[[0,-18,28,.3,h],[0,18,28,.3,h],[-14,0,.3,36,h],[14,0,.3,36,h]];
const area=(id,name,xmin,xmax,zmin,zmax,types)=>({id,name,xmin,xmax,zmin,zmax,types,count:10});
const maps={};
function level(id,name,subtitle,color,wallList,zones,options={}){
 return maps[id]={id,name,subtitle,color,preview:`/games/prop-hunt/maps/references/${id}.jpeg`,room:{width:28,depth:36,height:4.8},walls:wallList,zones,doors:[],fixtures:[],...options};
}

// 1. Kıyı Pazarı: Akdeniz kasabası meydanı ve pazar tezgâhları
const market=level('market','Kıyı Pazarı','Tezgâh arkasından dolan, meydana karış.','#87b2b9',boundary(7),[
 area('produce','Manav',-13,-3,-16,0,['crate','orangeFruit','appleFruit','basket','marketScale']),
 area('fish','Balıkçı',3,13,-16,0,['crate','marketScale','basket']),
 area('cafe','Kahve terası',-13,-3,3,16,['mug','stool','diningChair','glassCup']),
 area('store','Kasa deposu',3,13,3,16,['crate','basket','plant'])
],{room:{width:28,depth:36,height:7}});

// 2. Çatı Serası: Cam sera ve saksılama atölyesi
const greenhouse=level('greenhouse','Çatı Serası','Camın ardından görün, diğer kapıdan kaybol.','#8da38b',[
 ...boundary(1.15),[-8,-4,.15,22,3.3,0,'glass'],[8,-7.5,.15,15,3.3,0,'glass'],[8,5,.15,4,3.3,0,'glass'],
 [-5,-15,6,.15,3.3,0,'glass'],[5,-15,6,.15,3.3,0,'glass'],[-5,7,6,.15,3.3,0,'glass'],[5,7,6,.15,3.3,0,'glass'],
 [-5,-4,6,.15,3.3,0,'glass'],[5,-4,6,.15,3.3,0,'glass']
],[
 area('nursery','Cam sera',-7,7,-14,-5,['smallPot','watering','soilBag']),
 area('workshop','Saksılama atölyesi',-7,7,-3,6,['seedTray','smallPot','watering']),
 area('terrace','Bitki terası',-13,13,9,16,['plant','watering','stool','soilBag'])
],{doors:[[0,7,3,1],[0,-4,3,1],[0,-15,3,1],[8,1.5,1,3]]});

// 3. Son Jeton: Neon Arcade ve Retro Oyun Kulübü
const arcade=level('arcade','Son Jeton','Aynı makinelerin arasında farklı bir oyun.','#df9075',[
 ...boundary(),[-7,-4,14,.25],[11,-4,6,.25],[3,-15,.25,6],[3,-6,.25,4],[-3,9,.25,6],[-3,-.5,.25,4.5]
],[
 area('machines','Oyun salonu',-13,1,-16,-6,['arcadeCabinet','pinball','stool']),
 area('lounge','Oyun köşesi',-13,-5,-2,16,['ball','stool','speaker']),
 area('snack','Atıştırmalık barı',-1,13,-2,16,['mug','stool','coffeeMachine']),
 area('prizes','Ödül vitrini',5,13,-16,-6,['robot','planet','arcadeCabinet'])
],{doors:[[3,-10,1,3],[2,-4,3,1],[-3,4,1,3],[-3,14,1,3]]});

// 4. Minik Mucitler: Çocuk Bilim ve Keşif Müzesi
const museum=level('museum','Minik Mucitler','Sergiler arasında kaybol, balkondan rota değiştir.','#b8a888',[
 ...boundary(8),[-5.75,-9,8.5,.25,3.2,3],[5.75,-9,8.5,.25,3.2,3],[-6,3,.25,6],[6,3,.25,6]
],[
 area('exhibits','Ana sergi',-7,7,-7,0,['planet','robot','plasma']),
 area('craft','Deney atölyesi',-13,-7,2,16,['paintJar','robot','stool']),
 area('shop','Müze dükkânı',7,13,2,16,['bookstack','planet','robot']),
 area('gallery','Üst galeri',-7,7,-16,-11,['planet','bookstack','stool'])
],{room:{width:28,depth:36,height:8},doors:[[0,-9,3,1],[-6,8,1,3],[6,8,1,3]],raised:true});

// 5. Bavul Molası: Butik Otel Lobisi ve Dinlenme Salonu
const hotel=level('hotel','Bavul Molası','Avluyu geç, bagajların arasına karış.','#65a3a1',[
 ...boundary(6),[-6,-9,.25,12],[6,-9,.25,12],[-6,12,.25,8],[6,12,.25,8],[-10,2,8,.25],[10,2,8,.25]
],[
 area('reception','Resepsiyon',-13,-7,4,16,['case','luggageCart','receptionBell']),
 area('breakfast','Kahvaltı',7,13,4,16,['mug','plate','stool']),
 area('lounge','Oturma salonu',-13,-7,-16,0,['pillow','plant','bookstack']),
 area('luggage','Bagaj odası',7,13,-16,0,['case','luggageCart','basket']),
 area('courtyard','Avlu',-4,4,-16,16,['plant','diningChair','stool'])
],{room:{width:28,depth:36,height:6},doors:[[-6,5,1,3],[6,5,1,3],[-6,-1,1,3],[6,-1,1,3]]});

// 6. Son Sevkiyat: Kompakt Konteyner Limanı ve Rıhtım (32 x 40 m)
const harborContainers=[
 {x:-12,z:-14,w:5,d:2.6,h:2.8,color:0},{x:-4.5,z:-14,w:4.5,d:2.6,h:2.8,color:1},
 {x:-12,z:-8,w:5,d:2.6,h:5.2,color:2},{x:-4.5,z:-8,w:4.5,d:2.6,h:2.8,color:0},
 {x:-12,z:-2,w:5,d:2.6,h:2.8,color:1},{x:-4.5,z:-2,w:4.5,d:2.6,h:5.2,color:2},
 {x:-12,z:4,w:5,d:2.6,h:5.2,color:0},{x:-4.5,z:4,w:4.5,d:2.6,h:2.8,color:1},
 {x:-12,z:10,w:5,d:2.6,h:2.8,color:2},{x:-4.5,z:10,w:4.5,d:2.6,h:2.8,color:0},
 {x:-12,z:16,w:5,d:2.6,h:2.8,color:1},{x:-4.5,z:16,w:4.5,d:2.6,h:2.8,color:2}
];
const harborWalls=[
 [0,-20,32,.4,5],[0,20,32,.4,1.15],[-16,0,.4,40,5],[16,0,.4,40,1.15],
 ...harborContainers.map(({x,z,w,d,h})=>[x,z,w,d,h]),
 // Freight shed walls
 [9.5,-19,11,.35,5],[15,-12.5,.35,13,5],[4,-12.5,.35,13,5],[6,-6,4,.35,5],[13,-6,4,.35,5]
];
const harbor=level('harbor','Son Sevkiyat','Kargo limanı · Konteynerler, vinçler ve rıhtım.','#456e80',harborWalls,[
 area('stacks','Konteyner sahası',-15,-1,-19,-1,['cargoDrum','trafficCone','cableReel','pallet','cargoBox']),
 area('dispatch','Sevkiyat sahası',-15,-1,1,19,['pallet','cargoBox','cargoDrum','toolChest']),
 area('freight','Gümrük hangarı',4.5,14.5,-18.5,-6.5,['cargoBox','pallet','toolChest','cableReel']),
 area('maintenance','Vinç bakım alanı',0,15,-5.5,3.5,['toolChest','cargoDrum','trafficCone','cableReel']),
 area('quay','Rıhtım',3.5,15,4.5,19,['mooringBollard','lifeBuoy','cableReel','cargoDrum'])
],{room:{width:32,depth:40,height:8},preview:'/games/prop-hunt/maps/references/harbor.svg',containers:harborContainers,layoutScale:0.4,
 doors:[[9.5,-6,3,1]]});

// 7. Sprint Ofisi: 8 Departmanlı Teknoloji Stüdyosu (30 x 36 m)
const officeRooms=[
 ['manager','Müdür Odası',-1,-15,['award','executiveDesk','binderStack']],
 ['backend','Backend Developer',1,-15,['codeMonitor','diagramBoard','networkSwitch']],
 ['mobile','Mobile Developer',-1,-7,['phoneRack','tabletStand','testRig']],
 ['analyst','İş Analisti',1,-7,['kanbanBoard','binderStack','tabletStand']],
 ['database','DB Admin',-1,3,['serverRack','storageArray','networkSwitch']],
 ['devops','DevOps / Altyapı',1,3,['networkSwitch','serverRack','codeMonitor']],
 ['design','UX / UI Tasarım',-1,13,['drawingTablet','tabletStand','kanbanBoard']],
 ['qa','QA / Test Ekibi',1,13,['testRig','phoneRack','codeMonitor']]
];
const officeWalls=[[0,-18,30,.3],[0,18,30,.3],[-15,0,.3,36],[15,0,.3,36]];
const officeDoors=[];
// Spine walls & doors
for(const side of [-1,1]){
 for(const z of [-15,-7,3,13]){
  officeWalls.push([side*2.5,z-2.2,.25,2.4],[side*2.5,z+2.2,.25,2.4]);
  officeDoors.push([side*2.5,z,1.2,2.8]);
 }
}
// Room dividing walls
// At z = -12: solid wall on manager side (-1), door on backend side (1)
officeWalls.push([-8.75,-12,12.5,.25]); // Manager-mobile solid divider
officeWalls.push([5.1,-12,5.2,.25],[12.15,-12,5.7,.25]); officeDoors.push([8.5,-12,1.4,1]);
// At z = -2: dividers with side doors
officeWalls.push([-5.1,-2,5.2,.25],[-12.15,-2,5.7,.25]); officeDoors.push([-8.5,-2,1.4,1]);
officeWalls.push([5.1,-2,5.2,.25],[12.15,-2,5.7,.25]); officeDoors.push([8.5,-2,1.4,1]);
// At z = 8: dividers with side doors
officeWalls.push([-5.1,8,5.2,.25],[-12.15,8,5.7,.25]); officeDoors.push([-8.5,8,1.4,1]);
officeWalls.push([5.1,8,5.2,.25],[12.15,8,5.7,.25]); officeDoors.push([8.5,8,1.4,1]);

const techOffice=level('techOffice','Sprint Ofisi','8 ekip odası · Masalar, cihazlar ve sunucular.','#778eac',officeWalls,
 [
  area('manager','Müdür Odası',-14.5,-2.8,-17.5,-12.3,['award','executiveDesk','binderStack']),
  area('backend','Backend Developer',2.8,14.5,-17.5,-12.3,['codeMonitor','diagramBoard','networkSwitch']),
  area('mobile','Mobile Developer',-14.5,-2.8,-11.7,-2.3,['phoneRack','tabletStand','testRig']),
  area('analyst','İş Analisti',2.8,14.5,-11.7,-2.3,['kanbanBoard','binderStack','tabletStand']),
  area('database','DB Admin',-14.5,-2.8,-1.7,7.7,['serverRack','storageArray','networkSwitch']),
  area('devops','DevOps / Altyapı',2.8,14.5,-1.7,7.7,['networkSwitch','serverRack','codeMonitor']),
  area('design','UX / UI Tasarım',-14.5,-2.8,8.3,17.5,['drawingTablet','tabletStand','kanbanBoard']),
  area('qa','QA / Test Ekibi',2.8,14.5,8.3,17.5,['testRig','phoneRack','codeMonitor'])
 ],
 {room:{width:30,depth:36,height:4.8},doors:officeDoors,preview:'/games/prop-hunt/maps/references/techOffice.svg'});

export function terrainHeight(map,x,z){
 if(!map?.raised)return 0;
 if(z<=-9)return 3;
 if(Math.abs(x)>=9&&Math.abs(x)<=12.8&&z<5)return Math.max(0,Math.min(3,(5-z)*3/14));
 return 0;
}
function add(map,type,x,z,y=terrainHeight(map,x,z),angle=0,parent=null){const o={id:`${map.id}-${map.fixtures.length}`,mapId:map.id,type,x,y,z,angle,wet:0};if(parent)o.supportId=parent.id;map.fixtures.push(o);return o;}
function table(map,x,z,type='f_potting',items=['mug','smallPot','watering'],angle=0){const p=add(map,type,x,z,undefined,angle),height=type==='f_coffee'?.48:type==='f_dining'?.8:.9;items.forEach((t,i)=>{const dx=(i-(items.length-1)/2)*.65;add(map,t,x+Math.cos(angle)*dx,z-Math.sin(angle)*dx,p.y+height,angle,p);});return p;}

// 1. Kıyı Pazarı yerleşimi
const s1=add(market,'marketStall',-8,-11);
for(let i=0;i<4;i++){const c=add(market,'crate',-9.1+i*.72,-11,.9,0,s1);add(market,i%2?'appleFruit':'orangeFruit',c.x,c.z,c.y+.5,0,c);}
add(market,'marketScale',-8,-10.2,.9,0,s1);
const s2=add(market,'marketStall',-8,-4);
for(let i=0;i<3;i++){const c=add(market,'crate',-8.8+i*.75,-4,.9,0,s2);add(market,'orangeFruit',c.x,c.z,c.y+.5,0,c);}
add(market,'basket',-6.5,-4,.9,0,s2);
const s3=add(market,'marketStall',8,-11);
for(let i=0;i<3;i++){add(market,'crate',7.2+i*.75,-11,.9,0,s3);}
add(market,'marketScale',8,-10.2,.9,0,s3);
const s4=add(market,'marketStall',8,-4);
for(let i=0;i<3;i++){add(market,'crate',7.2+i*.75,-4,.9,0,s4);}
add(market,'basket',9.5,-4,.9,0,s4);
add(market,'fountain',0,0);
for(const x of [-6,6]){table(market,x,7,'f_coffee',['mug','glassCup','plate']);for(const dz of [-1.2,1.2])add(market,'diningChair',x,7+dz,0,dz<0?0:Math.PI);}
for(const x of [7,9])for(const z of [10,13]){const c=add(market,'crate',x,z);add(market,'crate',x,z,.5,0,c);}
add(market,'basket',10.5,11.5);
for(const [x,z]of [[-12,-16],[12,-16],[-12,15],[12,15]])add(market,'largePlant',x,z);

// 2. Çatı Serası yerleşimi
for(const [x,z]of [[-4,-11],[4,-11],[-4,1],[4,1]])table(greenhouse,x,z,'f_potting',['smallPot','seedTray','watering']);
for(const x of [-11,11])for(const z of [-12,-6,0,7,13])add(greenhouse,'planterBox',x,z,0,Math.PI/2);
for(const x of [-5,5])add(greenhouse,'planterBox',x,12);
table(greenhouse,0,15,'f_coffee',['mug','mug']);for(const x of [-1.7,1.7])add(greenhouse,'diningChair',x,15);
for(const [x,z]of [[-6,4],[6,4],[-6,-13],[6,-13]])add(greenhouse,'soilBag',x,z);

// 3. Son Jeton yerleşimi (Retro Arcade & Lounge)
for(const z of [-14,-11,-8]){add(arcade,'arcadeCabinet',-11.5,z,0,Math.PI/2);add(arcade,'arcadeCabinet',-6.5,z,0,-Math.PI/2);add(arcade,'stool',-10,z);add(arcade,'stool',-8,z);}
for(const z of [0,4])add(arcade,'pinball',-5,z);
for(const z of [3,11])add(arcade,'f_game',-9,z);
add(arcade,'speaker',-11,14);add(arcade,'speaker',-7,14);add(arcade,'ball',-8,1);
for(const z of [-14,-10]){const s=add(arcade,'exhibitShelf',11,z,0,-Math.PI/2);table(arcade,9.5,z,'f_coffee',['robot','planet']);}
add(arcade,'arcadeCabinet',7,-14,0,Math.PI);
table(arcade,7,9,'f_dining',['coffeeMachine','mug','glassCup','plate']);
for(const x of [4.5,7,9.5])add(arcade,'stool',x,11);
table(arcade,8,-.2,'f_potting',['laptop','speaker','tableLamp']);

// 4. Minik Mucitler yerleşimi
add(museum,'orrery',0,-3);
table(museum,-4,1,'f_coffee',['planet','plasma']);table(museum,4,1,'f_coffee',['robot','plasma']);
table(museum,-10,8,'f_dining',['robot','paintJar','laptop']);
table(museum,-10,12,'f_dining',['plasma','paintJar','robot']);
for(const z of [6,10,14])add(museum,'stool',-10,z);
add(museum,'exhibitShelf',11,8,0,-Math.PI/2);add(museum,'exhibitShelf',11,12,0,-Math.PI/2);
table(museum,9,10,'f_coffee',['bookstack','planet','robot']);
add(museum,'exhibitShelf',-4,-14);add(museum,'exhibitShelf',4,-14);
table(museum,0,-14,'f_coffee',['planet','robot']);
for(const x of [-2,2])add(museum,'stool',x,-14,3);
for(const x of [-11,11])add(museum,'largePlant',x,16);

// 5. Bavul Molası yerleşimi
table(hotel,-10,10,'f_dining',['laptop','receptionBell','mug']);add(hotel,'diningChair',-10,12,0,0);add(hotel,'luggageCart',-8,5);
table(hotel,10,12,'f_dining',['coffeeMachine','plate','glassCup','mug']);
table(hotel,10,6,'f_coffee',['plate','mug']);for(const dz of [-1.2,1.2])add(hotel,'diningChair',10,6+dz,0,dz<0?0:Math.PI);
for(const z of [-12,-6]){add(hotel,'f_sun-sofa',-10,z,0,Math.PI/2);table(hotel,-8,z,'f_coffee',['mug','flatBook','pillow']);}
add(hotel,'largePlant',-11,-15);add(hotel,'plant',-11,-1);
add(hotel,'luggageCart',8,-6);add(hotel,'luggageCart',8,-12);
for(const x of [10,12])for(const z of [-13,-9,-5])add(hotel,'case',x,z);
add(hotel,'basket',11,-15);
add(hotel,'planterBox',-2,0);add(hotel,'planterBox',2,0);
for(const x of [-2.5,2.5])for(const z of [-8,8])add(hotel,'diningChair',x,z,0,x<0?Math.PI/2:-Math.PI/2);
for(const [x,z]of [[-4,-15],[4,-15],[-4,15],[4,15]])add(hotel,'largePlant',x,z);

// 6. Son Sevkiyat yerleşimi
for(const [x,z]of [[7,-15],[12,-15],[7,-10],[12,-10],[-1,6],[-1,12]]){
 const p=add(harbor,'pallet',x,z);
 add(harbor,'cargoBox',x-.32,z,.22,0,p);add(harbor,'cargoBox',x+.32,z,.22,0,p);
}
for(const [x,z]of [[6,-8],[11,-8],[5,0],[10,0]]){
 add(harbor,'toolChest',x,z);add(harbor,'cableReel',x+1.5,z);
}
for(const z of [6,9,12,15,18])add(harbor,'mooringBollard',14.8,z);
for(const z of [7.5,10.5,13.5,16.5])add(harbor,'lifeBuoy',14.5,z);
for(const [x,z]of [[-1,-14],[-1,-8],[-1,0],[2,7],[2,14]])add(harbor,'cargoDrum',x,z);
for(const [x,z]of [[1,-18],[1,-5],[1,5],[1,18],[5,4],[10,4]])add(harbor,'trafficCone',x,z);

// 7. Sprint Ofisi yerleşimi
for(const zone of techOffice.zones){
 const x=(zone.xmin+zone.xmax)/2,z=(zone.zmin+zone.zmax)/2;
 const workItems={
  manager:['codeMonitor','award','binderStack'],
  backend:['codeMonitor','networkSwitch','codeMonitor'],
  mobile:['phoneRack','tabletStand','testRig'],
  analyst:['tabletStand','binderStack','binderStack'],
  database:['codeMonitor','storageArray','networkSwitch'],
  devops:['codeMonitor','networkSwitch','storageArray'],
  design:['codeMonitor','drawingTablet','tabletStand'],
  qa:['codeMonitor','testRig','phoneRack']
 }[zone.id];
 const positions=zone.id==='manager'?[[0,-1.5]]:[[-2.5,-1],[2.5,-1]];
 for(const [dx,dz]of positions){
  const desk=add(techOffice,zone.id==='manager'?'executiveDesk':'techDesk',x+dx,z+dz);
  const height=zone.id==='manager'?.8:.78;
  add(techOffice,workItems[0],desk.x,desk.z-.32,height,0,desk);
  add(techOffice,workItems[1],desk.x-.65,desk.z+.35,height,0,desk);
  add(techOffice,workItems[2],desk.x+.65,desk.z+.35,height,0,desk);
  add(techOffice,'officeChair',desk.x,desk.z+1.4);
 }
 if(zone.id==='manager'){
  for(const dx of [-1,1])add(techOffice,'diningChair',x+dx,z-2.5,0,Math.PI);
  table(techOffice,x+3.5,z+1.8,'f_dining',['binderStack','mug']);
  add(techOffice,'f_sun-sofa',x-3.5,z+1.8);
 }
 if(['database','devops'].includes(zone.id)){
  const side=Math.sign(x);for(const dz of [-1.5,1.5])add(techOffice,'serverRack',side*13.5,z+dz,0,side<0?Math.PI/2:-Math.PI/2);
 }
 add(techOffice,['backend','database','devops'].includes(zone.id)?'diagramBoard':'kanbanBoard',zone.id==='manager'?x-3.5:x,zone.zmin+1.1);
 add(techOffice,'plant',x,zone.zmax-1.1);
}

for(const map of Object.values(maps)){for(const f of [...map.fixtures])if(['f_potting','f_dining'].includes(f.type))for(const side of [-1,1])add(map,'stool',f.x+side*1.2,f.z+1.35,terrainHeight(map,f.x,f.z+1.35));}

export const MAPS=Object.freeze(maps);
export const SIZE_TIERS=[
 {id:'standard',name:'Standart',maxArea:1050,teams:'1v1 – 6v6'},
 {id:'large',name:'Büyük',maxArea:1200,teams:'3v3 – 8v8'},
 {id:'huge',name:'Devasa',maxArea:Infinity,teams:'6v6 – 12v12'},
];
const LOFT_ROOM={width:28,depth:36};
export function mapSize(room){
 const width=Math.round(room.width),depth=Math.round(room.depth),area=width*depth;
 const tier=SIZE_TIERS.find(t=>area<=t.maxArea);
 return {width,depth,area,size:tier.id,sizeName:tier.name,sizeTeams:tier.teams};
}
export const MAP_CHOICES=[{id:'loft',name:'Güneşli Ev',subtitle:'Tanıdık odalar, yüzlerce farklı kılık.',color:'#8c9c7c',preview:'/games/prop-hunt/maps/references/loft.jpeg',...mapSize(LOFT_ROOM)},...Object.values(maps).map(({id,name,subtitle,color,preview,room})=>({id,name,subtitle,color,preview,...mapSize(room)}))];
export const validMap=id=>id==='loft'||Object.hasOwn(MAPS,id);
