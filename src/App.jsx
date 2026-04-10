import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ─── Persistence (keyed per user) ───
const getKey = (uid) => `kronex-data-${uid||"anon"}`;
const load = (uid) => { try { const r = localStorage.getItem(getKey(uid)); return r ? JSON.parse(r) : null; } catch { return null; } };
const save = (d, uid) => { try { localStorage.setItem(getKey(uid), JSON.stringify(d)); } catch {} };

// ─── Default config & data ───
const DEFAULT_CONFIG = {
  saveName: "Minha Carreira",
  theme: "midnight",
  accentColor: "#22D3EE",
  competitions: ["Liga", "Copa Nacional", "Champions League", "Supercopa", "Copa do Mundo de Clubes"],
  positions: ["GOL", "ZAG", "LE", "LD", "VOL", "MC", "ME", "MD", "MEI", "PE", "PD", "SA", "ATA"],
  transferTypes: ["Compra", "Venda", "Empréstimo (entrada)", "Empréstimo (saída)", "Pré-contrato", "Base"],
  matchResults: ["Vitória", "Empate", "Derrota"],
  trophyTypes: ["Liga", "Copa Nacional", "Champions League", "Liga Europa", "Supercopa", "Copa do Mundo de Clubes", "Outro"],
};

const DEFAULT_DATA = {
  config: { ...DEFAULT_CONFIG },
  saves: [],
  activeSaveId: null,
  _version: 1,
};

const DEFAULT_SAVE = {
  id: null,
  name: "Nova Carreira",
  gameVersion: "EA FC 26",
  difficulty: "Lendário",
  createdAt: "",
  seasons: [],
  activeSeasonId: null,
  managerName: "",
  managerNationality: "",
  hallOfFame: [],
  records: {},
  timeline: [],
};

const DEFAULT_SEASON = {
  id: null,
  number: 1,
  teamName: "",
  teamBadgeEmoji: "⚽",
  league: "",
  year: "2025/26",
  players: [],
  matches: [],
  transfers: [],
  trophies: [],
  objectives: [],
  notes: "",
  youthAcademy: [],
  leaguePosition: "",
  leaguePoints: "",
  diary: [],
};

// ─── Data migration ───
const DATA_VERSION = 1;
const migrateData = (d) => {
  if (!d) return d;
  const v = d._version || 1;
  if (v >= DATA_VERSION) return d;
  let m = { ...d };
  m._version = DATA_VERSION;
  return m;
};

// ─── Helpers ───
const today = () => new Date().toISOString().slice(0, 10);
const genId = () => Date.now() + Math.random();
const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

// Compute player rating color
const ratingColor = (r) => {
  if (r >= 85) return "var(--green)";
  if (r >= 75) return "var(--blue)";
  if (r >= 65) return "var(--yellow)";
  return "var(--text3)";
};

// Match result badge
const resultBadge = (goalsFor, goalsAgainst) => {
  if (goalsFor > goalsAgainst) return { label: "V", cls: "tg-g" };
  if (goalsFor < goalsAgainst) return { label: "D", cls: "tg-r" };
  return { label: "E", cls: "tg-y" };
};

// Aggregate match stats
const matchStats = (matches) => {
  const w = matches.filter(m => m.goalsFor > m.goalsAgainst).length;
  const d = matches.filter(m => m.goalsFor === m.goalsAgainst).length;
  const l = matches.filter(m => m.goalsFor < m.goalsAgainst).length;
  const gf = matches.reduce((a, m) => a + (m.goalsFor || 0), 0);
  const ga = matches.reduce((a, m) => a + (m.goalsAgainst || 0), 0);
  return { w, d, l, gf, ga, total: matches.length, pts: w * 3 + d };
};

// Form streak (últimos 5)
const formStreak = (matches) => {
  return matches.slice(-5).map(m => {
    if (m.goalsFor > m.goalsAgainst) return "V";
    if (m.goalsFor < m.goalsAgainst) return "D";
    return "E";
  });
};

// Win streak / losing streak
const getStreaks = (matches) => {
  let winStreak = 0, loseStreak = 0, currentWin = 0, currentLose = 0, unbeaten = 0, currentUnbeaten = 0;
  matches.forEach(m => {
    if (m.goalsFor > m.goalsAgainst) { currentWin++; currentLose = 0; currentUnbeaten++; winStreak = Math.max(winStreak, currentWin); }
    else if (m.goalsFor < m.goalsAgainst) { currentLose++; currentWin = 0; currentUnbeaten = 0; loseStreak = Math.max(loseStreak, currentLose); }
    else { currentWin = 0; currentLose = 0; currentUnbeaten++; }
    unbeaten = Math.max(unbeaten, currentUnbeaten);
  });
  return { winStreak, loseStreak, unbeaten };
};

// Best XI auto - pick highest rated player per position
const getBestXI = (players, formation) => {
  const slots = FORMATIONS[formation] || FORMATIONS["4-3-3"];
  return slots.map(pos => {
    const candidates = players.filter(p => p.position === pos || (p.altPositions || []).includes(pos));
    if (candidates.length === 0) return { position: pos, player: null };
    candidates.sort((a, b) => (b.overall || 0) - (a.overall || 0));
    return { position: pos, player: candidates[0] };
  });
};

const FORMATIONS = {
  "4-3-3": ["GOL","LD","ZAG","ZAG","LE","VOL","MC","MC","PD","ATA","PE"],
  "4-4-2": ["GOL","LD","ZAG","ZAG","LE","MD","MC","MC","ME","ATA","ATA"],
  "4-2-3-1": ["GOL","LD","ZAG","ZAG","LE","VOL","VOL","PD","MEI","PE","ATA"],
  "3-5-2": ["GOL","ZAG","ZAG","ZAG","LD","MC","VOL","ME","MEI","ATA","ATA"],
  "4-1-4-1": ["GOL","LD","ZAG","ZAG","LE","VOL","MD","MC","MC","ME","ATA"],
  "3-4-3": ["GOL","ZAG","ZAG","ZAG","LD","MC","MC","LE","PD","ATA","PE"],
  "5-3-2": ["GOL","LD","ZAG","ZAG","ZAG","LE","MC","MC","MC","ATA","ATA"],
  "4-3-2-1": ["GOL","LD","ZAG","ZAG","LE","MC","MC","MC","MEI","MEI","ATA"],
};

const GAME_VERSIONS = ["EA FC 26", "EA FC 25", "EA FC 24", "FIFA 23"];
const DIFFICULTIES = ["Amador", "Semi-Pro", "Profissional", "Classe Mundial", "Lendário", "Ultimate"];

// ─── Theme presets ───
const THEMES = {
  pitch: { "--bg":"#0A0F0A","--bg2":"#111A11","--bg3":"#1A261A","--bg4":"#223322","--border":"#2A3D2A","--border2":"#345534","--text":"#E0F0E0","--text2":"#90B890","--text3":"#608860" },
  midnight: { "--bg":"#08090F","--bg2":"#0E1118","--bg3":"#161B26","--bg4":"#1E2536","--border":"#262F42","--border2":"#334058","--text":"#E2E8F4","--text2":"#8898B8","--text3":"#586888" },
  stadium: { "--bg":"#0C0C14","--bg2":"#121220","--bg3":"#1A1A30","--bg4":"#222240","--border":"#2A2A50","--border2":"#383868","--text":"#E4E4F4","--text2":"#9898C0","--text3":"#686898" },
  light: { "--bg":"#F2F4F0","--bg2":"#FFFFFF","--bg3":"#EDF0EA","--bg4":"#E0E4D8","--border":"#C8D0C0","--border2":"#B0BAA8","--text":"#1A1E1A","--text2":"#4A5A4A","--text3":"#788878" },
  dark: { "--bg":"#0C0F14","--bg2":"#141820","--bg3":"#1A1F2B","--bg4":"#222838","--border":"#2A3040","--border2":"#343A4D","--text":"#E8EAF0","--text2":"#9CA3B8","--text3":"#6B7390" },
  champions: { "--bg":"#0A0A18","--bg2":"#0F0F22","--bg3":"#18182E","--bg4":"#20203C","--border":"#2C2C54","--border2":"#3A3A6E","--text":"#E8E8FF","--text2":"#A0A0D0","--text3":"#7070A0" },
};

const ACCENT_COLORS = ["#22D3EE","#00E676","#FF6D00","#F50057","#FFEA00","#651FFF","#2979FF","#FF1744","#76FF03","#F472B6","#FF9100","#F0A050"];

const BADGE_EMOJIS = ["⚽","🏟️","🦁","🐺","🦅","⭐","🔵","🔴","⚫","🟡","🟢","🟣","💎","👑","🛡️","🏆","⚡","🔥","🐉","🦈","🐻","🦊","🐝","🦉"];

// ─── Icons (SVG components) ───
const Icon = ({ d, size = 20, color = "currentColor", stroke = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const I = {
  home:<Icon d={<><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>}/>,
  match:<Icon d={<><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></>}/>,
  squad:<Icon d={<><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></>}/>,
  transfer:<Icon d={<><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></>}/>,
  trophy:<Icon d={<><path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 22V8a6 6 0 0112 0v14"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22"/></>}/>,
  stats:<Icon d={<><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></>}/>,
  youth:<Icon d={<><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 18a6 6 0 100-12 6 6 0 000 12z"/><path d="M12 14a2 2 0 100-4 2 2 0 000 4z"/></>}/>,
  records:<Icon d={<><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>}/>,
  settings:<Icon d={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></>}/>,
  plus:<Icon d={<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>}/>,
  check:<Icon d={<><polyline points="20 6 9 17 4 12"/></>}/>,
  trash:<Icon d={<><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></>}/>,
  edit:<Icon d={<><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></>}/>,
  x:<Icon d={<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>}/>,
  search:<Icon d={<><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>}/>,
  menu:<Icon d={<><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></>}/>,
  save:<Icon d={<><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></>}/>,
  compare:<Icon d={<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>}/>,
  formation:<Icon d={<><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="17" r="1.5"/><circle cx="7" cy="12" r="1.5"/><circle cx="17" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="9" cy="7" r="1.5"/><circle cx="15" cy="7" r="1.5"/></>}/>,
  timeline:<Icon d={<><line x1="12" y1="2" x2="12" y2="22"/><circle cx="12" cy="6" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="18" r="2"/></>}/>,
  chevDown:<Icon d={<><polyline points="6 9 12 15 18 9"/></>} size={16}/>,
  arrowUp:<Icon d={<><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>} size={14}/>,
  arrowDown:<Icon d={<><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>} size={14}/>,
  star:<Icon d={<><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>}/>,
  shirt:<Icon d={<><path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.47a1 1 0 00.99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.47a2 2 0 00-1.34-2.23z"/></>}/>,
  calendar:<Icon d={<><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}/>,
};

// ─── CSS ───
const getCSS = (tv, accent) => `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=Outfit:wght@400;500;600;700;800;900&display=swap');
:root{${Object.entries(tv).map(([k,v])=>`${k}:${v}`).join(";")};--accent:${accent};--accent2:${accent}dd;--accent-glow:${accent}18;--green:#4ADE80;--green-bg:rgba(74,222,128,.12);--red:#F87171;--red-bg:rgba(248,113,113,.12);--yellow:#FBBF24;--yellow-bg:rgba(251,191,36,.12);--blue:#60A5FA;--blue-bg:rgba(96,165,250,.12);--purple:#A78BFA;--purple-bg:rgba(167,139,250,.12);--radius:14px;--radius-sm:8px;--shadow:0 4px 24px rgba(0,0,0,.3)}
*{margin:0;padding:0;box-sizing:border-box}html{overflow-x:hidden}body,#root{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;-webkit-font-smoothing:antialiased;overflow-x:hidden}
.app{display:flex;min-height:100vh;overflow-x:hidden}.sb{width:260px;height:100vh;background:var(--bg2);border-right:1px solid var(--border);display:flex;flex-direction:column;position:fixed;top:0;left:0;z-index:100;transition:transform .3s cubic-bezier(.4,0,.2,1);overflow-y:auto;scrollbar-width:none}.sb::-webkit-scrollbar{display:none}.sb-h{padding:28px 24px 20px;border-bottom:1px solid var(--border);flex-shrink:0}.logo{font-family:'Outfit',sans-serif;font-size:24px;font-weight:900;background:linear-gradient(135deg,var(--accent),${accent}88);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-.5px;text-transform:uppercase}.logo-s{font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:3px;margin-top:4px;font-weight:500}
.nav{padding:16px 12px;flex:1;display:flex;flex-direction:column;gap:4px;overflow-y:auto;min-height:0;scrollbar-width:none}.nav::-webkit-scrollbar{display:none}.ni{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:10px;cursor:pointer;transition:all .2s cubic-bezier(.4,0,.2,1);color:var(--text2);font-size:14px;font-weight:500;border:none;background:none;width:100%;text-align:left;font-family:inherit;position:relative}.ni:hover{background:var(--bg3);color:var(--text);transform:translateX(4px)}.ni:active{transform:translateX(2px) scale(.98)}.ni.a{background:var(--accent-glow);color:var(--accent);font-weight:600}.ni.a svg{stroke:var(--accent)}.ni.a::after{content:'';position:absolute;left:0;top:25%;bottom:25%;width:3px;background:var(--accent);border-radius:0 3px 3px 0}.nb{margin-left:auto;background:var(--accent);color:#000;font-size:11px;font-weight:700;padding:2px 7px;border-radius:20px;min-width:20px;text-align:center}.sb-f{padding:12px 16px;border-top:1px solid var(--border);font-size:11px;color:var(--text3);flex-shrink:0}
.mc{flex:1;margin-left:260px;padding:32px 40px;max-width:1200px;animation:pageIn .3s ease;overflow-x:hidden}.ph{margin-bottom:28px}.pt{font-family:'Outfit',sans-serif;font-size:30px;font-weight:800;color:var(--text);letter-spacing:-.5px}.ps{color:var(--text3);font-size:14px;margin-top:4px}
@keyframes pageIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:24px;margin-bottom:20px;transition:all .25s cubic-bezier(.4,0,.2,1)}.card:hover{border-color:var(--border2);box-shadow:0 2px 16px rgba(0,0,0,.15)}.ct{font-size:16px;font-weight:600;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.sg{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:28px}.sc{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:18px;position:relative;overflow:hidden;cursor:default;transition:all .25s cubic-bezier(.4,0,.2,1)}.sc:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,.2);border-color:var(--border2)}.sc::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;transition:height .25s}.sc:hover::before{height:4px}.sc.ac::before{background:linear-gradient(90deg,var(--accent),${accent}88)}.sc.gn::before{background:linear-gradient(90deg,var(--green),#34D399)}.sc.rd::before{background:linear-gradient(90deg,var(--red),#FB923C)}.sc.bl::before{background:linear-gradient(90deg,var(--blue),#818CF8)}.sc.yl::before{background:linear-gradient(90deg,var(--yellow),#FBBF24)}.sc.pp::before{background:linear-gradient(90deg,var(--purple),#C084FC)}
.sl{font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.5px;font-weight:600;margin-bottom:6px}.sv{font-size:26px;font-weight:700;letter-spacing:-1px}.sd{font-size:12px;color:var(--text2);margin-top:4px}
table{width:100%;border-collapse:collapse}th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:var(--text3);font-weight:600;padding:12px 16px;border-bottom:1px solid var(--border)}td{padding:12px 16px;border-bottom:1px solid var(--border);font-size:14px;color:var(--text2);vertical-align:middle;transition:background .15s}tr{transition:all .15s}tr:hover td{background:var(--bg3)}.in{color:var(--text);font-weight:500}
.tg{display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;transition:all .2s;gap:4px}.tg:hover{filter:brightness(1.15)}.tg-g{background:var(--green-bg);color:var(--green)}.tg-r{background:var(--red-bg);color:var(--red)}.tg-y{background:var(--yellow-bg);color:var(--yellow)}.tg-b{background:var(--blue-bg);color:var(--blue)}.tg-p{background:var(--purple-bg);color:var(--purple)}.tg-n{background:var(--bg4);color:var(--text2)}.tg-ac{background:var(--accent-glow);color:var(--accent)}
.btn{display:inline-flex;align-items:center;gap:6px;padding:10px 18px;border-radius:var(--radius-sm);font-size:13px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;border:none;transition:all .2s cubic-bezier(.4,0,.2,1)}.bp{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#000;font-weight:700;box-shadow:0 2px 12px ${accent}44}.bp:hover{transform:translateY(-2px);box-shadow:0 6px 24px ${accent}55}.bp:active{transform:translateY(0) scale(.97)}.bg{background:transparent;color:var(--text2);border:1px solid var(--border)}.bg:hover{background:var(--bg3);color:var(--text);border-color:var(--border2)}.bg:active{transform:scale(.97)}.bd{background:var(--red-bg);color:var(--red)}.bd:hover{background:rgba(248,113,113,.2);transform:translateY(-1px)}.bs{padding:6px 12px;font-size:12px}
.bi{padding:8px;background:transparent;border:1px solid var(--border);color:var(--text3);border-radius:var(--radius-sm);cursor:pointer;transition:all .2s;display:inline-flex;align-items:center;justify-content:center}.bi:hover{background:var(--bg3);color:var(--text);transform:scale(1.08);border-color:var(--border2)}.bi:active{transform:scale(.95)}
.fr{display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap}.fg{display:flex;flex-direction:column;gap:4px;flex:1;min-width:140px}.fl{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--text3);font-weight:600}
input,select,textarea{background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 14px;color:var(--text);font-size:14px;font-family:'DM Sans',sans-serif;outline:none;transition:all .2s;width:100%}input:focus,select:focus,textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px ${accent}22}select{cursor:pointer;-webkit-appearance:none}textarea{resize:vertical;min-height:60px}
.tb{display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap}.tr{margin-left:auto;display:flex;gap:8px}
.mo{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:200;animation:fi .2s ease}.md{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:28px;width:90%;max-width:560px;box-shadow:0 8px 40px rgba(0,0,0,.4);animation:su .25s cubic-bezier(.4,0,.2,1);max-height:85vh;overflow-y:auto;scrollbar-width:none}.md::-webkit-scrollbar{display:none}.mdt{font-size:20px;font-weight:700;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between}.ma{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}
@keyframes fi{from{opacity:0}to{opacity:1}}@keyframes su{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
.mh{display:none;position:fixed;top:0;left:0;right:0;height:56px;background:var(--bg2);border-bottom:1px solid var(--border);z-index:99;padding:0 16px;align-items:center;backdrop-filter:blur(12px);background:rgba(from var(--bg2) r g b/.85)}.hb{background:none;border:none;color:var(--text);cursor:pointer;padding:4px;transition:transform .2s}.hb:active{transform:scale(.9)}
.toast{position:fixed;bottom:24px;right:24px;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--radius-sm);padding:12px 20px;font-size:13px;color:var(--text);box-shadow:0 8px 32px rgba(0,0,0,.3);z-index:300;animation:toastIn .35s cubic-bezier(.4,0,.2,1);display:flex;align-items:center;gap:8px}
@keyframes toastIn{from{opacity:0;transform:translateY(20px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}
.filter-scroll{display:flex;overflow-x:auto;gap:6px;padding:4px 2px;-webkit-overflow-scrolling:touch;scrollbar-width:none}.filter-scroll::-webkit-scrollbar{display:none}.filter-scroll .btn{flex-shrink:0}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.form-badge{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;cursor:pointer;background:var(--bg3);border:2px solid var(--border);transition:all .2s}.form-badge:hover{border-color:var(--accent);transform:scale(1.1)}.form-badge.sel{border-color:var(--accent);background:var(--accent-glow)}
.player-row{display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--border);transition:all .15s;cursor:pointer}.player-row:hover{background:var(--bg3);padding-left:18px}.player-row:active{background:var(--bg4)}
.ovr{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:10px;font-weight:800;font-size:15px;font-family:'Outfit',sans-serif;flex-shrink:0;border:2px solid}
.form-dot{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;flex-shrink:0}
.form-dot.V{background:var(--green-bg);color:var(--green)}.form-dot.D{background:var(--red-bg);color:var(--red)}.form-dot.E{background:var(--yellow-bg);color:var(--yellow)}
.empty-state{padding:48px 24px;text-align:center;color:var(--text3)}.empty-state-icon{font-size:48px;margin-bottom:12px;opacity:.5}.empty-state-title{font-size:16px;font-weight:600;color:var(--text2);margin-bottom:4px}.empty-state-sub{font-size:13px}
.m-card{transition:all .2s cubic-bezier(.4,0,.2,1)}.m-card:active{transform:scale(.98);background:var(--bg4)}
.dg{display:grid;grid-template-columns:1fr 1fr;gap:20px}
/* Season selector */
.season-sel{display:flex;align-items:center;gap:8px;padding:8px 16px;border-radius:10px;background:var(--bg3);border:1px solid var(--border);cursor:pointer;transition:all .2s;font-size:13px;font-weight:600;color:var(--text)}.season-sel:hover{border-color:var(--accent);background:var(--accent-glow)}
.season-chip{display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid var(--border);background:var(--bg3);color:var(--text2);transition:all .2s;white-space:nowrap}.season-chip:hover{border-color:var(--border2);color:var(--text)}.season-chip.a{background:var(--accent-glow);border-color:var(--accent);color:var(--accent)}
/* Mobile responsive */
@media(max-width:768px){
.sb{transform:translateX(-100%);width:280px;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.sb.open{transform:translateX(0)}
.mc{margin-left:0;padding:60px 12px 80px;max-width:100vw;overflow-x:hidden;box-sizing:border-box;width:100%}
.mh{display:flex;height:52px}
.app{overflow-x:hidden;max-width:100vw;width:100%}
body,html,#root{overflow-x:hidden;max-width:100vw;width:100%}
.ph{margin-bottom:16px;overflow:hidden}.pt{font-size:20px;word-break:break-word}.ps{font-size:11px;word-break:break-word}
.sg{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:10px;margin-bottom:16px;padding-bottom:4px;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.sg::-webkit-scrollbar{display:none}
.sc{min-width:140px;flex-shrink:0;scroll-snap-align:start;padding:12px}
.sv{font-size:18px}.sl{font-size:9px;letter-spacing:1px;margin-bottom:4px}.sd{font-size:10px;word-break:break-word}
.dg{grid-template-columns:1fr;gap:10px}
.card{padding:12px;margin-bottom:10px;border-radius:12px;overflow:hidden;word-break:break-word;max-width:100%;box-sizing:border-box}.ct{font-size:13px;margin-bottom:10px;overflow:hidden}
.tb{flex-direction:column;gap:8px;margin-bottom:12px;width:100%;overflow:hidden}.tb select{width:100%}.tr{margin-left:0;width:100%;display:flex;gap:8px;overflow:hidden}.tr .btn{flex:1;min-width:0}
.btn{padding:8px 10px;font-size:11px;white-space:nowrap;min-width:0}.bp{padding:8px 12px}.bs{padding:5px 8px;font-size:10px}.bi{padding:5px}
.filter-scroll{width:100%;max-width:100%;overflow-x:auto}.filter-scroll .btn{flex-shrink:0}
table{display:none}
.m-cards{display:flex;flex-direction:column;gap:8px;width:100%}
.m-card{background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px;overflow:hidden;max-width:100%;box-sizing:border-box}
.m-card-h{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:4px;overflow:hidden}
.m-card-n{font-size:12px;font-weight:600;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.m-card-r{display:flex;flex-wrap:wrap;gap:3px;font-size:10px;color:var(--text2);align-items:center;overflow:hidden}
.m-card-a{display:flex;gap:4px;margin-top:6px;justify-content:flex-end;flex-shrink:0}
.m-card-a .bi{padding:4px;border-radius:6px}
.tg{font-size:9px;padding:2px 6px;white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis}
.mo{align-items:flex-end;padding:0}
.md{width:100%;max-width:100%;border-radius:16px 16px 0 0;max-height:90vh;padding:16px 14px;animation:slideUp .25s cubic-bezier(.4,0,.2,1);overflow-y:auto;box-sizing:border-box}
@keyframes slideUp{from{transform:translateY(100%);opacity:.8}to{transform:translateY(0);opacity:1}}
.mdt{font-size:16px;margin-bottom:12px}
.ma{margin-top:12px;gap:8px}.ma .btn{flex:1;min-width:0}
input,select,textarea{font-size:16px;padding:10px 10px;max-width:100%;box-sizing:border-box}select{font-size:14px;width:100%}
.toast{bottom:14px;right:10px;left:10px;font-size:11px;padding:10px 12px;border-radius:10px;max-width:100vw;box-sizing:border-box}
.fr{flex-direction:column;gap:8px;margin-bottom:8px;width:100%}.fg{min-width:0;width:100%}.fl{font-size:10px}
.form-grid{grid-template-columns:1fr}
.logo{font-size:20px}.logo-s{font-size:9px;letter-spacing:2px}
.ni{padding:10px 14px;font-size:13px;gap:10px}
.player-row{padding:8px 10px;gap:6px;overflow:hidden;max-width:100%;box-sizing:border-box}
.ovr{width:30px;height:30px;font-size:12px;border-radius:8px;flex-shrink:0}
.season-chip{padding:5px 10px;font-size:11px}
.empty-state{padding:32px 16px}
.form-badge{width:36px;height:36px;font-size:16px}
/* Fix all flex children from overflowing */
.player-row>div{min-width:0;overflow:hidden}
.player-row>div>div{overflow:hidden;text-overflow:ellipsis}
}
@media(max-width:768px){.m-only{display:flex}.d-only{display:none}}
@media(min-width:769px){.m-only{display:none}.d-only{display:block}}
`;

// ─── Shared components ───
function Modal({title,onClose,children}){return(<div className="mo" onClick={onClose}><div className="md" onClick={e=>e.stopPropagation()}><div className="mdt">{title}<button className="bi" onClick={onClose}>{I.x}</button></div>{children}</div></div>);}
function Toast({message,onUndo}){if(!message)return null;return<div className="toast">{I.check} {message}{onUndo&&<button onClick={onUndo} style={{marginLeft:8,padding:"4px 12px",borderRadius:6,fontSize:12,fontWeight:700,border:"1px solid var(--accent)",background:"transparent",color:"var(--accent)",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap",transition:"all .2s"}}>Desfazer</button>}</div>;}

function ConfirmDelete({onConfirm,label}){
const[c,setC]=useState(false);const t=useRef(null);
const click=()=>{if(!c){setC(true);t.current=setTimeout(()=>setC(false),3000);}else{onConfirm();setC(false);}};
useEffect(()=>()=>clearTimeout(t.current),[]);
return c?<button className="btn bd bs" onClick={()=>{onConfirm();setC(false);}} style={{animation:"su .15s ease"}}>{label||"Confirmar?"}</button>:<button className="bi" onClick={click} title="Remover">{I.trash}</button>;
}

function EmptyState({icon,title,sub,action}){
return(<div className="empty-state"><div className="empty-state-icon">{icon}</div><div className="empty-state-title">{title}</div><div className="empty-state-sub">{sub}</div>{action&&<div style={{marginTop:16}}>{action}</div>}</div>);
}

function OvrBadge({value,size}){
const sz=size||36;const c=ratingColor(value);
return <div className="ovr" style={{width:sz,height:sz,borderColor:c,color:c,background:c+"12",fontSize:sz*.42}}>{value||"?"}</div>;
}

function FormDots({matches}){
const form=formStreak(matches);
return <div style={{display:"flex",gap:3}}>{form.map((f,i)=><div key={i} className={`form-dot ${f}`}>{f}</div>)}</div>;
}

// ─── FAB (Floating Action Button) ───
function FAB({onAdd}){
return(<div className="m-only" style={{position:"fixed",bottom:24,right:20,zIndex:150}}>
<button onClick={onAdd} style={{width:56,height:56,borderRadius:28,border:"none",background:"linear-gradient(135deg,var(--accent),var(--accent2))",color:"#000",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",boxShadow:"0 6px 24px rgba(0,0,0,.4)",transition:"all .3s cubic-bezier(.4,0,.2,1)"}}>
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
</button></div>);
}

// ─── OVR EVOLUTION CHART (pure CSS, no library) ───
function OvrChart({history}){
if(!history||history.length<2)return null;
const vals=history.map(h=>h.overall);const min=Math.min(...vals)-3;const max=Math.max(...vals)+3;const range=max-min||1;
return(<div style={{marginTop:12,borderTop:"1px solid var(--border)",paddingTop:12}}>
<div style={{fontSize:11,textTransform:"uppercase",letterSpacing:1.5,color:"var(--text3)",fontWeight:600,marginBottom:8}}>📈 Evolução de Overall</div>
<div style={{display:"flex",alignItems:"flex-end",gap:4,height:80,padding:"0 4px"}}>
{history.map((h,i)=>{const pct=((h.overall-min)/range)*100;const prev=i>0?history[i-1].overall:h.overall;const diff=h.overall-prev;
return(<div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4,height:"100%",justifyContent:"flex-end"}}>
<span style={{fontSize:10,fontWeight:700,color:diff>0?"var(--green)":diff<0?"var(--red)":"var(--text2)"}}>{h.overall}</span>
<div style={{width:"100%",maxWidth:36,borderRadius:"4px 4px 0 0",background:diff>0?"var(--green)":diff<0?"var(--red)":"var(--accent)",opacity:.7,height:`${Math.max(pct,8)}%`,transition:"height .4s",minHeight:4}}/>
<span style={{fontSize:9,color:"var(--text3)"}}>T{h.season}</span>
</div>);})}
</div>
</div>);
}

// ─── LEAGUE POSITION CARD ───
function LeagueCard({season,setSeason}){
if(!season)return null;
const pos=season.leaguePosition||"";const pts=season.leaguePoints||"";
const posNum=Number(pos);
const posColor=posNum===1?"var(--accent)":posNum<=3?"var(--green)":posNum<=6?"var(--blue)":posNum<=10?"var(--yellow)":"var(--text2)";
const posLabel=posNum===1?"🥇 Líder":posNum===2?"🥈 2º lugar":posNum===3?"🥉 3º lugar":posNum?`${posNum}º lugar`:"";
return(<div className="card">
<div className="ct">🏅 Classificação na Liga</div>
<div style={{display:"flex",gap:12,alignItems:"center"}}>
<div style={{display:"flex",gap:8,flex:1}}>
<div style={{flex:1}}><label className="fl">Posição</label>
<input type="number" min="1" max="30" value={pos} onChange={e=>setSeason(s=>({...s,leaguePosition:e.target.value}))} placeholder="Ex: 3" style={{textAlign:"center",fontSize:18,fontWeight:800,fontFamily:"'Outfit',sans-serif",padding:8}}/></div>
<div style={{flex:1}}><label className="fl">Pontos</label>
<input type="number" min="0" value={pts} onChange={e=>setSeason(s=>({...s,leaguePoints:e.target.value}))} placeholder="Ex: 45" style={{textAlign:"center",fontSize:18,fontWeight:800,fontFamily:"'Outfit',sans-serif",padding:8}}/></div>
</div>
{posNum>0&&<div style={{textAlign:"center",flexShrink:0}}>
<div style={{fontSize:28,fontWeight:900,fontFamily:"'Outfit',sans-serif",color:posColor}}>{posNum}º</div>
<div style={{fontSize:10,color:"var(--text3)"}}>{pts?`${pts} pts`:""}</div>
</div>}
</div>
{posLabel&&<div style={{marginTop:8,fontSize:13,color:posColor,fontWeight:600}}>{posLabel}</div>}
</div>);
}

// ─── DIARY / SEASON NOTES ───
function DiaryCard({season,setSeason,toast}){
if(!season)return null;
const[adding,setAdding]=useState(false);const[text,setText]=useState("");
const diary=season.diary||[];
const addEntry=()=>{if(!text.trim())return;setSeason(s=>({...s,diary:[...(s.diary||[]),{id:genId(),text:text.trim(),date:today()}]}));setText("");setAdding(false);toast("Nota adicionada");};
const remEntry=(id)=>setSeason(s=>({...s,diary:(s.diary||[]).filter(d=>d.id!==id)}));
return(<div className="card">
<div className="ct">📝 Diário da Temporada</div>
{diary.length>0&&<div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
{diary.slice().reverse().map(d=>(
<div key={d.id} style={{display:"flex",gap:10,padding:"8px 0",borderBottom:"1px solid var(--border)"}}>
<div style={{width:3,background:"var(--accent)",borderRadius:2,flexShrink:0}}/>
<div style={{flex:1,minWidth:0}}>
<div style={{fontSize:13,color:"var(--text)",lineHeight:1.5,wordBreak:"break-word"}}>{d.text}</div>
<div style={{fontSize:10,color:"var(--text3)",marginTop:4}}>{d.date}</div>
</div>
<button onClick={()=>remEntry(d.id)} style={{background:"none",border:"none",color:"var(--text3)",cursor:"pointer",padding:2,fontSize:14,flexShrink:0,alignSelf:"flex-start"}}>×</button>
</div>))}
</div>}
{adding?<div>
<textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Ex: Perdi o zagueiro titular por 3 meses..." autoFocus rows={3} style={{marginBottom:8}}/>
<div style={{display:"flex",gap:8}}><button className="btn bp bs" onClick={addEntry}>Salvar</button><button className="btn bg bs" onClick={()=>setAdding(false)}>Cancelar</button></div>
</div>:
<button className="btn bg bs" onClick={()=>setAdding(true)}>{I.plus} Nova Anotação</button>}
</div>);
}

// ─── ACHIEVEMENTS ENGINE ───
function getAchievements(allSeasons,activeSeason){
const achs=[];
const allMatches=allSeasons.flatMap(s=>s.matches||[]);
const allTrophies=allSeasons.flatMap(s=>s.trophies||[]);
const allPlayers={};
allSeasons.forEach(s=>(s.players||[]).forEach(p=>{
if(!allPlayers[p.name])allPlayers[p.name]={totalGoals:0,totalAssists:0};
allPlayers[p.name].totalGoals+=(p.goals||0);
allPlayers[p.name].totalAssists+=(p.assists||0);
}));
const totalGoals=Object.values(allPlayers).reduce((a,p)=>a+p.totalGoals,0);
const totalAssists=Object.values(allPlayers).reduce((a,p)=>a+p.totalAssists,0);

// Match milestones
if(allMatches.length>=1) achs.push({icon:"⚽",name:"Primeiro Jogo",desc:"Registrou sua primeira partida",done:true});
if(allMatches.length>=50) achs.push({icon:"🎮",name:"Veterano",desc:"50 partidas registradas",done:true});
if(allMatches.length>=100) achs.push({icon:"🏟️",name:"Centenário",desc:"100 partidas registradas",done:true});
if(allMatches.length>=250) achs.push({icon:"👑",name:"Lenda",desc:"250 partidas registradas",done:true});

// Goal milestones
if(totalGoals>=50) achs.push({icon:"🔥",name:"Máquina de Gols",desc:"50 gols na carreira",done:true});
if(totalGoals>=100) achs.push({icon:"💯",name:"Centenário de Gols",desc:"100 gols marcados",done:true});
if(totalGoals>=500) achs.push({icon:"⚡",name:"Artilheiro Supremo",desc:"500 gols na carreira",done:true});

// Trophy milestones
if(allTrophies.length>=1) achs.push({icon:"🏆",name:"Primeiro Título",desc:"Conquistou seu primeiro troféu",done:true});
if(allTrophies.length>=5) achs.push({icon:"🏆",name:"Colecionador",desc:"5 troféus conquistados",done:true});
if(allTrophies.length>=10) achs.push({icon:"🏆",name:"Dinastia",desc:"10 troféus conquistados",done:true});

// Season achievements
allSeasons.forEach(s=>{
const ms=matchStats(s.matches||[]);
if(ms.total>=10&&ms.l===0) achs.push({icon:"🛡️",name:"Invicto",desc:`Temporada ${s.number} sem derrotas (${ms.total} jogos)`,done:true});
if(ms.total>=10&&ms.ga===0) achs.push({icon:"🧤",name:"Muralha",desc:`Temporada ${s.number} sem gols sofridos`,done:true});
if(ms.total>=10&&ms.w===ms.total) achs.push({icon:"💎",name:"Perfeição",desc:`Temporada ${s.number} — 100% de vitórias`,done:true});
});

// Streaks
allSeasons.forEach(s=>{
const sk=getStreaks(s.matches||[]);
if(sk.winStreak>=10) achs.push({icon:"🔥",name:"Em Chamas",desc:`${sk.winStreak} vitórias seguidas na temp. ${s.number}`,done:true});
if(sk.unbeaten>=20) achs.push({icon:"⚔️",name:"Inabalável",desc:`${sk.unbeaten} jogos invicto na temp. ${s.number}`,done:true});
});

// Multi-season
if(allSeasons.length>=3) achs.push({icon:"📅",name:"Carreira Longa",desc:"3+ temporadas jogadas",done:true});
if(allSeasons.length>=5) achs.push({icon:"📅",name:"Veterano de Bancada",desc:"5+ temporadas jogadas",done:true});

// Youth
const totalYouth=allSeasons.reduce((a,s)=>a+(s.youthAcademy||[]).length,0);
if(totalYouth>=5) achs.push({icon:"🌱",name:"Formador",desc:"5+ jovens na academia",done:true});

// Upcoming (not yet achieved) — show as locked
const upcoming=[];
if(allMatches.length<50) upcoming.push({icon:"🎮",name:"Veterano",desc:`${allMatches.length}/50 partidas`,done:false});
if(totalGoals<100&&totalGoals>=10) upcoming.push({icon:"💯",name:"Centenário de Gols",desc:`${totalGoals}/100 gols`,done:false});
if(allTrophies.length<5&&allTrophies.length>=1) upcoming.push({icon:"🏆",name:"Colecionador",desc:`${allTrophies.length}/5 troféus`,done:false});

// Remove duplicates by name, keep first
const seen=new Set();const unique=[];
[...achs,...upcoming].forEach(a=>{if(!seen.has(a.name)){seen.add(a.name);unique.push(a);}});
return unique;
}

function AchievementsCard({allSeasons,activeSeason}){
const achs=getAchievements(allSeasons,activeSeason);
const done=achs.filter(a=>a.done).length;
if(achs.length===0)return null;
return(<div className="card">
<div className="ct">🏅 Conquistas <span style={{marginLeft:"auto",fontSize:12,color:"var(--text3)"}}>{done} desbloqueadas</span></div>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8}}>
{achs.map((a,i)=>(
<div key={i} style={{padding:10,borderRadius:10,background:a.done?"var(--accent-glow)":"var(--bg3)",border:`1px solid ${a.done?"var(--accent)":"var(--border)"}`,textAlign:"center",opacity:a.done?1:.5,transition:"all .2s"}}>
<div style={{fontSize:24,marginBottom:4}}>{a.icon}</div>
<div style={{fontSize:11,fontWeight:700,color:a.done?"var(--accent)":"var(--text3)"}}>{a.name}</div>
<div style={{fontSize:9,color:"var(--text3)",marginTop:2}}>{a.desc}</div>
</div>))}
</div>
</div>);
}

// ─── SHARE SEASON SUMMARY ───
function shareSeasonSummary(season,allSeasons){
if(!season)return;
const ms=matchStats(season.matches);const sk=getStreaks(season.matches);
const topScorer=[...(season.players||[])].sort((a,b)=>(b.goals||0)-(a.goals||0))[0];
const totalTrophies=allSeasons.reduce((a,s)=>a+(s.trophies||[]).length,0);
const trophyNames=(season.trophies||[]).map(t=>`🏆 ${t.name}`).join("\n");
const pos=season.leaguePosition?`📊 ${season.leaguePosition}º lugar${season.leaguePoints?` — ${season.leaguePoints} pts`:""}`:null;

let text=`⚽ *${season.teamBadgeEmoji} ${season.teamName}*\n`;
text+=`📅 Temporada ${season.number} · ${season.year}\n`;
text+=`🏟️ ${season.league}\n\n`;
text+=`📊 *Resultados*\n`;
text+=`${ms.total} jogos: ${ms.w}V ${ms.d}E ${ms.l}D\n`;
text+=`⚽ ${ms.gf} gols marcados · ${ms.ga} sofridos\n`;
text+=`📈 Aproveitamento: ${ms.total>0?Math.round((ms.pts/(ms.total*3))*100):0}%\n`;
if(pos) text+=`${pos}\n`;
text+=`\n🔥 *Sequências*\n`;
text+=`Vitórias: ${sk.winStreak} · Invicto: ${sk.unbeaten}\n`;
if(topScorer&&(topScorer.goals||0)>0){text+=`\n👑 *Artilheiro:* ${topScorer.name} (${topScorer.goals} gols)\n`;}
if(trophyNames){text+=`\n🏆 *Títulos*\n${trophyNames}\n`;}
text+=`\n_Registrado no Kronex_`;

if(navigator.share){navigator.share({text}).catch(()=>{});}
else{navigator.clipboard?.writeText(text).then(()=>alert("Copiado!")).catch(()=>{window.open("https://wa.me/?text="+encodeURIComponent(text),"_blank");});}
}

// ─── OBJECTIVES CARD ───
function ObjectivesCard({season,setSeason,toast}){
const[adding,setAdding]=useState(false);
const[newObj,setNewObj]=useState("");
if(!season)return null;
const objs=season.objectives||[];
const toggle=(id)=>{setSeason(s=>({...s,objectives:(s.objectives||[]).map(o=>o.id===id?{...o,done:!o.done}:o)}));};
const addObj=()=>{if(!newObj.trim())return;setSeason(s=>({...s,objectives:[...(s.objectives||[]),{id:genId(),text:newObj.trim(),done:false}]}));setNewObj("");setAdding(false);toast("Objetivo adicionado");};
const remObj=(id)=>{setSeason(s=>({...s,objectives:(s.objectives||[]).filter(o=>o.id!==id)}));};
const doneCount=objs.filter(o=>o.done).length;
return(<div className="card">
<div className="ct">🎯 Objetivos da Temporada {objs.length>0&&<span style={{marginLeft:"auto",fontSize:12,color:doneCount===objs.length&&objs.length>0?"var(--green)":"var(--text3)"}}>{doneCount}/{objs.length}</span>}</div>
{objs.length>0&&<div style={{marginBottom:12}}>
<div style={{height:6,background:"var(--bg4)",borderRadius:3,overflow:"hidden",marginBottom:10}}>
<div style={{height:"100%",width:`${objs.length>0?(doneCount/objs.length)*100:0}%`,background:"linear-gradient(90deg,var(--accent),var(--green))",borderRadius:3,transition:"width .4s"}}/>
</div>
{objs.map(o=>(
<div key={o.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid var(--border)",cursor:"pointer"}} onClick={()=>toggle(o.id)}>
<div style={{width:22,height:22,borderRadius:6,border:o.done?"none":"2px solid var(--border2)",background:o.done?"var(--green)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .2s"}}>
{o.done&&<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
</div>
<span style={{flex:1,fontSize:13,color:o.done?"var(--text3)":"var(--text)",textDecoration:o.done?"line-through":"none",transition:"all .2s",minWidth:0,overflow:"hidden",textOverflow:"ellipsis"}}>{o.text}</span>
<button onClick={e=>{e.stopPropagation();remObj(o.id);}} style={{background:"none",border:"none",color:"var(--text3)",cursor:"pointer",padding:2,fontSize:14}}>×</button>
</div>))}
</div>}
{adding?<div style={{display:"flex",gap:8}}>
<input value={newObj} onChange={e=>setNewObj(e.target.value)} placeholder="Ex: Ganhar a liga" autoFocus onKeyDown={e=>{if(e.key==="Enter")addObj();if(e.key==="Escape")setAdding(false);}} style={{flex:1}}/>
<button className="btn bp bs" onClick={addObj}>Adicionar</button>
<button className="btn bg bs" onClick={()=>setAdding(false)}>×</button>
</div>:
<button className="btn bg bs" onClick={()=>setAdding(true)}>{I.plus} Novo Objetivo</button>}
</div>);
}

// ─── DASHBOARD ───
function Dashboard({save:sv,season:sn,goTo,allSeasons,setSeason,toast}){
if(!sv) return <EmptyState icon="🏟️" title="Nenhum save ativo" sub="Crie seu primeiro save nas configurações" action={<button className="btn bp" onClick={()=>goTo("settings")}>{I.plus} Criar Save</button>}/>;
if(!sn) return <EmptyState icon="📅" title="Nenhuma temporada" sub="Crie sua primeira temporada" action={<button className="btn bp" onClick={()=>goTo("settings")}>{I.plus} Nova Temporada</button>}/>;

const ms=matchStats(sn.matches);const streaks=getStreaks(sn.matches);const form=formStreak(sn.matches);
const topScorer=sn.players.length>0?[...sn.players].sort((a,b)=>(b.goals||0)-(a.goals||0))[0]:null;
const topAssister=sn.players.length>0?[...sn.players].sort((a,b)=>(b.assists||0)-(a.assists||0))[0]:null;
const topRated=sn.players.length>0?[...sn.players].filter(p=>(p.matchesPlayed||0)>0).sort((a,b)=>(b.avgRating||0)-(a.avgRating||0))[0]:null;
const motmLeader=sn.players.length>0?[...sn.players].sort((a,b)=>(b.motm||0)-(a.motm||0))[0]:null;
const totalTrophies=allSeasons.reduce((a,s)=>a+(s.trophies||[]).length,0);

// recent matches (last 5)
const recent=sn.matches.slice(-5).reverse();

return(<div>
<div className="ph">
<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
<div><div className="pt">{sn.teamBadgeEmoji} {sn.teamName}</div><div className="ps">{sn.league} · {sn.year} · Temporada {sn.number}</div></div>
<button className="btn bg bs" onClick={()=>shareSeasonSummary(sn,allSeasons)} title="Compartilhar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg> Compartilhar</button>
</div>
</div>

<div className="sg">
<div className="sc ac"><div className="sl">Jogos</div><div className="sv">{ms.total}</div><div className="sd">{ms.w}V {ms.d}E {ms.l}D</div></div>
{(sn.leaguePosition||0)>0&&<div className="sc gn"><div className="sl">Liga</div><div className="sv">{sn.leaguePosition}º</div><div className="sd">{sn.leaguePoints?`${sn.leaguePoints} pontos`:sn.league}</div></div>}
<div className="sc gn"><div className="sl">Gols</div><div className="sv">{ms.gf}</div><div className="sd">Sofridos: {ms.ga} · Saldo: {ms.gf-ms.ga>0?"+":""}{ms.gf-ms.ga}</div></div>
<div className="sc bl"><div className="sl">Aproveitamento</div><div className="sv">{ms.total>0?Math.round((ms.pts/(ms.total*3))*100):0}%</div><div className="sd">{ms.pts} pontos em {ms.total*3} possíveis</div></div>
<div className="sc yl"><div className="sl">Sequências</div><div className="sv">{streaks.winStreak}V</div><div className="sd">Invicto: {streaks.unbeaten} · Derrotas: {streaks.loseStreak}</div></div>
<div className="sc pp"><div className="sl">Troféus</div><div className="sv">{totalTrophies}</div><div className="sd">{sn.trophies.length} nesta temporada</div></div>
</div>

<div className="dg">
<div className="card">
<div className="ct">🔥 Forma Recente</div>
{recent.length===0?<div style={{color:"var(--text3)",fontSize:13}}>Nenhum jogo registrado</div>:
<div style={{display:"flex",flexDirection:"column",gap:8}}>
{recent.map(m=>{const rb=resultBadge(m.goalsFor,m.goalsAgainst);return(
<div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid var(--border)",overflow:"hidden"}}>
<span className={`tg ${rb.cls}`} style={{minWidth:22,textAlign:"center",flexShrink:0}}>{rb.label}</span>
<span style={{fontSize:12,color:"var(--text)",fontWeight:600,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.opponent}</span>
<span style={{fontSize:13,fontWeight:700,fontFamily:"'Outfit',sans-serif",flexShrink:0}}>{m.goalsFor}-{m.goalsAgainst}</span>
<span className="tg tg-n" style={{fontSize:9,flexShrink:0}}>{m.competition}</span>
</div>);})}
<div style={{display:"flex",gap:4,marginTop:8}}>{form.map((f,i)=><div key={i} className={`form-dot ${f}`}>{f}</div>)}</div>
</div>}
</div>

<div className="card">
<div className="ct">⭐ Destaques</div>
<div style={{display:"flex",flexDirection:"column",gap:12}}>
{topScorer&&<div style={{display:"flex",alignItems:"center",gap:8,overflow:"hidden"}}><OvrBadge value={topScorer.overall} size={30}/><div style={{flex:1,minWidth:0,overflow:"hidden"}}><div style={{fontSize:12,fontWeight:600,color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{topScorer.name}</div><div style={{fontSize:10,color:"var(--text3)"}}>Artilheiro</div></div><span style={{fontSize:16,fontWeight:800,fontFamily:"'Outfit',sans-serif",color:"var(--green)",flexShrink:0}}>{topScorer.goals||0}⚽</span></div>}
{topAssister&&<div style={{display:"flex",alignItems:"center",gap:8,overflow:"hidden"}}><OvrBadge value={topAssister.overall} size={30}/><div style={{flex:1,minWidth:0,overflow:"hidden"}}><div style={{fontSize:12,fontWeight:600,color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{topAssister.name}</div><div style={{fontSize:10,color:"var(--text3)"}}>Assistências</div></div><span style={{fontSize:16,fontWeight:800,fontFamily:"'Outfit',sans-serif",color:"var(--blue)",flexShrink:0}}>{topAssister.assists||0}🅰️</span></div>}
{topRated&&<div style={{display:"flex",alignItems:"center",gap:8,overflow:"hidden"}}><OvrBadge value={topRated.overall} size={30}/><div style={{flex:1,minWidth:0,overflow:"hidden"}}><div style={{fontSize:12,fontWeight:600,color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{topRated.name}</div><div style={{fontSize:10,color:"var(--text3)"}}>Melhor Nota</div></div><span style={{fontSize:16,fontWeight:800,fontFamily:"'Outfit',sans-serif",color:"var(--yellow)",flexShrink:0}}>{(topRated.avgRating||0).toFixed(1)}⭐</span></div>}
{motmLeader&&(motmLeader.motm||0)>0&&<div style={{display:"flex",alignItems:"center",gap:8,overflow:"hidden"}}><OvrBadge value={motmLeader.overall} size={30}/><div style={{flex:1,minWidth:0,overflow:"hidden"}}><div style={{fontSize:12,fontWeight:600,color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{motmLeader.name}</div><div style={{fontSize:10,color:"var(--text3)"}}>Man of the Match</div></div><span style={{fontSize:16,fontWeight:800,fontFamily:"'Outfit',sans-serif",color:"var(--purple)",flexShrink:0}}>{motmLeader.motm}🏅</span></div>}
{!topScorer&&<div style={{color:"var(--text3)",fontSize:13}}>Registre jogadores e partidas para ver destaques</div>}
</div>
</div>
</div>

{sn.trophies.length>0&&<div className="card">
<div className="ct">🏆 Títulos da Temporada</div>
<div style={{display:"flex",gap:10,flexWrap:"wrap"}}>{sn.trophies.map((t,i)=><span key={i} className="tg tg-ac" style={{fontSize:13,padding:"6px 14px"}}>🏆 {t.name}</span>)}</div>
</div>}

{/* Objectives */}
<ObjectivesCard season={sn} setSeason={setSeason} toast={toast}/>

{/* League Position */}
<LeagueCard season={sn} setSeason={setSeason}/>

{/* Diary */}
<DiaryCard season={sn} setSeason={setSeason} toast={toast}/>

{/* Achievements */}
<AchievementsCard allSeasons={allSeasons} activeSeason={sn}/>
</div>);
}

// ─── MATCHES PAGE ───
function MatchesPage({season,setSeason,toast,config}){
const[modal,setModal]=useState(false);
const[form,setForm]=useState({opponent:"",goalsFor:0,goalsAgainst:"",competition:config.competitions[0],date:today(),motm:"",notes:"",isHome:true});
const[scorers,setScorers]=useState([]); // [{playerId,playerName,goals:1}]
const[assists,setAssists]=useState([]); // [{playerId,playerName,assists:1}]
const[matchRating,setMatchRating]=useState({}); // {playerId: rating}
const[filter,setFilter]=useState("Todos");

if(!season) return <EmptyState icon="⚽" title="Sem temporada ativa" sub="Crie uma temporada primeiro"/>;

// Quick add scorer
const addScorer=(p)=>{
const existing=scorers.find(s=>s.playerId===p.id);
if(existing){setScorers(scorers.map(s=>s.playerId===p.id?{...s,goals:s.goals+1}:s));}
else{setScorers([...scorers,{playerId:p.id,playerName:p.name,goals:1}]);}
setForm(f=>({...f,goalsFor:(Number(f.goalsFor)||0)+1}));
};
const removeScorer=(pid)=>{
const s=scorers.find(x=>x.playerId===pid);
if(!s)return;
if(s.goals>1){setScorers(scorers.map(x=>x.playerId===pid?{...x,goals:x.goals-1}:x));}
else{setScorers(scorers.filter(x=>x.playerId!==pid));}
setForm(f=>({...f,goalsFor:Math.max(0,(Number(f.goalsFor)||0)-1)}));
};

// Quick add assist
const addAssist=(p)=>{
const existing=assists.find(a=>a.playerId===p.id);
if(existing){setAssists(assists.map(a=>a.playerId===p.id?{...a,assists:a.assists+1}:a));}
else{setAssists([...assists,{playerId:p.id,playerName:p.name,assists:1}]);}
};
const removeAssist=(pid)=>{
const a=assists.find(x=>x.playerId===pid);
if(!a)return;
if(a.assists>1){setAssists(assists.map(x=>x.playerId===pid?{...x,assists:x.assists-1}:x));}
else{setAssists(assists.filter(x=>x.playerId!==pid));}
};

const totalScorerGoals=scorers.reduce((a,s)=>a+s.goals,0);

const resetForm=()=>{
setForm({opponent:"",goalsFor:0,goalsAgainst:"",competition:config.competitions[0],date:today(),motm:"",notes:"",isHome:true});
setScorers([]);setAssists([]);setMatchRating({});
};

const add=()=>{
if(!form.opponent)return;
const gf=Number(form.goalsFor)||0;
const ga=Number(form.goalsAgainst)||0;
const match={id:genId(),opponent:form.opponent,goalsFor:gf,goalsAgainst:ga,competition:form.competition,date:form.date,motm:form.motm,notes:form.notes,isHome:form.isHome,scorers:scorers,assists:assists};

if(modal==="edit"){
setSeason(s=>({...s,matches:s.matches.map(m=>m.id===form.id?{...match,id:form.id}:m)}));
toast("Jogo atualizado");
}else{
// Auto-update player stats
setSeason(s=>{
const newPlayers=s.players.map(p=>{
let updated={...p};
// Goals
const sc=scorers.find(x=>x.playerId===p.id);
if(sc) updated.goals=(updated.goals||0)+sc.goals;
// Assists
const as2=assists.find(x=>x.playerId===p.id);
if(as2) updated.assists=(updated.assists||0)+as2.assists;
// MOTM
if(form.motm===p.name) updated.motm=(updated.motm||0)+1;
// Matches played (all players in scorers or assists, or motm, count as played)
if(sc||as2||form.motm===p.name) updated.matchesPlayed=(updated.matchesPlayed||0)+1;
// Individual rating
const rt=matchRating[p.id];
if(rt){
const prev=updated.avgRating||0;const prevM=updated.matchesPlayed||1;
updated.avgRating=prevM>1?((prev*(prevM-1))+Number(rt))/prevM:Number(rt);
}
return updated;
});
return{...s,matches:[...s.matches,match],players:newPlayers};
});
toast("⚽ Jogo registrado!");
}
setModal(false);resetForm();};

const editM=(m)=>{
setForm({...m,goalsFor:m.goalsFor||0});
setScorers(m.scorers||[]);setAssists(m.assists||[]);
setModal("edit");};
const rem=(id)=>{setSeason(s=>({...s,matches:s.matches.filter(m=>m.id!==id)}));toast("Jogo removido");};

const ms=matchStats(season.matches);
const comps=[...new Set(season.matches.map(m=>m.competition))];
const filtered=season.matches.filter(m=>{
if(filter!=="Todos"&&m.competition!==filter)return false;
return true;
}).reverse();

// Player picker component
const PlayerPicker=({label,items,onAdd,onRemove,field})=>(
<div style={{marginBottom:12}}>
<div className="fl" style={{marginBottom:6}}>{label}</div>
{/* Selected */}
{items.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
{items.map(item=>(
<div key={item.playerId} style={{display:"flex",alignItems:"center",gap:4,background:"var(--accent-glow)",border:"1px solid var(--accent)",borderRadius:20,padding:"4px 10px",fontSize:12,color:"var(--accent)",fontWeight:600}}>
{item.playerName} {item[field]>1&&<span style={{fontWeight:800}}>×{item[field]}</span>}
<button onClick={()=>onRemove(item.playerId)} style={{background:"none",border:"none",color:"var(--accent)",cursor:"pointer",padding:0,marginLeft:2,fontSize:14,lineHeight:1}}>−</button>
</div>))}
</div>}
{/* Quick buttons */}
<div style={{display:"flex",flexWrap:"wrap",gap:4}}>
{season.players.slice(0,20).map(p=>{
const count=items.find(x=>x.playerId===p.id)?.[field]||0;
return(
<button key={p.id} onClick={()=>onAdd(p)} type="button"
style={{padding:"5px 10px",borderRadius:8,fontSize:11,fontWeight:count>0?700:500,border:count>0?"1px solid var(--accent)":"1px solid var(--border)",background:count>0?"var(--accent-glow)":"var(--bg3)",color:count>0?"var(--accent)":"var(--text2)",cursor:"pointer",transition:"all .15s",fontFamily:"'DM Sans',sans-serif"}}>
{p.name.split(" ").pop()} {count>0&&<span style={{fontWeight:800}}>({count})</span>}
</button>);
})}
</div>
</div>);

return(<div>
<div className="ph"><div className="pt">⚽ Partidas</div><div className="ps">{ms.total} jogos · {ms.w}V {ms.d}E {ms.l}D · {ms.gf} gols marcados</div></div>

<div className="tb">
<button className="btn bp" onClick={()=>{resetForm();setModal(true);}}>{I.plus} Novo Jogo</button>
<div className="filter-scroll">
<button className={`btn ${filter==="Todos"?"bp":"bg"} bs`} onClick={()=>setFilter("Todos")}>Todos</button>
{comps.map(c=><button key={c} className={`btn ${filter===c?"bp":"bg"} bs`} onClick={()=>setFilter(c)}>{c}</button>)}
</div>
</div>

{filtered.length===0?<EmptyState icon="⚽" title="Nenhum jogo" sub="Registre seu primeiro jogo!"/>:
<>
<div className="d-only"><div className="card" style={{padding:0,overflow:"hidden"}}>
<table><thead><tr><th>Data</th><th>Adversário</th><th style={{textAlign:"center"}}>Placar</th><th>Competição</th><th>MOTM</th><th style={{textAlign:"right"}}>Ações</th></tr></thead>
<tbody>{filtered.map(m=>{const rb=resultBadge(m.goalsFor,m.goalsAgainst);return(
<tr key={m.id}><td style={{fontSize:12,color:"var(--text3)"}}>{m.date}</td>
<td className="in">{m.isHome?"🏠 ":"✈️ "}{m.opponent}</td>
<td style={{textAlign:"center"}}><span className={`tg ${rb.cls}`} style={{marginRight:6}}>{rb.label}</span><span style={{fontWeight:700,fontFamily:"'Outfit',sans-serif"}}>{m.goalsFor} - {m.goalsAgainst}</span></td>
<td><span className="tg tg-n">{m.competition}</span></td>
<td style={{fontSize:12,color:"var(--text2)"}}>{m.motm||"—"}</td>
<td style={{textAlign:"right"}}><div style={{display:"flex",gap:4,justifyContent:"flex-end"}}><button className="bi" onClick={()=>editM(m)} title="Editar">{I.edit}</button><ConfirmDelete onConfirm={()=>rem(m.id)}/></div></td>
</tr>);})}</tbody></table>
</div></div>
<div className="m-only" style={{display:"flex",flexDirection:"column",gap:8}}>
{filtered.map(m=>{const rb=resultBadge(m.goalsFor,m.goalsAgainst);return(
<div key={m.id} className="m-card">
<div className="m-card-h"><span className={`tg ${rb.cls}`}>{rb.label}</span><span className="m-card-n" style={{marginLeft:6}}>{m.isHome?"🏠 ":"✈️ "}{m.opponent}</span><span style={{fontWeight:700,fontFamily:"'Outfit',sans-serif",fontSize:16}}>{m.goalsFor}-{m.goalsAgainst}</span></div>
<div className="m-card-r"><span className="tg tg-n">{m.competition}</span><span>{m.date}</span>{m.motm&&<span>⭐ {m.motm}</span>}</div>
{(m.scorers||[]).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:4}}>{m.scorers.map((s,i)=><span key={i} style={{fontSize:10,color:"var(--green)"}}>⚽ {s.playerName}{s.goals>1?` ×${s.goals}`:""}</span>)}</div>}
<div className="m-card-a"><button className="bi" onClick={()=>editM(m)}>{I.edit}</button><ConfirmDelete onConfirm={()=>rem(m.id)}/></div>
</div>);})}
</div>
</>}

{modal&&<Modal title={modal==="edit"?"Editar Jogo":"Novo Jogo"} onClose={()=>{setModal(false);resetForm();}}>
<div className="fr">
<div className="fg" style={{flex:2}}><label className="fl">Adversário</label><input value={form.opponent||""} onChange={e=>setForm({...form,opponent:e.target.value})} autoFocus placeholder="Ex: Real Madrid"/></div>
<div className="fg" style={{maxWidth:80}}><label className="fl">Local</label>
<button className={`btn ${form.isHome?"bp":"bg"} bs`} style={{width:"100%",justifyContent:"center"}} onClick={()=>setForm({...form,isHome:!form.isHome})}>{form.isHome?"🏠 Casa":"✈️ Fora"}</button>
</div>
</div>
<div className="fr">
<div className="fg"><label className="fl">Competição</label><select value={form.competition} onChange={e=>setForm({...form,competition:e.target.value})}>{config.competitions.map(c=><option key={c}>{c}</option>)}</select></div>
<div className="fg"><label className="fl">Data</label><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></div>
</div>

{/* SCORERS PICKER */}
{season.players.length>0?<>
<div style={{borderTop:"1px solid var(--border)",margin:"8px 0",paddingTop:10}}>
<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
<span className="fl">⚽ Gols Marcados</span>
<span style={{fontSize:18,fontWeight:800,fontFamily:"'Outfit',sans-serif",color:"var(--accent)"}}>{totalScorerGoals}</span>
</div>
</div>
<PlayerPicker label="Toque no jogador que marcou" items={scorers} onAdd={addScorer} onRemove={removeScorer} field="goals"/>

<PlayerPicker label="🅰️ Assistências" items={assists} onAdd={addAssist} onRemove={removeAssist} field="assists"/>
</>:
<div className="fr">
<div className="fg"><label className="fl">Gols Pró</label><input type="number" min="0" value={form.goalsFor} onChange={e=>setForm({...form,goalsFor:e.target.value})} placeholder="0"/></div>
</div>}

<div className="fr">
<div className="fg"><label className="fl">Gols Contra</label><input type="number" min="0" value={form.goalsAgainst} onChange={e=>setForm({...form,goalsAgainst:e.target.value})} placeholder="0"/></div>
<div className="fg"><label className="fl">Man of the Match</label><select value={form.motm||""} onChange={e=>setForm({...form,motm:e.target.value})}><option value="">—</option>{season.players.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}</select></div>
</div>

<div className="fr"><div className="fg"><label className="fl">Observações</label><textarea value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Notas sobre o jogo..." rows={2}/></div></div>
<div className="ma"><button className="btn bg" onClick={()=>{setModal(false);resetForm();}}>Cancelar</button><button className="btn bp" onClick={add}>{modal==="edit"?"Salvar":"Registrar ⚽"}</button></div>
</Modal>}
</div>);
}

// ─── SQUAD PAGE ───
function SquadPage({season,setSeason,toast,config}){
const[modal,setModal]=useState(false);
const[form,setForm]=useState({name:"",position:config.positions[0],overall:"",potential:"",age:"",altPositions:[],goals:0,assists:0,matchesPlayed:0,avgRating:0,motm:0,shirtNumber:"",nationality:"",foot:"Direito",notes:""});
const[search,setSearch]=useState("");
const[sortBy,setSortBy]=useState("overall");
const[filterPos,setFilterPos]=useState("Todos");
const[compareIds,setCompareIds]=useState([]);
const[showCompare,setShowCompare]=useState(false);

if(!season) return <EmptyState icon="👕" title="Sem temporada ativa" sub="Crie uma temporada primeiro"/>;

const add=()=>{
if(!form.name)return;
const player={...form,id:form.id||genId(),overall:Number(form.overall)||0,potential:Number(form.potential)||0,age:Number(form.age)||0,goals:Number(form.goals)||0,assists:Number(form.assists)||0,matchesPlayed:Number(form.matchesPlayed)||0,avgRating:Number(form.avgRating)||0,motm:Number(form.motm)||0,shirtNumber:Number(form.shirtNumber)||0,overallHistory:[...(form.overallHistory||[]),{season:season.number,overall:Number(form.overall)||0}]};
if(modal==="edit"){setSeason(s=>({...s,players:s.players.map(p=>p.id===form.id?player:p)}));toast("Jogador atualizado");}
else{setSeason(s=>({...s,players:[...s.players,player]}));toast(`${form.name} adicionado!`);}
setModal(false);};

const editP=(p)=>{setForm({...p});setModal("edit");};
const rem=(id)=>{setSeason(s=>({...s,players:s.players.filter(p=>p.id!==id)}));toast("Jogador removido");};

const positions=[...new Set(season.players.map(p=>p.position))];
let sorted=[...season.players];
if(filterPos!=="Todos") sorted=sorted.filter(p=>p.position===filterPos);
if(search) sorted=sorted.filter(p=>p.name.toLowerCase().includes(search.toLowerCase()));
sorted.sort((a,b)=>{
if(sortBy==="overall")return(b.overall||0)-(a.overall||0);
if(sortBy==="potential")return(b.potential||0)-(a.potential||0);
if(sortBy==="goals")return(b.goals||0)-(a.goals||0);
if(sortBy==="assists")return(b.assists||0)-(a.assists||0);
if(sortBy==="rating")return(b.avgRating||0)-(a.avgRating||0);
if(sortBy==="age")return(a.age||0)-(b.age||0);
return a.name.localeCompare(b.name);
});

const toggleCompare=(id)=>{
setCompareIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id].slice(-2));
};

const compPlayers=compareIds.map(id=>season.players.find(p=>p.id===id)).filter(Boolean);

return(<div>
<div className="ph"><div className="pt">👕 Elenco</div><div className="ps">{season.players.length} jogadores · OVR médio {season.players.length>0?Math.round(season.players.reduce((a,p)=>a+(p.overall||0),0)/season.players.length):0}</div></div>

<div className="tb">
<button className="btn bp" onClick={()=>{setForm({name:"",position:config.positions[0],overall:"",potential:"",age:"",altPositions:[],goals:0,assists:0,matchesPlayed:0,avgRating:0,motm:0,shirtNumber:"",nationality:"",foot:"Direito",notes:"",overallHistory:[]});setModal(true);}}>{I.plus} Adicionar Jogador</button>
{compareIds.length===2&&<button className="btn bg" onClick={()=>setShowCompare(true)}>{I.compare} Comparar ({compareIds.length})</button>}
<select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{maxWidth:160}}>
<option value="overall">Ordenar: Overall</option><option value="potential">Ordenar: Potencial</option><option value="goals">Ordenar: Gols</option><option value="assists">Ordenar: Assists</option><option value="rating">Ordenar: Nota</option><option value="age">Ordenar: Idade</option><option value="name">Ordenar: Nome</option>
</select>
</div>

<div className="filter-scroll" style={{marginBottom:16}}>
<button className={`btn ${filterPos==="Todos"?"bp":"bg"} bs`} onClick={()=>setFilterPos("Todos")}>Todos</button>
{config.positions.map(p=><button key={p} className={`btn ${filterPos===p?"bp":"bg"} bs`} onClick={()=>setFilterPos(p)}>{p}</button>)}
</div>

{sorted.length===0?<EmptyState icon="👕" title="Nenhum jogador" sub="Adicione jogadores ao seu elenco"/>:
<div className="card" style={{padding:0,overflow:"hidden"}}>
{sorted.map(p=>(
<div key={p.id} className="player-row" onClick={()=>editP(p)}>
<div style={{position:"relative"}}>
<OvrBadge value={p.overall}/>
{compareIds.includes(p.id)&&<div style={{position:"absolute",top:-4,right:-4,width:14,height:14,borderRadius:7,background:"var(--accent)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,color:"#000"}}>✓</div>}
</div>
<div style={{flex:1,minWidth:0,overflow:"hidden"}}>
<div style={{display:"flex",alignItems:"center",gap:6}}>
{p.shirtNumber>0&&<span style={{fontSize:11,color:"var(--text3)",fontWeight:700,flexShrink:0}}>#{p.shirtNumber}</span>}
<span style={{fontSize:13,fontWeight:600,color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}>{p.name}</span>
</div>
<div style={{display:"flex",gap:6,alignItems:"center",marginTop:2}}>
<span className="tg tg-ac" style={{fontSize:10}}>{p.position}</span>
{p.age>0&&<span style={{fontSize:11,color:"var(--text3)"}}>{p.age} anos</span>}
{p.potential>p.overall&&<span style={{fontSize:11,color:"var(--green)"}}>↑{p.potential}</span>}
</div>
</div>
<div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
{(p.goals||0)>0&&<span style={{fontSize:11,color:"var(--text2)"}}>⚽{p.goals}</span>}
{(p.assists||0)>0&&<span style={{fontSize:11,color:"var(--text2)"}}>🅰️{p.assists}</span>}
{(p.avgRating||0)>0&&<span style={{fontSize:11,color:"var(--yellow)"}}>⭐{(p.avgRating).toFixed(1)}</span>}
<button className="bi" style={{padding:3}} onClick={e=>{e.stopPropagation();toggleCompare(p.id);}} title="Comparar">{I.compare}</button>
</div>
</div>))}
</div>}

{modal&&<Modal title={modal==="edit"?"Editar Jogador":"Novo Jogador"} onClose={()=>setModal(false)}>
<div className="fr">
<div className="fg" style={{flex:2}}><label className="fl">Nome</label><input value={form.name||""} onChange={e=>setForm({...form,name:e.target.value})} autoFocus placeholder="Ex: Haaland"/></div>
<div className="fg" style={{maxWidth:80}}><label className="fl">Camisa</label><input type="number" min="0" value={form.shirtNumber||""} onChange={e=>setForm({...form,shirtNumber:e.target.value})} placeholder="#"/></div>
</div>
<div className="fr">
<div className="fg"><label className="fl">Posição</label><select value={form.position} onChange={e=>setForm({...form,position:e.target.value})}>{config.positions.map(p=><option key={p}>{p}</option>)}</select></div>
<div className="fg"><label className="fl">Idade</label><input type="number" min="15" max="45" value={form.age||""} onChange={e=>setForm({...form,age:e.target.value})}/></div>
</div>
<div className="fr">
<div className="fg"><label className="fl">Overall</label><input type="number" min="1" max="99" value={form.overall||""} onChange={e=>setForm({...form,overall:e.target.value})}/></div>
<div className="fg"><label className="fl">Potencial</label><input type="number" min="1" max="99" value={form.potential||""} onChange={e=>setForm({...form,potential:e.target.value})}/></div>
</div>
<div className="fr">
<div className="fg"><label className="fl">Nacionalidade</label><input value={form.nationality||""} onChange={e=>setForm({...form,nationality:e.target.value})} placeholder="Ex: Brasil"/></div>
<div className="fg"><label className="fl">Pé</label><select value={form.foot||"Direito"} onChange={e=>setForm({...form,foot:e.target.value})}><option>Direito</option><option>Esquerdo</option><option>Ambos</option></select></div>
</div>
<div style={{borderTop:"1px solid var(--border)",margin:"12px 0",paddingTop:12}}>
<div style={{fontSize:11,textTransform:"uppercase",letterSpacing:1.5,color:"var(--text3)",fontWeight:600,marginBottom:8}}>Estatísticas da Temporada</div>
</div>
<div className="fr">
<div className="fg"><label className="fl">Gols</label><input type="number" min="0" value={form.goals||""} onChange={e=>setForm({...form,goals:e.target.value})}/></div>
<div className="fg"><label className="fl">Assistências</label><input type="number" min="0" value={form.assists||""} onChange={e=>setForm({...form,assists:e.target.value})}/></div>
</div>
<div className="fr">
<div className="fg"><label className="fl">Jogos</label><input type="number" min="0" value={form.matchesPlayed||""} onChange={e=>setForm({...form,matchesPlayed:e.target.value})}/></div>
<div className="fg"><label className="fl">Nota Média</label><input type="number" min="0" max="10" step="0.1" value={form.avgRating||""} onChange={e=>setForm({...form,avgRating:e.target.value})}/></div>
</div>
<div className="fr">
<div className="fg"><label className="fl">MOTM</label><input type="number" min="0" value={form.motm||""} onChange={e=>setForm({...form,motm:e.target.value})}/></div>
</div>
{/* OVR Evolution Chart */}
{modal==="edit"&&<OvrChart history={form.overallHistory}/>}
<div className="fr"><div className="fg"><label className="fl">Notas</label><textarea value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Observações sobre o jogador..." rows={2}/></div></div>
<div className="ma">
{modal==="edit"&&<ConfirmDelete onConfirm={()=>{rem(form.id);setModal(false);}} label="Excluir"/>}
<button className="btn bg" onClick={()=>setModal(false)}>Cancelar</button>
<button className="btn bp" onClick={add}>{modal==="edit"?"Salvar":"Adicionar"}</button>
</div>
</Modal>}

{showCompare&&compPlayers.length===2&&<Modal title="Comparar Jogadores" onClose={()=>setShowCompare(false)}>
<div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:12,textAlign:"center"}}>
{[compPlayers[0],null,compPlayers[1]].map((p,i)=>{
if(i===1)return <div key="vs" style={{display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:18,color:"var(--text3)",fontFamily:"'Outfit',sans-serif"}}>VS</div>;
return <div key={p.id} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
<OvrBadge value={p.overall} size={48}/>
<div style={{fontSize:14,fontWeight:700}}>{p.name}</div>
<span className="tg tg-ac">{p.position}</span>
{[{l:"Potencial",v:p.potential},{l:"Idade",v:p.age},{l:"Gols",v:p.goals||0},{l:"Assists",v:p.assists||0},{l:"Nota",v:(p.avgRating||0).toFixed(1)},{l:"MOTM",v:p.motm||0},{l:"Jogos",v:p.matchesPlayed||0}].map(s=>(
<div key={s.l} style={{display:"flex",justifyContent:"space-between",width:"100%",padding:"4px 0",borderBottom:"1px solid var(--border)"}}>
<span style={{fontSize:11,color:"var(--text3)"}}>{s.l}</span>
<span style={{fontSize:13,fontWeight:600}}>{s.v}</span>
</div>))}
</div>;})}
</div>
<div className="ma"><button className="btn bg" onClick={()=>setShowCompare(false)}>Fechar</button></div>
</Modal>}
</div>);
}

// ─── TRANSFERS PAGE ───
function TransfersPage({season,setSeason,toast,config}){
const[modal,setModal]=useState(false);
const[form,setForm]=useState({playerName:"",type:config.transferTypes[0],fee:"",from:"",to:"",date:today(),notes:""});
const[filter,setFilter]=useState("Todos");

if(!season) return <EmptyState icon="🔄" title="Sem temporada ativa" sub="Crie uma temporada primeiro"/>;

const add=()=>{
if(!form.playerName)return;
const t={...form,id:form.id||genId(),fee:Number(form.fee)||0};
if(modal==="edit"){setSeason(s=>({...s,transfers:s.transfers.map(tr=>tr.id===form.id?t:tr)}));toast("Transferência atualizada");}
else{setSeason(s=>({...s,transfers:[...s.transfers,t]}));toast("Transferência registrada!");}
setModal(false);};

const rem=(id)=>{setSeason(s=>({...s,transfers:s.transfers.filter(t=>t.id!==id)}));toast("Removida");};

const fmtFee=(n)=>{if(n>=1000000)return `€${(n/1000000).toFixed(1)}M`;if(n>=1000)return `€${(n/1000).toFixed(0)}K`;return n>0?`€${n}`:"Grátis";};

const types=[...new Set(season.transfers.map(t=>t.type))];
const filtered=filter==="Todos"?season.transfers:season.transfers.filter(t=>t.type===filter);
const totalBought=season.transfers.filter(t=>t.type==="Compra").reduce((a,t)=>a+t.fee,0);
const totalSold=season.transfers.filter(t=>t.type==="Venda").reduce((a,t)=>a+t.fee,0);

return(<div>
<div className="ph"><div className="pt">🔄 Transferências</div><div className="ps">{season.transfers.length} movimentações · Gasto: {fmtFee(totalBought)} · Vendas: {fmtFee(totalSold)} · Saldo: {fmtFee(totalSold-totalBought)}</div></div>

<div className="tb">
<button className="btn bp" onClick={()=>{setForm({playerName:"",type:config.transferTypes[0],fee:"",from:"",to:"",date:today(),notes:""});setModal(true);}}>{I.plus} Nova Transferência</button>
<div className="filter-scroll">{["Todos",...config.transferTypes].map(t=><button key={t} className={`btn ${filter===t?"bp":"bg"} bs`} onClick={()=>setFilter(t)}>{t}</button>)}</div>
</div>

{filtered.length===0?<EmptyState icon="🔄" title="Nenhuma transferência" sub="Registre compras, vendas e empréstimos"/>:
<div className="card" style={{padding:0}}>
{filtered.map(t=>(
<div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderBottom:"1px solid var(--border)",transition:"all .15s",overflow:"hidden"}}>
<div style={{width:32,height:32,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0,background:t.type.includes("Compra")||t.type.includes("entrada")?"var(--green-bg)":"var(--red-bg)"}}>{t.type.includes("Compra")||t.type.includes("entrada")?"📥":"📤"}</div>
<div style={{flex:1,minWidth:0,overflow:"hidden"}}>
<div style={{fontSize:13,fontWeight:600,color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.playerName}</div>
<div style={{display:"flex",gap:4,alignItems:"center",marginTop:2,flexWrap:"wrap"}}><span className="tg tg-n">{t.type}</span>{t.from&&<span style={{fontSize:10,color:"var(--text3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>de {t.from}</span>}{t.to&&<span style={{fontSize:10,color:"var(--text3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>para {t.to}</span>}</div>
</div>
<span style={{fontSize:15,fontWeight:700,fontFamily:"'Outfit',sans-serif",color:t.fee>0?"var(--accent)":"var(--text3)"}}>{fmtFee(t.fee)}</span>
<div style={{display:"flex",gap:4}}><button className="bi" onClick={()=>{setForm({...t});setModal("edit");}}>{I.edit}</button><ConfirmDelete onConfirm={()=>rem(t.id)}/></div>
</div>))}
</div>}

{modal&&<Modal title={modal==="edit"?"Editar Transferência":"Nova Transferência"} onClose={()=>setModal(false)}>
<div className="fr"><div className="fg"><label className="fl">Jogador</label><input value={form.playerName} onChange={e=>setForm({...form,playerName:e.target.value})} autoFocus placeholder="Nome do jogador"/></div></div>
<div className="fr">
<div className="fg"><label className="fl">Tipo</label><select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>{config.transferTypes.map(t=><option key={t}>{t}</option>)}</select></div>
<div className="fg"><label className="fl">Valor (€)</label><input type="number" min="0" value={form.fee||""} onChange={e=>setForm({...form,fee:e.target.value})} placeholder="0"/></div>
</div>
<div className="fr">
<div className="fg"><label className="fl">De (clube)</label><input value={form.from||""} onChange={e=>setForm({...form,from:e.target.value})} placeholder="Clube de origem"/></div>
<div className="fg"><label className="fl">Para (clube)</label><input value={form.to||""} onChange={e=>setForm({...form,to:e.target.value})} placeholder="Clube destino"/></div>
</div>
<div className="fr"><div className="fg"><label className="fl">Data</label><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></div></div>
<div className="ma"><button className="btn bg" onClick={()=>setModal(false)}>Cancelar</button><button className="btn bp" onClick={add}>{modal==="edit"?"Salvar":"Registrar"}</button></div>
</Modal>}
</div>);
}

// ─── TROPHIES PAGE ───
function TrophiesPage({season,setSeason,toast,config,allSeasons}){
const[modal,setModal]=useState(false);
const[form,setForm]=useState({name:config.trophyTypes[0],customName:"",notes:""});

if(!season) return <EmptyState icon="🏆" title="Sem temporada ativa" sub="Crie uma temporada primeiro"/>;

const add=()=>{
const name=form.name==="Outro"?form.customName:form.name;
if(!name)return;
const trophy={id:genId(),name,notes:form.notes,season:season.number,year:season.year};
setSeason(s=>({...s,trophies:[...s.trophies,trophy]}));
toast(`🏆 ${name} conquistado!`);setModal(false);};

const rem=(id)=>{setSeason(s=>({...s,trophies:s.trophies.filter(t=>t.id!==id)}));toast("Troféu removido");};

// All trophies across seasons
const allTrophies=allSeasons.flatMap(s=>(s.trophies||[]).map(t=>({...t,team:s.teamName,seasonNum:s.number,year:s.year,badge:s.teamBadgeEmoji})));

return(<div>
<div className="ph"><div className="pt">🏆 Títulos</div><div className="ps">{allTrophies.length} troféus na carreira</div></div>

<div className="tb"><button className="btn bp" onClick={()=>{setForm({name:config.trophyTypes[0],customName:"",notes:""});setModal(true);}}>{I.plus} Adicionar Título</button></div>

{allTrophies.length===0?<EmptyState icon="🏆" title="Nenhum troféu" sub="Conquiste seu primeiro título!"/>:
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:14}}>
{allTrophies.map(t=>(
<div key={t.id} className="card" style={{textAlign:"center",padding:20,position:"relative"}}>
<div style={{fontSize:40,marginBottom:8}}>🏆</div>
<div style={{fontSize:14,fontWeight:700,color:"var(--text)"}}>{t.name}</div>
<div style={{fontSize:12,color:"var(--text3)",marginTop:4}}>{t.badge} {t.team}</div>
<div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>Temp. {t.seasonNum} · {t.year}</div>
{t.season===season.number&&<div style={{position:"absolute",top:8,right:8}}><ConfirmDelete onConfirm={()=>rem(t.id)}/></div>}
</div>))}
</div>}

{modal&&<Modal title="Novo Título" onClose={()=>setModal(false)}>
<div className="fr"><div className="fg"><label className="fl">Competição</label><select value={form.name} onChange={e=>setForm({...form,name:e.target.value})}>{config.trophyTypes.map(t=><option key={t}>{t}</option>)}</select></div></div>
{form.name==="Outro"&&<div className="fr"><div className="fg"><label className="fl">Nome do Troféu</label><input value={form.customName} onChange={e=>setForm({...form,customName:e.target.value})} placeholder="Ex: Copa da Liga"/></div></div>}
<div className="ma"><button className="btn bg" onClick={()=>setModal(false)}>Cancelar</button><button className="btn bp" onClick={add}>Conquistar! 🏆</button></div>
</Modal>}
</div>);
}

// ─── STATS PAGE ───
function StatsPage({season,allSeasons}){
if(!season) return <EmptyState icon="📊" title="Sem temporada ativa" sub="Crie uma temporada primeiro"/>;

const ms=matchStats(season.matches);const streaks=getStreaks(season.matches);
const byComp={};season.matches.forEach(m=>{if(!byComp[m.competition])byComp[m.competition]=[];byComp[m.competition].push(m);});

// Top 5 scorers
const topScorers=[...season.players].filter(p=>(p.goals||0)>0).sort((a,b)=>(b.goals||0)-(a.goals||0)).slice(0,5);
const topAssisters=[...season.players].filter(p=>(p.assists||0)>0).sort((a,b)=>(b.assists||0)-(a.assists||0)).slice(0,5);
const topRated=[...season.players].filter(p=>(p.matchesPlayed||0)>0&&(p.avgRating||0)>0).sort((a,b)=>(b.avgRating||0)-(a.avgRating||0)).slice(0,5);

// Decisiveness: goals + assists / matches
const decisive=[...season.players].filter(p=>(p.matchesPlayed||0)>0).map(p=>({...p,dec:((p.goals||0)+(p.assists||0))/(p.matchesPlayed||1)})).sort((a,b)=>b.dec-a.dec).slice(0,5);

return(<div>
<div className="ph"><div className="pt">📊 Estatísticas</div><div className="ps">Análise completa da temporada {season.number}</div></div>

<div className="sg">
<div className="sc ac"><div className="sl">Aproveitamento</div><div className="sv">{ms.total>0?Math.round((ms.pts/(ms.total*3))*100):0}%</div></div>
<div className="sc gn"><div className="sl">Média Gols/Jogo</div><div className="sv">{ms.total>0?(ms.gf/ms.total).toFixed(1):"0"}</div></div>
<div className="sc rd"><div className="sl">Gols Sofridos/Jogo</div><div className="sv">{ms.total>0?(ms.ga/ms.total).toFixed(1):"0"}</div></div>
<div className="sc bl"><div className="sl">Seq. Invicta</div><div className="sv">{streaks.unbeaten}</div></div>
</div>

<div className="dg">
<div className="card">
<div className="ct">🎯 Por Competição</div>
{Object.entries(byComp).map(([comp,mts])=>{const s=matchStats(mts);return(
<div key={comp} style={{padding:"8px 0",borderBottom:"1px solid var(--border)"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
<span style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{comp}</span>
<span style={{fontSize:12,color:"var(--text3)"}}>{s.w}V {s.d}E {s.l}D</span>
</div>
<div style={{height:6,background:"var(--bg4)",borderRadius:3,marginTop:6,overflow:"hidden"}}>
<div style={{height:"100%",width:`${s.total>0?(s.pts/(s.total*3))*100:0}%`,background:"linear-gradient(90deg,var(--accent),var(--green))",borderRadius:3,transition:"width .6s"}}/>
</div>
</div>);})}
</div>

<div className="card">
<div className="ct">⚽ Artilheiros</div>
{topScorers.length===0?<div style={{color:"var(--text3)",fontSize:13}}>Sem dados</div>:
topScorers.map((p,i)=>(
<div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:"1px solid var(--border)"}}>
<span style={{fontSize:14,fontWeight:800,color:i===0?"var(--accent)":"var(--text3)",fontFamily:"'Outfit',sans-serif",width:20}}>{i+1}</span>
<span style={{flex:1,fontSize:13,fontWeight:600,color:"var(--text)"}}>{p.name}</span>
<span style={{fontSize:15,fontWeight:800,fontFamily:"'Outfit',sans-serif"}}>{p.goals}</span>
</div>))}
</div>

<div className="card">
<div className="ct">🅰️ Garçons</div>
{topAssisters.length===0?<div style={{color:"var(--text3)",fontSize:13}}>Sem dados</div>:
topAssisters.map((p,i)=>(
<div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:"1px solid var(--border)"}}>
<span style={{fontSize:14,fontWeight:800,color:i===0?"var(--accent)":"var(--text3)",fontFamily:"'Outfit',sans-serif",width:20}}>{i+1}</span>
<span style={{flex:1,fontSize:13,fontWeight:600,color:"var(--text)"}}>{p.name}</span>
<span style={{fontSize:15,fontWeight:800,fontFamily:"'Outfit',sans-serif"}}>{p.assists}</span>
</div>))}
</div>

<div className="card">
<div className="ct">💫 Mais Decisivos</div>
{decisive.length===0?<div style={{color:"var(--text3)",fontSize:13}}>Sem dados</div>:
decisive.map((p,i)=>(
<div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:"1px solid var(--border)"}}>
<span style={{fontSize:14,fontWeight:800,color:i===0?"var(--accent)":"var(--text3)",fontFamily:"'Outfit',sans-serif",width:20}}>{i+1}</span>
<span style={{flex:1,fontSize:13,fontWeight:600,color:"var(--text)"}}>{p.name}</span>
<span style={{fontSize:12,color:"var(--text2)"}}>{p.dec.toFixed(2)} G+A/jogo</span>
</div>))}
</div>
</div>
</div>);
}

// ─── YOUTH ACADEMY PAGE ───
function YouthPage({season,setSeason,toast}){
const[modal,setModal]=useState(false);
const[form,setForm]=useState({name:"",position:"MC",age:"",overallMin:"",overallMax:"",potentialMin:"",potentialMax:"",status:"Monitorando"});

if(!season) return <EmptyState icon="🌱" title="Sem temporada ativa" sub="Crie uma temporada primeiro"/>;

const add=()=>{
if(!form.name)return;
const ya={...form,id:form.id||genId()};
if(modal==="edit"){setSeason(s=>({...s,youthAcademy:s.youthAcademy.map(y=>y.id===form.id?ya:y)}));toast("Atualizado");}
else{setSeason(s=>({...s,youthAcademy:[...(s.youthAcademy||[]),ya]}));toast("Jovem adicionado!");}
setModal(false);};

const rem=(id)=>{setSeason(s=>({...s,youthAcademy:(s.youthAcademy||[]).filter(y=>y.id!==id)}));toast("Removido");};
const promote=(y)=>{
const player={id:genId(),name:y.name,position:y.position,overall:Number(y.overallMin)||60,potential:Number(y.potentialMax)||80,age:Number(y.age)||16,goals:0,assists:0,matchesPlayed:0,avgRating:0,motm:0,shirtNumber:0,nationality:"",foot:"Direito",notes:"Promovido da base",overallHistory:[]};
setSeason(s=>({...s,players:[...s.players,player],youthAcademy:(s.youthAcademy||[]).filter(ya=>ya.id!==y.id)}));
toast(`${y.name} promovido ao elenco principal!`);};

const ya=season.youthAcademy||[];

return(<div>
<div className="ph"><div className="pt">🌱 Base / Academia</div><div className="ps">{ya.length} jovens monitorados</div></div>

<div className="tb"><button className="btn bp" onClick={()=>{setForm({name:"",position:"MC",age:"",overallMin:"",overallMax:"",potentialMin:"",potentialMax:"",status:"Monitorando"});setModal(true);}}>{I.plus} Adicionar Jovem</button></div>

{ya.length===0?<EmptyState icon="🌱" title="Academia vazia" sub="Adicione jovens promessas"/>:
<div className="card" style={{padding:0}}>
{ya.map(y=>(
<div key={y.id} className="player-row">
<div style={{width:36,height:36,borderRadius:10,background:"var(--accent-glow)",border:"2px solid var(--accent)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:"var(--accent)",fontFamily:"'Outfit',sans-serif"}}>{y.position?.slice(0,3)}</div>
<div style={{flex:1,minWidth:0}}>
<div style={{fontSize:14,fontWeight:600,color:"var(--text)"}}>{y.name}</div>
<div style={{display:"flex",gap:6,alignItems:"center",marginTop:2}}>
{y.age&&<span style={{fontSize:11,color:"var(--text3)"}}>{y.age} anos</span>}
<span style={{fontSize:11,color:"var(--text3)"}}>OVR: {y.overallMin||"?"}-{y.overallMax||"?"}</span>
<span style={{fontSize:11,color:"var(--green)"}}>POT: {y.potentialMin||"?"}-{y.potentialMax||"?"}</span>
</div>
</div>
<span className={`tg ${y.status==="Monitorando"?"tg-y":"tg-g"}`}>{y.status}</span>
<button className="btn bg bs" onClick={()=>promote(y)} title="Promover ao time principal">↑ Promover</button>
<button className="bi" onClick={()=>{setForm({...y});setModal("edit");}}>{I.edit}</button>
<ConfirmDelete onConfirm={()=>rem(y.id)}/>
</div>))}
</div>}

{modal&&<Modal title={modal==="edit"?"Editar Jovem":"Novo Jovem"} onClose={()=>setModal(false)}>
<div className="fr"><div className="fg"><label className="fl">Nome</label><input value={form.name||""} onChange={e=>setForm({...form,name:e.target.value})} autoFocus/></div></div>
<div className="fr">
<div className="fg"><label className="fl">Posição</label><select value={form.position} onChange={e=>setForm({...form,position:e.target.value})}>{DEFAULT_CONFIG.positions.map(p=><option key={p}>{p}</option>)}</select></div>
<div className="fg"><label className="fl">Idade</label><input type="number" min="14" max="20" value={form.age||""} onChange={e=>setForm({...form,age:e.target.value})}/></div>
</div>
<div className="fr">
<div className="fg"><label className="fl">OVR Mín</label><input type="number" min="1" max="99" value={form.overallMin||""} onChange={e=>setForm({...form,overallMin:e.target.value})}/></div>
<div className="fg"><label className="fl">OVR Máx</label><input type="number" min="1" max="99" value={form.overallMax||""} onChange={e=>setForm({...form,overallMax:e.target.value})}/></div>
</div>
<div className="fr">
<div className="fg"><label className="fl">POT Mín</label><input type="number" min="1" max="99" value={form.potentialMin||""} onChange={e=>setForm({...form,potentialMin:e.target.value})}/></div>
<div className="fg"><label className="fl">POT Máx</label><input type="number" min="1" max="99" value={form.potentialMax||""} onChange={e=>setForm({...form,potentialMax:e.target.value})}/></div>
</div>
<div className="fr"><div className="fg"><label className="fl">Status</label><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option>Monitorando</option><option>Pronto p/ promover</option><option>Emprestado</option></select></div></div>
<div className="ma"><button className="btn bg" onClick={()=>setModal(false)}>Cancelar</button><button className="btn bp" onClick={add}>{modal==="edit"?"Salvar":"Adicionar"}</button></div>
</Modal>}
</div>);
}

// ─── RECORDS / HALL OF FAME ───
function RecordsPage({allSeasons,save:sv}){
if(!sv||allSeasons.length===0) return <EmptyState icon="⭐" title="Sem dados" sub="Jogue algumas temporadas para ver recordes"/>;

// Calculate records across all seasons
const allPlayers={};const allMatches=[];
allSeasons.forEach(s=>{
s.matches.forEach(m=>allMatches.push({...m,season:s.number,team:s.teamName}));
s.players.forEach(p=>{
if(!allPlayers[p.name])allPlayers[p.name]={name:p.name,totalGoals:0,totalAssists:0,totalMatches:0,totalMotm:0,seasons:[]};
allPlayers[p.name].totalGoals+=(p.goals||0);
allPlayers[p.name].totalAssists+=(p.assists||0);
allPlayers[p.name].totalMatches+=(p.matchesPlayed||0);
allPlayers[p.name].totalMotm+=(p.motm||0);
allPlayers[p.name].seasons.push({season:s.number,goals:p.goals||0,assists:p.assists||0,overall:p.overall,rating:p.avgRating||0});
});
});

const playerList=Object.values(allPlayers);
const topAllTimeScorer=playerList.length>0?[...playerList].sort((a,b)=>b.totalGoals-a.totalGoals)[0]:null;
const topAllTimeAssister=playerList.length>0?[...playerList].sort((a,b)=>b.totalAssists-a.totalAssists)[0]:null;
const topAllTimeMotm=playerList.length>0?[...playerList].sort((a,b)=>b.totalMotm-a.totalMotm)[0]:null;

// Best season (most wins)
const seasonStats=allSeasons.map(s=>{const ms=matchStats(s.matches);return{...s,stats:ms};});
const bestSeason=seasonStats.length>0?[...seasonStats].sort((a,b)=>(b.stats.pts/(b.stats.total||1))-(a.stats.pts/(a.stats.total||1)))[0]:null;

// Biggest win
const biggestWin=allMatches.length>0?[...allMatches].sort((a,b)=>(b.goalsFor-b.goalsAgainst)-(a.goalsFor-a.goalsAgainst))[0]:null;

// All trophies
const allTrophies=allSeasons.flatMap(s=>(s.trophies||[]).map(t=>({...t,team:s.teamName,year:s.year,badge:s.teamBadgeEmoji})));

return(<div>
<div className="ph"><div className="pt">⭐ Hall da Fama & Recordes</div><div className="ps">Lendas e marcos da carreira de {sv.managerName||"Treinador"}</div></div>

<div className="dg">
{topAllTimeScorer&&<div className="card" style={{textAlign:"center"}}>
<div style={{fontSize:32,marginBottom:4}}>👑</div>
<div style={{fontSize:11,textTransform:"uppercase",letterSpacing:2,color:"var(--text3)",fontWeight:600}}>Maior Artilheiro</div>
<div style={{fontSize:20,fontWeight:800,fontFamily:"'Outfit',sans-serif",color:"var(--accent)",margin:"4px 0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{topAllTimeScorer.name}</div>
<div style={{fontSize:24,fontWeight:900,fontFamily:"'Outfit',sans-serif"}}>{topAllTimeScorer.totalGoals} gols</div>
</div>}

{topAllTimeAssister&&<div className="card" style={{textAlign:"center"}}>
<div style={{fontSize:32,marginBottom:4}}>🎯</div>
<div style={{fontSize:11,textTransform:"uppercase",letterSpacing:2,color:"var(--text3)",fontWeight:600}}>Mais Assistências</div>
<div style={{fontSize:20,fontWeight:800,fontFamily:"'Outfit',sans-serif",color:"var(--blue)",margin:"4px 0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{topAllTimeAssister.name}</div>
<div style={{fontSize:24,fontWeight:900,fontFamily:"'Outfit',sans-serif"}}>{topAllTimeAssister.totalAssists} assists</div>
</div>}

{topAllTimeMotm&&topAllTimeMotm.totalMotm>0&&<div className="card" style={{textAlign:"center"}}>
<div style={{fontSize:32,marginBottom:4}}>🏅</div>
<div style={{fontSize:11,textTransform:"uppercase",letterSpacing:2,color:"var(--text3)",fontWeight:600}}>Mais MOTM</div>
<div style={{fontSize:20,fontWeight:800,fontFamily:"'Outfit',sans-serif",color:"var(--yellow)",margin:"4px 0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{topAllTimeMotm.name}</div>
<div style={{fontSize:24,fontWeight:900,fontFamily:"'Outfit',sans-serif"}}>{topAllTimeMotm.totalMotm} prêmios</div>
</div>}

{biggestWin&&<div className="card" style={{textAlign:"center"}}>
<div style={{fontSize:32,marginBottom:4}}>💪</div>
<div style={{fontSize:11,textTransform:"uppercase",letterSpacing:2,color:"var(--text3)",fontWeight:600}}>Maior Goleada</div>
<div style={{fontSize:20,fontWeight:800,fontFamily:"'Outfit',sans-serif",color:"var(--green)",margin:"4px 0"}}>{biggestWin.goalsFor} x {biggestWin.goalsAgainst}</div>
<div style={{fontSize:12,color:"var(--text2)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>vs {biggestWin.opponent} · Temp. {biggestWin.season}</div>
</div>}
</div>

{allTrophies.length>0&&<div className="card">
<div className="ct">🏆 Todos os Títulos ({allTrophies.length})</div>
<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{allTrophies.map((t,i)=>(
<div key={i} style={{background:"var(--accent-glow)",border:"1px solid var(--accent)",borderRadius:10,padding:"8px 14px",display:"flex",alignItems:"center",gap:6}}>
<span style={{fontSize:18}}>🏆</span>
<div><div style={{fontSize:12,fontWeight:600,color:"var(--accent)"}}>{t.name}</div><div style={{fontSize:10,color:"var(--text3)"}}>{t.badge} {t.team} · {t.year}</div></div>
</div>))}</div>
</div>}

{/* Career Timeline */}
<div className="card">
<div className="ct">📅 Timeline da Carreira</div>
{allSeasons.map((s,i)=>{const ms2=matchStats(s.matches);return(
<div key={s.id} style={{display:"flex",gap:16,padding:"12px 0",borderBottom:i<allSeasons.length-1?"1px solid var(--border)":"none"}}>
<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
<div style={{width:36,height:36,borderRadius:"50%",background:"var(--accent-glow)",border:"2px solid var(--accent)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,fontFamily:"'Outfit',sans-serif",color:"var(--accent)"}}>{s.number}</div>
{i<allSeasons.length-1&&<div style={{width:2,flex:1,background:"var(--border)"}}/>}
</div>
<div style={{flex:1}}>
<div style={{fontSize:14,fontWeight:700,color:"var(--text)"}}>{s.teamBadgeEmoji} {s.teamName}</div>
<div style={{fontSize:12,color:"var(--text3)"}}>{s.league} · {s.year}</div>
<div style={{display:"flex",gap:8,marginTop:6,flexWrap:"wrap"}}>
<span className="tg tg-n">{ms2.total} jogos</span>
<span className="tg tg-g">{ms2.w}V</span>
<span className="tg tg-r">{ms2.l}D</span>
{(s.trophies||[]).map((t,j)=><span key={j} className="tg tg-ac">🏆 {t.name}</span>)}
</div>
</div>
</div>);})}
</div>
</div>);
}

// ─── SETTINGS PAGE ───
function SettingsPage({data,setData,toast,goTo}){
const[saveModal,setSaveModal]=useState(false);
const[seasonModal,setSeasonModal]=useState(false);
const[saveForm,setSaveForm]=useState({name:"Nova Carreira",gameVersion:GAME_VERSIONS[0],difficulty:DIFFICULTIES[3],managerName:"",managerNationality:""});
const[seasonForm,setSeasonForm]=useState({teamName:"",teamBadgeEmoji:"⚽",league:"",year:"2025/26",copySquad:true});
const[editSave,setEditSave]=useState(null);
const[editSeason,setEditSeason]=useState(null);

const activeSave=data.saves.find(s=>s.id===data.activeSaveId);
const activeSeason=activeSave?.seasons.find(s=>s.id===activeSave.activeSeasonId);
const lastSeason=activeSave?.seasons[activeSave?.seasons.length-1];

const createSave=()=>{
const sv={...DEFAULT_SAVE,...saveForm,id:genId(),createdAt:today(),seasons:[]};
setData(d=>({...d,saves:[...d.saves,sv],activeSaveId:sv.id}));
toast("Save criado!");setSaveModal(false);};

const createSeason=()=>{
if(!seasonForm.teamName)return;
const newNum=(activeSave?.seasons.length||0)+1;
let players=[];
// Copy squad from last season if same team and option is checked
if(seasonForm.copySquad&&lastSeason&&lastSeason.players.length>0){
players=lastSeason.players.map(p=>({
...p,
id:genId(),
age:(p.age||0)+1,
goals:0,assists:0,matchesPlayed:0,avgRating:0,motm:0,
overallHistory:[...(p.overallHistory||[]),{season:newNum,overall:p.overall||0}],
}));
}
const sn={...DEFAULT_SEASON,teamName:seasonForm.teamName,teamBadgeEmoji:seasonForm.teamBadgeEmoji,league:seasonForm.league,year:seasonForm.year,id:genId(),number:newNum,players};
setData(d=>({...d,saves:d.saves.map(s=>s.id===d.activeSaveId?{...s,seasons:[...s.seasons,sn],activeSeasonId:sn.id}:s)}));
toast(players.length>0?`Temporada criada com ${players.length} jogadores!`:"Temporada criada!");setSeasonModal(false);};

const deleteSave=(id)=>{
setData(d=>{const newSaves=d.saves.filter(s=>s.id!==id);return{...d,saves:newSaves,activeSaveId:newSaves.length>0?newSaves[0].id:null};});
toast("Save removido");};

const deleteSeason=(id)=>{
setData(d=>({...d,saves:d.saves.map(s=>{if(s.id!==d.activeSaveId)return s;const newS=s.seasons.filter(sn=>sn.id!==id);return{...s,seasons:newS,activeSeasonId:newS.length>0?newS[newS.length-1].id:null};})}));
toast("Temporada removida");};

const userPrefs=data.userPrefs||{};
const myTheme=userPrefs.theme||data.config.theme||"pitch";
const myAccent=userPrefs.accentColor||data.config.accentColor||"#22D3EE";

return(<div>
<div className="ph"><div className="pt">⚙️ Configurações</div><div className="ps">Saves, temporadas e personalização</div></div>

{/* Active Save */}
<div className="card">
<div className="ct">{I.save} Saves da Carreira</div>
{data.saves.length===0?<div style={{color:"var(--text3)",fontSize:13,marginBottom:12}}>Nenhum save criado ainda</div>:
<div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
{data.saves.map(s=>(
<div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,background:s.id===data.activeSaveId?"var(--accent-glow)":"var(--bg3)",border:`1px solid ${s.id===data.activeSaveId?"var(--accent)":"var(--border)"}`,cursor:"pointer",transition:"all .2s",overflow:"hidden"}} onClick={()=>setData(d=>({...d,activeSaveId:s.id}))}>
<div style={{fontSize:20,flexShrink:0}}>🎮</div>
<div style={{flex:1,minWidth:0,overflow:"hidden"}}>
<div style={{fontSize:13,fontWeight:600,color:s.id===data.activeSaveId?"var(--accent)":"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
<div style={{fontSize:10,color:"var(--text3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.gameVersion} · {s.difficulty} · {s.seasons.length} temp.</div>
</div>
{s.id===data.activeSaveId&&<span className="tg tg-ac">Ativo</span>}
<ConfirmDelete onConfirm={()=>deleteSave(s.id)}/>
</div>))}
</div>}
<button className="btn bp" onClick={()=>{setSaveForm({name:"Nova Carreira",gameVersion:GAME_VERSIONS[0],difficulty:DIFFICULTIES[3],managerName:"",managerNationality:""});setSaveModal(true);}}>{I.plus} Novo Save</button>
</div>

{/* Seasons */}
{activeSave&&<div className="card">
<div className="ct">{I.calendar} Temporadas — {activeSave.name}</div>
{activeSave.seasons.length===0?<div style={{color:"var(--text3)",fontSize:13,marginBottom:12}}>Nenhuma temporada</div>:
<div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
{activeSave.seasons.map(sn=>(
<div key={sn.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,background:sn.id===activeSave.activeSeasonId?"var(--accent-glow)":"var(--bg3)",border:`1px solid ${sn.id===activeSave.activeSeasonId?"var(--accent)":"var(--border)"}`,cursor:"pointer",transition:"all .2s",overflow:"hidden"}} onClick={()=>setData(d=>({...d,saves:d.saves.map(s=>s.id===d.activeSaveId?{...s,activeSeasonId:sn.id}:s)}))}>
<span style={{fontSize:18,flexShrink:0}}>{sn.teamBadgeEmoji}</span>
<div style={{flex:1,minWidth:0,overflow:"hidden"}}>
<div style={{fontSize:13,fontWeight:600,color:sn.id===activeSave.activeSeasonId?"var(--accent)":"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>Temp. {sn.number} — {sn.teamName}</div>
<div style={{fontSize:10,color:"var(--text3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sn.league} · {sn.year} · {sn.matches.length} jogos · {sn.players.length} jogadores</div>
</div>
{(sn.trophies||[]).length>0&&<span style={{fontSize:14}}>🏆{sn.trophies.length}</span>}
<ConfirmDelete onConfirm={()=>deleteSeason(sn.id)}/>
</div>))}
</div>}
<button className="btn bp" onClick={()=>{
const last=activeSave.seasons[activeSave.seasons.length-1];
setSeasonForm({teamName:last?.teamName||"",teamBadgeEmoji:last?.teamBadgeEmoji||"⚽",league:last?.league||"",year:"",copySquad:!!last?.players?.length});
setSeasonModal(true);
}}>{I.plus} Nova Temporada</button>
{activeSave.seasons.length>0&&<p style={{fontSize:12,color:"var(--text3)",marginTop:8}}>Dica: Ao trocar de time, desmarque "Copiar elenco". Ao continuar com o mesmo time, o elenco é copiado com idades +1.</p>}
</div>}

{/* Theme */}
<div className="card">
<div className="ct">🎨 Aparência</div>
<div style={{fontSize:12,color:"var(--text3)",marginBottom:8}}>Tema</div>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:10,marginBottom:16}}>
{Object.entries(THEMES).map(([name,vars])=>(
<div key={name} onClick={()=>setData(d=>({...d,userPrefs:{...(d.userPrefs||{}),theme:name}}))} style={{borderRadius:10,padding:12,cursor:"pointer",border:`2px solid ${myTheme===name?"var(--accent)":"transparent"}`,background:vars["--bg2"],textAlign:"center",fontSize:12,fontWeight:600,color:vars["--text"],transition:"all .2s"}}>{name.charAt(0).toUpperCase()+name.slice(1)}</div>))}
</div>
<div style={{fontSize:12,color:"var(--text3)",marginBottom:8}}>Cor de destaque</div>
<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
{ACCENT_COLORS.map(col=>(
<div key={col} onClick={()=>setData(d=>({...d,userPrefs:{...(d.userPrefs||{}),accentColor:col}}))} style={{width:32,height:32,borderRadius:"50%",background:col,cursor:"pointer",border:myAccent===col?"3px solid var(--text)":"3px solid transparent",transition:"all .25s"}}/>))}
</div>
</div>

{/* Custom lists */}
<div className="card">
<div className="ct">📋 Competições Personalizadas</div>
<div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
{data.config.competitions.map(c=>(
<div key={c} style={{display:"flex",alignItems:"center",gap:6,background:"var(--bg3)",border:"1px solid var(--border)",padding:"6px 12px",borderRadius:20,fontSize:13}}>
{c}
<button style={{background:"none",border:"none",color:"var(--text3)",cursor:"pointer",padding:0,display:"flex"}} onClick={()=>setData(d=>({...d,config:{...d.config,competitions:d.config.competitions.filter(x=>x!==c)}}))}>{I.x}</button>
</div>))}
</div>
<div style={{display:"flex",gap:8}}>
<input id="newComp" placeholder="Nova competição..." style={{flex:1}} onKeyDown={e=>{if(e.key==="Enter"){const v=e.target.value.trim();if(v&&!data.config.competitions.includes(v)){setData(d=>({...d,config:{...d.config,competitions:[...d.config.competitions,v]}}));e.target.value="";toast("Competição adicionada");}}}}/>
<button className="btn bp bs" onClick={()=>{const el=document.getElementById("newComp");const v=el?.value?.trim();if(v&&!data.config.competitions.includes(v)){setData(d=>({...d,config:{...d.config,competitions:[...d.config.competitions,v]}}));el.value="";toast("Adicionada");}}}>{I.plus}</button>
</div>
</div>

{/* Save modal */}
{saveModal&&<Modal title="Novo Save" onClose={()=>setSaveModal(false)}>
<div className="fr"><div className="fg"><label className="fl">Nome do Save</label><input value={saveForm.name} onChange={e=>setSaveForm({...saveForm,name:e.target.value})} autoFocus placeholder="Ex: Carreira com o Arsenal"/></div></div>
<div className="fr">
<div className="fg"><label className="fl">Jogo</label><select value={saveForm.gameVersion} onChange={e=>setSaveForm({...saveForm,gameVersion:e.target.value})}>{GAME_VERSIONS.map(g=><option key={g}>{g}</option>)}</select></div>
<div className="fg"><label className="fl">Dificuldade</label><select value={saveForm.difficulty} onChange={e=>setSaveForm({...saveForm,difficulty:e.target.value})}>{DIFFICULTIES.map(d=><option key={d}>{d}</option>)}</select></div>
</div>
<div className="fr">
<div className="fg"><label className="fl">Nome do Treinador</label><input value={saveForm.managerName||""} onChange={e=>setSaveForm({...saveForm,managerName:e.target.value})} placeholder="Seu nome"/></div>
<div className="fg"><label className="fl">Nacionalidade</label><input value={saveForm.managerNationality||""} onChange={e=>setSaveForm({...saveForm,managerNationality:e.target.value})} placeholder="Ex: Brasil"/></div>
</div>
<div className="ma"><button className="btn bg" onClick={()=>setSaveModal(false)}>Cancelar</button><button className="btn bp" onClick={createSave}>Criar Save</button></div>
</Modal>}

{/* Season modal */}
{seasonModal&&<Modal title="Nova Temporada" onClose={()=>setSeasonModal(false)}>
<div className="fr"><div className="fg" style={{flex:2}}><label className="fl">Time</label><input value={seasonForm.teamName} onChange={e=>setSeasonForm({...seasonForm,teamName:e.target.value})} autoFocus placeholder="Ex: Manchester City"/></div>
<div className="fg" style={{maxWidth:80}}><label className="fl">Escudo</label>
<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
{BADGE_EMOJIS.slice(0,8).map(e=><div key={e} className={`form-badge ${seasonForm.teamBadgeEmoji===e?"sel":""}`} style={{width:32,height:32,fontSize:16,borderRadius:8}} onClick={()=>setSeasonForm({...seasonForm,teamBadgeEmoji:e})}>{e}</div>)}
</div>
</div></div>
<div className="fr">
<div className="fg"><label className="fl">Liga</label><input value={seasonForm.league||""} onChange={e=>setSeasonForm({...seasonForm,league:e.target.value})} placeholder="Ex: Premier League"/></div>
<div className="fg"><label className="fl">Ano</label><input value={seasonForm.year||""} onChange={e=>setSeasonForm({...seasonForm,year:e.target.value})} placeholder="Ex: 2025/26"/></div>
</div>
<div style={{fontSize:12,color:"var(--text3)",marginBottom:8}}>Mais emojis de escudo:</div>
<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>{BADGE_EMOJIS.map(e=><div key={e} className={`form-badge ${seasonForm.teamBadgeEmoji===e?"sel":""}`} style={{width:36,height:36,fontSize:18}} onClick={()=>setSeasonForm({...seasonForm,teamBadgeEmoji:e})}>{e}</div>)}</div>

{/* Copy Squad Toggle */}
{lastSeason&&lastSeason.players.length>0&&<div style={{borderTop:"1px solid var(--border)",paddingTop:12,marginBottom:12}}>
<div onClick={()=>setSeasonForm({...seasonForm,copySquad:!seasonForm.copySquad})} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"8px 0"}}>
<div style={{width:40,height:22,borderRadius:11,background:seasonForm.copySquad?"var(--accent)":"var(--bg4)",transition:"all .2s",position:"relative",flexShrink:0}}>
<div style={{width:18,height:18,borderRadius:9,background:"#fff",position:"absolute",top:2,left:seasonForm.copySquad?20:2,transition:"all .2s",boxShadow:"0 1px 4px rgba(0,0,0,.3)"}}/>
</div>
<div style={{flex:1}}>
<div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>Copiar elenco da temporada anterior</div>
<div style={{fontSize:11,color:"var(--text3)"}}>{lastSeason.players.length} jogadores · idades +1 · stats zerados</div>
</div>
</div>
</div>}

<div className="ma"><button className="btn bg" onClick={()=>setSeasonModal(false)}>Cancelar</button><button className="btn bp" onClick={createSeason}>Criar Temporada</button></div>
</Modal>}
</div>);
}

// ─── PWA Install Hook ───
function useInstallPrompt(){
const[prompt,setPrompt]=useState(null);const[installed,setInstalled]=useState(false);const[isIOS,setIsIOS]=useState(false);
useEffect(()=>{
if(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches){setInstalled(true);return;}
if(window.navigator.standalone){setInstalled(true);return;}
setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
const h=(e)=>{e.preventDefault();setPrompt(e);};
window.addEventListener("beforeinstallprompt",h);
window.addEventListener("appinstalled",()=>setInstalled(true));
return()=>window.removeEventListener("beforeinstallprompt",h);
},[]);
const doInstall=async()=>{if(prompt){prompt.prompt();const r=await prompt.userChoice;if(r.outcome==="accepted"){setInstalled(true);setPrompt(null);}}};
return{prompt,installed,isIOS,doInstall};
}

// ─── PWA Install Banner ───
function InstallBanner({installHook}){
const{prompt,installed,isIOS,doInstall}=installHook;
const[show,setShow]=useState(false);const[dismissed,setDismissed]=useState(()=>{try{return localStorage.getItem("kronex-install-dismissed")==="1";}catch{return false;}});
useEffect(()=>{if(installed||dismissed)return;if(prompt){setShow(true);return;}if(isIOS){setTimeout(()=>setShow(true),3000);}},[prompt,installed,dismissed,isIOS]);
const dismiss=()=>{setShow(false);setDismissed(true);try{localStorage.setItem("kronex-install-dismissed","1");}catch{}};
if(!show||installed)return null;
return(<div className="m-only" style={{position:"fixed",bottom:0,left:0,right:0,zIndex:250,padding:12,display:"flex"}}>
<div style={{background:"linear-gradient(135deg,#0E1420,#0A1018)",border:"1px solid #1A2A3A",borderRadius:14,padding:16,width:"100%",maxWidth:480,margin:"0 auto",boxShadow:"0 -4px 32px rgba(0,0,0,.5)",display:"flex",alignItems:"center",gap:14}}>
<svg width="40" height="40" viewBox="0 0 64 64" fill="none" style={{flexShrink:0}}><circle cx="32" cy="32" r="22" stroke="#22D3EE" strokeWidth="2" opacity="0.3"/><path d="M38 8L26 30H32L24 56L44 28H36L38 8Z" fill="#22D3EE" opacity="0.9"/><path d="M27 27L29 23L31 27L29 31Z" fill="#22D3EE"/></svg>
<div style={{flex:1}}><div style={{fontSize:14,fontWeight:700,color:"#E0F0F8",marginBottom:3}}>Instalar Kronex</div><div style={{fontSize:11,color:"#4A6A80",lineHeight:1.4}}>{isIOS?"Toque em compartilhar ↑ e \"Adicionar à Tela de Início\"":"Instale como app no seu celular!"}</div></div>
<div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
{!isIOS&&prompt&&<button onClick={()=>{doInstall();setShow(false);}} style={{padding:"8px 16px",borderRadius:8,fontSize:12,fontWeight:700,border:"none",cursor:"pointer",background:"linear-gradient(135deg,#22D3EE,#0891B2)",color:"#000",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap"}}>Instalar</button>}
<button onClick={dismiss} style={{padding:"6px 12px",borderRadius:6,fontSize:11,fontWeight:500,border:"1px solid #1A2A3A",cursor:"pointer",background:"transparent",color:"#4A6A80",fontFamily:"'DM Sans',sans-serif"}}>Agora não</button>
</div></div></div>);
}

// ─── Welcome Tour ───
function WelcomeTour({onFinish}){
const[step,setStep]=useState(0);
const steps=[
{icon:"🏟️",title:"Bem-vindo ao Kronex!",desc:"Seu tracker definitivo de modo carreira EA FC. Registre partidas, gerencie elencos e acompanhe sua evolução."},
{icon:"🎮",title:"Crie um Save",desc:"Vá em Configurações e crie seu primeiro save. Cada save pode ter múltiplas temporadas e times diferentes."},
{icon:"⚽",title:"Registre Partidas",desc:"Na aba Partidas, registre cada jogo com placar, adversário, competição e Man of the Match. Rápido e fácil!"},
{icon:"👕",title:"Monte seu Elenco",desc:"Adicione jogadores com overall, potencial, estatísticas. Compare jogadores lado a lado."},
{icon:"📊",title:"Acompanhe Tudo",desc:"Estatísticas, transferências, títulos, base de jovens, recordes e timeline da carreira. Tudo num lugar só!"},
];
const s=steps[step];
return(<div className="mo" onClick={onFinish}><div className="md" onClick={e=>e.stopPropagation()} style={{maxWidth:400,textAlign:"center",padding:32}}>
<div style={{fontSize:52,marginBottom:16}}>{s.icon}</div>
<div style={{fontSize:20,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginBottom:8,color:"var(--text)"}}>{s.title}</div>
<div style={{fontSize:14,color:"var(--text2)",lineHeight:1.7,marginBottom:24}}>{s.desc}</div>
<div style={{display:"flex",gap:6,justifyContent:"center",marginBottom:20}}>{steps.map((_,i)=><div key={i} style={{width:8,height:8,borderRadius:4,background:i===step?"var(--accent)":"var(--bg4)",transition:"all .2s"}}/>)}</div>
<div style={{display:"flex",gap:10}}>
{step>0&&<button className="btn bg" onClick={()=>setStep(step-1)} style={{flex:1}}>Anterior</button>}
{step<steps.length-1?<button className="btn bp" onClick={()=>setStep(step+1)} style={{flex:1}}>Próximo</button>:
<button className="btn bp" onClick={onFinish} style={{flex:1}}>Começar! 🚀</button>}
</div>
</div></div>);
}

// ─── Help Page ───
function HelpPage({goTo}){
return(<div>
<div className="ph"><div className="pt">❓ Ajuda</div><div className="ps">Como usar o Kronex</div></div>

<div className="card" style={{background:"var(--accent-glow)",borderColor:"var(--accent)"}}>
<div className="ct" style={{color:"var(--accent)",fontSize:18}}>🚀 Primeiros Passos</div>
<div style={{fontSize:14,color:"var(--text2)",lineHeight:2}}>
<strong style={{color:"var(--text)"}}>1.</strong> Vá em <span style={{color:"var(--accent)",cursor:"pointer",textDecoration:"underline"}} onClick={()=>goTo("settings")}>Configurações</span> e crie um <strong>Save</strong> (ex: "Carreira Arsenal")<br/>
<strong style={{color:"var(--text)"}}>2.</strong> Crie uma <strong>Temporada</strong> dentro do save (escolha time, liga, ano)<br/>
<strong style={{color:"var(--text)"}}>3.</strong> Vá em <span style={{color:"var(--accent)",cursor:"pointer",textDecoration:"underline"}} onClick={()=>goTo("squad")}>Elenco</span> e adicione seus jogadores<br/>
<strong style={{color:"var(--text)"}}>4.</strong> Registre cada jogo em <span style={{color:"var(--accent)",cursor:"pointer",textDecoration:"underline"}} onClick={()=>goTo("matches")}>Partidas</span> — placar, MOTM, goleadores<br/>
<strong style={{color:"var(--text)"}}>5.</strong> Acompanhe tudo no <span style={{color:"var(--accent)",cursor:"pointer",textDecoration:"underline"}} onClick={()=>goTo("dashboard")}>Painel</span><br/>
<strong style={{color:"var(--text)"}}>6.</strong> Ao final da temporada, registre <span style={{color:"var(--accent)",cursor:"pointer",textDecoration:"underline"}} onClick={()=>goTo("trophies")}>Títulos</span> e crie nova temporada
</div>
</div>

<div className="card">
<div className="ct">❓ Perguntas Frequentes</div>
<div style={{display:"flex",flexDirection:"column",gap:16}}>
{[
{q:"Como troco de time na mesma carreira?",a:"Crie uma nova temporada em Configurações com o novo time. O histórico anterior é preservado — você vê tudo nos Recordes e Timeline."},
{q:"Posso ter mais de uma carreira?",a:"Sim! Crie múltiplos saves em Configurações. Cada um é independente com suas próprias temporadas."},
{q:"Como funciona o comparador de jogadores?",a:"No Elenco, clique no ícone de gráfico ao lado de 2 jogadores. O botão 'Comparar' aparece na toolbar."},
{q:"O que é a Base / Academia?",a:"Lá você registra jovens da youth academy com ranges de overall e potencial. Quando estiverem prontos, promova ao elenco principal com um clique."},
{q:"Meus dados estão seguros?",a:"Sim! Seus dados são salvos na nuvem (Firebase) vinculados à sua conta. Também ficam em cache local para acesso rápido."},
{q:"Como instalo no celular?",a:"No Android: o app oferece instalar automaticamente, ou vá nos 3 pontinhos do navegador → 'Instalar app'. No iPhone: Safari → botão compartilhar → 'Adicionar à Tela de Início'."},
{q:"Posso mudar o visual do app?",a:"Sim! Configurações → Aparência. Tem 6 temas e 12 cores de destaque."},
].map((faq,i)=>(<div key={i}><div style={{fontSize:14,fontWeight:600,color:"var(--text)",marginBottom:4}}>{faq.q}</div><div style={{fontSize:13,color:"var(--text2)",lineHeight:1.6}}>{faq.a}</div></div>))}
</div>
</div>

<div className="card">
<div className="ct">📖 Seções do App</div>
<div style={{display:"flex",flexDirection:"column",gap:12}}>
{[
{icon:"📊",name:"Painel",desc:"Dashboard com stats gerais, forma recente, destaques do elenco e sequências",id:"dashboard"},
{icon:"⚽",name:"Partidas",desc:"Registre jogos com placar, competição, local (casa/fora), Man of the Match e goleadores",id:"matches"},
{icon:"👕",name:"Elenco",desc:"Gerencie jogadores com overall, potencial, estatísticas, posição. Compare jogadores lado a lado",id:"squad"},
{icon:"🔄",name:"Transferências",desc:"Registre compras, vendas, empréstimos com valores. Veja o saldo da janela",id:"transfers"},
{icon:"🏆",name:"Títulos",desc:"Registre troféus conquistados. Vitrine visual com todos os títulos da carreira",id:"trophies"},
{icon:"📈",name:"Estatísticas",desc:"Aproveitamento por competição, artilheiros, garçons, jogadores mais decisivos",id:"stats"},
{icon:"🌱",name:"Base",desc:"Youth academy: monitore jovens, ranges de OVR/POT, promova ao elenco principal",id:"youth"},
{icon:"⭐",name:"Recordes",desc:"Hall da fama, maior artilheiro, mais assistências, maior goleada, timeline completa",id:"records"},
].map(s=>(<div key={s.id} style={{display:"flex",gap:12,alignItems:"center",padding:"8px 0",borderBottom:"1px solid var(--border)",cursor:"pointer"}} onClick={()=>goTo(s.id)}>
<span style={{fontSize:24}}>{s.icon}</span>
<div style={{flex:1}}><div style={{fontSize:14,fontWeight:600,color:"var(--text)"}}>{s.name}</div><div style={{fontSize:12,color:"var(--text3)"}}>{s.desc}</div></div>
<span style={{fontSize:12,color:"var(--accent)"}}>→</span>
</div>))}
</div>
</div>
</div>);
}

// ─── MAIN APP ───
export default function App({ user, logout, saveData, loadData, saveUserPrefs: saveUP, loadUserPrefs: loadUP }){
const uid=user?.uid||"anon";
const installHook=useInstallPrompt();
const[showTour,setShowTour]=useState(()=>{try{return!localStorage.getItem(`kronex-tour-${uid}`);}catch{return true;}});
const[data,setDataRaw]=useState(()=>{const l=load(uid);const base=l?{...DEFAULT_DATA,...l,config:{...DEFAULT_CONFIG,...(l.config||{})}}:DEFAULT_DATA;return migrateData(base);});
const[page,setPageRaw]=useState(()=>{try{return localStorage.getItem(`kronex-page-${uid}`)||"dashboard";}catch{return"dashboard";}});
const setPage=(p)=>{setPageRaw(p);try{localStorage.setItem(`kronex-page-${uid}`,p);}catch{}};
const[so,setSo]=useState(false);
const[tm,setTm]=useState("");

// Load from Firebase on mount
useEffect(()=>{
if(user&&loadData){loadData().then(cd=>{if(cd){const migrated=migrateData({...DEFAULT_DATA,...cd,config:{...DEFAULT_CONFIG,...(cd.config||{})}});setDataRaw(migrated);save(migrated,uid);}});}
},[user]);

const undoRef=useRef(null);const toastTimer=useRef(null);

const setData=useCallback((u)=>{setDataRaw(p=>{undoRef.current=p;const n=typeof u==="function"?u(p):u;save(n,uid);if(user&&saveData)saveData(n);return n;});},[uid,user,saveData]);

const toast=useCallback((m)=>{setTm(m);if(toastTimer.current)clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>{setTm("");undoRef.current=null;},4000);},[]);
const doUndo=useCallback(()=>{if(undoRef.current){setDataRaw(undoRef.current);save(undoRef.current,uid);if(user&&saveData)saveData(undoRef.current);undoRef.current=null;setTm("Ação desfeita!");setTimeout(()=>setTm(""),2000);}},[uid,user,saveData]);

// Resolve active save & season
const activeSave=data.saves.find(s=>s.id===data.activeSaveId)||null;
const activeSeason=activeSave?.seasons.find(s=>s.id===activeSave.activeSeasonId)||null;
const allSeasons=activeSave?.seasons||[];

// Update season helper
const setSeason=useCallback((updater)=>{
setData(d=>({...d,saves:d.saves.map(s=>{
if(s.id!==d.activeSaveId)return s;
return{...s,seasons:s.seasons.map(sn=>{
if(sn.id!==s.activeSeasonId)return sn;
return typeof updater==="function"?updater(sn):updater;
})};
})}));
},[setData]);

// Theme
const userPrefs=data.userPrefs||{};
const myTheme=userPrefs.theme||data.config.theme||"midnight";
const myAccent=userPrefs.accentColor||data.config.accentColor||"#22D3EE";
const tv=THEMES[myTheme]||THEMES.midnight;

const go=(id)=>{setPage(id);setSo(false);};
const finishTour=()=>{setShowTour(false);try{localStorage.setItem(`kronex-tour-${uid}`,"1");}catch{}};

const userName=user?.displayName||user?.email?.split("@")[0]||"Treinador";

const nav=[
{id:"dashboard",label:"Painel",icon:I.home},
{id:"matches",label:"Partidas",icon:I.match,badge:activeSeason?.matches.length||null},
{id:"squad",label:"Elenco",icon:I.squad,badge:activeSeason?.players.length||null},
{id:"transfers",label:"Transferências",icon:I.transfer},
{id:"trophies",label:"Títulos",icon:I.trophy},
{id:"stats",label:"Estatísticas",icon:I.stats},
{id:"youth",label:"Base",icon:I.youth},
{id:"records",label:"Recordes",icon:I.records},
{id:"help",label:"Ajuda",icon:I.star},
{id:"settings",label:"Configurações",icon:I.settings},
];

return(<><style>{getCSS(tv,myAccent)}</style><div className="app">
{/* Mobile header */}
<div className="mh">
<button className="hb" onClick={()=>setSo(!so)}>{I.menu}</button>
<span style={{marginLeft:12,fontFamily:"'Outfit',sans-serif",fontWeight:900,fontSize:18,background:`linear-gradient(135deg,#22D3EE,#0EA5E9)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",flex:1,textTransform:"uppercase",letterSpacing:1}}>Kronex</span>
{activeSeason&&<span style={{fontSize:14,fontWeight:600,color:"var(--text2)",marginRight:4}}>{activeSeason.teamBadgeEmoji}</span>}
</div>

{/* Sidebar */}
<nav className={`sb ${so?"open":""}`}>
<div className="sb-h">
<div className="logo" style={{background:"linear-gradient(135deg,#22D3EE,#0EA5E9)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Kronex</div>
<div className="logo-s">career mode tracker</div>
</div>

{/* Season quick switch */}
{activeSave&&activeSave.seasons.length>0&&<div style={{padding:"12px 12px 8px"}}>
<div className="filter-scroll" style={{gap:6}}>
{activeSave.seasons.map(sn=>(
<button key={sn.id} className={`season-chip ${sn.id===activeSave.activeSeasonId?"a":""}`} onClick={()=>{setData(d=>({...d,saves:d.saves.map(s=>s.id===d.activeSaveId?{...s,activeSeasonId:sn.id}:s)}));}}>
{sn.teamBadgeEmoji} T{sn.number}
</button>))}
</div>
</div>}

<div className="nav">{nav.map(n=><button key={n.id} className={`ni ${page===n.id?"a":""}`} onClick={()=>go(n.id)}>{n.icon}{n.label}{n.badge>0&&<span className="nb">{n.badge}</span>}</button>)}</div>
<div className="sb-f">
<div style={{display:"flex",alignItems:"center",gap:10}}>
<div style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg,#22D3EE,#0891B2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:"#000",flexShrink:0,fontFamily:"'Outfit',sans-serif"}}>{userName[0]?.toUpperCase()}</div>
<div style={{flex:1,minWidth:0}}>
<div style={{fontSize:12,fontWeight:600,color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{userName}</div>
<div style={{fontSize:10,color:"var(--text3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{activeSave?`${activeSave.name} · ${activeSave.gameVersion}`:"Sem save ativo"}</div>
</div>
{logout&&<button className="bi" onClick={logout} title="Sair" style={{padding:4}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></button>}
</div>
</div>
</nav>

{so&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:99}} onClick={()=>setSo(false)}/>}

<main className="mc">
{page==="dashboard"&&<Dashboard save={activeSave} season={activeSeason} goTo={go} allSeasons={allSeasons} setSeason={setSeason} toast={toast}/>}
{page==="matches"&&<MatchesPage season={activeSeason} setSeason={setSeason} toast={toast} config={data.config}/>}
{page==="squad"&&<SquadPage season={activeSeason} setSeason={setSeason} toast={toast} config={data.config}/>}
{page==="transfers"&&<TransfersPage season={activeSeason} setSeason={setSeason} toast={toast} config={data.config}/>}
{page==="trophies"&&<TrophiesPage season={activeSeason} setSeason={setSeason} toast={toast} config={data.config} allSeasons={allSeasons}/>}
{page==="stats"&&<StatsPage season={activeSeason} allSeasons={allSeasons}/>}
{page==="youth"&&<YouthPage season={activeSeason} setSeason={setSeason} toast={toast}/>}
{page==="records"&&<RecordsPage allSeasons={allSeasons} save={activeSave}/>}
{page==="help"&&<HelpPage goTo={go}/>}
{page==="settings"&&<SettingsPage data={data} setData={setData} toast={toast} goTo={go}/>}
</main>
</div>
{page==="matches"&&activeSeason&&<FAB onAdd={()=>{}}/>}
{showTour&&<WelcomeTour onFinish={finishTour}/>}
<InstallBanner installHook={installHook}/>
<Toast message={tm} onUndo={undoRef.current?doUndo:null}/>
</>);
}
