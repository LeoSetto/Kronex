import { useState, useEffect } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, googleProvider, db } from "./firebase";

// Kronex logo — football + lightning bolt + star
export const KronexLogo = ({ size = 80, color = "#fff" }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Ball circle */}
    <circle cx="32" cy="32" r="27" stroke={color} strokeWidth="2.5" opacity="0.35"/>
    {/* Ball pentagon lines */}
    <path d="M32 7C32 7 22 18 20 24C18 30 22 38 26 42C30 46 38 48 42 44C46 40 48 30 46 24C44 18 32 7 32 7Z" stroke={color} strokeWidth="1" opacity="0.15" fill="none"/>
    <path d="M18 20C24 22 28 26 30 32" stroke={color} strokeWidth="1" opacity="0.12"/>
    <path d="M46 20C40 22 36 26 34 32" stroke={color} strokeWidth="1" opacity="0.12"/>
    <path d="M22 46C26 40 30 36 32 34" stroke={color} strokeWidth="1" opacity="0.12"/>
    <path d="M42 46C38 40 34 36 32 34" stroke={color} strokeWidth="1" opacity="0.12"/>
    {/* Lightning bolt */}
    <path d="M38 4L24 30H32L22 60L46 26H36L38 4Z" fill={color} opacity="0.9"/>
    {/* Star 4-point */}
    <path d="M26 28L28 24L30 28L28 32Z" fill={color}/>
  </svg>
);

// Firestore helpers
export async function saveUserData(uid, data) {
  try { await setDoc(doc(db, "kronex_users", uid, "data", "main"), { ...data, updatedAt: new Date().toISOString() }); } catch (e) { console.error("Erro ao salvar:", e); }
}
export async function loadUserData(uid) {
  try { const s = await getDoc(doc(db, "kronex_users", uid, "data", "main")); return s.exists() ? s.data() : null; } catch (e) { console.error("Erro ao carregar:", e); return null; }
}
export async function saveUserPrefs(uid, prefs) {
  try { await setDoc(doc(db, "kronex_users", uid), { prefs }, { merge: true }); } catch (e) { console.error(e); }
}
export async function loadUserPrefs(uid) {
  try { const s = await getDoc(doc(db, "kronex_users", uid)); return s.exists() ? (s.data().prefs || null) : null; } catch { return null; }
}

const errMsg = {
  "auth/email-already-in-use":"Este email já está em uso",
  "auth/invalid-email":"Email inválido",
  "auth/weak-password":"Senha fraca (mínimo 6 caracteres)",
  "auth/user-not-found":"Usuário não encontrado",
  "auth/wrong-password":"Senha incorreta",
  "auth/invalid-credential":"Email ou senha incorretos",
  "auth/too-many-requests":"Muitas tentativas. Aguarde",
  "auth/popup-closed-by-user":"Login cancelado",
  "auth/popup-blocked":"Popup bloqueado. Permita popups para este site",
  "auth/network-request-failed":"Sem conexão. Verifique sua internet",
  "auth/cancelled-popup-request":"Operação cancelada",
  "auth/unauthorized-domain":"Domínio não autorizado. Adicione " + (typeof window!=="undefined"?window.location.hostname:"") + " no Firebase Console → Authentication → Settings → Authorized domains",
};

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
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setStep(u ? "ready" : "login"); setLoading(false); });
    return unsub;
  }, []);

  const doLogin = () => {
    if (!email || !password) { setError("Preencha email e senha"); return; }
    setBusy(true); setError("");
    signInWithEmailAndPassword(auth, email, password).catch(e => setError(errMsg[e.code] || e.message)).finally(() => setBusy(false));
  };
  const doRegister = () => {
    if (!email || !password) { setError("Preencha todos os campos"); return; }
    setBusy(true); setError("");
    createUserWithEmailAndPassword(auth, email, password).then(cred => { if (name) return updateProfile(cred.user, { displayName: name }); }).catch(e => setError(errMsg[e.code] || e.message)).finally(() => setBusy(false));
  };
  const doGoogle = async () => {
    setBusy(true); setError("");
    try { await signInWithPopup(auth, googleProvider); } catch (e) { const c=e.code||""; if(c!=="auth/popup-closed-by-user"&&c!=="auth/cancelled-popup-request") setError(errMsg[c]||e.message); }
    setBusy(false);
  };
  const doLogout = () => signOut(auth);

  if (loading) return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#080C12"}}><KronexLogo size={60} color="#22D3EE"/></div>;

  if (step === "ready" && user) {
    return children({ user, logout: doLogout, saveData: (d) => saveUserData(user.uid, d), loadData: () => loadUserData(user.uid), saveUserPrefs: (p) => saveUserPrefs(user.uid, p), loadUserPrefs: () => loadUserPrefs(user.uid) });
  }

  const Inp = (props) => <input {...props} style={{width:"100%",padding:"14px 16px",background:"#0A1018",border:"1px solid #1A2A3A",borderRadius:10,color:"#E0F0F8",fontSize:16,fontFamily:"'DM Sans',sans-serif",outline:"none",marginBottom:12,boxSizing:"border-box",WebkitAppearance:"none"}}/>;
  const Btn = ({primary,children:c,...p}) => <button {...p} type="button" style={{width:"100%",padding:"14px 18px",borderRadius:10,fontSize:15,fontWeight:primary?700:500,fontFamily:"'DM Sans',sans-serif",cursor:"pointer",border:primary?"none":"1px solid #1A2A3A",marginBottom:10,transition:"all .2s",WebkitAppearance:"none",background:primary?"linear-gradient(135deg,#22D3EE,#0891B2)":"#0A1018",color:primary?"#000":"#E0F0F8",boxShadow:primary?"0 2px 16px rgba(34,211,238,.3)":"none",opacity:p.disabled?.6:1}}>{c}</button>;

  const GoogleSvg = () => <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>;

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
      <style>{`*{margin:0;padding:0;box-sizing:border-box}body{background:#080C12}input:focus{border-color:#22D3EE!important;box-shadow:0 0 0 3px rgba(34,211,238,.15)!important}button:active{transform:scale(.97)}`}</style>
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#080C12",fontFamily:"'Outfit',sans-serif",padding:16}}>
      <div style={{background:"#0E1420",border:"1px solid #1A2A3A",borderRadius:16,padding:"32px 24px",width:"100%",maxWidth:420,textAlign:"center"}}>

        <div style={{marginBottom:16}}><KronexLogo size={64} color="#22D3EE"/></div>
        <div style={{fontFamily:"'Outfit'",fontSize:32,fontWeight:900,background:"linear-gradient(135deg,#22D3EE,#0EA5E9)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:-1,textTransform:"uppercase"}}>Kronex</div>
        <div style={{fontSize:11,color:"#4A6A80",textTransform:"uppercase",letterSpacing:4,marginBottom:28}}>career mode tracker</div>

        {error && <div style={{color:"#F87171",fontSize:13,marginBottom:12,padding:"10px 14px",background:"rgba(248,113,113,.1)",borderRadius:10,textAlign:"left"}}>{error}</div>}

        {step === "login" && <>
          <Inp type="email" inputMode="email" autoComplete="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} enterKeyHint="next"/>
          <Inp type="password" autoComplete="current-password" placeholder="Senha" value={password} onChange={e=>setPassword(e.target.value)} enterKeyHint="go" onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();doLogin();}}}/>
          <Btn primary onClick={doLogin} disabled={busy}>{busy?"Aguarde...":"Entrar"}</Btn>
          <button type="button" onClick={()=>{setStep("register");setError("");}} style={{color:"#22D3EE",cursor:"pointer",background:"none",border:"none",fontFamily:"'DM Sans'",fontSize:13,marginTop:4,display:"block",width:"100%",textAlign:"center",padding:8}}>Não tem conta? Criar agora</button>
          <div style={{display:"flex",alignItems:"center",gap:12,margin:"16px 0",color:"#4A6A80",fontSize:12}}><div style={{flex:1,height:1,background:"#1A2A3A"}}/><span>ou</span><div style={{flex:1,height:1,background:"#1A2A3A"}}/></div>
          <Btn onClick={doGoogle} disabled={busy}><span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><GoogleSvg/> Entrar com Google</span></Btn>
        </>}

        {step === "register" && <>
          <Inp type="text" autoComplete="name" placeholder="Seu nome" value={name} onChange={e=>setName(e.target.value)} enterKeyHint="next"/>
          <Inp type="email" inputMode="email" autoComplete="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} enterKeyHint="next"/>
          <Inp type="password" autoComplete="new-password" placeholder="Senha (mínimo 6)" value={password} onChange={e=>setPassword(e.target.value)} enterKeyHint="go" onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();doRegister();}}}/>
          <Btn primary onClick={doRegister} disabled={busy}>{busy?"Aguarde...":"Criar Conta"}</Btn>
          <button type="button" onClick={()=>{setStep("login");setError("");}} style={{color:"#22D3EE",cursor:"pointer",background:"none",border:"none",fontFamily:"'DM Sans'",fontSize:13,marginTop:4,display:"block",width:"100%",textAlign:"center",padding:8}}>Já tem conta? Fazer login</button>
          <div style={{display:"flex",alignItems:"center",gap:12,margin:"16px 0",color:"#4A6A80",fontSize:12}}><div style={{flex:1,height:1,background:"#1A2A3A"}}/><span>ou</span><div style={{flex:1,height:1,background:"#1A2A3A"}}/></div>
          <Btn onClick={doGoogle} disabled={busy}><span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><GoogleSvg/> Entrar com Google</span></Btn>
        </>}

      </div></div>
    </>
  );
}
