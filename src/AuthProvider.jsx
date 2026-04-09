import { useState, useEffect } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, googleProvider, db } from "./firebase";

// Kronex symbol — compass inspired by logo
export const KronexSymbol = ({ size = 80 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="28" stroke="#22D3EE" strokeWidth="2" opacity="0.3"/>
    <circle cx="32" cy="32" r="20" stroke="#22D3EE" strokeWidth="1.5" opacity="0.5"/>
    <circle cx="32" cy="32" r="4" fill="#22D3EE"/>
    <path d="M32 8L35 28H29L32 8Z" fill="#22D3EE"/>
    <path d="M32 56L29 36H35L32 56Z" fill="#0E7490" opacity="0.6"/>
    <path d="M8 32L28 29V35L8 32Z" fill="#0E7490" opacity="0.6"/>
    <path d="M56 32L36 35V29L56 32Z" fill="#22D3EE"/>
    <path d="M14 14L28 28L24 28L14 14Z" fill="#22D3EE" opacity="0.4"/>
    <path d="M50 50L36 36L40 36L50 50Z" fill="#22D3EE" opacity="0.4"/>
  </svg>
);

// ─── Firestore helpers ───
export async function saveUserData(uid, data) {
  try {
    await setDoc(doc(db, "kronex_users", uid, "data", "main"), {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) { console.error("Erro ao salvar:", e); }
}

export async function loadUserData(uid) {
  try {
    const s = await getDoc(doc(db, "kronex_users", uid, "data", "main"));
    return s.exists() ? s.data() : null;
  } catch (e) { console.error("Erro ao carregar:", e); return null; }
}

export async function saveUserPrefs(uid, prefs) {
  try { await setDoc(doc(db, "kronex_users", uid), { prefs }, { merge: true }); } catch (e) { console.error(e); }
}

export async function loadUserPrefs(uid) {
  try { const s = await getDoc(doc(db, "kronex_users", uid)); return s.exists() ? (s.data().prefs || null) : null; } catch { return null; }
}

// ─── Styles ───
const S = {
  page: { minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#080C12",fontFamily:"'Outfit',sans-serif",padding:16 },
  card: { background:"#0E1420",border:"1px solid #1A2A3A",borderRadius:16,padding:40,width:"100%",maxWidth:440,textAlign:"center" },
  logo: { fontFamily:"'Outfit',sans-serif",fontSize:36,fontWeight:900,background:"linear-gradient(135deg,#22D3EE,#0EA5E9)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",marginBottom:4,letterSpacing:-1,textTransform:"uppercase" },
  sub: { fontSize:11,color:"#4A6A80",textTransform:"uppercase",letterSpacing:4,marginBottom:32 },
  input: { width:"100%",padding:"12px 16px",background:"#0A1018",border:"1px solid #1A2A3A",borderRadius:8,color:"#E0F0F8",fontSize:14,fontFamily:"'Outfit',sans-serif",outline:"none",marginBottom:12,boxSizing:"border-box",transition:"border-color .2s" },
  btn: { width:"100%",padding:"12px 18px",borderRadius:8,fontSize:14,fontWeight:600,fontFamily:"'Outfit',sans-serif",cursor:"pointer",border:"none",marginBottom:10,transition:"all 0.2s" },
  bp: { background:"linear-gradient(135deg,#22D3EE,#0891B2)",color:"#000",fontWeight:700,boxShadow:"0 2px 16px rgba(34,211,238,0.3)" },
  bg: { background:"#0A1018",color:"#E0F0F8",border:"1px solid #1A2A3A" },
  div: { display:"flex",alignItems:"center",gap:12,margin:"16px 0",color:"#4A6A80",fontSize:12 },
  line: { flex:1,height:1,background:"#1A2A3A" },
  toggle: { color:"#22D3EE",cursor:"pointer",background:"none",border:"none",fontFamily:"'Outfit',sans-serif",fontSize:13,marginTop:8,display:"block",width:"100%",textAlign:"center" },
  err: { color:"#F87171",fontSize:13,marginBottom:12,padding:"8px 12px",background:"rgba(248,113,113,0.1)",borderRadius:8 },
};

const errMsg = {
  "auth/email-already-in-use":"Este email já está em uso",
  "auth/invalid-email":"Email inválido",
  "auth/weak-password":"Senha fraca (mínimo 6 caracteres)",
  "auth/user-not-found":"Usuário não encontrado",
  "auth/wrong-password":"Senha incorreta",
  "auth/invalid-credential":"Email ou senha incorretos",
  "auth/too-many-requests":"Muitas tentativas. Aguarde",
  "auth/popup-closed-by-user":"Login cancelado",
};

// ═══════════════════════════════════════
// AUTH PROVIDER
// ═══════════════════════════════════════
export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        setStep("ready");
      } else {
        setStep("login");
      }
      setLoading(false);
    });
    getRedirectResult(auth).catch(() => {});
    return unsub;
  }, []);

  const doLogin = async () => {
    if (!email || !password) { setError("Preencha email e senha"); return; }
    setBusy(true); setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) { setError(errMsg[e.code] || e.message); }
    setBusy(false);
  };

  const doRegister = async () => {
    if (!email || !password) { setError("Preencha todos os campos"); return; }
    setBusy(true); setError("");
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (name) await updateProfile(cred.user, { displayName: name });
    } catch (e) { setError(errMsg[e.code] || e.message); }
    setBusy(false);
  };

  const doGoogle = async () => {
    setBusy(true); setError("");
    try {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) { await signInWithRedirect(auth, googleProvider); }
      else { await signInWithPopup(auth, googleProvider); }
    } catch (e) {
      if (e.code !== "auth/popup-closed-by-user") setError(errMsg[e.code] || e.message);
    }
    setBusy(false);
  };

  const doLogout = async () => { await signOut(auth); };

  const onKey = (e) => {
    if (e.key !== "Enter") return;
    if (step === "login") doLogin();
    else if (step === "register") doRegister();
  };

  if (loading) return <div style={S.page}><div style={{color:"#4A6A80",fontSize:16}}>Carregando...</div></div>;

  if (step === "ready" && user) {
    return children({
      user,
      logout: doLogout,
      saveData: (data) => saveUserData(user.uid, data),
      loadData: () => loadUserData(user.uid),
      saveUserPrefs: (prefs) => saveUserPrefs(user.uid, prefs),
      loadUserPrefs: () => loadUserPrefs(user.uid),
    });
  }

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=DM+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
      <div style={S.page}><div style={S.card}>

        <div style={{marginBottom:20}}><KronexSymbol size={70}/></div>
        <div style={S.logo}>Kronex</div>
        <div style={S.sub}>career mode tracker</div>

        {error && <div style={S.err}>{error}</div>}

        {step === "login" && <>
          <input style={S.input} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={onKey} autoFocus/>
          <input style={S.input} type="password" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={onKey}/>
          <button style={{...S.btn,...S.bp,opacity:busy?0.6:1}} onClick={doLogin} disabled={busy}>{busy?"Aguarde...":"Entrar"}</button>
          <button style={S.toggle} onClick={()=>{setStep("register");setError("");}}>Não tem conta? Criar agora</button>
          <div style={S.div}><div style={S.line}/><span>ou</span><div style={S.line}/></div>
          <button style={{...S.btn,...S.bg}} onClick={doGoogle} disabled={busy}>
            <span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Entrar com Google
            </span>
          </button>
        </>}

        {step === "register" && <>
          <input style={S.input} type="text" placeholder="Seu nome" value={name} onChange={e => setName(e.target.value)} onKeyDown={onKey} autoFocus/>
          <input style={S.input} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={onKey}/>
          <input style={S.input} type="password" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={onKey}/>
          <button style={{...S.btn,...S.bp,opacity:busy?0.6:1}} onClick={doRegister} disabled={busy}>{busy?"Aguarde...":"Criar Conta"}</button>
          <button style={S.toggle} onClick={()=>{setStep("login");setError("");}}>Já tem conta? Fazer login</button>
          <div style={S.div}><div style={S.line}/><span>ou</span><div style={S.line}/></div>
          <button style={{...S.btn,...S.bg}} onClick={doGoogle} disabled={busy}>
            <span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Entrar com Google
            </span>
          </button>
        </>}

      </div></div>
    </>
  );
}
