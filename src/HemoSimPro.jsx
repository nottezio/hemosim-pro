import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Activity, Heart, Settings2, GraduationCap, Gauge, Waves,
  Stethoscope, Info, Zap, Wind, RotateCcw, Pause, Play
} from 'lucide-react';

/* =========================================================================
 *  HEMOSIM PRO  —  Clinical Hemodynamic Workbench  (v1: physics-first)
 *  Closed-loop biventricular lumped-parameter model
 *  Suga time-varying elastance + Frank windkessels + diode valves
 * =======================================================================*/

// ---------- Color tokens (clinical dark navy) ----------
const C = {
  bg: '#060912',
  panel: '#0c1322',
  panelLight: '#111a2e',
  border: '#1f2a44',
  borderHi: '#2c3a5e',
  text: '#cfd8ec',
  textDim: '#7a89aa',
  textFaint: '#4a5777',
  grid: '#1a2440',
  gridFaint: '#121a30',
  cursor: '#22d3ee',
  // Trace colors
  P_lv:  '#ef4444',   // red — left ventricle
  P_sa:  '#f59e0b',   // amber — aorta
  P_la:  '#60a5fa',   // blue — left atrium
  P_pa:  '#a78bfa',   // violet — pulmonary artery
  P_rv:  '#fb7185',   // rose — right ventricle
  P_ra:  '#38bdf8',   // sky — right atrium
  V_lv:  '#34d399',   // green — volume
  ecg:   '#86efac',   // soft green
  ghost: '#475569',   // ghost-loop slate
  espvr: '#facc15',   // espvr line
  edpvr: '#f97316',   // edpvr curve
  ok:    '#10b981',
  warn:  '#f59e0b',
  bad:   '#ef4444',
};

// ---------- Default physiologic parameters ----------
const DEF = {
  hr: 70,
  // Ventricles  (V0 reasonable, EDPVR tuned for LVEDP~8 at EDV~125)
  Ees_lv: 2.5, V0_lv: 10, A_lv: 0.30, B_lv: 0.025,
  Ees_rv: 0.70, V0_rv: 15, A_rv: 0.25, B_rv: 0.025,
  // Atria
  Ees_la: 0.45, V0_la: 5, A_la: 0.20, B_la: 0.045,
  Ees_ra: 0.35, V0_ra: 6, A_ra: 0.15, B_ra: 0.040,
  // Vasculature
  C_sa: 1.5, C_sv: 60, C_pa: 2.5, C_pv: 7.5,
  R_sys: 1.05, R_pul: 0.16,
  R_sv_ra: 0.005, R_pv_la: 0.005,
  // Valves
  R_mit: 0.005, R_aor: 0.005, R_tri: 0.005, R_puv: 0.005,
  G_mit_leak: 0, G_aor_leak: 0, G_tri_leak: 0, G_puv_leak: 0,
  // Slider control multipliers (applied dynamically)
  preload: 1.0, afterload: 1.0, inotropy: 1.0, lusitropy: 1.0,
  // Pathology flags
  dynLVOT: false,
};

const INIT_STATE = {
  V_lv: 100, V_rv: 100, V_la: 30, V_ra: 30,
  P_sa: 85, P_sv: 4, P_pa: 14, P_pv: 6,
  t: 0,
  prev_mit_open: true,
  prev_aor_open: false,
  s1_phase: 0.02,
  s2_phase: 0.34,
};

// ---------- Pathology presets ----------
const PRESETS = {
  Normal: {
    label: 'Normal Physiology',
    short: 'NL',
    color: '#22d3ee',
    category: 'baseline',
    description: 'Healthy adult — baseline reference. EF ~60%, BP 120/80, CO 5 L/min.',
    teaching: 'Notice the rectangular PV loop with four crisp corners (mitral closure → aortic opening → aortic closure → mitral opening). Aortic and LV pressures meet only during ejection.',
    overrides: {}
  },
  AS: {
    label: 'Aortic Stenosis (severe)',
    short: 'AS',
    color: '#fbbf24',
    category: 'valve',
    description: 'Narrow valve → systolic LV-aorta gradient. LV hypertrophies (concentric, ↑Ees, ↑stiffness). Aortic upstroke is parvus et tardus.',
    teaching: 'Watch P_LV climb far above P_AO during ejection — the gradient (~50 mmHg here). PV loop becomes tall and narrow. Eventually progresses to HFpEF physiology from chronic afterload.',
    overrides: {
      R_aor: 0.220,
      Ees_lv: 3.5,
      A_lv: 0.45, B_lv: 0.040,
      preload: 1.05,
    }
  },
  AR: {
    label: 'Aortic Regurgitation (severe)',
    short: 'AR',
    color: '#84cc16',
    category: 'valve',
    description: 'Diastolic regurgitation → wide pulse pressure (Corrigan/water-hammer pulse), LV volume overload, eccentric dilation.',
    teaching: 'Aortic diastolic pressure plummets as blood leaks back into LV. PV loop loses its bottom-flat segment (no isovolumetric phases) and shifts massively right. EF preserved early — masks dysfunction.',
    overrides: {
      G_aor_leak: 0.07,
      V0_lv: 25,
      A_lv: 0.20,
    }
  },
  MS: {
    label: 'Mitral Stenosis (severe)',
    short: 'MS',
    color: '#3b82f6',
    category: 'valve',
    description: 'Diastolic LA-LV gradient → LA dilation, elevated mLAP, pulmonary HTN, low forward CO. LV is under-filled and small.',
    teaching: 'P_LA stays elevated through diastole, never matches P_LV (the gradient). LV is small (low EDV). PA pressures rise. The lung absorbs the disease — pulmonary HTN is the killer.',
    overrides: {
      R_mit: 0.080,
      Ees_la: 0.30,
      V0_la: 12,
      A_la: 0.30, B_la: 0.060,
      preload: 1.10,
    }
  },
  MR: {
    label: 'Mitral Regurgitation (severe)',
    short: 'MR',
    color: '#06b6d4',
    category: 'valve',
    description: 'Systolic backflow → giant v-wave on LA pressure, biventricular volume overload. "Preserved" total EF masks reduced forward output.',
    teaching: 'P_LA tracks P_LV during systole (giant v-wave) — they\'re directly connected through the leak. PV loop loses isovolumetric contraction phase. Total SV looks normal but forward SV is much less.',
    overrides: {
      G_mit_leak: 0.07,
      V0_la: 15, A_la: 0.15,
      V0_lv: 22,
    }
  },
  HOCM: {
    label: 'HOCM (dynamic obstruction)',
    short: 'HOCM',
    color: '#a78bfa',
    category: 'cardiomyopathy',
    description: 'Hyperdynamic LV with dynamic LVOT obstruction. R_aor rises as V_LV shrinks (Venturi → SAM). Worse with low preload, low afterload, high inotropy.',
    teaching: 'Spike-and-dome aortic trace. Try lowering preload OR raising inotropy — obstruction worsens (the famous Valsalva / amyl nitrite response). This is why HOCM patients have exertional syncope.',
    overrides: {
      Ees_lv: 3.5,
      V0_lv: 5,
      A_lv: 0.55, B_lv: 0.050,
      dynLVOT: true,
      preload: 1.25,
    }
  },
  HFrEF: {
    label: 'HFrEF',
    short: 'HFrEF',
    color: '#ef4444',
    category: 'cardiomyopathy',
    description: 'Systolic dysfunction: depressed contractility, dilated LV (eccentric remodeling), low EF, elevated filling pressures.',
    teaching: 'Watch the ESPVR slope flatten (low Ees). LV dilates to compensate (preload reserve), but the loop shifts right and gets shorter — EF crashes. Then LVEDP rises and pulm congestion develops.',
    overrides: {
      Ees_lv: 1.0,
      V0_lv: 25,
      A_lv: 0.35, B_lv: 0.028,
      preload: 1.20,
    }
  },
  HFpEF: {
    label: 'HFpEF',
    short: 'HFpEF',
    color: '#fb7185',
    category: 'cardiomyopathy',
    description: 'Diastolic dysfunction: stiff non-compliant LV with impaired relaxation. Normal EF but high LVEDP and pulmonary congestion.',
    teaching: 'EDPVR curve becomes steep — small volume changes produce big pressure changes. EF stays >50% but LVEDP and mLAP soar. The patient is congested with normal "squeeze". This is the obesity/HTN/diabetes phenotype.',
    overrides: {
      A_lv: 0.40, B_lv: 0.035,
      lusitropy: 0.75,
      preload: 1.30,
    }
  },
};

// ---------- Math helpers ----------

// Normalized double-hill activation
function dHill(tn, tau1, tau2, n1, n2) {
  if (tn <= 0) return 0;
  const g1 = Math.pow(tn / tau1, n1);
  const g2 = Math.pow(tn / tau2, n2);
  return (g1 / (1 + g1)) * (1 / (1 + g2));
}
function findPeak(tau1, tau2, n1, n2) {
  let pk = 0;
  for (let i = 1; i < 1000; i++) {
    const v = dHill(i / 1000, tau1, tau2, n1, n2);
    if (v > pk) pk = v;
  }
  return pk;
}

// Ventricular activation
const V_TAU1 = 0.27, V_N1 = 1.32, V_N2 = 21.9;
let _vPeakCache = { tau2: -1, peak: 1 };
function vShape(t, T, lusitropy) {
  // lusitropy>1 = faster relaxation (shorter tau2)
  const tau2 = 0.45 / lusitropy;
  if (Math.abs(_vPeakCache.tau2 - tau2) > 1e-6) {
    _vPeakCache.tau2 = tau2;
    _vPeakCache.peak = findPeak(V_TAU1, tau2, V_N1, V_N2);
  }
  const tn = t / T;
  return dHill(tn, V_TAU1, tau2, V_N1, V_N2) / _vPeakCache.peak;
}

// Atrial activation — peaks late in cycle (atrial kick before next QRS)
const A_TAU1 = 0.06, A_TAU2 = 0.13, A_N1 = 2, A_N2 = 12;
const A_PEAK = findPeak(A_TAU1, A_TAU2, A_N1, A_N2);
function aShape(t, T) {
  let tn = (t / T) - 0.82;
  if (tn < 0) tn += 1;
  return dHill(tn, A_TAU1, A_TAU2, A_N1, A_N2) / A_PEAK;
}

// Suga combined chamber pressure
function Pchamber(V, en, Ees, V0, A, B) {
  const Pes = Ees * (V - V0);
  const Ped = A * (Math.exp(B * Math.max(0, V - V0)) - 1);
  return en * Pes + (1 - en) * Ped;
}

// Diode valve with leak
function valve(Pup, Pdown, R, Gleak) {
  const dP = Pup - Pdown;
  if (dP > 0) return dP / R;
  return dP * Gleak;
}

// Synthetic ECG (single lead, V5-ish)
function ecgWave(phase) {
  let v = 0;
  // P wave
  v += 0.18 * Math.exp(-Math.pow((phase - 0.83) * 25, 2));
  // QRS — wrap-aware near phase 0
  let p = phase < 0.5 ? phase : phase - 1;
  v += -0.08 * Math.exp(-Math.pow((p + 0.018) * 220, 2));   // Q
  v +=  1.0  * Math.exp(-Math.pow((p - 0.005) * 180, 2));   // R
  v += -0.20 * Math.exp(-Math.pow((p - 0.030) * 150, 2));   // S
  // T wave
  v +=  0.30 * Math.exp(-Math.pow((phase - 0.36) * 13, 2));
  return v;
}

// ---------- One simulation step (forward Euler) ----------
function simStep(s, p, dt) {
  const T = 60 / p.hr;
  const en_v = vShape(s.t, T, p.lusitropy);
  const en_a = aShape(s.t, T);

  const Ees_lv_eff = p.Ees_lv * p.inotropy;
  const Ees_rv_eff = p.Ees_rv * p.inotropy;

  const P_lv = Pchamber(s.V_lv, en_v, Ees_lv_eff, p.V0_lv, p.A_lv, p.B_lv);
  const P_rv = Pchamber(s.V_rv, en_v, Ees_rv_eff, p.V0_rv, p.A_rv, p.B_rv);
  const P_la = Pchamber(s.V_la, en_a, p.Ees_la, p.V0_la, p.A_la, p.B_la);
  const P_ra = Pchamber(s.V_ra, en_a, p.Ees_ra, p.V0_ra, p.A_ra, p.B_ra);

  const Q_mit = valve(P_la, P_lv, p.R_mit, p.G_mit_leak);
  // Dynamic LVOT obstruction (HOCM): R_aor rises as V_LV shrinks (Venturi → SAM)
  const R_aor_eff = p.dynLVOT
    ? p.R_aor * (1 + 12 * Math.max(0, 1 - s.V_lv / 55))
    : p.R_aor;
  const Q_aor = valve(P_lv, s.P_sa, R_aor_eff, p.G_aor_leak);
  const Q_tri = valve(P_ra, P_rv, p.R_tri, p.G_tri_leak);
  const Q_puv = valve(P_rv, s.P_pa, p.R_puv, p.G_puv_leak);

  const R_sys_eff = p.R_sys * p.afterload;
  const Q_sys  = (s.P_sa - s.P_sv) / R_sys_eff;
  const Q_pul  = (s.P_pa - s.P_pv) / p.R_pul;
  const Q_svRA = (s.P_sv - P_ra)   / p.R_sv_ra;
  const Q_pvLA = (s.P_pv - P_la)   / p.R_pv_la;

  s.V_la += (Q_pvLA - Q_mit) * dt;
  s.V_lv += (Q_mit  - Q_aor) * dt;
  s.V_ra += (Q_svRA - Q_tri) * dt;
  s.V_rv += (Q_tri  - Q_puv) * dt;
  s.P_sa += (Q_aor  - Q_sys)  / p.C_sa * dt;
  s.P_sv += (Q_sys  - Q_svRA) / p.C_sv * dt;
  s.P_pa += (Q_puv  - Q_pul)  / p.C_pa * dt;
  s.P_pv += (Q_pul  - Q_pvLA) / p.C_pv * dt;

  // Floor volumes (numerical safety)
  if (s.V_lv < 5) s.V_lv = 5;
  if (s.V_rv < 5) s.V_rv = 5;
  if (s.V_la < 3) s.V_la = 3;
  if (s.V_ra < 3) s.V_ra = 3;

  // Phase advance
  s.t += dt;
  let cycled = false;
  if (s.t >= T) { s.t -= T; cycled = true; }

  // Heart sound detection
  const phase = s.t / T;
  const mit_open = (P_la > P_lv);
  const aor_open = (P_lv > s.P_sa);
  if (s.prev_mit_open && !mit_open) s.s1_phase = phase;
  if (s.prev_aor_open && !aor_open) s.s2_phase = phase;
  s.prev_mit_open = mit_open;
  s.prev_aor_open = aor_open;

  return { P_lv, P_rv, P_la, P_ra, Q_mit, Q_aor, Q_tri, Q_puv, en_v, en_a, cycled, T, phase };
}

// ---------- Pre-stabilize a reference cycle ----------
function buildReferenceLoop() {
  const s = { ...INIT_STATE };
  const p = { ...DEF };
  // run 10s to stabilize
  for (let i = 0; i < 10000; i++) simStep(s, p, 0.001);
  // capture one cycle
  const T = 60 / p.hr;
  const loop = [];
  let collected = 0;
  while (collected < T / 0.002) {
    const out = simStep(s, p, 0.001);
    loop.push({ V: s.V_lv, P: out.P_lv });
    collected++;
  }
  return loop;
}

// ===========================================================================
//  MAIN COMPONENT
// ===========================================================================
export default function HemoSimPro() {
  const [params, setParams] = useState(DEF);
  const [activePreset, setActivePreset] = useState('Normal');
  const [studentMode, setStudentMode] = useState(false);
  const [running, setRunning] = useState(true);
  const [metrics, setMetrics] = useState({
    EDV: 125, ESV: 50, SV: 75, EF: 60, CO: 5.25,
    SBP: 120, DBP: 80, MAP: 93, LVEDP: 8, LVESP: 120,
    PASP: 25, PADP: 10, mPAP: 15, LAP: 9, RAP: 5, dPdt: 1500,
  });
  const [warn, setWarn] = useState(null);

  const paramsRef = useRef(params);
  const stateRef = useRef({ ...INIT_STATE });
  const histRef = useRef([]);            // recent waveform samples
  const cycleBufRef = useRef([]);        // current cycle samples (PV + metrics)
  const lastCycleRef = useRef([]);       // last completed cycle
  const sndsRef = useRef({ s1: 0.02, s2: 0.34, s3: null, s4: null });

  const pvCanvasRef = useRef(null);
  const wgCanvasRef = useRef(null);

  const refLoop = useMemo(() => buildReferenceLoop(), []);

  // Sync params
  useEffect(() => { paramsRef.current = params; }, [params]);

  // When preload slider changes, inject/withdraw venous volume
  const lastPreloadRef = useRef(1.0);
  useEffect(() => {
    const delta = params.preload - lastPreloadRef.current;
    // bump systemic venous pressure (ramps EDV up/down over a few cycles)
    stateRef.current.P_sv += delta * 12;
    lastPreloadRef.current = params.preload;
  }, [params.preload]);

  const updateParam = (key, val) => setParams(p => ({ ...p, [key]: val }));

  // Smoothly morph params toward a target over ~1.5s using rAF
  const morphRef = useRef(null);
  const applyPreset = (name) => {
    const preset = PRESETS[name];
    if (!preset) return;
    setActivePreset(name);
    // Build target: DEF + overrides; HR stays as user's setting
    const target = {
      ...DEF,
      ...preset.overrides,
      hr: paramsRef.current.hr,
    };
    // Ensure all preset slider values default sensibly when not specified
    if (!('preload' in preset.overrides)) target.preload = 1.0;
    if (!('afterload' in preset.overrides)) target.afterload = 1.0;
    if (!('inotropy' in preset.overrides)) target.inotropy = 1.0;
    if (!('lusitropy' in preset.overrides)) target.lusitropy = 1.0;
    if (morphRef.current) cancelAnimationFrame(morphRef.current);
    const start = { ...paramsRef.current };
    const t0 = performance.now();
    const DUR = 1500;
    const tick = (now) => {
      const u = Math.min(1, (now - t0) / DUR);
      const ease = u < 0.5 ? 2*u*u : 1 - Math.pow(-2*u + 2, 2) / 2;
      const next = {};
      for (const k in target) {
        if (typeof target[k] === 'number' && typeof start[k] === 'number') {
          next[k] = start[k] + (target[k] - start[k]) * ease;
        } else {
          next[k] = u >= 1 ? target[k] : start[k];
        }
      }
      setParams(next);
      if (u < 1) morphRef.current = requestAnimationFrame(tick);
    };
    morphRef.current = requestAnimationFrame(tick);
  };

  const reset = () => {
    if (morphRef.current) cancelAnimationFrame(morphRef.current);
    setParams(DEF);
    setActivePreset('Normal');
    stateRef.current = { ...INIT_STATE };
    histRef.current = [];
    cycleBufRef.current = [];
    lastCycleRef.current = [];
    sndsRef.current = { s1: 0.02, s2: 0.34, s3: null, s4: null };
    lastPreloadRef.current = 1.0;
  };

  // ---------- ANIMATION LOOP ----------
  useEffect(() => {
    let raf;
    let lastWall = performance.now();
    let lastT = stateRef.current.t;
    let metricCounter = 0;

    function frame(now) {
      const wallDt = Math.min(0.05, (now - lastWall) / 1000);
      lastWall = now;

      if (running) {
        const SUB = 0.001;
        let nSteps = Math.max(1, Math.floor(wallDt / SUB));
        if (nSteps > 80) nSteps = 80;  // cap
        const dt = wallDt / nSteps;
        const p = paramsRef.current;
        const s = stateRef.current;

        for (let i = 0; i < nSteps; i++) {
          const out = simStep(s, p, dt);
          // Sample every ~5ms for buffers
          if (i % 4 === 0 || i === nSteps - 1) {
            const wallT = now / 1000 + (i - nSteps) * dt;
            const T = out.T;
            const ph = s.t / T;
            const sample = {
              wallT,
              t: s.t,
              T,
              phase: ph,
              P_lv: out.P_lv,
              P_la: out.P_la,
              P_ra: out.P_ra,
              P_rv: out.P_rv,
              P_sa: s.P_sa,
              P_pa: s.P_pa,
              V_lv: s.V_lv,
              V_rv: s.V_rv,
              ecg: ecgWave(ph),
            };
            histRef.current.push(sample);
            cycleBufRef.current.push(sample);

            if (out.cycled) {
              if (cycleBufRef.current.length > 5) {
                lastCycleRef.current = cycleBufRef.current.slice();
                computeMetrics(lastCycleRef.current, p);
                sndsRef.current = { s1: s.s1_phase, s2: s.s2_phase, s3: null, s4: null };
              }
              cycleBufRef.current = [];
            }
          }
          lastT = s.t;
        }

        // Trim history
        const cutoff = now / 1000 - 2.6;
        while (histRef.current.length > 0 && histRef.current[0].wallT < cutoff) {
          histRef.current.shift();
        }
      }

      drawPV();
      drawWiggers();
      raf = requestAnimationFrame(frame);
    }

    function computeMetrics(cyc, p) {
      let edv = -Infinity, esv = Infinity;
      let sbp = -Infinity, dbp = Infinity, mapSum = 0;
      let pasp = -Infinity, padp = Infinity, mpapSum = 0;
      let lapSum = 0, rapSum = 0;
      let lvespAtEsv = 0;
      let dpdtMax = 0;
      for (let i = 0; i < cyc.length; i++) {
        const c = cyc[i];
        if (c.V_lv > edv) edv = c.V_lv;
        if (c.V_lv < esv) { esv = c.V_lv; lvespAtEsv = c.P_lv; }
        if (c.P_sa > sbp) sbp = c.P_sa;
        if (c.P_sa < dbp) dbp = c.P_sa;
        if (c.P_pa > pasp) pasp = c.P_pa;
        if (c.P_pa < padp) padp = c.P_pa;
        mapSum += c.P_sa;
        mpapSum += c.P_pa;
        lapSum += c.P_la;
        rapSum += c.P_ra;
        if (i > 0) {
          const dpdt = (cyc[i].P_lv - cyc[i-1].P_lv) / Math.max(1e-3, cyc[i].wallT - cyc[i-1].wallT);
          if (dpdt > dpdtMax) dpdtMax = dpdt;
        }
      }
      const sv = edv - esv;
      const ef = (sv / edv) * 100;
      const co = (sv * p.hr) / 1000;
      // LVEDP = P_lv at moment V_lv is max
      let lvedp = 0;
      for (const c of cyc) if (c.V_lv === edv) { lvedp = c.P_lv; break; }
      setMetrics({
        EDV: edv, ESV: esv, SV: sv, EF: ef, CO: co,
        SBP: sbp, DBP: dbp, MAP: (sbp + 2*dbp)/3,
        LVEDP: lvedp, LVESP: lvespAtEsv,
        PASP: pasp, PADP: padp, mPAP: mpapSum / cyc.length,
        LAP: lapSum / cyc.length, RAP: rapSum / cyc.length,
        dPdt: dpdtMax,
      });
    }

    function drawPV() {
      const cv = pvCanvasRef.current;
      if (!cv) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = cv.getBoundingClientRect();
      const W = rect.width, H = rect.height;
      if (cv.width !== W * dpr || cv.height !== H * dpr) {
        cv.width = W * dpr; cv.height = H * dpr;
      }
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const padL = 50, padR = 18, padT = 20, padB = 38;
      const innerW = W - padL - padR;
      const innerH = H - padT - padB;
      const Vmin = 0, Vmax = 260;
      const Pmin = 0, Pmax = 220;
      const xV = v => padL + ((v - Vmin) / (Vmax - Vmin)) * innerW;
      const yP = pp => padT + (1 - (pp - Pmin) / (Pmax - Pmin)) * innerH;

      // Grid
      ctx.strokeStyle = C.gridFaint; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let v = 0; v <= Vmax; v += 50) {
        ctx.moveTo(xV(v), padT); ctx.lineTo(xV(v), padT + innerH);
      }
      for (let p = 0; p <= Pmax; p += 40) {
        ctx.moveTo(padL, yP(p)); ctx.lineTo(padL + innerW, yP(p));
      }
      ctx.stroke();

      // Axis labels
      ctx.fillStyle = C.textFaint;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      for (let v = 0; v <= Vmax; v += 50) ctx.fillText(v, xV(v), padT + innerH + 14);
      ctx.textAlign = 'right';
      for (let p = 0; p <= Pmax; p += 40) ctx.fillText(p, padL - 6, yP(p) + 3);

      ctx.fillStyle = C.textDim;
      ctx.font = '11px "Geist", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(studentMode ? 'LV Volume (mL)' : 'V_LV (mL)', padL + innerW/2, H - 6);
      ctx.save();
      ctx.translate(14, padT + innerH/2);
      ctx.rotate(-Math.PI/2);
      ctx.fillText(studentMode ? 'LV Pressure (mmHg)' : 'P_LV (mmHg)', 0, 0);
      ctx.restore();

      // ESPVR line (Ees * (V - V0))
      const p = paramsRef.current;
      const Ees = p.Ees_lv * p.inotropy;
      ctx.strokeStyle = C.espvr;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      const v1 = p.V0_lv;
      const v2 = Vmax;
      ctx.moveTo(xV(v1), yP(0));
      ctx.lineTo(xV(v2), yP(Ees * (v2 - p.V0_lv)));
      ctx.stroke();
      ctx.setLineDash([]);
      // ESPVR label
      ctx.fillStyle = C.espvr;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(studentMode ? 'Contractility' : 'ESPVR', xV(180), yP(Ees*(180 - p.V0_lv)) - 4);

      // EDPVR curve
      ctx.strokeStyle = C.edpvr;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      let started = false;
      for (let v = p.V0_lv; v <= Vmax; v += 4) {
        const pp = p.A_lv * (Math.exp(p.B_lv * (v - p.V0_lv)) - 1);
        if (pp > Pmax) break;
        if (!started) { ctx.moveTo(xV(v), yP(pp)); started = true; }
        else ctx.lineTo(xV(v), yP(pp));
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.edpvr;
      ctx.fillText(studentMode ? 'Stiffness' : 'EDPVR', xV(200), yP(40));

      // Ghost reference loop
      ctx.strokeStyle = C.ghost;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      for (let i = 0; i < refLoop.length; i++) {
        const pt = refLoop[i];
        if (i === 0) ctx.moveTo(xV(pt.V), yP(pt.P));
        else ctx.lineTo(xV(pt.V), yP(pt.P));
      }
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);

      // Active loop (last full cycle)
      const lc = lastCycleRef.current;
      if (lc.length > 4) {
        ctx.strokeStyle = C.P_lv;
        ctx.lineWidth = 2.2;
        ctx.shadowColor = C.P_lv;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        for (let i = 0; i < lc.length; i++) {
          const pt = lc[i];
          if (i === 0) ctx.moveTo(xV(pt.V_lv), yP(pt.P_lv));
          else ctx.lineTo(xV(pt.V_lv), yP(pt.P_lv));
        }
        ctx.closePath();
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Cursor at current state
      const curV = stateRef.current.V_lv;
      const histLast = histRef.current[histRef.current.length-1];
      const curP = histLast ? histLast.P_lv : 0;
      ctx.fillStyle = C.cursor;
      ctx.shadowColor = C.cursor;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(xV(curV), yP(curP), 4.5, 0, Math.PI*2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Title
      ctx.fillStyle = C.text;
      ctx.font = 'bold 11px "Geist", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('PRESSURE-VOLUME LOOP', padL, 14);
      // Legend
      ctx.font = '9.5px "JetBrains Mono", monospace';
      ctx.fillStyle = C.ghost; ctx.fillText('— normal ref', padL + innerW - 95, 14);
      ctx.fillStyle = C.P_lv;  ctx.fillText('— current', padL + innerW - 35, 14);
    }

    function drawWiggers() {
      const cv = wgCanvasRef.current;
      if (!cv) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = cv.getBoundingClientRect();
      const W = rect.width, H = rect.height;
      if (cv.width !== W * dpr || cv.height !== H * dpr) {
        cv.width = W * dpr; cv.height = H * dpr;
      }
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const padL = 56, padR = 16, padT = 16, padB = 22;
      const innerW = W - padL - padR;
      const innerH = H - padT - padB;
      // Track allocation (heights)
      const trackECG = innerH * 0.16;
      const trackPress = innerH * 0.45;
      const trackVol = innerH * 0.25;
      const trackSnd = innerH * 0.14;
      const yECG_top = padT;
      const yPress_top = yECG_top + trackECG;
      const yVol_top = yPress_top + trackPress;
      const ySnd_top = yVol_top + trackVol;

      // Time window: last 2 seconds
      const hist = histRef.current;
      if (hist.length < 2) return;
      const tEnd = hist[hist.length-1].wallT;
      const tStart = tEnd - 2.0;
      const xT = tt => padL + ((tt - tStart) / 2.0) * innerW;

      // Background bands
      ctx.fillStyle = '#0a1124';
      ctx.fillRect(padL, yECG_top, innerW, trackECG);
      ctx.fillStyle = '#0c1428';
      ctx.fillRect(padL, yPress_top, innerW, trackPress);
      ctx.fillStyle = '#0a1322';
      ctx.fillRect(padL, yVol_top, innerW, trackVol);
      ctx.fillStyle = '#0a0f20';
      ctx.fillRect(padL, ySnd_top, innerW, trackSnd);

      // Grid lines
      ctx.strokeStyle = C.gridFaint;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let s = 0; s <= 2; s += 0.2) {
        ctx.moveTo(padL + s/2 * innerW, padT);
        ctx.lineTo(padL + s/2 * innerW, padT + innerH);
      }
      ctx.stroke();

      // Pressure scale (0..160 mmHg)
      const Pmin = 0, Pmax = 160;
      const yP = pp => yPress_top + (1 - (pp - Pmin)/(Pmax - Pmin)) * trackPress;
      ctx.fillStyle = C.textFaint;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      [0, 40, 80, 120, 160].forEach(p => ctx.fillText(p, padL - 4, yP(p) + 3));

      // Pressure grid lines
      ctx.strokeStyle = C.gridFaint;
      ctx.beginPath();
      [40, 80, 120].forEach(p => {
        ctx.moveTo(padL, yP(p));
        ctx.lineTo(padL + innerW, yP(p));
      });
      ctx.stroke();

      // Volume scale (0..200 mL)
      const Vmin = 0, Vmax = 200;
      const yV = vv => yVol_top + (1 - (vv - Vmin)/(Vmax - Vmin)) * trackVol;
      ctx.textAlign = 'right';
      [0, 100, 200].forEach(v => ctx.fillText(v, padL - 4, yV(v) + 3));

      // ECG y center
      const yEcg = e => yECG_top + trackECG * 0.5 - e * (trackECG * 0.42);

      // Plot waveforms
      const plot = (color, accessor, lineW, glow) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineW;
        if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 4; }
        ctx.beginPath();
        let started = false;
        for (const s of hist) {
          if (s.wallT < tStart) continue;
          const x = xT(s.wallT);
          const y = accessor(s);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        if (glow) ctx.shadowBlur = 0;
      };

      plot(C.ecg, s => yEcg(s.ecg), 1.4, true);
      plot(C.P_la, s => yP(s.P_la), 1.4, false);
      plot(C.P_sa, s => yP(s.P_sa), 1.7, true);
      plot(C.P_lv, s => yP(s.P_lv), 1.7, true);
      plot(C.V_lv, s => yV(s.V_lv), 1.6, true);

      // Heart sound markers (S1, S2) on each cycle currently in window
      const snds = sndsRef.current;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      // Reconstruct cycle starts in the visible window (skip first sample)
      let lastPhase = -1;
      const cycleStartTs = [];
      for (const s of hist) {
        if (lastPhase >= 0 && s.phase < lastPhase - 0.3) cycleStartTs.push(s.wallT);
        lastPhase = s.phase;
      }
      cycleStartTs.forEach(cs => {
        const T = 60 / paramsRef.current.hr;
        const ts1 = cs + snds.s1 * T;
        const ts2 = cs + snds.s2 * T;
        if (ts1 >= tStart && ts1 <= tEnd) {
          ctx.strokeStyle = C.cursor;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(xT(ts1), ySnd_top + 4);
          ctx.lineTo(xT(ts1), ySnd_top + trackSnd - 4);
          ctx.stroke();
          ctx.fillStyle = C.cursor;
          ctx.fillText('S1', xT(ts1), ySnd_top + trackSnd - 6);
        }
        if (ts2 >= tStart && ts2 <= tEnd) {
          ctx.strokeStyle = '#fb923c';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(xT(ts2), ySnd_top + 4);
          ctx.lineTo(xT(ts2), ySnd_top + trackSnd - 4);
          ctx.stroke();
          ctx.fillStyle = '#fb923c';
          ctx.fillText('S2', xT(ts2), ySnd_top + trackSnd - 6);
        }
      });

      // Time cursor at current moment
      ctx.strokeStyle = C.cursor;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(xT(tEnd), padT);
      ctx.lineTo(xT(tEnd), padT + innerH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Track labels
      ctx.fillStyle = C.textDim;
      ctx.font = '10px "Geist", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('ECG', padL + 4, yECG_top + 12);
      ctx.fillText('Pressures (mmHg)', padL + 4, yPress_top + 12);
      ctx.fillText('LV Volume (mL)', padL + 4, yVol_top + 12);
      ctx.fillText('Sounds', padL + 4, ySnd_top + 12);

      // Legend (right side of pressure track)
      ctx.font = '9.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      const legX = padL + innerW - 110;
      ctx.fillStyle = C.P_lv;  ctx.fillText('■ P_LV', legX, yPress_top + 12);
      ctx.fillStyle = C.P_sa;  ctx.fillText('■ P_AO', legX + 50, yPress_top + 12);
      ctx.fillStyle = C.P_la;  ctx.fillText('■ P_LA', legX, yPress_top + 24);

      // Title
      ctx.fillStyle = C.text;
      ctx.font = 'bold 11px "Geist", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('WIGGERS DIAGRAM  (last 2.0 s)', padL, 12);
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [running, refLoop, studentMode]);

  // Heart SVG dynamic dims
  const heartViz = useMemo(() => {
    const lvFill = Math.min(1, Math.max(0.3, (metrics.EDV) / 180));
    const lvWall = 6 + Math.max(0, (params.Ees_lv * params.inotropy - 2) * 4);
    const rvFill = Math.min(1, Math.max(0.3, (metrics.EDV) / 180));
    const rvWall = 4 + Math.max(0, (params.Ees_rv * params.inotropy - 0.6) * 3);
    return { lvFill, lvWall, rvFill, rvWall };
  }, [metrics, params]);

  // ====================== RENDER ======================
  return (
    <div className="w-screen h-screen overflow-hidden" style={{
      background: `radial-gradient(ellipse at top, #0c1326 0%, ${C.bg} 60%)`,
      color: C.text,
      fontFamily: '"Geist", "Inter", system-ui, sans-serif',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: ${C.panel}; }
        ::-webkit-scrollbar-thumb { background: ${C.borderHi}; border-radius: 3px; }
        input[type=range] {
          -webkit-appearance: none; appearance: none;
          background: transparent; width: 100%; height: 18px;
        }
        input[type=range]::-webkit-slider-runnable-track {
          height: 3px; background: ${C.border}; border-radius: 3px;
        }
        input[type=range]::-moz-range-track {
          height: 3px; background: ${C.border}; border-radius: 3px;
        }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 14px; height: 14px; border-radius: 50%;
          background: ${C.cursor}; margin-top: -6px;
          box-shadow: 0 0 8px ${C.cursor};
          cursor: pointer;
        }
        input[type=range]::-moz-range-thumb {
          width: 14px; height: 14px; border-radius: 50%;
          background: ${C.cursor}; border: none;
          box-shadow: 0 0 8px ${C.cursor};
          cursor: pointer;
        }
        .glow-cyan { box-shadow: 0 0 12px rgba(34,211,238,0.18) inset, 0 0 6px rgba(34,211,238,0.08); }
        .panel {
          background: linear-gradient(180deg, ${C.panel} 0%, ${C.bg} 100%);
          border: 1px solid ${C.border};
          border-radius: 6px;
        }
        .num { font-family: "JetBrains Mono", monospace; font-feature-settings: "tnum" 1; }
        @keyframes pulse-soft {
          0%, 100% { opacity: 0.85; }
          50% { opacity: 1; }
        }
      `}</style>

      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: C.border, height: '44px' }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Activity size={18} color={C.cursor} style={{ filter: `drop-shadow(0 0 6px ${C.cursor})` }} />
            <div>
              <div style={{ fontWeight: 700, letterSpacing: '0.05em', fontSize: 13 }}>
                HEMOSIM <span style={{ color: C.cursor }}>PRO</span>
              </div>
              <div style={{ fontSize: 9, color: C.textFaint, letterSpacing: '0.15em' }}>
                CLINICAL HEMODYNAMIC WORKBENCH · v1.0
              </div>
            </div>
          </div>
          <div className="ml-4 flex items-center gap-2 px-2 py-1 rounded text-xs num" style={{ background: C.panelLight, border: `1px solid ${C.border}` }}>
            <span style={{ color: C.textFaint }}>preset:</span>
            <span style={{ color: PRESETS[activePreset].color, fontWeight: 600 }}>
              {PRESETS[activePreset].label.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs" style={{ color: C.textDim }}>
            <GraduationCap size={14} />
            <span>{studentMode ? 'Student' : 'Clinical'}</span>
            <button
              onClick={() => setStudentMode(!studentMode)}
              className="relative w-9 h-5 rounded-full transition-colors"
              style={{ background: studentMode ? C.cursor : C.border }}
            >
              <div
                className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                style={{
                  background: '#fff',
                  left: studentMode ? '18px' : '2px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                }}
              />
            </button>
          </div>

          <button
            onClick={() => setRunning(!running)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs"
            style={{ background: C.panelLight, border: `1px solid ${C.border}`, color: C.text }}
          >
            {running ? <><Pause size={12}/> Pause</> : <><Play size={12}/> Run</>}
          </button>
          <button
            onClick={reset}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs"
            style={{ background: C.panelLight, border: `1px solid ${C.border}`, color: C.text }}
          >
            <RotateCcw size={12}/> Reset
          </button>
        </div>
      </header>

      {/* Main grid */}
      <div className="grid gap-2 p-2" style={{
        height: 'calc(100vh - 44px)',
        gridTemplateColumns: '2fr 2fr 1fr 2fr',
        gridTemplateRows: 'auto minmax(0, 1.5fr) minmax(0, 1fr) auto',
        gridTemplateAreas: `
          "presets presets presets presets"
          "pv pv heart ctrl"
          "wig wig wig reason"
          "status status status status"
        `,
      }}>
        {/* PRESETS ROW */}
        <div className="panel flex items-center gap-1 px-2 py-1.5 overflow-x-auto" style={{ gridArea: 'presets' }}>
          <div className="flex items-center gap-1.5 pr-2 mr-1 border-r" style={{ borderColor: C.border }}>
            <Stethoscope size={11} color={C.cursor} />
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: C.textDim, whiteSpace: 'nowrap' }}>
              PATHOLOGY
            </span>
          </div>
          {Object.entries(PRESETS).map(([key, preset]) => {
            const active = activePreset === key;
            return (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded transition-all"
                style={{
                  background: active ? `${preset.color}22` : C.panelLight,
                  border: `1px solid ${active ? preset.color : C.border}`,
                  boxShadow: active ? `0 0 8px ${preset.color}55` : 'none',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
                title={preset.description}
              >
                <span className="num" style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: preset.color,
                  letterSpacing: '0.05em',
                }}>
                  {preset.short}
                </span>
                <span style={{ fontSize: 10.5, color: active ? C.text : C.textDim, fontWeight: active ? 600 : 400 }}>
                  {preset.label.replace(/\s*\([^)]+\)/, '')}
                </span>
              </button>
            );
          })}
        </div>

        {/* PV LOOP */}
        <div className="panel relative" style={{ gridArea: 'pv' }}>
          <canvas ref={pvCanvasRef} className="w-full h-full block" />
        </div>

        {/* HEART SVG */}
        <div className="panel flex flex-col p-2" style={{ gridArea: 'heart' }}>
          <div className="flex items-center justify-between mb-1">
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: C.text }}>
              HEART
            </div>
            <Heart size={11} style={{ color: C.P_lv, animation: 'pulse-soft 1s infinite' }} />
          </div>
          <div className="flex-1 flex items-center justify-center min-h-0">
            <HeartSVG
              metrics={metrics}
              params={params}
              state={stateRef}
              hist={histRef}
            />
          </div>
        </div>

        {/* CONTROLS */}
        <div className="panel p-3 overflow-y-auto" style={{ gridArea: 'ctrl' }}>
          <div className="flex items-center gap-1.5 mb-3">
            <Settings2 size={12} color={C.cursor} />
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em' }}>HEMODYNAMIC CONTROLS</span>
          </div>

          <Slider
            label={studentMode ? "Heart Rate" : "Heart Rate (HR)"}
            sub="bpm" min={30} max={180} step={1}
            value={params.hr} onChange={v => updateParam('hr', v)}
            normal={70} icon={<Activity size={10}/>}
          />
          <Slider
            label={studentMode ? "Preload" : "Preload (Ved)"}
            sub="× normal" min={0.4} max={1.8} step={0.02}
            value={params.preload} onChange={v => updateParam('preload', v)}
            normal={1.0} icon={<Wind size={10}/>}
          />
          <Slider
            label={studentMode ? "Vessel Resistance" : "Afterload (Rsys)"}
            sub="× normal" min={0.4} max={2.5} step={0.02}
            value={params.afterload} onChange={v => updateParam('afterload', v)}
            normal={1.0} icon={<Gauge size={10}/>}
          />
          <Slider
            label={studentMode ? "Contractility" : "Inotropy (Ees)"}
            sub="× normal" min={0.3} max={2.5} step={0.02}
            value={params.inotropy} onChange={v => updateParam('inotropy', v)}
            normal={1.0} icon={<Zap size={10}/>}
          />
          <Slider
            label={studentMode ? "Relaxation" : "Lusitropy (1/τ)"}
            sub="× normal" min={0.4} max={2.0} step={0.02}
            value={params.lusitropy} onChange={v => updateParam('lusitropy', v)}
            normal={1.0} icon={<Waves size={10}/>}
          />

          <div className="mt-3 pt-3 border-t" style={{ borderColor: C.border }}>
            <div style={{ fontSize: 10, color: C.textFaint, lineHeight: 1.5 }}>
              {studentMode
                ? "Move sliders to see how each lever affects pressures, volumes, and the PV loop in real time."
                : "Sliders apply multiplicative scaling to baseline params. Closed-loop equilibrium re-establishes within 3–5 cycles."}
            </div>
          </div>
        </div>

        {/* WIGGERS */}
        <div className="panel relative" style={{ gridArea: 'wig' }}>
          <canvas ref={wgCanvasRef} className="w-full h-full block" />
        </div>

        {/* REASONING */}
        <div className="panel p-3 overflow-y-auto" style={{ gridArea: 'reason' }}>
          <div className="flex items-center gap-1.5 mb-2">
            <Stethoscope size={12} color={C.cursor} />
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em' }}>
              {studentMode ? 'WHAT YOU\'RE SEEING' : 'PHYSIOLOGY NOTES'}
            </span>
          </div>
          <ReasoningPanel studentMode={studentMode} metrics={metrics} params={params} activePreset={activePreset} />
        </div>

        {/* STATUS STRIP */}
        <div className="panel" style={{ gridArea: 'status', minHeight: '76px' }}>
          <StatusStrip metrics={metrics} studentMode={studentMode} />
        </div>
      </div>

      {warn && (
        <div className="absolute bottom-4 right-4 p-3 rounded-md text-xs"
             style={{ background: '#3a1a1a', border: `1px solid ${C.bad}`, color: '#fecaca' }}>
          {warn}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
//  SLIDER COMPONENT
// ===========================================================================
function Slider({ label, sub, min, max, step, value, onChange, normal, icon }) {
  const pct = ((value - min) / (max - min)) * 100;
  const normalPct = ((normal - min) / (max - min)) * 100;
  const isAbnormal = Math.abs(value - normal) / (max - min) > 0.05;
  return (
    <div className="mb-2.5">
      <div className="flex items-center justify-between mb-0.5">
        <div className="flex items-center gap-1.5" style={{ fontSize: 10.5, color: C.textDim }}>
          <span style={{ color: C.textFaint }}>{icon}</span>
          <span style={{ fontWeight: 500 }}>{label}</span>
        </div>
        <div className="num" style={{
          fontSize: 11,
          color: isAbnormal ? C.cursor : C.textDim,
          fontWeight: 600,
        }}>
          {value.toFixed(step < 1 ? 2 : 0)} <span style={{ fontSize: 9, color: C.textFaint }}>{sub}</span>
        </div>
      </div>
      <div className="relative">
        <input
          type="range"
          min={min} max={max} step={step}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="block"
        />
        {/* normal marker */}
        <div className="absolute pointer-events-none" style={{
          left: `${normalPct}%`, top: 4, width: 1, height: 11,
          background: C.textFaint, transform: 'translateX(-0.5px)',
        }} />
      </div>
    </div>
  );
}

// ===========================================================================
//  HEART SVG COMPONENT
// ===========================================================================
function HeartSVG({ metrics, params, state, hist }) {
  // pulsing radii based on volume
  const lvSize = 0.35 + 0.5 * Math.min(1, (metrics.EDV) / 180);
  const rvSize = 0.32 + 0.45 * Math.min(1, (metrics.EDV) / 180);
  const lvWallThickness = 5 + Math.max(0, (params.Ees_lv * params.inotropy - 2.0) * 4);
  const rvWallThickness = 3 + Math.max(0, (params.Ees_rv * params.inotropy - 0.55) * 3);

  // Dynamic instantaneous values from latest sample
  const last = hist.current[hist.current.length - 1];
  const pLV = last ? last.P_lv : 0;
  const pLA = last ? last.P_la : 0;
  const pSA = last ? last.P_sa : 0;
  const pRV = last ? last.P_rv : 0;
  const pRA = last ? last.P_ra : 0;
  const pPA = last ? last.P_pa : 0;

  const mitOpen = pLA > pLV;
  const aorOpen = pLV > pSA;
  const triOpen = pRA > pRV;
  const puvOpen = pRV > pPA;

  const valveColor = (open) => open ? C.cursor : C.textFaint;

  return (
    <svg viewBox="0 0 200 280" style={{ width: '100%', height: '100%', maxHeight: '100%' }}>
      <defs>
        <radialGradient id="lvGrad" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#7f1d1d" />
          <stop offset="100%" stopColor="#3b0a0a" />
        </radialGradient>
        <radialGradient id="rvGrad" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#1e3a5f" />
          <stop offset="100%" stopColor="#0a1d36" />
        </radialGradient>
        <radialGradient id="laGrad" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#7c2d12" />
          <stop offset="100%" stopColor="#431407" />
        </radialGradient>
        <radialGradient id="raGrad" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#164e63" />
          <stop offset="100%" stopColor="#082f3a" />
        </radialGradient>
      </defs>

      {/* Aorta arch */}
      <path
        d="M 100 18 Q 100 8, 130 8 Q 165 8, 165 40 L 165 60"
        stroke={C.P_sa} strokeWidth="6" fill="none" strokeLinecap="round" opacity={0.85}
      />
      <text x="160" y="74" fill={C.P_sa} fontSize="7" textAnchor="middle" className="num">AO</text>

      {/* Pulmonary trunk */}
      <path
        d="M 100 18 Q 100 8, 70 8 Q 40 8, 40 40 L 40 55"
        stroke={C.P_pa} strokeWidth="5" fill="none" strokeLinecap="round" opacity={0.8}
      />
      <text x="40" y="68" fill={C.P_pa} fontSize="7" textAnchor="middle" className="num">PA</text>

      {/* RA */}
      <ellipse cx="65" cy="80" rx="22" ry={14 + rvSize*4} fill="url(#raGrad)" stroke={C.P_ra} strokeWidth="1.2" opacity="0.95" />
      <text x="65" y="83" fill={C.text} fontSize="9" textAnchor="middle" fontWeight="600">RA</text>

      {/* LA */}
      <ellipse cx="135" cy="80" rx="22" ry={14 + lvSize*4} fill="url(#laGrad)" stroke={C.P_la} strokeWidth="1.2" opacity="0.95" />
      <text x="135" y="83" fill={C.text} fontSize="9" textAnchor="middle" fontWeight="600">LA</text>

      {/* Tricuspid valve */}
      <line x1="50" y1="100" x2="80" y2="100" stroke={valveColor(triOpen)} strokeWidth="2" opacity={triOpen ? 1 : 0.4} strokeDasharray={triOpen ? "0" : "3,3"} />

      {/* Mitral valve */}
      <line x1="120" y1="100" x2="150" y2="100" stroke={valveColor(mitOpen)} strokeWidth="2" opacity={mitOpen ? 1 : 0.4} strokeDasharray={mitOpen ? "0" : "3,3"} />

      {/* RV (left side, smaller, crescent-ish) */}
      <ellipse cx="65" cy={170 + (1-rvSize)*15} rx={28 + rvSize*8} ry={50 + rvSize*15}
               fill="url(#rvGrad)" stroke={C.P_rv} strokeWidth={rvWallThickness} opacity="0.95" />
      <text x="65" y="170" fill={C.text} fontSize="11" textAnchor="middle" fontWeight="700">RV</text>

      {/* LV (right side, large, rounded) */}
      <ellipse cx="135" cy={170 + (1-lvSize)*15} rx={32 + lvSize*10} ry={56 + lvSize*16}
               fill="url(#lvGrad)" stroke={C.P_lv} strokeWidth={lvWallThickness} opacity="0.95" />
      <text x="135" y="170" fill={C.text} fontSize="11" textAnchor="middle" fontWeight="700">LV</text>

      {/* Pulmonic valve */}
      <line x1="50" y1="115" x2="80" y2="115" stroke={valveColor(puvOpen)} strokeWidth="2" opacity={puvOpen ? 1 : 0.4} strokeDasharray={puvOpen ? "0" : "3,3"} />

      {/* Aortic valve */}
      <line x1="120" y1="115" x2="150" y2="115" stroke={valveColor(aorOpen)} strokeWidth="2" opacity={aorOpen ? 1 : 0.4} strokeDasharray={aorOpen ? "0" : "3,3"} />

      {/* Live pressure labels */}
      <text x="100" y="265" fill={C.textFaint} fontSize="7" textAnchor="middle" className="num">
        wall ≈ {lvWallThickness.toFixed(1)} px (Ees={(params.Ees_lv*params.inotropy).toFixed(2)})
      </text>
    </svg>
  );
}

// ===========================================================================
//  STATUS STRIP
// ===========================================================================
function StatusStrip({ metrics, studentMode }) {
  const items = studentMode ? [
    { l: 'Ejection Fraction', v: metrics.EF.toFixed(0), u: '%', c: metrics.EF >= 50 ? C.ok : metrics.EF >= 40 ? C.warn : C.bad, ref: '≥55%' },
    { l: 'Stroke Volume',    v: metrics.SV.toFixed(0), u: 'mL', c: C.text, ref: '60–100' },
    { l: 'Cardiac Output',   v: metrics.CO.toFixed(2), u: 'L/min', c: metrics.CO >= 4 ? C.ok : C.warn, ref: '4–8' },
    { l: 'Blood Pressure',   v: `${metrics.SBP.toFixed(0)}/${metrics.DBP.toFixed(0)}`, u: 'mmHg', c: C.text, ref: '120/80' },
    { l: 'Mean Arterial P',  v: metrics.MAP.toFixed(0), u: 'mmHg', c: metrics.MAP >= 65 ? C.ok : C.bad, ref: '70–100' },
    { l: 'LV End-Dia P',     v: metrics.LVEDP.toFixed(0), u: 'mmHg', c: metrics.LVEDP < 15 ? C.ok : C.warn, ref: '<12' },
    { l: 'PA Pressure',      v: `${metrics.PASP.toFixed(0)}/${metrics.PADP.toFixed(0)}`, u: 'mmHg', c: metrics.PASP < 35 ? C.ok : C.warn, ref: '25/10' },
    { l: 'Mean LA P',        v: metrics.LAP.toFixed(0), u: 'mmHg', c: metrics.LAP < 12 ? C.ok : C.warn, ref: '6–12' },
    { l: 'dP/dt max',        v: (metrics.dPdt).toFixed(0), u: 'mmHg/s', c: C.text, ref: '~1500' },
  ] : [
    { l: 'EF',     v: metrics.EF.toFixed(1),  u: '%',     c: metrics.EF >= 50 ? C.ok : metrics.EF >= 40 ? C.warn : C.bad, ref: '≥55%' },
    { l: 'SV',     v: metrics.SV.toFixed(0),  u: 'mL',    c: C.text, ref: '60–100' },
    { l: 'CO',     v: metrics.CO.toFixed(2),  u: 'L/min', c: metrics.CO >= 4 ? C.ok : C.warn, ref: '4–8' },
    { l: 'EDV/ESV',v: `${metrics.EDV.toFixed(0)}/${metrics.ESV.toFixed(0)}`, u: 'mL', c: C.text, ref: '120/50' },
    { l: 'BP',     v: `${metrics.SBP.toFixed(0)}/${metrics.DBP.toFixed(0)}`, u: 'mmHg', c: C.text, ref: '120/80' },
    { l: 'MAP',    v: metrics.MAP.toFixed(0), u: 'mmHg',  c: metrics.MAP >= 65 ? C.ok : C.bad, ref: '70–100' },
    { l: 'LVEDP',  v: metrics.LVEDP.toFixed(1), u: 'mmHg', c: metrics.LVEDP < 15 ? C.ok : C.warn, ref: '<12' },
    { l: 'PASP/PADP', v: `${metrics.PASP.toFixed(0)}/${metrics.PADP.toFixed(0)}`, u: 'mmHg', c: metrics.PASP < 35 ? C.ok : C.warn, ref: '25/10' },
    { l: 'mPAP',   v: metrics.mPAP.toFixed(1), u: 'mmHg', c: metrics.mPAP < 25 ? C.ok : C.bad, ref: '<20' },
    { l: 'mLAP',   v: metrics.LAP.toFixed(1),  u: 'mmHg', c: metrics.LAP < 12 ? C.ok : C.warn, ref: '6–12' },
    { l: 'mRAP',   v: metrics.RAP.toFixed(1),  u: 'mmHg', c: C.text, ref: '2–6' },
    { l: 'dP/dt',  v: metrics.dPdt.toFixed(0), u: 'mmHg/s', c: C.text, ref: '~1500' },
  ];

  return (
    <div className="flex items-stretch h-full">
      {items.map((it, i) => (
        <div key={i}
             className="flex-1 flex flex-col justify-center px-2.5 py-2"
             style={{ borderRight: i < items.length-1 ? `1px solid ${C.border}` : 'none' }}>
          <div style={{ fontSize: 9, color: C.textFaint, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {it.l}
          </div>
          <div className="num flex items-baseline gap-1" style={{ marginTop: 2 }}>
            <span style={{ fontSize: 17, fontWeight: 600, color: it.c }}>{it.v}</span>
            <span style={{ fontSize: 9, color: C.textFaint }}>{it.u}</span>
          </div>
          <div className="num" style={{ fontSize: 8, color: C.textFaint, marginTop: 1 }}>
            ref: {it.ref}
          </div>
        </div>
      ))}
    </div>
  );
}

// ===========================================================================
//  REASONING PANEL
// ===========================================================================
function ReasoningPanel({ studentMode, metrics, params, activePreset }) {
  const blocks = [];
  const preset = PRESETS[activePreset];

  // Lead with preset teaching when not Normal
  if (activePreset !== 'Normal') {
    blocks.push({
      title: preset.label,
      body: preset.description,
      accent: preset.color,
    });
    blocks.push({
      title: 'What to look for',
      body: preset.teaching,
      accent: preset.color,
    });
  }

  if (studentMode) {
    if (activePreset === 'Normal') {
      blocks.push({
        title: 'The Cardiac Cycle',
        body: 'The PV loop traces one heartbeat as a counter-clockwise rectangle. Four corners = mitral closure (S1) → aortic opening → aortic closure (S2) → mitral opening. Area inside = stroke work.',
      });
    }
    if (params.preload > 1.15) {
      blocks.push({ title: 'You raised preload',
        body: 'More venous return → higher EDV → Frank-Starling: stretched fibers contract harder → larger SV. Loop shifts right and grows taller.' });
    }
    if (params.afterload > 1.2) {
      blocks.push({ title: 'You raised afterload',
        body: 'Higher vessel resistance → ventricle must generate more pressure to open the aortic valve → less ejection → SV↓, ESV↑. Loop becomes taller and narrower.' });
    }
    if (params.inotropy > 1.2) {
      blocks.push({ title: 'You raised contractility',
        body: 'Stronger ventricle empties to a lower ESV at any given afterload → ESPVR steepens → SV and EF rise.' });
    }
    if (params.lusitropy < 0.8) {
      blocks.push({ title: 'You impaired relaxation',
        body: 'Slower active relaxation → ventricle stays stiff in early diastole → incomplete filling → LVEDP rises. The diastolic dysfunction pattern of HFpEF.' });
    }
    if (activePreset === 'Normal' && blocks.length === 1) {
      blocks.push({ title: 'Try this',
        body: 'Move Preload up — watch SV grow (Frank-Starling). Then raise Afterload — SV falls while P_LV rises. Then click HOCM and lower Preload — watch the obstruction worsen.' });
    }
  } else {
    if (activePreset === 'Normal') {
      blocks.push({
        title: 'Closed-loop biventricular model',
        body: 'Suga E(t) (double-hill) drives both ventricles. Atrial elastance phase-shifted to t/T ≈ 0.85 (atrial kick). Two 2-element windkessels. Diode valves with optional regurgitant Gleak.',
      });
    }
    blocks.push({
      title: 'Live interpretation',
      body: `EF ${metrics.EF.toFixed(0)}% · CO ${metrics.CO.toFixed(2)} L/min · MAP ${metrics.MAP.toFixed(0)} mmHg · LVEDP ${metrics.LVEDP.toFixed(0)} mmHg. ${
        metrics.LVEDP > 18 ? 'LVEDP elevated → pulmonary congestion. ' : ''
      }${metrics.MAP < 65 ? 'MAP below organ perfusion threshold. ' : ''}${
        metrics.PASP > 35 ? 'PASP elevated → pulmonary HTN. ' : ''
      }${metrics.EF < 40 ? 'Reduced EF (HFrEF range). ' : ''}${
        metrics.EF >= 50 && metrics.LVEDP > 15 ? 'Preserved EF + high LVEDP → HFpEF physiology. ' : ''
      }`,
    });
  }

  return (
    <div className="space-y-2.5">
      {blocks.map((b, i) => (
        <div key={i} className="rounded p-2.5" style={{
          background: C.panelLight,
          border: `1px solid ${b.accent || C.border}`,
          borderLeftWidth: b.accent ? '3px' : '1px',
        }}>
          <div className="flex items-center gap-1.5 mb-1">
            <Info size={10} color={b.accent || C.cursor} />
            <span style={{ fontSize: 10.5, fontWeight: 600, color: C.text }}>{b.title}</span>
          </div>
          <p style={{ fontSize: 10.5, lineHeight: 1.55, color: C.textDim, margin: 0 }}>
            {b.body}
          </p>
        </div>
      ))}
    </div>
  );
}
