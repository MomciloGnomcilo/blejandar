import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "./firebase";
import {
  doc, getDoc, setDoc, updateDoc, onSnapshot, collection
} from "firebase/firestore";

// ─── Constants ───────────────────────────────────────────────
const HOURS = Array.from({ length: 16 }, (_, i) => i + 8); // 8am–11pm
const formatHour = h => h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getDates() {
  const dates = [], today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d);
  }
  return dates;
}
const DATES = getDates();
const dateKey = d => d.toISOString().split("T")[0];

// ─── Confetti ─────────────────────────────────────────────────
function Confetti({ active }) {
  if (!active) return null;
  const colors = ["#FFD700","#FF6B6B","#4ECDC4","#45B7D1","#96CEB4","#FFEAA7","#DDA0DD"];
  return (
    <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:9999 }}>
      {Array.from({ length: 60 }, (_, i) => (
        <div key={i} style={{
          position: "absolute",
          left: `${(i * 1.67) % 100}%`,
          top: "-20px",
          width: `${6 + i % 8}px`,
          height: `${6 + i % 8}px`,
          background: colors[i % colors.length],
          borderRadius: i % 3 === 0 ? "50%" : i % 3 === 1 ? "2px" : "0",
          animation: `cffall ${2 + (i % 4) * 0.5}s linear ${(i % 20) * 0.12}s forwards`,
          transform: `rotate(${i * 37}deg)`,
        }} />
      ))}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("home"); // home | admin | group
  const [groupId, setGroupId] = useState(null);
  const [group, setGroup] = useState(null);      // live Firestore data
  const [loading, setLoading] = useState(false);
  const [myName, setMyName] = useState(null);    // who I am in this session
  const [nameInput, setNameInput] = useState("");
  const [adminNameInput, setAdminNameInput] = useState("");
  const [adminMembersInput, setAdminMembersInput] = useState("");
  const [selection, setSelection] = useState({});// my local picks (pre-submit)
  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState(true);
  const [confetti, setConfetti] = useState(false);
  const [saving, setSaving] = useState(false);
  const prevRevealedRef = useRef(false);

  // ── Parse URL ──────────────────────────────────────────────
  useEffect(() => {
    const m = window.location.hash.match(/^#group\/([^/]+)$/);
    if (m) { setGroupId(m[1]); setScreen("group"); }
  }, []);

  // ── Listen to Firestore ────────────────────────────────────
  useEffect(() => {
    if (!groupId || screen !== "group") return;
    setLoading(true);
    const ref = doc(db, "groups", groupId);
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) {
        const data = snap.data();
        setGroup(data);

        // Restore my session name from localStorage
        const savedName = localStorage.getItem(`hangout_name_${groupId}`);
        if (savedName && data.members?.[savedName]) {
          setMyName(savedName);
          if (!data.members[savedName].submitted) {
            setSelection(data.members[savedName].picks || {});
          }
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, [groupId, screen]);

  // ── Confetti on reveal ─────────────────────────────────────
  useEffect(() => {
    if (!group) return;
    const revealed = isRevealed(group);
    if (revealed && !prevRevealedRef.current) {
      setConfetti(true);
      setTimeout(() => setConfetti(false), 6000);
    }
    prevRevealedRef.current = revealed;
  }, [group]);

  // ── Helpers ────────────────────────────────────────────────
  const isRevealed = (g) => {
    if (!g) return false;
    const members = Object.keys(g.members || {});
    return members.length > 0 && members.every(m => g.members[m].submitted);
  };

  const getMatches = useCallback((g) => {
    if (!g || !isRevealed(g)) return [];
    const members = Object.keys(g.members || {});
    const matches = [];
    DATES.forEach(d => HOURS.forEach(h => {
      const key = `${dateKey(d)}:${h}`;
      if (members.every(m => g.members[m]?.picks?.[key])) matches.push(key);
    }));
    return matches;
  }, []);

  // ── Create group ───────────────────────────────────────────
  const createGroup = async () => {
    const name = adminNameInput.trim();
    const memberList = adminMembersInput.split(",").map(s => s.trim()).filter(Boolean);
    if (!name || memberList.length < 1) return;

    const id = name.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now().toString(36);
    const members = {};
    memberList.forEach(m => { members[m] = { picks: {}, submitted: false }; });

    await setDoc(doc(db, "groups", id), { name, members, createdAt: Date.now() });
    window.location.hash = `#group/${id}`;
    setGroupId(id);
    setScreen("group");
  };

  // ── Join group as member ───────────────────────────────────
  const joinGroup = () => {
    const name = nameInput.trim();
    if (!name || !group?.members?.[name]) return;
    if (group.members[name].submitted) {
      alert(`${name} has already submitted! Picks are locked.`);
      return;
    }
    localStorage.setItem(`hangout_name_${groupId}`, name);
    setMyName(name);
    setSelection(group.members[name].picks || {});
    setNameInput("");
  };

  // ── Toggle cell ────────────────────────────────────────────
  const toggleCell = (key, val) => {
    setSelection(prev => {
      const next = { ...prev };
      if (val) next[key] = true; else delete next[key];
      return next;
    });
  };

  const handleMouseDown = (key) => {
    if (!myName || group?.members?.[myName]?.submitted) return;
    const v = !selection[key];
    setIsDragging(true); setDragValue(v);
    toggleCell(key, v);
  };
  const handleMouseEnter = (key) => {
    if (isDragging && myName && !group?.members?.[myName]?.submitted) toggleCell(key, dragValue);
  };
  useEffect(() => {
    const up = () => setIsDragging(false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  // ── Submit picks ───────────────────────────────────────────
  const submitPicks = async () => {
    if (!myName || !groupId) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "groups", groupId), {
        [`members.${myName}.picks`]: selection,
        [`members.${myName}.submitted`]: true,
      });
    } finally {
      setSaving(false);
    }
  };

  // ── Derived state ──────────────────────────────────────────
  const members = group ? Object.keys(group.members || {}) : [];
  const allSubmitted = isRevealed(group);
  const matches = getMatches(group);
  const mySubmitted = myName && group?.members?.[myName]?.submitted;
  const submittedCount = members.filter(m => group?.members?.[m]?.submitted).length;

  // ── Styles ─────────────────────────────────────────────────
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Mono:wght@300;400;500&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #root { min-height: 100vh; background: #07070f; color: #f0ede8; font-family: 'Syne', sans-serif; }
    @keyframes cffall { to { transform: translateY(110vh) rotate(720deg); opacity: 0; } }
    @keyframes glow { 0%,100%{box-shadow:0 0 10px #ffd700,0 0 22px #ffd70055}50%{box-shadow:0 0 24px #ffd700,0 0 48px #ffd700aa} }
    @keyframes fadein { from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)} }
    @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.4} }
    @keyframes revealBg { from{background-size:0% 100%}to{background-size:100% 100%} }
    .cell { transition: background 0.08s, filter 0.08s; }
    .cell:hover { filter: brightness(1.35); }
    .glow { animation: glow 1.4s ease-in-out infinite !important; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
    input::placeholder { color: rgba(240,237,232,0.3); }
    input:focus { border-color: rgba(200,240,74,0.5) !important; }
  `;

  const inp = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: "8px", color: "#f0ede8",
    fontFamily: "'Syne',sans-serif", fontSize: "1rem",
    padding: "12px 16px", outline: "none", width: "100%",
    transition: "border-color 0.15s",
  };
  const btn = (bg = "#c8f04a", c = "#07070f") => ({
    background: bg, border: "none", borderRadius: "8px",
    color: c, cursor: "pointer", fontFamily: "'Syne',sans-serif",
    fontWeight: 700, fontSize: "0.95rem", padding: "12px 24px",
    transition: "opacity 0.15s, transform 0.1s",
  });

  // ═══════════════════════════════════════════════════════════
  // HOME SCREEN
  // ═══════════════════════════════════════════════════════════
  if (screen === "home") return (
    <>
      <style>{css}</style>
      <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:"2rem", background:"radial-gradient(ellipse at 50% -10%, #1a1a30 0%, #07070f 65%)" }}>
        <div style={{ textAlign:"center", animation:"fadein 0.6s ease", maxWidth:500 }}>
          <div style={{ fontSize:"3.5rem", marginBottom:"0.5rem" }}>🗓️</div>
          <h1 style={{ fontSize:"clamp(2.2rem,7vw,3.8rem)", fontWeight:800, letterSpacing:"-0.03em", lineHeight:1.1, marginBottom:"0.9rem" }}>
            When Can We<br/><span style={{color:"#c8f04a"}}>All Hang?</span>
          </h1>
          <p style={{ fontFamily:"'DM Mono',monospace", fontSize:"0.88rem", color:"rgba(240,237,232,0.42)", marginBottom:"2.5rem", lineHeight:1.65 }}>
            Admin creates a group with members → everyone secretly marks their free hours
            → once all submitted, results auto-reveal 🎉
          </p>
          <div style={{ display:"flex", flexDirection:"column", gap:"0.75rem", alignItems:"center" }}>
            <button style={{ ...btn(), maxWidth:280, width:"100%" }} onClick={() => setScreen("admin")}>
              Create a Group →
            </button>
            <button style={{ background:"transparent", border:"1px solid rgba(255,255,255,0.18)", borderRadius:"8px", color:"#f0ede8", cursor:"pointer", fontFamily:"'Syne',sans-serif", fontSize:"0.9rem", padding:"10px 24px" }}
              onClick={() => {
                const id = prompt("Paste your group link or ID:");
                if (!id) return;
                const m = id.match(/group\/([^\s&#]+)/) || [null, id.trim()];
                if (m[1]) { setGroupId(m[1]); setScreen("group"); window.location.hash = `#group/${m[1]}`; }
              }}>
              Open Existing Group
            </button>
          </div>
        </div>
      </div>
    </>
  );

  // ═══════════════════════════════════════════════════════════
  // ADMIN CREATE SCREEN
  // ═══════════════════════════════════════════════════════════
  if (screen === "admin") return (
    <>
      <style>{css}</style>
      <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:"2rem", background:"radial-gradient(ellipse at 50% -10%, #1a1a30 0%, #07070f 65%)" }}>
        <div style={{ width:"100%", maxWidth:460, animation:"fadein 0.5s ease" }}>
          <button onClick={() => setScreen("home")} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.35)", cursor:"pointer", fontFamily:"'DM Mono',monospace", fontSize:"0.82rem", marginBottom:"2rem" }}>← back</button>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:"0.65rem", color:"#c8f04a", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:"0.4rem" }}>step 1</div>
          <h2 style={{ fontSize:"2rem", fontWeight:800, marginBottom:"0.4rem" }}>Create your group</h2>
          <p style={{ fontFamily:"'DM Mono',monospace", fontSize:"0.82rem", color:"rgba(255,255,255,0.38)", marginBottom:"2rem", lineHeight:1.6 }}>
            Add all member names. Everyone marks their hours secretly — results only reveal once every single person has submitted.
          </p>

          <label style={{ fontFamily:"'DM Mono',monospace", fontSize:"0.72rem", color:"rgba(255,255,255,0.4)", display:"block", marginBottom:"0.4rem" }}>Group name</label>
          <input style={{ ...inp, marginBottom:"1.25rem" }} placeholder="e.g. Friday Squad" value={adminNameInput} onChange={e => setAdminNameInput(e.target.value)} autoFocus/>

          <label style={{ fontFamily:"'DM Mono',monospace", fontSize:"0.72rem", color:"rgba(255,255,255,0.4)", display:"block", marginBottom:"0.4rem" }}>Members (comma-separated)</label>
          <input style={inp} placeholder="e.g. Alice, Bob, Carlos, Diana" value={adminMembersInput} onChange={e => setAdminMembersInput(e.target.value)} onKeyDown={e => e.key === "Enter" && createGroup()}/>

          {adminMembersInput && (
            <div style={{ marginTop:"0.75rem", display:"flex", flexWrap:"wrap", gap:"0.4rem" }}>
              {adminMembersInput.split(",").map(s => s.trim()).filter(Boolean).map(m => (
                <span key={m} style={{ background:"rgba(200,240,74,0.12)", border:"1px solid rgba(200,240,74,0.25)", borderRadius:"20px", fontFamily:"'DM Mono',monospace", fontSize:"0.76rem", padding:"3px 10px", color:"#c8f04a" }}>{m}</span>
              ))}
            </div>
          )}

          <button style={{ ...btn(), marginTop:"1.5rem", width:"100%" }} onClick={createGroup}>Create Group & Get Link →</button>
        </div>
      </div>
    </>
  );

  // ═══════════════════════════════════════════════════════════
  // GROUP SCREEN
  // ═══════════════════════════════════════════════════════════
  if (screen === "group") {
    if (loading) return (
      <>
        <style>{css}</style>
        <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#07070f" }}>
          <span style={{ fontFamily:"'DM Mono',monospace", color:"rgba(255,255,255,0.3)", animation:"pulse 1.5s ease infinite" }}>loading group...</span>
        </div>
      </>
    );

    if (!group) return (
      <>
        <style>{css}</style>
        <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#07070f" }}>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:"2rem", marginBottom:"1rem" }}>🤔</div>
            <p style={{ fontFamily:"'DM Mono',monospace", color:"rgba(255,255,255,0.4)" }}>Group not found. Check the link.</p>
          </div>
        </div>
      </>
    );

    const shareUrl = `${window.location.origin}${window.location.pathname}#group/${groupId}`;

    return (
      <>
        <style>{css}</style>
        <Confetti active={confetti} />
        <div style={{ minHeight:"100vh", background:"#07070f" }}>

          {/* ── Header ── */}
          <div style={{ background:"rgba(255,255,255,0.03)", borderBottom:"1px solid rgba(255,255,255,0.08)", padding:"0.9rem 1.5rem", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:"0.75rem" }}>
            <div>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:"0.6rem", color:"#c8f04a", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:"2px" }}>group</div>
              <h1 style={{ fontSize:"1.3rem", fontWeight:800 }}>{group.name}</h1>
            </div>
            <div style={{ display:"flex", gap:"0.75rem", alignItems:"center" }}>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:"0.72rem", color:"rgba(255,255,255,0.3)", textAlign:"right" }}>
                {submittedCount}/{members.length} submitted
              </div>
              <button style={{ ...btn("rgba(255,255,255,0.09)", "#f0ede8"), fontSize:"0.78rem", padding:"8px 14px" }}
                onClick={() => { try { navigator.clipboard.writeText(shareUrl); } catch(e){} alert(`Share this link:\n\n${shareUrl}`); }}>
                📋 Copy Link
              </button>
            </div>
          </div>

          <div style={{ padding:"1.25rem", maxWidth:1400, margin:"0 auto" }}>

            {/* ── Revealed banner ── */}
            {allSubmitted && matches.length > 0 && (
              <div style={{ background:"linear-gradient(135deg,#1a2800,#243400)", border:"1px solid rgba(200,240,74,0.35)", borderRadius:"14px", padding:"1.25rem 1.5rem", marginBottom:"1.25rem", display:"flex", alignItems:"center", gap:"1rem", animation:"fadein 0.5s ease" }}>
                <span style={{ fontSize:"2.5rem" }}>🎉</span>
                <div>
                  <div style={{ fontWeight:800, color:"#c8f04a", fontSize:"1.15rem", marginBottom:"3px" }}>Everyone overlaps on {matches.length} hour slot{matches.length !== 1 ? "s" : ""}!</div>
                  <div style={{ fontFamily:"'DM Mono',monospace", fontSize:"0.78rem", color:"rgba(255,255,255,0.45)" }}>The golden glowing cells are your hangout windows. Go make plans! 🚀</div>
                </div>
              </div>
            )}

            {allSubmitted && matches.length === 0 && (
              <div style={{ background:"rgba(255,100,100,0.08)", border:"1px solid rgba(255,100,100,0.2)", borderRadius:"14px", padding:"1.25rem 1.5rem", marginBottom:"1.25rem", display:"flex", alignItems:"center", gap:"1rem", animation:"fadein 0.5s ease" }}>
                <span style={{ fontSize:"2rem" }}>😬</span>
                <div>
                  <div style={{ fontWeight:700, color:"#ff8080", fontSize:"1rem", marginBottom:"3px" }}>No overlap found in these 2 weeks</div>
                  <div style={{ fontFamily:"'DM Mono',monospace", fontSize:"0.78rem", color:"rgba(255,255,255,0.4)" }}>Looks like everyone's busy. Time to reschedule or compromise!</div>
                </div>
              </div>
            )}

            {/* ── Waiting banner ── */}
            {!allSubmitted && (
              <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"12px", padding:"0.85rem 1.25rem", marginBottom:"1.25rem", display:"flex", alignItems:"center", gap:"0.75rem" }}>
                <span style={{ fontSize:"1.2rem" }}>🔒</span>
                <div style={{ fontFamily:"'DM Mono',monospace", fontSize:"0.78rem", color:"rgba(255,255,255,0.45)" }}>
                  Results are hidden until all {members.length} members submit. <strong style={{color:"#f0ede8"}}>{members.length - submittedCount} left.</strong>
                </div>
              </div>
            )}

            {/* ── Name entry / status bar ── */}
            {!myName ? (
              <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"12px", padding:"1.25rem", marginBottom:"1.25rem" }}>
                <p style={{ fontFamily:"'DM Mono',monospace", fontSize:"0.8rem", color:"rgba(255,255,255,0.4)", marginBottom:"1rem" }}>
                  Who are you? Pick your name from the group:
                </p>
                <div style={{ display:"flex", flexWrap:"wrap", gap:"0.5rem", marginBottom:"1rem" }}>
                  {members.map(m => {
                    const submitted = group.members[m].submitted;
                    return (
                      <button key={m}
                        onClick={() => { setNameInput(m); }}
                        style={{ background: nameInput === m ? "rgba(200,240,74,0.18)" : "rgba(255,255,255,0.07)", border:`1px solid ${nameInput === m ? "rgba(200,240,74,0.4)" : "rgba(255,255,255,0.12)"}`, borderRadius:"8px", color: submitted ? "rgba(255,255,255,0.4)" : "#f0ede8", cursor: submitted ? "default" : "pointer", fontFamily:"'DM Mono',monospace", fontSize:"0.82rem", padding:"8px 14px", display:"flex", alignItems:"center", gap:"6px" }}>
                        {m}
                        {submitted && <span style={{ fontSize:"0.65rem", color:"#4ade80" }}>✓ submitted</span>}
                      </button>
                    );
                  })}
                </div>
                {nameInput && !group.members[nameInput]?.submitted && (
                  <button style={btn()} onClick={joinGroup}>Enter as {nameInput} →</button>
                )}
              </div>
            ) : mySubmitted ? (
              <div style={{ background:"rgba(74,222,128,0.07)", border:"1px solid rgba(74,222,128,0.2)", borderRadius:"10px", padding:"0.75rem 1.25rem", marginBottom:"1.25rem", display:"flex", alignItems:"center", gap:"0.75rem" }}>
                <span style={{ fontSize:"1.1rem" }}>✅</span>
                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:"0.8rem" }}>
                  <strong style={{color:"#4ade80"}}>{myName}</strong> — your picks are submitted and locked.
                  {!allSubmitted && ` Waiting for ${members.length - submittedCount} more.`}
                </span>
              </div>
            ) : (
              <div style={{ background:"rgba(200,240,74,0.06)", border:"1px solid rgba(200,240,74,0.2)", borderRadius:"10px", padding:"0.75rem 1.25rem", marginBottom:"1.25rem", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:"0.75rem" }}>
                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:"0.8rem" }}>
                  Marking as <strong style={{color:"#c8f04a"}}>{myName}</strong> — click or drag to mark free hours, then submit
                </span>
                <div style={{ display:"flex", gap:"0.5rem", alignItems:"center" }}>
                  <span style={{ fontFamily:"'DM Mono',monospace", fontSize:"0.72rem", color:"rgba(255,255,255,0.35)" }}>{Object.keys(selection).length} hours selected</span>
                  <button style={{ ...btn(), fontSize:"0.85rem", padding:"9px 20px" }} onClick={submitPicks} disabled={saving}>
                    {saving ? "Saving..." : "Submit Picks 🔒"}
                  </button>
                </div>
              </div>
            )}

            {/* ── Calendar Grid ── */}
            <div style={{ overflowX:"auto", userSelect:"none" }}>
              <table style={{ borderCollapse:"separate", borderSpacing:"3px", minWidth:820, width:"100%" }}>
                <thead>
                  <tr>
                    <th style={{ width:50 }}></th>
                    {DATES.map(d => {
                      const isToday = d.toDateString() === new Date().toDateString();
                      return (
                        <th key={dateKey(d)} style={{ textAlign:"center", padding:"4px 2px", minWidth:48 }}>
                          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:"0.58rem", color:"rgba(255,255,255,0.28)", textTransform:"uppercase" }}>{DAY_NAMES[d.getDay()]}</div>
                          <div style={{ fontWeight:800, fontSize:"0.92rem", lineHeight:1.2, color:isToday?"#c8f04a":"#f0ede8" }}>{d.getDate()}</div>
                          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:"0.56rem", color:"rgba(255,255,255,0.26)" }}>{MONTH_NAMES[d.getMonth()]}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {HOURS.map(h => (
                    <tr key={h}>
                      <td style={{ fontFamily:"'DM Mono',monospace", fontSize:"0.58rem", color:"rgba(255,255,255,0.28)", textAlign:"right", paddingRight:"6px", whiteSpace:"nowrap", verticalAlign:"middle" }}>
                        {formatHour(h)}
                      </td>
                      {DATES.map(d => {
                        const key = `${dateKey(d)}:${h}`;
                        const isMatch = matches.includes(key);
                        const myPick = !!selection[key];
                        const canEdit = myName && !mySubmitted;

                        // What others picked — only visible after reveal
                        const othersCount = allSubmitted
                          ? members.filter(m => m !== myName && group.members[m]?.picks?.[key]).length
                          : 0;
                        const totalFree = allSubmitted
                          ? members.filter(m => group.members[m]?.picks?.[key]).length
                          : 0;

                        let bg = "rgba(255,255,255,0.04)";
                        if (isMatch) bg = "#ffd700";
                        else if (allSubmitted && myPick && othersCount > 0) bg = `rgba(80,210,120,${Math.min(0.85, 0.3 + othersCount * 0.2)})`;
                        else if (myPick) bg = "rgba(200,240,74,0.3)";
                        else if (allSubmitted && othersCount > 0) bg = `rgba(100,170,255,${Math.min(0.32, 0.08 + othersCount * 0.09)})`;

                        const freeNames = allSubmitted ? members.filter(m => group.members[m]?.picks?.[key]) : [];

                        return (
                          <td key={key} style={{ padding:"1px" }}>
                            <div
                              className={`cell${isMatch ? " glow" : ""}`}
                              onMouseDown={() => canEdit && handleMouseDown(key)}
                              onMouseEnter={() => canEdit && handleMouseEnter(key)}
                              title={allSubmitted && freeNames.length > 0 ? `Free: ${freeNames.join(", ")}` : ""}
                              style={{
                                height:26, borderRadius:4, background:bg,
                                cursor: canEdit ? "pointer" : "default",
                                border: myPick && !isMatch ? "1px solid rgba(200,240,74,0.35)" : "1px solid transparent",
                                display:"flex", alignItems:"center", justifyContent:"center",
                                fontSize:"0.58rem", color:isMatch?"#07070f":"rgba(255,255,255,0.4)",
                                fontFamily:"'DM Mono',monospace", fontWeight:isMatch?700:400,
                              }}>
                              {isMatch ? "🎉" : (allSubmitted && totalFree > 0 && !myPick ? totalFree : "")}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Legend ── */}
            <div style={{ marginTop:"1.25rem", display:"flex", gap:"1.25rem", flexWrap:"wrap", fontFamily:"'DM Mono',monospace", fontSize:"0.7rem", color:"rgba(255,255,255,0.36)" }}>
              {[
                ["rgba(200,240,74,0.3)", "1px solid rgba(200,240,74,0.35)", "your free time"],
                allSubmitted && ["rgba(100,170,255,0.22)", "transparent", "others free"],
                allSubmitted && ["rgba(80,210,120,0.55)", "transparent", "overlap!"],
                allSubmitted && ["#ffd700", "transparent", "everyone free 🎉"],
              ].filter(Boolean).map(([bg, border, label]) => (
                <div key={label} style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <div style={{ width:12, height:12, borderRadius:3, background:bg, border:`1px solid ${border}` }} />
                  {label}
                </div>
              ))}
            </div>

            {/* ── Members status ── */}
            <div style={{ marginTop:"1.75rem", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"12px", padding:"1.25rem" }}>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:"0.62rem", color:"rgba(255,255,255,0.28)", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:"0.75rem" }}>
                members — {submittedCount}/{members.length} submitted
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:"0.5rem" }}>
                {members.map(m => {
                  const submitted = group.members[m].submitted;
                  const isMe = m === myName;
                  return (
                    <div key={m} style={{ background: isMe ? "rgba(200,240,74,0.1)" : "rgba(255,255,255,0.05)", border:`1px solid ${isMe ? "rgba(200,240,74,0.25)" : "rgba(255,255,255,0.1)"}`, borderRadius:"8px", padding:"6px 12px", fontFamily:"'DM Mono',monospace", fontSize:"0.76rem", display:"flex", alignItems:"center", gap:"6px" }}>
                      <span style={{ color:isMe?"#c8f04a":"#f0ede8" }}>{m}</span>
                      {submitted
                        ? <span style={{ fontSize:"0.65rem", color:"#4ade80" }}>✓ submitted</span>
                        : <span style={{ fontSize:"0.65rem", color:"rgba(255,255,255,0.28)" }}>⏳ pending</span>
                      }
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      </>
    );
  }

  return null;
}
