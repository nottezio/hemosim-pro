# HemoSim Pro — Clinical Hemodynamic Workbench

A real-time, closed-loop **biventricular cardiac hemodynamic simulator** with 8 pathology presets. Built for cardiology learners, residents, and educators.

> Suga time-varying elastance · double-hill activation · Frank windkessels · diode valves · Forward Euler @ 1 ms

---

## ✨ Features

| | |
|---|---|
| **Engine** | Closed-loop biventricular (LV + RV + LA + RA + systemic + pulmonary windkessels) |
| **Live waveforms** | PV loop, Wiggers diagram (ECG, P_LV, P_AO, P_LA, V_LV, S1/S2 markers) |
| **Heart visual** | Pulsing chambers, color-coded valves, wall thickness reflects contractility |
| **Sliders** | HR, Preload, Afterload, Inotropy, Lusitropy — all live, no reset needed |
| **Presets** | Normal · AS · AR · MS · MR · HOCM (dynamic LVOT) · HFrEF · HFpEF |
| **Modes** | Clinical (full terminology) ↔ Student (simplified labels + teaching) |
| **Status strip** | EF, SV, CO, BP, MAP, LVEDP, PASP/PADP, mLAP, mRAP, dP/dt — live, color-coded |

---

## 🚀 Deploy to GitHub Pages

### One-time setup

```bash
# 1. Create the repo on GitHub (e.g. yourname/hemosim-pro), then locally:
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/yourname/hemosim-pro.git
git push -u origin main
```

### Configure Pages (one click on GitHub)

1. Go to your repo on GitHub
2. Click **Settings** → **Pages** (left sidebar)
3. Under **Build and deployment** → **Source**, select **GitHub Actions**
4. Done. The workflow at `.github/workflows/deploy.yml` will fire on every push to `main`

Your site will be live at:
```
https://yourname.github.io/hemosim-pro/
```

### ⚠️ Important: match the `base` path

In `vite.config.js`, the `base` field MUST match your repo name:

```js
base: '/hemosim-pro/',   // for repo: yourname/hemosim-pro
base: '/',               // for user site: yourname.github.io
base: '/cardio-tools/',  // if you rename the repo to "cardio-tools"
```

If you skip this, JS/CSS will return 404 in production.

---

## 🛠️ Local development

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # output → dist/
npm run preview      # serve the production build locally
```

**Min viewport: 1280 × 720.** Mobile/tablet not supported in v1 (the closed-loop visualization needs the screen real estate).

---

## 🩺 What each preset demonstrates

| Preset | Hallmark finding | Mechanism |
|---|---|---|
| **Normal** | EF 60%, BP 120/80, CO 5 L/min | Baseline reference |
| **AS** | LV–AO gradient ~50 mmHg, ↑LVEDP | Severe valve narrowing + LVH |
| **AR** | Wide pulse pressure, dilated LV (EDV ↑) | Diastolic regurg → eccentric remodeling |
| **MS** | ↑mLAP, low LVEDP, small LV | Diastolic LA→LV gradient |
| **MR** | Giant LA v-wave, ↑EDV | Systolic backflow into LA |
| **HOCM** | Spike-and-dome aorta, ↑LVEDP | Dynamic LVOT obstruction (Venturi/SAM) |
| **HFrEF** | EF 30%, dilated LV, ↑LVEDP | Depressed contractility |
| **HFpEF** | Preserved EF, ↑LVEDP, ↑mLAP | Stiff LV + impaired relaxation |

**Try this clinical experiment:**
1. Click **HOCM**
2. Lower the **Preload** slider
3. Watch the LV–AO gradient grow — exactly what happens during Valsalva (↓venous return). This is why HOCM patients have exertional syncope.

---

## 🧮 Model details

The engine uses the standard **Suga time-varying elastance** formulation:

```
P(V, t) = e(t) · Ees · (V - V₀) + (1 - e(t)) · A · (e^(B·(V-V₀)) - 1)
              ⌊── ESPVR (active) ──⌋   ⌊─── EDPVR (passive) ───⌋
```

where the activation function `e(t)` is a normalized double-hill:

```
e(tn) = (g₁ / (1+g₁)) · (1 / (1+g₂))     where  gᵢ = (tn/τᵢ)^nᵢ
```

Atrial activation is phase-shifted to `t/T ≈ 0.85` (atrial kick before next QRS).

Vasculature is two 2-element windkessels:
- **Systemic**: C_sa, R_sys → C_sv → R_sv→RA
- **Pulmonary**: C_pa, R_pul → C_pv → R_pv→LA

Valves are diodes with optional regurgitant conductance `Gleak`. HOCM uses a dynamic `R_aor`:

```
R_aor_eff = R_aor · (1 + 12 · max(0, 1 - V_lv/55))
```

Integration is forward Euler at 1 ms substeps, capped at 80 substeps/frame for stability.

---

## 📂 Project structure

```
hemosim-pro/
├── .github/workflows/deploy.yml   GitHub Actions auto-deploy
├── public/
│   └── favicon.svg
├── src/
│   ├── HemoSimPro.jsx             Main component (~1400 lines, single-file)
│   ├── main.jsx                   React 18 entry
│   └── index.css                  Tailwind + body reset
├── index.html
├── package.json                   React 18, Vite 5, Tailwind 3.4, lucide-react
├── tailwind.config.js
├── postcss.config.js
└── vite.config.js
```

---

## 🔬 Roadmap (v2 candidates)

- [ ] Save/load custom parameter sets to URL hash
- [ ] Tablet-responsive layout
- [ ] Drug effects (norepinephrine, dobutamine, milrinone, beta-blocker)
- [ ] Mechanical support (IABP, Impella, VA-ECMO)
- [ ] Combined lesions (e.g. AS + AR mixed disease)
- [ ] Quiz mode: present a PV loop, ask user to identify pathology

---

## 📜 License

MIT (see LICENSE). Built for educational use. **Not intended for clinical decision-making.**

---

*Built with React 18 · Vite · Tailwind · lucide-react*
