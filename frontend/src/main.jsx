import React,{useEffect,useState}from "react";
import {createRoot} from "react-dom/client";
import "./style.css";
import logo from "./assets/turu-logo.png";

const API=(import.meta.env.VITE_API_URL||"").replace(/\/$/,"");
async function api(path,options={}){
 if(!API) throw new Error("VITE_API_URL fehlt. Bitte die Backend-Adresse in Render beim Frontend eintragen.");
 const r=await fetch(API+path,options); const text=await r.text(); let j={};
 try{j=text?JSON.parse(text):{}}catch{j={error:"Ungültige Serverantwort."}}
 if(!r.ok)throw new Error(j.error||`Serverfehler (${r.status})`); return j;
}
const teamsFallback=["1. Mannschaft","U19","U17","U16","U15","U13","U12","U10","U8","U6","U4","Inklusionsmannschaft"];
const demoPassword="Turu1880!";

function App(){
 const [page,setPage]=useState("Home"),[menu,setMenu]=useState(false),[session,setSession]=useState(()=>JSON.parse(localStorage.getItem("turuSession")||"null"));
 const [teams,setTeams]=useState([]),[posts,setPosts]=useState([]),[matches,setMatches]=useState([]),[vouchers,setVouchers]=useState([]),[selected,setSelected]=useState(null),[players,setPlayers]=useState([]);
 const [msg,setMsg]=useState(""),[loading,setLoading]=useState(false),[auth,setAuth]=useState("login");
 const go=p=>{setPage(p);setMenu(false);window.scrollTo({top:0,behavior:"smooth"});};
 useEffect(()=>{Promise.all([
  api("/api/teams").catch(()=>[]),api("/api/posts").catch(()=>[]),api("/api/matches").catch(()=>[]),api("/api/vouchers").catch(()=>[])
 ]).then(([a,b,c,d])=>{setTeams(a);setPosts(b);setMatches(c);setVouchers(d)})},[]);
 const openTeam=async t=>{setSelected(t);go("Team");try{setPlayers(await api(`/api/teams/${t.id}/players`))}catch(e){setMsg(e.message)}};
 const login=async e=>{e.preventDefault();setLoading(true);setMsg("");const d=new FormData(e.target);
 try{
  if(auth==="register"){
   if(d.get("password")!==d.get("confirm"))throw new Error("Die Passwörter stimmen nicht überein.");
   await api("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({firstName:d.get("firstName"),alias:d.get("alias"),email:d.get("email"),password:d.get("password"),terms:d.get("terms")==="on"})});
   setAuth("login");setMsg("Registrierung erfolgreich. Du kannst dich jetzt anmelden.");
  }else{
   const j=await api("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:d.get("email"),password:d.get("password")})});
   localStorage.setItem("turuSession",JSON.stringify(j));setSession(j);go("Profil");
  }
 }catch(x){setMsg(x.message)}finally{setLoading(false)}};
 const changePassword=async e=>{e.preventDefault();const d=new FormData(e.target);if(d.get("new")!==d.get("confirm"))return setMsg("Die neuen Passwörter stimmen nicht überein.");
 try{const j=await api("/api/auth/change-password",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.token},body:JSON.stringify({currentPassword:d.get("current"),newPassword:d.get("new")})});setMsg(j.message);e.target.reset()}catch(x){setMsg(x.message)}};

 const Page=()=>{
 if(page==="Mein TuRU")return <section className="section narrow"><span className="eyebrow">PERSÖNLICHER BEREICH</span><h1>Mein TuRU</h1><p>Hier registrierst du dich, meldest dich an und verwaltest später dein persönliches Vereinsprofil.</p><form className="auth" onSubmit={login}>
 {auth==="register"&&<><label>Vorname<input name="firstName" required/></label><label>Alias (optional)<input name="alias"/></label></>}
 <label>E-Mail<input name="email" type="email" required/></label><label>Passwort<input name="password" type="password" minLength="8" required/></label>
 {auth==="register"&&<><label>Passwort bestätigen<input name="confirm" type="password" minLength="8" required/></label><label className="check"><input name="terms" type="checkbox" required/> Nutzungsbedingungen akzeptieren</label></>}
 <button className="primary" disabled={loading}>{loading?"Bitte warten...":auth==="login"?"Anmelden":"Konto erstellen"}</button>
 {msg&&<p className="notice">{msg}</p>}<button type="button" className="linkbtn" onClick={()=>{setAuth(auth==="login"?"register":"login");setMsg("")}}>{auth==="login"?"Noch kein Konto? Jetzt registrieren":"Zurück zur Anmeldung"}</button>
 </form></section>;
 if(page==="Profil"&&session)return <section className="section narrow"><span className="eyebrow">MEIN TURU</span><h1>Willkommen, {session.user.alias||session.user.firstName}</h1><p>Deine Rolle: <b>{session.user.role}</b></p><form className="auth" onSubmit={changePassword}><h2>Passwort ändern</h2><label>Aktuelles Passwort<input name="current" type="password" required/></label><label>Neues Passwort<input name="new" type="password" minLength="8" required/></label><label>Neues Passwort bestätigen<input name="confirm" type="password" minLength="8" required/></label><button className="primary">Passwort ändern</button>{msg&&<p className="notice">{msg}</p>}<button type="button" className="linkbtn" onClick={()=>{localStorage.removeItem("turuSession");setSession(null);go("Mein TuRU")}}>Abmelden</button></form></section>;
 if(page==="Mannschaften")return <section className="section"><span className="eyebrow">SPORT</span><h1>Unsere Mannschaften</h1><div className="grid">{(teams.length?teams:teamsFallback.map((name,i)=>({id:i,name}))).map(t=><article className="card team" key={t.id}><div className="crest">TURU</div><h2>{t.name}</h2><p>{t.name==="Inklusionsmannschaft"?"Gemeinsam Sport erleben – ohne Barrieren.":"24 Testspieler, Spiele, Ergebnisse und Berichte."}</p><button onClick={()=>t.id?openTeam(t):null}>Kader ansehen</button></article>)}</div></section>;
 if(page==="Team")return <section className="section"><span className="eyebrow">MANNSCHAFT</span><h1>{selected?.name||"Mannschaft"}</h1><p>{players.length} von 24 Testspielern</p><div className="players">{players.map((p,i)=><article className="player" key={p.id}><div className="avatar">{p.first_name?.[0]}{p.last_name?.[0]}</div><div><b>#{p.shirt_number} {p.first_name} {p.last_name}</b><small>{p.position}</small></div></article>)}</div></section>;
 if(page==="News")return <section className="section"><span className="eyebrow">AKTUELLES</span><h1>TuRU News</h1><div className="grid">{posts.map(p=><article className="card" key={p.id}><small>{new Date(p.created_at).toLocaleDateString("de-DE")}</small><h2>{p.title}</h2><p>{p.body}</p></article>)}</div></section>;
 if(page==="Ergebnisse")return <section className="section"><span className="eyebrow">SPIELE</span><h1>Ergebnisse & Spielplan</h1>{matches.map(m=><article className="ticker" key={m.id}><b>{m.team_name}</b><span>{m.home_team} – {m.away_team}</span><strong>{m.home_score??"–"} : {m.away_score??"–"}</strong></article>)}</section>;
 if(page==="Gutscheine")return <section className="section"><span className="eyebrow">MITGLIEDERVORTEILE</span><h1>Neue Aktionen & Gutscheine</h1><div className="grid">{vouchers.map(v=><article className="card voucher" key={v.id}><small>{v.sponsor_name}</small><h2>{v.title}</h2><p>{v.description}</p><code>{v.code}</code></article>)}</div></section>;
 if(page==="Geschichte")return <section className="section"><span className="eyebrow">SEIT 1880</span><h1>Unsere Geschichte & Identität</h1><div className="grid">{["Vereinsgeschichte","Fußball","Handball","Padel","Inklusionssport","TuRU Hall of Fame","TuRU Archiv","TuRU Persönlichkeiten","Unsere Heimat","Die Menschen hinter TuRU","TuRU-Zeitreise","TuRU heute & morgen"].map(x=><article className="card" key={x}><h2>{x}</h2><p>Dieser Bereich wird als Teil des digitalen TuRU-Archivs aufgebaut und später vom Admin erweitert.</p></article>)}</div></section>;
 return <><section className="hero"><div><span className="eyebrow">WILLKOMMEN BEI TURU 1880</span><h1>Tradition. Sport. Gemeinschaft.</h1><p>Willkommen auf der digitalen Vereinsplattform von TuRU 1880 Düsseldorf.</p><button className="primary" onClick={()=>go("Mannschaften")}>Unsere Mannschaften</button></div><div className="heroMark">1880</div></section>
 <section className="section"><div className="sectionHead"><div><span className="eyebrow">LIVE & AKTUELL</span><h2>Was gerade bei TuRU passiert</h2></div><button onClick={()=>go("News")}>Alle News</button></div>
 <div className="ticker live"><b>🔴 LIVETICKER</b><span>{matches.find(m=>m.status==="live")? "Live-Spiel läuft":matches[0]?`${matches[0].home_team} – ${matches[0].away_team}`:"Aktuelle Spiele werden hier angezeigt."}</span></div>
 <div className="grid">{posts.slice(0,3).map(p=><article className="card" key={p.id}><small>AKTUELL</small><h2>{p.title}</h2><p>{p.body}</p></article>)}</div></section>
 <section className="section promo"><span className="eyebrow">NEU BEI TURU</span><h2>Aktionen, Vorteile & Gutscheine</h2><p>{vouchers[0]?`${vouchers[0].title} – ${vouchers[0].description}`:"Neue Angebote unserer Partner erscheinen hier."}</p><button className="primary" onClick={()=>go("Gutscheine")}>Vorteile entdecken</button></section></>;
 };
 return <><header><button className="brand" onClick={()=>go("Home")}><img src={logo}/><span><b>TuRU 1880</b><small>DÜSSELDORF</small></span></button><button className="hamb" onClick={()=>setMenu(!menu)}>☰</button><nav className={menu?"open":""}>{["Home","News","Mannschaften","Ergebnisse","Geschichte","Gutscheine"].map(x=><button key={x} onClick={()=>go(x)}>{x}</button>)}<button className="mein" onClick={()=>go(session?"Profil":"Mein TuRU")}>👤 Mein TuRU</button></nav></header><main><Page/></main><footer>© TuRU 1880 Düsseldorf · Digitale Vereinsplattform</footer></>
}
createRoot(document.getElementById("root")).render(<App/>);
