(() => {
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const minimap = document.querySelector('#minimap');
  const mini = minimap.getContext('2d');
  const WORLD = 6000;
  const frame = document.querySelector('#gameFrame');
  const ui = {
    timer: document.querySelector('#timer'), kills: document.querySelector('#kills'), level: document.querySelector('#level'), stage: document.querySelector('#stage'),
    hpBar: document.querySelector('#hpBar'), hpText: document.querySelector('#hpText'), xpBar: document.querySelector('#xpBar'),
    start: document.querySelector('#startOverlay'), levelUp: document.querySelector('#levelOverlay'), gameOver: document.querySelector('#gameOverOverlay'),
    upgrades: document.querySelector('#upgradeGrid'), chat: document.querySelector('#chatLog'), chaos: document.querySelector('#chaosBar'), chaosText: document.querySelector('#chaosText'),
    warning: document.querySelector('#bossWarning'), final: document.querySelector('#finalScore'), voteTimer: document.querySelector('#voteTimer'), stageBanner: document.querySelector('#stageBanner'), awakenBanner: document.querySelector('#awakenBanner'), weaponRack: document.querySelector('#weaponRack'), raidHud: document.querySelector('#raidBossHud'), raidBar: document.querySelector('#raidBossBar'), raidPhase: document.querySelector('#raidBossPhase'), raidName: document.querySelector('#raidBossName')
  };
  const names = ['하늘다람쥐','김치전사','라면국물','새벽두시','무빙장인','돌멩이','고양이발'];
  const keys = new Set();
  const connectionStatus = document.querySelector('#connectionStatus');
  let state, last = 0, raf, spawnClock = 0, shotClock = 0;

  function freshState() {
    return { running:false, paused:false, over:false, time:0, kills:0, level:1, stage:1, xp:0, need:12, chaos:0, shield:0, slow:0, blackout:0, jam:0, confuse:0, voteCounts:[0,0,0], voters:new Set(),
      weaponClock:{nova:0,lightning:0,missile:0}, weapons:{rifle:1,orbit:0,nova:0,lightning:0,missile:0,saw:0}, awakened:{},
      player:{x:WORLD/2,y:WORLD/2,r:13,hp:100,maxHp:100,speed:205,damage:20,fireRate:.48,weaponCooldown:1,bulletSpeed:560,multishot:1,armor:0,magnet:70}, enemies:[], bullets:[], enemyBullets:[], gems:[], particles:[], effects:[], hazards:[] };
  }
  state = freshState();

  function resize(){ const dpr=Math.min(devicePixelRatio||1,2); const r=frame.getBoundingClientRect(); canvas.width=r.width*dpr; canvas.height=r.height*dpr; canvas.style.width=r.width+'px';canvas.style.height=r.height+'px';ctx.setTransform(dpr,0,0,dpr,0,0) }
  addEventListener('resize',resize); resize();
  const size=()=>({w:canvas.clientWidth,h:canvas.clientHeight});
  const rand=(a,b)=>a+Math.random()*(b-a);
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const stages=[
    {name:'격리 구역',color:'#35f2d0',pool:['normal','normal','runner']},
    {name:'폐기물 처리장',color:'#ffd84d',pool:['normal','runner','tank']},
    {name:'붉은 연구소',color:'#ff536f',pool:['runner','tank','shooter']},
    {name:'공허 관문',color:'#9e6cff',pool:['tank','shooter','splitter']},
    {name:'무한 침식',color:'#ffffff',pool:['runner','tank','shooter','splitter']}
  ];
  const regionForStage=stage=>stages[Math.floor((stage-1)/15)%stages.length];
  const stageDuration=stage=>Math.min(45,15+(stage-1)*(30/69));
  function stageAtTime(time){let stage=1;while(time>=stageDuration(stage)){time-=stageDuration(stage);stage++}return stage}
  const landmarks=Array.from({length:70},(_,i)=>({x:180+(i*811)%5640,y:180+(i*1367)%5640,r:18+(i*17)%58}));
  const raidProfiles=[
    {name:'심연의 군주',mechanic:'barrage',color:'#ff176b',hint:'방사형 탄막'},
    {name:'시간 포식자',mechanic:'chrono',color:'#54d9ff',hint:'시간 감속과 나선탄'},
    {name:'군체 여왕',mechanic:'hive',color:'#72f58e',hint:'분열 군단 소환'},
    {name:'멸망의 눈',mechanic:'laser',color:'#d681ff',hint:'회전 레이저 십자포화'}
  ];

  function addChat(text,type='good',name=names[Math.floor(Math.random()*names.length)]){
    const el=document.createElement('div'),author=document.createElement('b'); el.className='chat '+type;author.textContent=name;el.append(author,document.createTextNode(text));ui.chat.append(el);ui.chat.scrollTop=ui.chat.scrollHeight;
    while(ui.chat.children.length>18)ui.chat.firstChild.remove();
  }
  function announce(text){addChat(text,'system','SYSTEM');}
  function floatText(text,color='#35f2d0'){const el=document.createElement('div');el.className='float-text';el.textContent=text;el.style.color=color;el.style.left='50%';el.style.top='40%';frame.append(el);setTimeout(()=>el.remove(),1300)}

  function spawnEnemy(kind){
    const {w,h}=size(),p=state.player,side=Math.floor(Math.random()*4),margin=90;let x,y;
    if(side===0){x=p.x+rand(-w*.65,w*.65);y=p.y-h*.6-margin}else if(side===1){x=p.x+w*.6+margin;y=p.y+rand(-h*.65,h*.65)}else if(side===2){x=p.x+rand(-w*.65,w*.65);y=p.y+h*.6+margin}else{x=p.x-w*.6-margin;y=p.y+rand(-h*.65,h*.65)}
    x=Math.max(20,Math.min(WORLD-20,x));y=Math.max(20,Math.min(WORLD-20,y));
    const stage=regionForStage(state.stage),hpScale=Math.pow(1.14,state.stage-1)*(1+state.time/600),damageScale=Math.pow(1.11,state.stage-1),speedScale=Math.min(1.55,Math.pow(1.04,state.stage-1));
    if(!kind)kind=stage.pool[Math.floor(Math.random()*stage.pool.length)];
    const raidTier=Math.max(1,Math.floor(state.stage/15)),raidProfile=raidProfiles[(raidTier-1)%raidProfiles.length],table={
      normal:{r:12,hp:28*hpScale,speed:65*speedScale,color:'#ff536f',damage:10*damageScale,xp:1},
      runner:{r:8,hp:18*hpScale,speed:125*speedScale,color:'#4be7ff',damage:8*damageScale,xp:1},
      tank:{r:21,hp:135*hpScale,speed:38*speedScale,color:'#9e6cff',damage:18*damageScale,xp:4},
      shooter:{r:13,hp:58*hpScale,speed:44*speedScale,color:'#ff9f43',damage:12*damageScale,xp:3,shootRate:Math.max(.8,2.4-state.stage*.12)},
      splitter:{r:16,hp:82*hpScale,speed:58*speedScale,color:'#64f58d',damage:12*damageScale,xp:3,split:true},
      elite:{r:25,hp:(260+state.level*40)*hpScale,speed:68*speedScale,color:'#ffd84d',damage:20*damageScale,xp:10},
      boss:{r:42,hp:(1100+state.stage*450)*hpScale,speed:44*speedScale,color:stage.color,damage:26*damageScale,xp:35,boss:true},
      raidBoss:{r:74,hp:50000*Math.pow(1.8,raidTier-1),speed:32,color:raidProfile.color,damage:42+raidTier*8,xp:250*raidTier,boss:true,raid:true,raidName:raidProfile.name,mechanic:raidProfile.mechanic,hint:raidProfile.hint,shootRate:2.2,summonClock:5}
    };
    const stats=table[kind]||table.normal;
    state.enemies.push({x,y,kind,maxHp:stats.hp,shootClock:rand(.5,2),...stats});
  }
  function burst(x,y,color,count=8){for(let i=0;i<count;i++)state.particles.push({x,y,vx:rand(-90,90),vy:rand(-90,90),life:rand(.25,.7),color})}
  function command(cmd, remote=false, author='LOCAL'){
    if(!state.running||state.over)return;
    if(cmd.startsWith('vote')){castVote(Number(cmd.at(-1))-1,author);return}
    if(cmd==='heal'){state.player.hp=Math.min(state.player.maxHp,state.player.hp+28);if(!remote)addChat('!회복','good');floatText('+28 HP')}
    if(cmd==='supply'){for(let i=0;i<8;i++)state.gems.push({x:state.player.x+rand(-110,110),y:state.player.y+rand(-110,110),r:6,value:2});if(!remote)addChat('!보급','good');floatText('SUPPLY DROP','#35f2d0')}
    if(cmd==='shield'){state.shield=6;if(!remote)addChat('!실드','good');floatText('SHIELD 6s','#6ee7ff')}
    if(cmd==='horde'){for(let i=0;i<12;i++)spawnEnemy();if(!remote)addChat('!몹 ㅋㅋㅋㅋ','bad');floatText('HORDE!','#ff3d81');state.chaos+=9}
    if(cmd==='elite'){spawnEnemy('elite');if(!remote)addChat('!정예','bad');floatText('ELITE INBOUND','#ffd84d');state.chaos+=15}
    if(cmd==='boss'){spawnEnemy('boss');if(!remote)addChat('!보스','bad');ui.warning.classList.add('show');setTimeout(()=>ui.warning.classList.remove('show'),2600);state.chaos+=20}
    if(cmd==='blackout'){state.blackout=7;if(!remote)addChat('!암전','bad');floatText('BLACKOUT 7s','#ff3d81');state.chaos+=12}
    if(cmd==='slow'){state.slow=Math.max(state.slow,6);if(!remote)addChat('!둔화','bad');floatText('MOVEMENT -52%','#ff3d81');state.chaos+=10}
    if(cmd==='jam'){state.jam=5;if(!remote)addChat('!봉인','bad');floatText('WEAPONS JAMMED','#ff3d81');state.chaos+=14}
    if(cmd==='teleport'){state.player.x=rand(500,WORLD-500);state.player.y=rand(500,WORLD-500);if(!remote)addChat('!텔포','bad');floatText('FORCED WARP','#ff3d81');state.chaos+=15}
    if(cmd==='minefield'){for(let i=0;i<12;i++){const a=i*Math.PI*2/12+rand(-.18,.18),r=rand(70,190);state.hazards.push({x:state.player.x+Math.cos(a)*r,y:state.player.y+Math.sin(a)*r,r:22,life:12,arm:1.2})}if(!remote)addChat('!지뢰','bad');floatText('MINEFIELD','#ff3d81');state.chaos+=16}
    if(cmd==='confuse'){state.confuse=7;if(!remote)addChat('!혼란','bad');floatText('CONTROLS REVERSED','#ff3d81');state.chaos+=12}
    if(state.chaos>=100){state.chaos=0;for(let i=0;i<18;i++)spawnEnemy();spawnEnemy('elite');announce('혼돈 한계 돌파! 강제 웨이브가 시작됩니다.');floatText('CHAOS BREAK','#ff355f')}
    state.chaos=Math.min(100,state.chaos);updateUI();
  }
  document.querySelectorAll('[data-command]').forEach(b=>b.onclick=()=>command(b.dataset.command));
  const broadcastTestPanel = document.querySelector('#broadcastTestPanel');
  addEventListener('keydown', event=>{
    if(event.key!=='F10')return;
    event.preventDefault();
    const hidden=broadcastTestPanel.classList.toggle('is-hidden');
    broadcastTestPanel.setAttribute('aria-hidden',String(hidden));
  });

  function setConnection(status) {
    connectionStatus.className = status.connected ? 'connected' : status.error ? 'error' : '';
    connectionStatus.textContent = status.connected ? `● LIVE · ${status.title}` : status.error || (status.configured ? '방송 URL을 입력하세요.' : '서버에 API 키 설정이 필요합니다.');
  }
  fetch('/api/status').then(r=>r.json()).then(setConnection).catch(()=>setConnection({error:'YouTube 연동 서버가 실행되지 않았습니다.'}));
  const eventSource = new EventSource('/api/events');
  eventSource.addEventListener('status', event=>setConnection(JSON.parse(event.data)));
  eventSource.addEventListener('chat', event=>{const data=JSON.parse(event.data);addChat(data.text,'good',data.author)});
  eventSource.addEventListener('command', event=>{const data=JSON.parse(event.data);command(data.command,true,data.author);});
  eventSource.onerror=()=>{ if(!connectionStatus.classList.contains('connected')) setConnection({error:'채팅 서버 연결을 확인하세요.'}); };
  document.querySelector('#youtubeConnect').addEventListener('submit',async event=>{
    event.preventDefault(); const button=event.currentTarget.querySelector('button'); button.disabled=true;connectionStatus.className='';connectionStatus.textContent='방송을 확인하는 중…';
    try {const response=await fetch('/api/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({video:new FormData(event.currentTarget).get('video')})});const data=await response.json();if(!response.ok)throw new Error(data.error);setConnection(data);}
    catch(error){setConnection({error:error.message})} finally{button.disabled=false}
  });

  // Expose the same mock-chat action to WebMCP-capable browsers and agents.
  if (document.modelContext?.registerTool) {
    try {
      document.modelContext.registerTool({
        name:'trigger_mock_chat_event', title:'모의 채팅 이벤트 실행',
        description:'현재 게임에 회복, 적 떼, 빙결, 폭탄, 과충전 또는 보스 시청자 이벤트를 한 번 실행합니다.',
        inputSchema:{type:'object',properties:{event:{type:'string',enum:['heal','supply','shield','horde','elite','boss','blackout','slow','jam','teleport','minefield','confuse']}},required:['event'],additionalProperties:false},
        annotations:{readOnlyHint:false,untrustedContentHint:false},
        execute(input){
          if(!input||!['heal','supply','shield','horde','elite','boss','blackout','slow','jam','teleport','minefield','confuse'].includes(input.event)) throw new Error('지원하지 않는 이벤트입니다.');
          if(!state.running||state.over) throw new Error('게임이 진행 중일 때만 이벤트를 실행할 수 있습니다.');
          command(input.event); return {ok:true,event:input.event};
        }
      });
    } catch (error) { console.warn('WebMCP tool registration failed', error); }
  }

  const awakenNames={rifle:'성운 분쇄포',orbit:'항성 고리',nova:'제로 포인트 필드',lightning:'천뢰 네트워크',missile:'종말 유도탄',saw:'차원 절단륜'};
  const evolutionNames={
    rifle:{30:'은하 붕괴포',50:'차원 관통포',100:'창세 종결자'},orbit:{30:'행성 파쇄환',50:'사건의 지평선',100:'무한 우주륜'},
    nova:{30:'초신성 노심',50:'특이점 폭발로',100:'빅뱅 엔진'},lightning:{30:'천벌 성운망',50:'인과 절단뢰',100:'전지전능 뇌신'},
    missile:{30:'성계 소거탄',50:'시공 붕괴탄',100:'최후 심판탄'},saw:{30:'공간 분쇄륜',50:'차원 소멸륜',100:'윤회 종결륜'}
  };
  const evolutionLevel=key=>state.weapons[key]>=100?3:state.weapons[key]>=50?2:state.weapons[key]>=30?1:0;
  const weaponPower=key=>Math.pow(1.45,Math.max(0,state.weapons[key]-5))*Math.pow(3,evolutionLevel(key));
  const weaponCycle=key=>Math.max(.28,Math.pow(.96,Math.max(0,state.weapons[key]-5)));
  const cooldownFactor=key=>Math.max(.01,state.player.weaponCooldown*weaponCycle(key));
  function levelWeapon(key){state.weapons[key]++;const level=state.weapons[key],evolved=evolutionNames[key]?.[level];if(level>=5&&!state.awakened[key]){state.awakened[key]=true;const name=awakenNames[key];ui.awakenBanner.querySelector('b').textContent=name;ui.awakenBanner.classList.remove('show');void ui.awakenBanner.offsetWidth;ui.awakenBanner.classList.add('show');announce(`무기 각성 · ${name}!`);floatText('WEAPON AWAKENED','#d9a8ff')}else if(evolved){ui.awakenBanner.querySelector('b').textContent=evolved;ui.awakenBanner.classList.remove('show');void ui.awakenBanner.offsetWidth;ui.awakenBanner.classList.add('show');announce(`무기 진화 LV.${level} · ${evolved}!`);floatText(`EVOLUTION LV.${level}`,'#ffd84d')}else if(level>5){floatText(`${awakenNames[key]} +${level-5}`,'#d9a8ff')}}
  const upgradePool=[
    {icon:'⚡',name:'급속 장전',desc:'펄스 라이플 연사 속도 +18%',apply:()=>{state.player.fireRate*=.82;levelWeapon('rifle')}},
    {icon:'◆',name:'관통 탄자',desc:'라이플 피해 +10, 관통 +1',apply:()=>{state.player.damage+=10;state.player.pierce=(state.player.pierce||0)+1;levelWeapon('rifle')}},
    {icon:'⟁',name:'분열 사격',desc:'라이플 동시 발사체 +1',apply:()=>{state.player.multishot=Math.min(8,state.player.multishot+1);levelWeapon('rifle')}},
    {icon:'◌',name:'궤도 드론',desc:'회전 드론 추가 또는 위력 강화',apply:()=>levelWeapon('orbit')},
    {icon:'◎',name:'충격파 코어',desc:'주기적으로 전방위 충격파 발생',apply:()=>levelWeapon('nova')},
    {icon:'ϟ',name:'테슬라 릴레이',desc:'여러 적을 잇는 연쇄 번개',apply:()=>levelWeapon('lightning')},
    {icon:'➤',name:'추적 미사일',desc:'가장 강한 적에게 폭발탄 발사',apply:()=>levelWeapon('missile')},
    {icon:'✹',name:'톱날 오라',desc:'근접한 적에게 지속 피해',apply:()=>levelWeapon('saw')},
    {icon:'◉',name:'강화 외골격',desc:'최대 체력 +30, 체력 30 회복',apply:()=>{state.player.maxHp+=30;state.player.hp=Math.min(state.player.maxHp,state.player.hp+30)}},
    {icon:'◇',name:'반응 장갑',desc:'받는 피해 12% 감소',apply:()=>state.player.armor=Math.min(.6,state.player.armor+.12)},
    {icon:'»',name:'벡터 부츠',desc:'이동 속도 +14%',apply:()=>state.player.speed*=1.14},
    {icon:'✦',name:'중력 수집기',desc:'경험치 획득 범위 +45',apply:()=>state.player.magnet+=45},
    {icon:'⬢',name:'과충전 탄두',desc:'모든 무기 피해 +20%',apply:()=>state.player.damage*=1.2},
    {icon:'⌁',name:'시간 가속기',desc:'모든 무기 공격 주기 -10% (통합 쿨감 최대 99%)',apply:()=>state.player.weaponCooldown*=.9}
  ];
  function showUpgrade(){state.paused=true;state.voteCounts=[0,0,0];state.voters=new Set();ui.levelUp.classList.remove('hidden');ui.upgrades.innerHTML='';state.currentPicks=[...upgradePool].sort(()=>Math.random()-.5).slice(0,3);state.currentPicks.forEach((u,i)=>{const b=document.createElement('button');b.className='upgrade';b.innerHTML=`<kbd>${i+1}</kbd><span class="icon">${u.icon}</span><b>${u.name}</b><small>${u.desc}</small><span class="vote-count">0표</span><span class="votes"><i></i></span>`;b.onclick=()=>castVote(i,'LOCAL');ui.upgrades.append(b)});let left=10;ui.voteTimer.textContent=left;clearInterval(state.voteTimer);state.voteTimer=setInterval(()=>{ui.voteTimer.textContent=--left;if(left<=0)resolveVote()},1000)}
  function castVote(index,author){if(!state.paused||!state.currentPicks?.[index]||state.voters.has(author))return;state.voters.add(author);state.voteCounts[index]++;const max=Math.max(...state.voteCounts,1);[...ui.upgrades.children].forEach((card,i)=>{card.querySelector('.vote-count').textContent=`${state.voteCounts[i]}표`;card.querySelector('.votes i').style.width=(state.voteCounts[i]/max*100)+'%'});if(author==='LOCAL')announce(`${index+1}번 강화에 테스트 투표했습니다.`)}
  function resolveVote(){if(!state.paused)return;clearInterval(state.voteTimer);let max=Math.max(...state.voteCounts);let candidates=state.voteCounts.map((v,i)=>v===max?i:-1).filter(i=>i>=0);const winner=candidates[Math.floor(Math.random()*candidates.length)];const upgrade=state.currentPicks[winner];upgrade.apply();ui.levelUp.classList.add('hidden');state.paused=false;announce(`${winner+1}번 ${upgrade.name} 강화 확정! (${state.voteCounts[winner]}표)`)}

  function start(){cancelAnimationFrame(raf);clearInterval(state.voteTimer);state=freshState();state.running=true;ui.start.classList.add('hidden');ui.gameOver.classList.add('hidden');ui.levelUp.classList.add('hidden');ui.chat.innerHTML='';announce('6×6km 전투 구역에 진입했습니다.');announce('시청자는 지원, 방해, 강화 투표로 개입할 수 있습니다.');last=performance.now();raf=requestAnimationFrame(loop)}
  document.querySelector('#startBtn').onclick=start;document.querySelector('#restartBtn').onclick=start;
  addEventListener('keydown',e=>{keys.add(e.key.toLowerCase());if(e.key==='Enter'&&!state.running)start();if((e.key==='r'||e.key==='R')&&state.over)start();if(state.paused&&'123'.includes(e.key)){ui.upgrades.children[+e.key-1]?.click()}});
  addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  document.querySelectorAll('[data-key]').forEach(b=>{const k=b.dataset.key.toLowerCase();['pointerdown','pointerenter'].forEach(ev=>b.addEventListener(ev,e=>{if(e.buttons!==0||ev==='pointerdown')keys.add(k)}));['pointerup','pointerleave','pointercancel'].forEach(ev=>b.addEventListener(ev,()=>keys.delete(k)))});

  function defeat(e){
    if(e.dead)return;e.dead=true;state.kills++;state.gems.push({x:e.x,y:e.y,r:e.boss?9:5,value:e.xp});burst(e.x,e.y,e.color,e.boss?30:8);
    if(e.split)for(let i=0;i<2;i++)state.enemies.push({x:e.x+rand(-10,10),y:e.y+rand(-10,10),kind:'runner',r:7,hp:14,maxHp:14,speed:140,color:'#64f58d',damage:7,xp:1,shootClock:9});if(e.raid){state.enemyBullets=[];state.player.hp=Math.min(state.player.maxHp,state.player.hp+50);announce('레이드 보스 격파! 체력 50 회복.');floatText('RAID CLEARED','#ffd84d')}
  }
  function hurt(e,amount){if(e.dead)return;e.hp-=amount;if(e.hp<=0)defeat(e)}
  function enterStage(number){
    state.stage=number;const raid=number%15===0,info=regionForStage(number),profile=raidProfiles[(Math.floor(number/15)-1)%raidProfiles.length];ui.stageBanner.querySelector('small').textContent=raid?`RAID STAGE ${number}`:`STAGE ${number}`;ui.stageBanner.querySelector('b').textContent=raid?`${profile.name} 강림`:info.name;ui.stageBanner.style.borderColor=raid?profile.color:info.color;ui.stageBanner.classList.remove('show');void ui.stageBanner.offsetWidth;ui.stageBanner.classList.add('show');if(raid){const removed=state.enemies.filter(e=>!e.raid).length;state.enemies=[];state.enemyBullets=[];spawnEnemy('raidBoss');ui.raidName.textContent=profile.name;announce(`레이드 개시! 잡몹 ${removed}마리 소멸 · ${profile.name} (${profile.hint})`);ui.warning.textContent=`⚠ RAID BOSS // ${profile.name}`}else{spawnEnemy('boss');announce(`STAGE ${number} · ${info.name} 진입. 보스 출현!`);ui.warning.textContent='⚠ STAGE BOSS INCOMING'}ui.warning.classList.add('show');setTimeout(()=>ui.warning.classList.remove('show'),2600)
  }
  function fireWeapons(dt){
    const p=state.player;
    if(state.weapons.nova){state.weaponClock.nova-=dt;if(state.weaponClock.nova<=0){const awake=state.awakened.nova,radius=awake?210:105+state.weapons.nova*18;state.effects.push({kind:'nova',x:p.x,y:p.y,r:radius,life:.45,color:awake?'#d9a8ff':'#35f2d0'});state.enemies.forEach(e=>{if(dist(e,p)<radius)hurt(e,p.damage*(awake?3.2:1.1+state.weapons.nova*.35)*weaponPower('nova'))});state.weaponClock.nova=(awake?1.25:Math.max(2.2,5-state.weapons.nova*.45))*cooldownFactor('nova')}}
    if(state.weapons.lightning){state.weaponClock.lightning-=dt;if(state.weaponClock.lightning<=0){const awake=state.awakened.lightning,targets=[...state.enemies].sort((a,b)=>dist(a,p)-dist(b,p)).slice(0,Math.min(18,(awake?7:2)+state.weapons.lightning));let from={x:p.x,y:p.y};for(const e of targets){state.effects.push({kind:'line',x:from.x,y:from.y,x2:e.x,y2:e.y,life:awake?.35:.22,color:awake?'#d9a8ff':'#72e8ff'});hurt(e,p.damage*(awake?3:1.3+state.weapons.lightning*.25)*weaponPower('lightning'));from=e}state.weaponClock.lightning=(awake?.7:Math.max(1.1,3.6-state.weapons.lightning*.35))*cooldownFactor('lightning')}}
    if(state.weapons.missile){state.weaponClock.missile-=dt;if(state.weaponClock.missile<=0&&state.enemies.length){const awake=state.awakened.missile,count=awake?3:1;for(let i=0;i<count;i++){const target=[...state.enemies].sort((a,b)=>b.hp-a.hp)[i%state.enemies.length],a=Math.atan2(target.y-p.y,target.x-p.x)+(i-1)*.12;state.bullets.push({x:p.x,y:p.y,vx:Math.cos(a)*310,vy:Math.sin(a)*310,r:awake?10:7,life:3,missile:true,awakened:awake,damage:p.damage*(awake?5:2+state.weapons.missile*.5)*weaponPower('missile'),target})}state.weaponClock.missile=(awake?.85:Math.max(1.3,3.4-state.weapons.missile*.35))*cooldownFactor('missile')}}
    if(state.weapons.saw)state.enemies.forEach(e=>{const awake=state.awakened.saw;if(dist(e,p)<(awake?92:48+state.weapons.saw*5))hurt(e,p.damage*state.weapons.saw*(awake?1.7:.8)*weaponPower('saw')*dt/cooldownFactor('saw'))});
  }
  function raidAttack(e,phase,a,dt){
    e.shootClock-=dt;e.summonClock-=dt;
    if(e.mechanic==='hive'&&e.summonClock<=0){for(let i=0;i<phase*3;i++){spawnEnemy(i%2?'runner':'splitter');const mob=state.enemies.at(-1),angle=i*Math.PI*2/(phase*3);mob.x=e.x+Math.cos(angle)*(e.r+45);mob.y=e.y+Math.sin(angle)*(e.r+45)}e.summonClock=Math.max(2.5,6-phase)}
    if(e.shootClock>0)return;
    if(e.mechanic==='barrage'){const count=phase===1?12:phase===2?18:28,offset=state.time*.55;for(let i=0;i<count;i++){const ba=offset+i*Math.PI*2/count;state.enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(ba)*(125+phase*25),vy:Math.sin(ba)*(125+phase*25),r:5+phase,life:6,damage:e.damage*.45})}}
    if(e.mechanic==='chrono'){state.slow=2.8;state.effects.push({kind:'nova',x:state.player.x,y:state.player.y,r:125,life:1.2,color:'#54d9ff'});const count=10+phase*5;for(let i=0;i<count;i++){const ba=state.time*1.8+i*Math.PI*2/count;state.enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(ba)*(90+i*5),vy:Math.sin(ba)*(90+i*5),r:6,life:7,damage:e.damage*.38})}}
    if(e.mechanic==='hive'){for(let i=0;i<6+phase*2;i++){const ba=i*Math.PI*2/(6+phase*2);state.enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(ba)*135,vy:Math.sin(ba)*135,r:5,life:5,damage:e.damage*.35})}}
    if(e.mechanic==='laser'){const beams=phase+1;for(let i=0;i<beams;i++){const ba=state.time*.8+i*Math.PI/beams,x2=e.x+Math.cos(ba)*1100,y2=e.y+Math.sin(ba)*1100;state.effects.push({kind:'line',x:e.x-Math.cos(ba)*1100,y:e.y-Math.sin(ba)*1100,x2,y2,life:.65,color:'#d681ff'});const vx=state.player.x-e.x,vy=state.player.y-e.y;if(Math.abs(vx*Math.sin(ba)-vy*Math.cos(ba))<22&&!state.shield)state.player.hp-=e.damage*(1-state.player.armor)*.8}}
    if(phase>=2&&e.mechanic!=='laser')for(let i=-2;i<=2;i++){const ba=a+i*.11;state.enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(ba)*230,vy:Math.sin(ba)*230,r:7,life:5,damage:e.damage*.6})}
    e.shootClock=e.mechanic==='laser'?Math.max(1.2,3.4-phase*.45):Math.max(.65,e.shootRate-phase*.42);
  }

  function update(dt){
    const p=state.player,{w,h}=size(); state.time+=dt;state.shield=Math.max(0,state.shield-dt);state.slow=Math.max(0,state.slow-dt);state.blackout=Math.max(0,state.blackout-dt);state.jam=Math.max(0,state.jam-dt);state.confuse=Math.max(0,state.confuse-dt);state.chaos=Math.max(0,state.chaos-dt*.3);const stageNow=stageAtTime(state.time);if(stageNow>state.stage)enterStage(stageNow);
    let dx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),dy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);if(state.confuse){dx=-dx;dy=-dy}let l=Math.hypot(dx,dy)||1,moveSpeed=p.speed*(state.slow?.48:1);p.x=Math.max(p.r,Math.min(WORLD-p.r,p.x+dx/l*moveSpeed*dt));p.y=Math.max(p.r,Math.min(WORLD-p.r,p.y+dy/l*moveSpeed*dt));
    spawnClock-=dt;const raidAlive=state.enemies.some(e=>e.raid),bossAlive=state.enemies.some(e=>e.boss&&!e.raid),interval=Math.max(.22,.62-state.stage*.025-state.time/1800);if(!raidAlive&&spawnClock<=0&&state.enemies.length<320){const baseBatch=Math.min(7,2+Math.ceil(state.stage/2)+Math.floor(state.time/300)),batch=bossAlive?Math.ceil(baseBatch*.5):baseBatch;for(let i=0;i<batch;i++)spawnEnemy();spawnClock=interval}
    shotClock-=dt;const target=state.enemies.reduce((best,e)=>!best||dist(p,e)<dist(p,best)?e:best,null);if(!state.jam&&target&&shotClock<=0){const awake=state.awakened.rifle,base=Math.atan2(target.y-p.y,target.x-p.x),count=p.multishot+(awake?2:0);for(let i=0;i<count;i++){const a=base+(i-(count-1)/2)*(awake?.11:.16);state.bullets.push({x:p.x,y:p.y,vx:Math.cos(a)*p.bulletSpeed,vy:Math.sin(a)*p.bulletSpeed,r:(p.bulletSize||4)+(awake?2:0),life:1.8,awakened:awake,damage:awake?p.damage*1.8*weaponPower('rifle'):null,pierce:(p.pierce||0)+(awake?3:0)})}shotClock=p.fireRate*(awake?.55:1)*cooldownFactor('rifle')}
    state.bullets.forEach(b=>{if(b.missile&&b.target&&!b.target.dead){const a=Math.atan2(b.target.y-b.y,b.target.x-b.x);b.vx+=Math.cos(a)*400*dt;b.vy+=Math.sin(a)*400*dt;const speed=Math.hypot(b.vx,b.vy);b.vx=b.vx/speed*330;b.vy=b.vy/speed*330}b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt});
    state.enemies.forEach(e=>{const d=dist(e,p),a=Math.atan2(p.y-e.y,p.x-e.x);if(e.raid){const phase=e.hp/e.maxHp>.66?1:e.hp/e.maxHp>.33?2:3;if(d>190)e.x+=Math.cos(a)*e.speed*dt,e.y+=Math.sin(a)*e.speed*dt;raidAttack(e,phase,a,dt)}else if(e.kind==='shooter'&&d<300){e.shootClock-=dt;if(e.shootClock<=0){state.enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(a)*150,vy:Math.sin(a)*150,r:5,life:4,damage:e.damage});e.shootClock=e.shootRate}}else{e.x+=Math.cos(a)*e.speed*dt;e.y+=Math.sin(a)*e.speed*dt}if(d<e.r+p.r){if(!state.shield)p.hp-=e.damage*(1-p.armor)*dt;e.x-=Math.cos(a)*25*dt;e.y-=Math.sin(a)*25*dt}const orbitCount=Math.min(12,state.weapons.orbit);for(let i=0;i<orbitCount;i++){const awake=state.awakened.orbit,radius=awake?68:52,oa=state.time*(awake?3.6:2.4)/cooldownFactor('orbit')+i*Math.PI*2/orbitCount,orb={x:p.x+Math.cos(oa)*radius,y:p.y+Math.sin(oa)*radius};if(dist(e,orb)<e.r+(awake?11:7)&&(!e.orbitHit||e.orbitHit<state.time)){hurt(e,p.damage*(awake?2.2:.6+state.weapons.orbit*.12)*weaponPower('orbit'));e.orbitHit=state.time+(awake?.18:.35)*cooldownFactor('orbit')}}});
    state.enemyBullets.forEach(b=>{b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(dist(b,p)<b.r+p.r){if(!state.shield)p.hp-=b.damage*(1-p.armor);b.dead=true;burst(b.x,b.y,'#ff9f43',5)}});
    for(const b of state.bullets)for(const e of state.enemies)if(!b.dead&&!e.dead&&b.lastHit!==e&&dist(b,e)<b.r+e.r){hurt(e,b.damage||p.damage);b.lastHit=e;b.hits=(b.hits||0)+1;if(b.missile){const radius=b.awakened?120:65;state.effects.push({kind:'nova',x:b.x,y:b.y,r:radius,life:.35,color:b.awakened?'#d9a8ff':'#ffd84d'});state.enemies.forEach(other=>{if(dist(other,b)<radius)hurt(other,(b.damage||p.damage)*(b.awakened?.8:.55))});b.dead=true}else if(b.hits>(b.pierce??p.pierce??0))b.dead=true;burst(b.x,b.y,e.color,3)}
    if(!state.jam)fireWeapons(dt);
    state.hazards.forEach(m=>{m.arm-=dt;m.life-=dt;if(m.arm<=0&&!m.dead&&dist(m,p)<m.r+p.r){m.dead=true;if(!state.shield)p.hp-=24*(1-p.armor);state.effects.push({kind:'nova',x:m.x,y:m.y,r:75,life:.45,color:'#ff355f'});burst(m.x,m.y,'#ff355f',16)}});
    state.gems.forEach(g=>{const d=dist(g,p);if(d<(p.magnet||70)){const a=Math.atan2(p.y-g.y,p.x-g.x);g.x+=Math.cos(a)*320*dt;g.y+=Math.sin(a)*320*dt}if(d<p.r+g.r+3){g.dead=true;state.xp+=g.value}});
    state.particles.forEach(q=>{q.x+=q.vx*dt;q.y+=q.vy*dt;q.life-=dt});state.effects.forEach(e=>e.life-=dt);state.bullets=state.bullets.filter(b=>!b.dead&&b.life>0);state.enemyBullets=state.enemyBullets.filter(b=>!b.dead&&b.life>0);state.enemies=state.enemies.filter(e=>!e.dead);state.gems=state.gems.filter(g=>!g.dead);state.particles=state.particles.filter(q=>q.life>0);state.effects=state.effects.filter(e=>e.life>0);state.hazards=state.hazards.filter(m=>!m.dead&&m.life>0);
    if(state.xp>=state.need){state.xp-=state.need;state.level++;state.need=Math.round(state.need*1.3);showUpgrade()}
    if(p.hp<=0){p.hp=0;state.over=true;state.running=false;ui.final.textContent=`${Math.floor(state.time)}초 생존 · ${state.kills}마리 처치 · 레벨 ${state.level}`;ui.gameOver.classList.remove('hidden')}
    updateUI();
  }
  function updateUI(){const m=Math.floor(state.time/60),s=Math.floor(state.time%60);ui.timer.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;ui.kills.textContent=state.kills;ui.level.textContent=state.level;ui.stage.textContent=state.stage;ui.hpBar.style.width=(state.player.hp/state.player.maxHp*100)+'%';ui.hpText.textContent=`${Math.ceil(state.player.hp)} / ${state.player.maxHp}`;ui.xpBar.style.width=(state.xp/state.need*100)+'%';ui.chaos.style.width=state.chaos+'%';ui.chaosText.textContent=Math.round(state.chaos)+'%';const raid=state.enemies.find(e=>e.raid&&!e.dead);ui.raidHud.classList.toggle('show',Boolean(raid));if(raid){const ratio=raid.hp/raid.maxHp;ui.raidBar.style.width=Math.max(0,ratio*100)+'%';ui.raidPhase.textContent=`PHASE ${ratio>.66?1:ratio>.33?2:3} · RAID STAGE ${state.stage}`}const icons={rifle:'◆',orbit:'◌',nova:'◎',lightning:'ϟ',missile:'➤',saw:'✹'};const rack=Object.entries(state.weapons).filter(([,v])=>v>0).map(([k,v])=>`<span class="weapon-chip ${state.awakened[k]?'awakened':''}" title="${state.awakened[k]?awakenNames[k]:'각성까지 '+Math.max(0,5-v)+'레벨'}"><i>${icons[k]}</i><b>${state.awakened[k]?'AWK':`LV.${v}`}</b></span>`).join('');if(ui.weaponRack.innerHTML!==rack)ui.weaponRack.innerHTML=rack}
  function draw(){const {w,h}=size(),focus=state.player;ctx.clearRect(0,0,w,h);ctx.fillStyle='#090c16';ctx.fillRect(0,0,w,h);ctx.save();ctx.translate(w/2-focus.x,h/2-focus.y);ctx.strokeStyle='#182036';ctx.lineWidth=1;const minX=Math.max(0,Math.floor((focus.x-w/2)/48)*48),maxX=Math.min(WORLD,focus.x+w/2),minY=Math.max(0,Math.floor((focus.y-h/2)/48)*48),maxY=Math.min(WORLD,focus.y+h/2);for(let x=minX;x<=maxX;x+=48){ctx.beginPath();ctx.moveTo(x,minY);ctx.lineTo(x,maxY);ctx.stroke()}for(let y=minY;y<=maxY;y+=48){ctx.beginPath();ctx.moveTo(minX,y);ctx.lineTo(maxX,y);ctx.stroke()}ctx.strokeStyle='#526078';ctx.lineWidth=8;ctx.strokeRect(0,0,WORLD,WORLD);landmarks.forEach(o=>{if(Math.abs(o.x-focus.x)<w&&Math.abs(o.y-focus.y)<h){ctx.strokeStyle='#1e293b';ctx.lineWidth=4;ctx.beginPath();ctx.arc(o.x,o.y,o.r,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#111827';ctx.fillRect(o.x-o.r*.45,o.y-o.r*.45,o.r*.9,o.r*.9)}});
    state.gems.forEach(g=>{ctx.save();ctx.translate(g.x,g.y);ctx.rotate(state.time*2);ctx.fillStyle='#35f2d0';ctx.shadowBlur=12;ctx.shadowColor='#35f2d0';ctx.fillRect(-g.r/2,-g.r/2,g.r,g.r);ctx.restore()});state.hazards.forEach(m=>{ctx.save();ctx.translate(m.x,m.y);ctx.strokeStyle=m.arm>0?'#ffd84d':'#ff355f';ctx.fillStyle='#290914';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,m.r,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.rotate(state.time*2);for(let i=0;i<6;i++){ctx.rotate(Math.PI/3);ctx.fillRect(m.r-4,-2,8,4)}ctx.restore()});
    state.particles.forEach(q=>{ctx.globalAlpha=Math.min(1,q.life*3);ctx.fillStyle=q.color;ctx.fillRect(q.x,q.y,3,3)});ctx.globalAlpha=1;state.effects.forEach(e=>{ctx.globalAlpha=Math.min(1,e.life*4);ctx.strokeStyle=e.color;ctx.lineWidth=e.kind==='line'?3:5;ctx.shadowBlur=15;ctx.shadowColor=e.color;ctx.beginPath();if(e.kind==='line'){ctx.moveTo(e.x,e.y);ctx.lineTo(e.x2,e.y2)}else ctx.arc(e.x,e.y,e.r*(1-e.life*.7),0,Math.PI*2);ctx.stroke()});ctx.globalAlpha=1;ctx.shadowBlur=0;
    state.bullets.forEach(b=>{ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fillStyle=b.awakened?'#d9a8ff':b.missile?'#ff8d3b':'#f5d64b';ctx.shadowBlur=b.awakened?20:12;ctx.shadowColor=ctx.fillStyle;ctx.fill()});state.enemyBullets.forEach(b=>{ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fillStyle='#ff6b43';ctx.shadowBlur=10;ctx.shadowColor='#ff6b43';ctx.fill()});ctx.shadowBlur=0;
    state.enemies.forEach(e=>{ctx.save();ctx.translate(e.x,e.y);ctx.rotate(Math.atan2(state.player.y-e.y,state.player.x-e.x));ctx.fillStyle=e.color;ctx.shadowBlur=e.kind==='boss'?25:7;ctx.shadowColor=e.color;ctx.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,r=i%2?e.r*.72:e.r;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.fill();ctx.fillStyle='#090b12';ctx.fillRect(2,-5,e.r*.7,4);ctx.fillRect(2,4,e.r*.45,3);ctx.restore();if(e.kind==='boss'){ctx.fillStyle='#22283a';ctx.fillRect(e.x-35,e.y-e.r-12,70,5);ctx.fillStyle='#ff3d81';ctx.fillRect(e.x-35,e.y-e.r-12,70*(e.hp/e.maxHp),5)}});
    const p=state.player;if(state.weapons.saw){const awake=state.awakened.saw;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(-state.time*(awake?5:3));ctx.strokeStyle=awake?'#d9a8ff':'#ff8d3b';ctx.lineWidth=awake?6:3;ctx.setLineDash(awake?[14,5]:[8,7]);ctx.beginPath();ctx.arc(0,0,awake?92:48+state.weapons.saw*5,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.restore()}for(let i=0;i<state.weapons.orbit;i++){const awake=state.awakened.orbit,radius=awake?68:52,a=state.time*(awake?3.6:2.4)+i*Math.PI*2/state.weapons.orbit;ctx.beginPath();ctx.arc(p.x+Math.cos(a)*radius,p.y+Math.sin(a)*radius,awake?11:7,0,Math.PI*2);ctx.fillStyle=awake?'#d9a8ff':'#9e6cff';ctx.shadowBlur=awake?24:14;ctx.shadowColor=ctx.fillStyle;ctx.fill()}ctx.save();ctx.translate(p.x,p.y);ctx.rotate(state.time*2);ctx.strokeStyle=state.shield?'#6ee7ff':'#35f2d0';ctx.lineWidth=3;ctx.shadowBlur=18;ctx.shadowColor=state.shield?'#6ee7ff':'#35f2d0';if(state.shield){ctx.beginPath();ctx.arc(0,0,p.r+11,0,Math.PI*2);ctx.stroke()}ctx.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI/3;ctx.lineTo(Math.cos(a)*p.r,Math.sin(a)*p.r)}ctx.closePath();ctx.stroke();ctx.rotate(-state.time*4);ctx.fillStyle='#f4f6ff';ctx.fillRect(-4,-4,8,8);ctx.restore();ctx.shadowBlur=0;ctx.restore();if(state.blackout){ctx.fillStyle='rgba(0,0,0,.92)';ctx.fillRect(0,0,w,h);ctx.globalCompositeOperation='destination-out';const glow=ctx.createRadialGradient(w/2,h/2,18,w/2,h/2,95);glow.addColorStop(0,'rgba(0,0,0,1)');glow.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=glow;ctx.fillRect(w/2-100,h/2-100,200,200);ctx.globalCompositeOperation='source-over'}const debuffs=[];if(state.blackout)debuffs.push(`암전 ${Math.ceil(state.blackout)}s`);if(state.slow)debuffs.push(`둔화 ${Math.ceil(state.slow)}s`);if(state.jam)debuffs.push(`봉인 ${Math.ceil(state.jam)}s`);if(state.confuse)debuffs.push(`혼란 ${Math.ceil(state.confuse)}s`);if(debuffs.length){ctx.font="700 12px 'JetBrains Mono'";ctx.textAlign='center';ctx.fillStyle='#ff6d91';ctx.fillText(debuffs.join('  //  '),w/2,h-64)}drawMinimap();
  }
  function drawMinimap(){const w=minimap.width,h=minimap.height,p=state.player,s=w/WORLD;mini.clearRect(0,0,w,h);mini.fillStyle='#060910';mini.fillRect(0,0,w,h);mini.strokeStyle='#354157';mini.strokeRect(.5,.5,w-1,h-1);mini.fillStyle='#ff355f';for(let i=0;i<state.enemies.length;i+=Math.max(1,Math.ceil(state.enemies.length/160))){const e=state.enemies[i];mini.fillRect(e.x*s,e.y*s,e.boss?4:2,e.boss?4:2)}mini.fillStyle='#35f2d0';mini.beginPath();mini.arc(p.x*s,p.y*s,3.5,0,Math.PI*2);mini.fill();mini.strokeStyle='#71809b';const view=size();mini.strokeRect((p.x-view.w/2)*s,(p.y-view.h/2)*s,view.w*s,view.h*s)}
  function loop(t){const dt=Math.min(.033,(t-last)/1000);last=t;if(state.running&&!state.paused)update(dt);draw();if(!state.over)raf=requestAnimationFrame(loop)}
  addChat('게임 시작을 기다리는 중…','system','SYSTEM');draw();updateUI();
})();
