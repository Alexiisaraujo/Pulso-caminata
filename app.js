/* =========================================================
   PULSO — app.js
   Estado, persistencia, vistas, GPS, gráficos.
   Sin frameworks. Todo en localStorage.
   ========================================================= */

const LS_KEYS = {
  profile: 'pulso_profile',
  goals: 'pulso_goals',
  weights: 'pulso_weights',
  activities: 'pulso_activities',
  settings: 'pulso_settings',
  seeded: 'pulso_seeded'
};

const DAY_MS = 86400000;
const MET = { walk: 3.5, run: 9.8, bike: 7.5, other: 4.0 };
const ACTIVITY_LABEL = { walk: 'Caminar', run: 'Correr', bike: 'Bicicleta', other: 'Otra actividad' };

/* ---------------------------------------------------------
   Persistencia
   --------------------------------------------------------- */
const Store = {
  get(key, fallback){
    try{
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }catch(e){ return fallback; }
  },
  set(key, value){
    try{
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    }catch(e){
      toast('No se pudo guardar. El almacenamiento podría estar lleno.');
      return false;
    }
  }
};

function defaultProfile(){
  return { name:'', age:null, sex:'', height:null, weightInitial:110, weightCurrent:106.8, weightGoal:90, stepLength:0.75 };
}
function defaultGoals(){
  return { stepsGoal:10000, distanceGoal:7, weeklyStepsGoal:50000 };
}
function defaultSettings(){
  return { units:'kg_km', darkMode:true };
}

function todayISO(offsetDays){
  const d = new Date();
  if(offsetDays) d.setDate(d.getDate()+offsetDays);
  return d.toISOString().slice(0,10);
}

function seedDemoData(){
  if(Store.get(LS_KEYS.seeded, false)) return;
  Store.set(LS_KEYS.profile, defaultProfile());
  Store.set(LS_KEYS.goals, defaultGoals());
  Store.set(LS_KEYS.settings, defaultSettings());

  const weights = [];
  const seq = [110, 109.4, 108.8, 108.1, 107.6, 107.2, 106.8];
  seq.forEach((w,i)=>{
    weights.push({ date: todayISO(-(seq.length-1-i)*3), weight:w, demo:true });
  });
  Store.set(LS_KEYS.weights, weights);

  const activities = [
    { date: todayISO(0), steps:8432, distanceKm:6.2, calories:487, durationMin:78, type:'walk', source:'manual', demo:true },
    { date: todayISO(-1), steps:10231, distanceKm:7.4, calories:560, durationMin:92, type:'walk', source:'manual', demo:true },
    { date: todayISO(-2), steps:6820, distanceKm:4.8, calories:390, durationMin:64, type:'walk', source:'manual', demo:true },
    { date: todayISO(-3), steps:9120, distanceKm:6.6, calories:498, durationMin:80, type:'walk', source:'manual', demo:true },
    { date: todayISO(-4), steps:5210, distanceKm:3.7, calories:290, durationMin:48, type:'walk', source:'manual', demo:true },
  ];
  Store.set(LS_KEYS.activities, activities);
  Store.set(LS_KEYS.seeded, true);
}

function hasDemoData(){
  const w = Store.get(LS_KEYS.weights, []);
  const a = Store.get(LS_KEYS.activities, []);
  return w.some(x=>x.demo) || a.some(x=>x.demo);
}
function clearDemoData(){
  let w = Store.get(LS_KEYS.weights, []).filter(x=>!x.demo);
  let a = Store.get(LS_KEYS.activities, []).filter(x=>!x.demo);
  Store.set(LS_KEYS.weights, w);
  Store.set(LS_KEYS.activities, a);
  render();
  toast('Datos de demostración eliminados');
}
function wipeAllData(){
  Object.values(LS_KEYS).forEach(k=>localStorage.removeItem(k));
  seedDemoData();
  render();
  toast('Todos los datos fueron borrados');
}

/* ---------------------------------------------------------
   Utilidades
   --------------------------------------------------------- */
function fmt(n, decimals=0){
  if(n===null || n===undefined || isNaN(n)) return '—';
  return Number(n).toLocaleString('es-AR', { minimumFractionDigits:decimals, maximumFractionDigits:decimals });
}
function fmtDate(iso){
  const d = new Date(iso+'T00:00:00');
  return d.toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long' });
}
function weekdayShort(iso){
  const d = new Date(iso+'T00:00:00');
  const days = ['DOMINGO','LUNES','MARTES','MIÉRCOLES','JUEVES','VIERNES','SÁBADO'];
  return days[d.getDay()] + ' ' + d.getDate();
}
function toast(msg){
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(()=>el.remove(), 2600);
}
function haversine(lat1, lon1, lat2, lon2){
  const R = 6371;
  const dLat = (lat2-lat1) * Math.PI/180;
  const dLon = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function estimateCalories(type, weightKg, durationMin, speedKmh){
  let met = MET[type] || MET.other;
  if(type==='walk' && speedKmh){
    if(speedKmh > 6.5) met = 5.0;
    else if(speedKmh < 4) met = 2.8;
  }
  if(type==='run' && speedKmh){
    met = speedKmh >= 10 ? 11.5 : 9.0;
  }
  const hours = durationMin/60;
  return Math.round(met * (weightKg||75) * hours);
}

/* ---------------------------------------------------------
   Router
   --------------------------------------------------------- */
const VIEWS = ['inicio','actividad','historial','progreso','perfil'];
let currentView = 'inicio';

function navigate(view){
  currentView = view;
  document.querySelectorAll('.navbtn').forEach(b=>{
    b.classList.toggle('active', b.dataset.view===view);
  });
  render();
  document.querySelector('.views').scrollTo?.(0,0);
  window.scrollTo(0,0);
}

document.querySelectorAll('.navbtn').forEach(btn=>{
  btn.addEventListener('click', ()=>navigate(btn.dataset.view));
});
document.getElementById('btn-settings').addEventListener('click', ()=>navigate('perfil'));

/* ---------------------------------------------------------
   Render principal
   --------------------------------------------------------- */
function render(){
  const el = document.getElementById('views');
  if(currentView==='inicio') el.innerHTML = renderInicio();
  else if(currentView==='actividad') el.innerHTML = renderActividad();
  else if(currentView==='historial') el.innerHTML = renderHistorial();
  else if(currentView==='progreso') el.innerHTML = renderProgreso();
  else if(currentView==='perfil') el.innerHTML = renderPerfil();
  el.querySelector('.view')?.classList.add('view');
  bindViewEvents();
  drawChartsForView();
}

/* ---------------------------------------------------------
   VISTA: INICIO
   --------------------------------------------------------- */
function todayActivity(){
  const acts = Store.get(LS_KEYS.activities, []);
  const todays = acts.filter(a=>a.date===todayISO(0));
  return todays.reduce((acc,a)=>({
    steps: acc.steps + (a.steps||0),
    distanceKm: acc.distanceKm + (a.distanceKm||0),
    calories: acc.calories + (a.calories||0),
    durationMin: acc.durationMin + (a.durationMin||0),
  }), {steps:0, distanceKm:0, calories:0, durationMin:0});
}

function renderInicio(){
  const goals = Store.get(LS_KEYS.goals, defaultGoals());
  const t = todayActivity();
  const pct = Math.min(100, Math.round((t.steps/goals.stepsGoal)*100)) || 0;
  const circumference = 2*Math.PI*44;
  const offset = circumference - (pct/100)*circumference;
  const hrs = Math.floor(t.durationMin/60);
  const mins = Math.round(t.durationMin%60);

  return `
  <div class="view">
    <div class="h-greeting">${greeting()}</div>
    <div class="h-date">${fmtDate(todayISO(0))}</div>

    ${hasDemoData() ? `<div class="demo-banner">
      <span>Estás viendo datos de demostración</span>
      <button data-action="clear-demo">Quitar</button>
    </div>` : ''}

    <div class="card hero-card">
      <div class="hero-info">
        <div class="label">Pasos de hoy</div>
        <div class="value big-num">${fmt(t.steps)}</div>
        <div class="goal">Meta: <b>${fmt(goals.stepsGoal)}</b> pasos</div>
      </div>
      <div class="ring-wrap">
        <svg width="104" height="104" viewBox="0 0 104 104">
          <circle class="ring-track" cx="52" cy="52" r="44" fill="none" stroke-width="9"/>
          <circle class="ring-progress" cx="52" cy="52" r="44" fill="none" stroke-width="9"
            stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}" data-final-offset="${offset}"/>
        </svg>
        <div class="ring-center">
          <div class="pct">${pct}%</div>
        </div>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card">
        <svg viewBox="0 0 24 24" fill="none"><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        <div class="val">${fmt(t.distanceKm,1)} km</div>
        <div class="lbl">Distancia</div>
      </div>
      <div class="stat-card">
        <svg viewBox="0 0 24 24" fill="none"><path d="M8 3s-3 3-3 7a5 5 0 0010 0c0-1.5-.8-2.5-1.5-3.5.3 1.5-.5 2-1 1.5C13.5 6.5 13 4 11 2c.3 2-1 3.5-2 5-.7 1-1 1.7-1-4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 14a3 3 0 006 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        <div class="val">${fmt(t.calories)}</div>
        <div class="lbl">Kcal</div>
      </div>
      <div class="stat-card">
        <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <div class="val">${hrs}h ${mins}min</div>
        <div class="lbl">Tiempo</div>
      </div>
    </div>

    <div class="section-title">Mi progreso <button class="link-btn" data-action="goto-progreso">Ver todo</button></div>
    ${renderWeightSummaryCard()}

    <div class="section-title">Empezar</div>
    <button class="btn btn-primary btn-lg" data-action="goto-actividad">Iniciar caminata</button>
  </div>`;
}

function greeting(){
  const h = new Date().getHours();
  if(h < 12) return 'Buenos días';
  if(h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

function renderWeightSummaryCard(){
  const p = Store.get(LS_KEYS.profile, defaultProfile());
  const weights = Store.get(LS_KEYS.weights, []).sort((a,b)=>a.date.localeCompare(b.date));
  const current = weights.length ? weights[weights.length-1].weight : p.weightCurrent;
  const initial = p.weightInitial;
  const goal = p.weightGoal;
  const lost = Math.max(0, initial - current);
  const totalToLose = Math.max(0.01, initial - goal);
  const remaining = Math.max(0, current - goal);

  if(!weights.length){
    return `<div class="card empty">
      <svg viewBox="0 0 24 24" fill="none"><path d="M12 2a5 5 0 015 5c0 3-2 4-2 7H9c0-3-2-4-2-7a5 5 0 015-5z" stroke="currentColor" stroke-width="1.6"/><path d="M8 20h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <p>Todavía no registraste ningún peso.</p>
      <button class="btn btn-primary" data-action="open-weight-modal">Registrar peso</button>
    </div>`;
  }

  return `<div class="card">
    <div class="weight-grid">
      <div class="weight-cell"><div class="lbl">Actual</div><div class="val">${fmt(current,1)} kg</div></div>
      <div class="weight-cell"><div class="lbl">Objetivo</div><div class="val">${fmt(goal,1)} kg</div></div>
      <div class="weight-cell"><div class="lbl">Falta</div><div class="val lime">${fmt(remaining,1)} kg</div></div>
    </div>
    <div class="progress-track"><div class="progress-fill" data-final-width="${Math.min(100,(lost/totalToLose)*100)}"></div></div>
    <div class="progress-caption"><span>Perdiste <b>${fmt(lost,1)} kg</b> de ${fmt(totalToLose,1)} kg</span></div>
  </div>`;
}

/* ---------------------------------------------------------
   VISTA: ACTIVIDAD (manual + GPS)
   --------------------------------------------------------- */
let walkState = { active:false, watchId:null, startTime:null, distanceKm:0, lastPos:null, timerInt:null, path:[] };

function renderActividad(){
  if(walkState.active) return renderWalkLive();

  const stepsCapable = ('Accelerometer' in window) || (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function');

  return `<div class="view">
    <div class="section-title">Actividad</div>

    <div class="card" style="margin-bottom:16px;">
      <div style="font-weight:700; font-size:14.5px; margin-bottom:6px;">Caminata con GPS</div>
      <p style="font-size:12.5px; color:var(--text-dim); line-height:1.5; margin:0 0 16px;">
        Registrá tu recorrido en tiempo real: distancia, ritmo y calorías estimadas.
      </p>
      <button class="btn btn-primary btn-lg" data-action="start-walk">Iniciar caminata</button>
    </div>

    ${!stepsCapable ? `<div class="notice">
      Tu navegador no permite acceder al contador de pasos automáticamente. Podés introducir tus pasos manualmente abajo.
    </div>` : ''}

    <div class="section-title" style="margin-top:26px;">Registro manual</div>
    <div class="card">
      <form id="manual-form">
        <div class="chip-row" id="type-chips">
          ${Object.keys(ACTIVITY_LABEL).map((k,i)=>`<button type="button" class="chip ${i===0?'active':''}" data-type="${k}">${ACTIVITY_LABEL[k]}</button>`).join('')}
        </div>
        <input type="hidden" id="manual-type" value="walk">
        <div class="field" style="margin-top:14px;">
          <label>Pasos</label>
          <input type="number" id="manual-steps" inputmode="numeric" placeholder="Ej: 4500">
        </div>
        <div class="field-row">
          <div class="field">
            <label>Distancia (km)</label>
            <input type="number" id="manual-distance" step="0.1" inputmode="decimal" placeholder="Ej: 3.2">
          </div>
          <div class="field">
            <label>Duración (min)</label>
            <input type="number" id="manual-duration" inputmode="numeric" placeholder="Ej: 40">
          </div>
        </div>
        <button type="submit" class="btn btn-primary">Guardar actividad</button>
      </form>
    </div>
  </div>`;
}

function renderWalkLive(){
  return `<div class="view">
    <div class="card walk-live">
      <div class="status-dot">Caminata activa</div>
      <div class="timer" id="walk-timer">00:00:00</div>
      <div class="metrics-row">
        <div class="m"><div class="val" id="walk-distance">0,00 km</div><div class="lbl">Distancia</div></div>
        <div class="m"><div class="val" id="walk-speed">0,0 km/h</div><div class="lbl">Ritmo</div></div>
      </div>
      <div class="cal" id="walk-cal">Calorías estimadas: ≈ 0 kcal</div>
    </div>
    <div style="margin-top:18px;">
      <button class="btn btn-danger btn-lg" data-action="finish-walk">Finalizar caminata</button>
    </div>
  </div>`;
}

function startWalk(){
  if(!('geolocation' in navigator)){
    toast('Tu navegador no permite usar el GPS en este dispositivo.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    ()=>{
      walkState = { active:true, watchId:null, startTime:Date.now(), distanceKm:0, lastPos:null, timerInt:null, path:[] };
      walkState.watchId = navigator.geolocation.watchPosition(onWalkPosition, onWalkError, { enableHighAccuracy:true, maximumAge:1000 });
      walkState.timerInt = setInterval(updateWalkTimer, 1000);
      render();
    },
    (err)=>{
      if(err.code === err.PERMISSION_DENIED){
        toast('Permiso de ubicación rechazado. Activalo para usar el GPS.');
      }else{
        toast('No se pudo acceder al GPS. Probá el registro manual.');
      }
    },
    { enableHighAccuracy:true }
  );
}

function onWalkPosition(pos){
  const { latitude, longitude } = pos.coords;
  if(walkState.lastPos){
    const d = haversine(walkState.lastPos.lat, walkState.lastPos.lon, latitude, longitude);
    if(d > 0.0008 && d < 0.15){ // filtra saltos/ruido de GPS
      walkState.distanceKm += d;
    }
  }
  walkState.lastPos = { lat:latitude, lon:longitude };
  walkState.path.push([latitude, longitude]);
  updateWalkMetrics();
}
function onWalkError(){ /* silencioso: sigue con último dato conocido */ }

function updateWalkTimer(){
  if(!walkState.active) return;
  const secs = Math.floor((Date.now()-walkState.startTime)/1000);
  const h = String(Math.floor(secs/3600)).padStart(2,'0');
  const m = String(Math.floor((secs%3600)/60)).padStart(2,'0');
  const s = String(secs%60).padStart(2,'0');
  const elTimer = document.getElementById('walk-timer');
  if(elTimer) elTimer.textContent = `${h}:${m}:${s}`;
  updateWalkMetrics();
}
function updateWalkMetrics(){
  const p = Store.get(LS_KEYS.profile, defaultProfile());
  const secs = Math.max(1,(Date.now()-walkState.startTime)/1000);
  const hrs = secs/3600;
  const speed = walkState.distanceKm / hrs;
  const cal = estimateCalories('walk', p.weightCurrent, secs/60, speed);
  const elD = document.getElementById('walk-distance');
  const elS = document.getElementById('walk-speed');
  const elC = document.getElementById('walk-cal');
  if(elD) elD.textContent = `${fmt(walkState.distanceKm,2)} km`;
  if(elS) elS.textContent = `${fmt(isFinite(speed)?speed:0,1)} km/h`;
  if(elC) elC.textContent = `Calorías estimadas: ≈ ${fmt(cal)} kcal`;
}

function finishWalk(){
  const p = Store.get(LS_KEYS.profile, defaultProfile());
  const durationMin = (Date.now()-walkState.startTime)/60000;
  const speed = walkState.distanceKm / (durationMin/60);
  const calories = estimateCalories('walk', p.weightCurrent, durationMin, speed);

  clearInterval(walkState.timerInt);
  navigator.geolocation.clearWatch(walkState.watchId);

  const acts = Store.get(LS_KEYS.activities, []);
  acts.push({
    date: todayISO(0),
    steps: Math.round(walkState.distanceKm*1000/((p.stepLength||0.75))),
    distanceKm: Math.round(walkState.distanceKm*100)/100,
    calories,
    durationMin: Math.round(durationMin),
    type:'walk', source:'gps'
  });
  Store.set(LS_KEYS.activities, acts);

  walkState = { active:false, watchId:null, startTime:null, distanceKm:0, lastPos:null, timerInt:null, path:[] };
  toast('Caminata guardada en tu historial');
  navigate('inicio');
}

function saveManualActivity(e){
  e.preventDefault();
  const type = document.getElementById('manual-type').value;
  const steps = parseInt(document.getElementById('manual-steps').value) || 0;
  const distanceKm = parseFloat(document.getElementById('manual-distance').value) || 0;
  const durationMin = parseInt(document.getElementById('manual-duration').value) || 0;

  if(!steps && !distanceKm && !durationMin){
    toast('Ingresá al menos un dato para guardar.');
    return;
  }
  const p = Store.get(LS_KEYS.profile, defaultProfile());
  const speed = durationMin>0 ? distanceKm/(durationMin/60) : 0;
  const calories = estimateCalories(type, p.weightCurrent, durationMin || (steps/130*10), speed);

  const acts = Store.get(LS_KEYS.activities, []);
  acts.push({ date: todayISO(0), steps, distanceKm, calories, durationMin, type, source:'manual' });
  Store.set(LS_KEYS.activities, acts);
  toast('Actividad guardada');
  navigate('inicio');
}

/* ---------------------------------------------------------
   VISTA: HISTORIAL
   --------------------------------------------------------- */
let historialRange = 'day';

function renderHistorial(){
  const acts = Store.get(LS_KEYS.activities, []).slice().sort((a,b)=>b.date.localeCompare(a.date));
  if(!acts.length){
    return `<div class="view">
      <div class="section-title">Historial</div>
      <div class="card empty">
        <svg viewBox="0 0 24 24" fill="none"><path d="M3 12a9 9 0 109-9" stroke="currentColor" stroke-width="1.6"/><path d="M3 4v5h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <p>Todavía no tenés actividades registradas.</p>
        <button class="btn btn-primary" data-action="goto-actividad">Iniciar caminata</button>
      </div>
    </div>`;
  }

  const grouped = groupByRange(acts, historialRange);

  return `<div class="view">
    <div class="section-title">Historial</div>
    <div class="segmented">
      <button data-range="day" class="${historialRange==='day'?'active':''}">Día</button>
      <button data-range="week" class="${historialRange==='week'?'active':''}">Semana</button>
      <button data-range="month" class="${historialRange==='month'?'active':''}">Mes</button>
    </div>
    ${grouped.map(g=>`
      <div class="day-group">
        <div class="day-group-title">${g.label}</div>
        <div class="day-item">
          <div>
            <div class="day-name">${g.sub}</div>
            <div class="day-sub">${fmt(g.calories)} kcal · ${fmt(g.durationMin)} min</div>
          </div>
          <div class="day-metrics">
            <div class="steps">${fmt(g.steps)} pasos</div>
            <div class="rest">${fmt(g.distanceKm,1)} km</div>
          </div>
        </div>
      </div>
    `).join('')}
  </div>`;
}

function groupByRange(acts, range){
  if(range==='day'){
    const byDay = {};
    acts.forEach(a=>{
      byDay[a.date] = byDay[a.date] || {date:a.date, steps:0, distanceKm:0, calories:0, durationMin:0};
      byDay[a.date].steps += a.steps||0;
      byDay[a.date].distanceKm += a.distanceKm||0;
      byDay[a.date].calories += a.calories||0;
      byDay[a.date].durationMin += a.durationMin||0;
    });
    return Object.values(byDay).sort((x,y)=>y.date.localeCompare(x.date)).map(d=>({
      label: weekdayShort(d.date), sub: fmtDate(d.date), steps:d.steps, distanceKm:d.distanceKm, calories:d.calories, durationMin:d.durationMin
    }));
  }
  const keyFor = (dateStr)=>{
    const d = new Date(dateStr+'T00:00:00');
    if(range==='week'){
      const first = new Date(d); first.setDate(d.getDate()-d.getDay());
      return first.toISOString().slice(0,10);
    }
    return dateStr.slice(0,7);
  };
  const byKey = {};
  acts.forEach(a=>{
    const k = keyFor(a.date);
    byKey[k] = byKey[k] || {key:k, steps:0, distanceKm:0, calories:0, durationMin:0};
    byKey[k].steps += a.steps||0;
    byKey[k].distanceKm += a.distanceKm||0;
    byKey[k].calories += a.calories||0;
    byKey[k].durationMin += a.durationMin||0;
  });
  return Object.values(byKey).sort((x,y)=>y.key.localeCompare(x.key)).map(d=>({
    label: range==='week' ? 'Semana' : 'Mes',
    sub: range==='week' ? `Desde ${fmtDate(d.key)}` : new Date(d.key+'-01').toLocaleDateString('es-AR',{month:'long', year:'numeric'}),
    steps:d.steps, distanceKm:d.distanceKm, calories:d.calories, durationMin:d.durationMin
  }));
}

/* ---------------------------------------------------------
   VISTA: PROGRESO
   --------------------------------------------------------- */
function renderProgreso(){
  const p = Store.get(LS_KEYS.profile, defaultProfile());
  const weights = Store.get(LS_KEYS.weights, []).slice().sort((a,b)=>a.date.localeCompare(b.date));
  const current = weights.length ? weights[weights.length-1].weight : p.weightCurrent;
  const lost = Math.max(0, p.weightInitial - current);
  const totalToLose = Math.max(0.01, p.weightInitial - p.weightGoal);
  const pct = Math.min(100, Math.round((lost/totalToLose)*100));
  const acts = Store.get(LS_KEYS.activities, []);
  const last7 = last7Days(acts);

  return `<div class="view">
    <div class="section-title">Progreso</div>

    <div class="card" style="text-align:center;">
      <div style="font-size:12px; color:var(--text-dim); font-weight:600; text-transform:uppercase; letter-spacing:.4px;">Tu progreso</div>
      <div class="progress-pct">${pct}%</div>
      <div class="progress-caption" style="justify-content:center;">Perdiste <b style="margin:0 4px;">${fmt(lost,1)} kg</b> de ${fmt(totalToLose,1)} kg</div>
      <div class="progress-track"><div class="progress-fill" data-final-width="${pct}"></div></div>
    </div>

    <div class="section-title">Evolución de peso <button class="link-btn" data-action="open-weight-modal">Registrar peso</button></div>
    ${weights.length ? `<div class="card chart-card"><canvas id="chart-weight"></canvas></div>` :
      `<div class="card empty"><p>Todavía no registraste ningún peso.</p><button class="btn btn-primary" data-action="open-weight-modal">Registrar mi peso</button></div>`}

    <div class="section-title">Pasos — últimos 7 días</div>
    <div class="card chart-card"><canvas id="chart-steps"></canvas></div>

    <div class="section-title">Kilómetros — últimos 7 días</div>
    <div class="card chart-card"><canvas id="chart-km"></canvas></div>

    <div class="section-title">Objetivos <button class="link-btn" data-action="open-goals-modal">Editar</button></div>
    <div class="card">
      <div class="settings-list">
        <div class="settings-row"><div><div class="label">Meta de pasos</div><div class="sub">${fmt(Store.get(LS_KEYS.goals,defaultGoals()).stepsGoal)} pasos/día</div></div></div>
        <div class="settings-row"><div><div class="label">Meta de distancia</div><div class="sub">${fmt(Store.get(LS_KEYS.goals,defaultGoals()).distanceGoal,1)} km/día</div></div></div>
        <div class="settings-row"><div><div class="label">Peso objetivo</div><div class="sub">${fmt(p.weightGoal,1)} kg</div></div></div>
        <div class="settings-row"><div><div class="label">Meta semanal</div><div class="sub">${fmt(Store.get(LS_KEYS.goals,defaultGoals()).weeklyStepsGoal)} pasos/semana</div></div></div>
      </div>
    </div>
  </div>`;
}

function last7Days(acts){
  const days = [];
  for(let i=6;i>=0;i--){
    const date = todayISO(-i);
    const dayActs = acts.filter(a=>a.date===date);
    days.push({
      date,
      steps: dayActs.reduce((s,a)=>s+(a.steps||0),0),
      distanceKm: dayActs.reduce((s,a)=>s+(a.distanceKm||0),0)
    });
  }
  return days;
}

let chartRefs = {};
function drawChartsForView(){
  Object.values(chartRefs).forEach(c=>c?.destroy?.());
  chartRefs = {};
  if(currentView !== 'progreso' || typeof Chart==='undefined') return;

  const weights = Store.get(LS_KEYS.weights, []).slice().sort((a,b)=>a.date.localeCompare(b.date));
  const wCanvas = document.getElementById('chart-weight');
  if(wCanvas && weights.length){
    chartRefs.weight = new Chart(wCanvas, {
      type:'line',
      data:{
        labels: weights.map(w=>new Date(w.date+'T00:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'})),
        datasets:[{ data: weights.map(w=>w.weight), borderColor:'#C6FF3D', backgroundColor:'rgba(198,255,61,0.12)', fill:true, tension:.35, pointRadius:2, pointBackgroundColor:'#C6FF3D', borderWidth:2 }]
      },
      options: chartOpts()
    });
  }

  const acts = Store.get(LS_KEYS.activities, []);
  const last7 = last7Days(acts);
  const sCanvas = document.getElementById('chart-steps');
  if(sCanvas){
    chartRefs.steps = new Chart(sCanvas, {
      type:'bar',
      data:{
        labels: last7.map(d=>weekdayShort(d.date).split(' ')[0].slice(0,3)),
        datasets:[{ data: last7.map(d=>d.steps), backgroundColor:'#C6FF3D', borderRadius:6, maxBarThickness:22 }]
      },
      options: chartOpts()
    });
  }
  const kCanvas = document.getElementById('chart-km');
  if(kCanvas){
    chartRefs.km = new Chart(kCanvas, {
      type:'bar',
      data:{
        labels: last7.map(d=>weekdayShort(d.date).split(' ')[0].slice(0,3)),
        datasets:[{ data: last7.map(d=>Math.round(d.distanceKm*10)/10), backgroundColor:'#8FC22B', borderRadius:6, maxBarThickness:22 }]
      },
      options: chartOpts()
    });
  }
}
function chartOpts(){
  return {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{display:false}, tooltip:{ backgroundColor:'#1D1F22', titleColor:'#fff', bodyColor:'#C6FF3D', borderColor:'#26282C', borderWidth:1 } },
    scales:{
      x:{ grid:{display:false}, ticks:{ color:'#5B5E64', font:{size:10} } },
      y:{ grid:{ color:'#1D1F22' }, ticks:{ color:'#5B5E64', font:{size:10} } }
    }
  };
}

/* ---------------------------------------------------------
   VISTA: PERFIL
   --------------------------------------------------------- */
function renderPerfil(){
  const p = Store.get(LS_KEYS.profile, defaultProfile());
  const s = Store.get(LS_KEYS.settings, defaultSettings());
  const initial = (p.name||'P').trim().charAt(0).toUpperCase() || 'P';

  return `<div class="view">
    <div class="section-title">Mi perfil</div>
    <div class="card">
      <div class="avatar-row">
        <div class="avatar">${initial}</div>
        <div>
          <div style="font-weight:700; font-size:16px;">${p.name || 'Sin nombre'}</div>
          <div style="font-size:12px; color:var(--text-faint);">${p.age?`${p.age} años · `:''}${p.height?`${p.height} cm`:''}</div>
        </div>
      </div>
      <button class="btn btn-secondary" data-action="open-profile-modal">Editar perfil</button>
    </div>

    <div class="section-title">Configuración</div>
    <div class="card">
      <div class="settings-list">
        <div class="settings-row" data-action="open-goals-modal">
          <div class="label">Cambiar objetivos</div>
          <svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div class="settings-row">
          <div><div class="label">Unidades</div><div class="sub">kg / km</div></div>
        </div>
        <div class="settings-row" data-action="toggle-dark">
          <div class="label">Modo oscuro</div>
          <div class="switch ${s.darkMode?'on':''}"></div>
        </div>
        <div class="settings-row" data-action="export-data">
          <div class="label">Exportar mis datos</div>
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div class="settings-row" data-action="import-data">
          <div class="label">Importar mis datos</div>
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 21V9M7 14l5-5 5 5M5 3h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <input type="file" id="import-file" accept="application/json" class="hidden">
      </div>
    </div>

    <div class="section-title">Zona de riesgo</div>
    <button class="btn btn-danger" data-action="wipe-data">Borrar todos los datos</button>

    <div class="notice" style="margin-top:22px; text-align:center;">
      PULSO guarda todo localmente en tu dispositivo. Ningún dato personal se envía a servidores externos.
    </div>
  </div>`;
}

/* ---------------------------------------------------------
   MODALES
   --------------------------------------------------------- */
function openModal(html){
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop" data-close-modal>
    <div class="modal-sheet" id="modal-sheet">
      <div class="modal-handle"></div>
      ${html}
    </div>
  </div>`;
  root.querySelector('[data-close-modal]').addEventListener('click', (e)=>{
    if(e.target.hasAttribute('data-close-modal')) closeModal();
  });
}
function closeModal(){ document.getElementById('modal-root').innerHTML=''; }

function openWeightModal(){
  openModal(`
    <div class="modal-title">Registrar peso</div>
    <form id="weight-form">
      <div class="field">
        <label>Peso (kg)</label>
        <input type="number" id="weight-input" step="0.1" inputmode="decimal" placeholder="Ej: 89.5" required autofocus>
      </div>
      <div class="field">
        <label>Fecha</label>
        <input type="date" id="weight-date" value="${todayISO(0)}" max="${todayISO(0)}" required>
      </div>
      <button type="submit" class="btn btn-primary btn-lg">Guardar</button>
    </form>
  `);
  document.getElementById('weight-form').addEventListener('submit', (e)=>{
    e.preventDefault();
    const weight = parseFloat(document.getElementById('weight-input').value);
    const date = document.getElementById('weight-date').value;
    if(!weight || weight<=0){ toast('Ingresá un peso válido'); return; }
    const weights = Store.get(LS_KEYS.weights, []).filter(w=>w.date!==date);
    weights.push({ date, weight });
    Store.set(LS_KEYS.weights, weights);
    const p = Store.get(LS_KEYS.profile, defaultProfile());
    p.weightCurrent = weight;
    Store.set(LS_KEYS.profile, p);
    closeModal();
    toast('Peso registrado');
    render();
  });
}

function openGoalsModal(){
  const g = Store.get(LS_KEYS.goals, defaultGoals());
  const p = Store.get(LS_KEYS.profile, defaultProfile());
  openModal(`
    <div class="modal-title">Editar objetivos</div>
    <form id="goals-form">
      <div class="field"><label>Meta de pasos diarios</label><input type="number" id="g-steps" value="${g.stepsGoal}" required></div>
      <div class="field"><label>Meta de distancia diaria (km)</label><input type="number" step="0.1" id="g-distance" value="${g.distanceGoal}" required></div>
      <div class="field"><label>Meta de pasos semanal</label><input type="number" id="g-weekly" value="${g.weeklyStepsGoal}" required></div>
      <div class="field"><label>Peso objetivo (kg)</label><input type="number" step="0.1" id="g-weight" value="${p.weightGoal}" required></div>
      <button type="submit" class="btn btn-primary btn-lg">Guardar objetivos</button>
    </form>
  `);
  document.getElementById('goals-form').addEventListener('submit', (e)=>{
    e.preventDefault();
    Store.set(LS_KEYS.goals, {
      stepsGoal: parseInt(document.getElementById('g-steps').value)||10000,
      distanceGoal: parseFloat(document.getElementById('g-distance').value)||7,
      weeklyStepsGoal: parseInt(document.getElementById('g-weekly').value)||50000
    });
    const prof = Store.get(LS_KEYS.profile, defaultProfile());
    prof.weightGoal = parseFloat(document.getElementById('g-weight').value)||prof.weightGoal;
    Store.set(LS_KEYS.profile, prof);
    closeModal();
    toast('Objetivos actualizados');
    render();
  });
}

function openProfileModal(){
  const p = Store.get(LS_KEYS.profile, defaultProfile());
  openModal(`
    <div class="modal-title">Editar perfil</div>
    <form id="profile-form">
      <div class="field"><label>Nombre</label><input type="text" id="p-name" value="${p.name||''}"></div>
      <div class="field-row">
        <div class="field"><label>Edad</label><input type="number" id="p-age" value="${p.age||''}"></div>
        <div class="field">
          <label>Sexo</label>
          <select id="p-sex">
            <option value="" ${!p.sex?'selected':''}>Preferir no decir</option>
            <option value="femenino" ${p.sex==='femenino'?'selected':''}>Femenino</option>
            <option value="masculino" ${p.sex==='masculino'?'selected':''}>Masculino</option>
            <option value="otro" ${p.sex==='otro'?'selected':''}>Otro</option>
          </select>
        </div>
      </div>
      <div class="field"><label>Altura (cm)</label><input type="number" id="p-height" value="${p.height||''}"></div>
      <div class="field-row">
        <div class="field"><label>Peso inicial (kg)</label><input type="number" step="0.1" id="p-winitial" value="${p.weightInitial}"></div>
        <div class="field"><label>Peso actual (kg)</label><input type="number" step="0.1" id="p-wcurrent" value="${p.weightCurrent}"></div>
      </div>
      <button type="submit" class="btn btn-primary btn-lg">Guardar perfil</button>
    </form>
  `);
  document.getElementById('profile-form').addEventListener('submit', (e)=>{
    e.preventDefault();
    const np = {
      ...p,
      name: document.getElementById('p-name').value.trim(),
      age: parseInt(document.getElementById('p-age').value) || null,
      sex: document.getElementById('p-sex').value,
      height: parseFloat(document.getElementById('p-height').value) || null,
      weightInitial: parseFloat(document.getElementById('p-winitial').value) || p.weightInitial,
      weightCurrent: parseFloat(document.getElementById('p-wcurrent').value) || p.weightCurrent,
      stepLength: p.height ? Math.round((p.height*0.415))/100 : p.stepLength
    };
    Store.set(LS_KEYS.profile, np);
    closeModal();
    toast('Perfil actualizado');
    render();
  });
}

/* ---------------------------------------------------------
   Exportar / Importar
   --------------------------------------------------------- */
function exportData(){
  const data = {};
  Object.entries(LS_KEYS).forEach(([k,key])=>{ data[k] = Store.get(key, null); });
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `pulso-datos-${todayISO(0)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('Datos exportados');
}
function importData(file){
  const reader = new FileReader();
  reader.onload = (e)=>{
    try{
      const data = JSON.parse(e.target.result);
      Object.entries(LS_KEYS).forEach(([k,key])=>{
        if(data[k] !== undefined && data[k] !== null) Store.set(key, data[k]);
      });
      toast('Datos importados correctamente');
      render();
    }catch(err){
      toast('El archivo no tiene un formato válido');
    }
  };
  reader.readAsText(file);
}

/* ---------------------------------------------------------
   Bind de eventos por vista (delegación simple)
   --------------------------------------------------------- */
function bindViewEvents(){
  const root = document.getElementById('views');

  root.querySelectorAll('[data-action]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const action = el.dataset.action;
      if(action==='goto-progreso') navigate('progreso');
      else if(action==='goto-actividad') navigate('actividad');
      else if(action==='open-weight-modal') openWeightModal();
      else if(action==='open-goals-modal') openGoalsModal();
      else if(action==='open-profile-modal') openProfileModal();
      else if(action==='clear-demo') clearDemoData();
      else if(action==='start-walk') startWalk();
      else if(action==='finish-walk') finishWalk();
      else if(action==='toggle-dark') toggleDark();
      else if(action==='export-data') exportData();
      else if(action==='import-data') document.getElementById('import-file')?.click();
      else if(action==='wipe-data') confirmWipe();
    });
  });

  const importInput = root.querySelector('#import-file');
  if(importInput){
    importInput.addEventListener('change', (e)=>{
      if(e.target.files[0]) importData(e.target.files[0]);
    });
  }

  const manualForm = root.querySelector('#manual-form');
  if(manualForm){
    manualForm.addEventListener('submit', saveManualActivity);
    root.querySelectorAll('#type-chips .chip').forEach(chip=>{
      chip.addEventListener('click', ()=>{
        root.querySelectorAll('#type-chips .chip').forEach(c=>c.classList.remove('active'));
        chip.classList.add('active');
        document.getElementById('manual-type').value = chip.dataset.type;
      });
    });
  }

  root.querySelectorAll('.segmented [data-range]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      historialRange = btn.dataset.range;
      render();
    });
  });

  // Animar ring y barra de progreso tras montar el DOM
  requestAnimationFrame(()=>{
    const ring = root.querySelector('.ring-progress');
    if(ring){ ring.style.strokeDashoffset = ring.dataset.finalOffset; }
    root.querySelectorAll('.progress-fill').forEach(bar=>{
      bar.style.width = bar.dataset.finalWidth + '%';
    });
  });
}

function toggleDark(){
  toast('PULSO usa modo oscuro como diseño principal');
}
function confirmWipe(){
  openModal(`
    <div class="modal-title">¿Borrar todos los datos?</div>
    <p style="font-size:13px; color:var(--text-dim); line-height:1.6; margin:-8px 0 20px;">
      Esta acción elimina tu perfil, objetivos, pesos y actividades guardadas en este dispositivo. No se puede deshacer.
    </p>
    <button class="btn btn-danger" id="confirm-wipe-btn">Sí, borrar todo</button>
    <div style="height:10px;"></div>
    <button class="btn btn-secondary" data-close-modal>Cancelar</button>
  `);
  document.getElementById('confirm-wipe-btn').addEventListener('click', ()=>{
    closeModal();
    wipeAllData();
  });
}

/* ---------------------------------------------------------
   Init
   --------------------------------------------------------- */
function init(){
  seedDemoData();
  render();

  setTimeout(()=>{
    document.getElementById('splash').style.opacity = '0';
    setTimeout(()=>{
      document.getElementById('splash').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
    }, 400);
  }, 700);

  if('serviceWorker' in navigator){
    window.addEventListener('load', ()=>{
      navigator.serviceWorker.register('service-worker.js').catch(()=>{});
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
