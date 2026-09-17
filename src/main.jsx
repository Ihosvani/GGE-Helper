import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, GripVertical, RotateCcw, Shield, Swords, Users, X } from "lucide-react";
import "./styles.css";

const ITEMS_URL = "https://raw.githubusercontent.com/GeneralsCamp/ggempire-data-cache/main/public/data/empire/items_latest.json";
const LANG_URL = "https://raw.githubusercontent.com/GeneralsCamp/ggempire-data-cache/main/public/data/lang/en.json";
const ROSTER_API_URL = "https://api.github.com/repos/Ihosvani/GGE-Helper/contents/src/data/roster.json";
const ADMIN_DRAFT_KEY = "gge-helper-roster-draft-v1";
const STORAGE_KEY = "gge-helper-rift-state-v1";
const emptyProgress = { selectedBoss: "", selectedLevel: "", completedStages: {} };

function parseUnits(value) {
  return String(value || "").split("#").filter(Boolean).map((entry) => {
    const [id, amount] = entry.split("+");
    return { id: String(id), amount: Number(amount) || 0 };
  });
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function nameForBoss(boss, lang) {
  return lang[`are_boss_name_${boss.name}`] || boss.name;
}

function decodeGitHubContent(content) {
  const bytes = Uint8Array.from(atob(content.replace(/\n/g, "")), (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function normalizeRoster(value) {
  const sourceMembers = Array.isArray(value) ? value : value?.members || [];
  return {
    members: sourceMembers.map((member) => typeof member === "string" ? member : member?.name).filter(Boolean),
    attacks: Array.isArray(value) ? {} : value?.attacks || {}
  };
}

function readSavedState() {
  try { return { ...emptyProgress, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").value }; } catch { return emptyProgress; }
}

function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(readSavedState);
  const [roster, setRoster] = useState({ members: [], attacks: {} });
  const [adminDraft, setAdminDraft] = useState(() => {
    try { return normalizeRoster(JSON.parse(localStorage.getItem(ADMIN_DRAFT_KEY) || "null")); } catch { return { members: [], attacks: {} }; }
  });
  const [rosterLoading, setRosterLoading] = useState(true);
  const [rosterError, setRosterError] = useState("");
  const [loadedAt, setLoadedAt] = useState(null);
  const isAdminPath = /\/admin\/?$/.test(window.location.pathname);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ value: progress, savedAt: Date.now() }));
  }, [progress]);

  useEffect(() => {
    Promise.all([fetch(ITEMS_URL).then((response) => response.json()), fetch(LANG_URL).then((response) => response.json())])
      .then(([items, lang]) => { setData({ items, lang }); setLoadedAt(new Date()); })
      .catch(() => setError("The live data could not be loaded. Check your connection and refresh to try again."));
  }, []);

  useEffect(() => {
    let active = true;
    async function loadMembers() {
      try {
        const response = await fetch(`${ROSTER_API_URL}?ref=main&t=${Date.now()}`, { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" });
        if (!response.ok) throw new Error("The shared roster could not be loaded.");
        const file = await response.json();
        if (!active) return;
        setRoster(normalizeRoster(decodeGitHubContent(file.content)));
        setRosterError("");
      } catch (loadError) {
        if (active) setRosterError(loadError.message);
      }
      if (active) setRosterLoading(false);
    }

    loadMembers();
    const refreshTimer = window.setInterval(loadMembers, 15000);
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
    };
  }, []);

  const bosses = data?.items?.raidBosses || [];
  const selectedBoss = bosses.find((boss) => String(boss.raidBossID) === String(progress.selectedBoss)) || bosses[0];
  const levels = useMemo(() => (data?.items?.raidBossLevels || []).filter((level) => String(level.raidBossID) === String(selectedBoss?.raidBossID)), [data, selectedBoss]);
  const selectedLevel = levels.find((level) => String(level.raidBossLevelID) === String(progress.selectedLevel)) || levels[0];
  const stages = useMemo(() => (data?.items?.raidBossStages || []).filter((stage) => String(stage.raidBossLevelID) === String(selectedLevel?.raidBossLevelID)), [data, selectedLevel]);
  const effectiveRoster = isAdminPath && adminDraft.members.length ? adminDraft : roster;
  const rosterKey = `${selectedBoss?.raidBossID || ""}:${selectedLevel?.raidBossLevelID || ""}`;
  const attackedNames = new Set(effectiveRoster.attacks[rosterKey] || []);
  const members = effectiveRoster.members.map((name, index) => ({ id: index, name, attacked: attackedNames.has(name) }));
  const currentStageIndex = Math.min(progress.currentStage || 0, Math.max(stages.length - 1, 0));
  const currentStage = stages[currentStageIndex];
  const completed = stages.filter((stage) => progress.completedStages[stage.raidBossStageID]).length;

  function updateProgress(patch) { setProgress((current) => ({ ...current, ...patch })); }
  function setBoss(id) { updateProgress({ selectedBoss: id, selectedLevel: "", currentStage: 0 }); }
  function setLevel(id) { updateProgress({ selectedLevel: id, currentStage: 0 }); }
  function toggleStage(stageId) {
    updateProgress({ completedStages: { ...progress.completedStages, [stageId]: !progress.completedStages[stageId] } });
  }
  function clearStageProgress() {
    const next = { ...progress.completedStages };
    stages.forEach((stage) => delete next[stage.raidBossStageID]);
    updateProgress({ completedStages: next, currentStage: 0 });
  }
  function updateAdminDraft(updater) {
    setAdminDraft((currentDraft) => {
      const nextDraft = updater(currentDraft.members.length ? currentDraft : roster);
      localStorage.setItem(ADMIN_DRAFT_KEY, JSON.stringify(nextDraft));
      return nextDraft;
    });
  }
  function toggleMember(index) {
    const memberName = members[index].name;
    updateAdminDraft((current) => {
      const selectedNames = new Set(current.attacks[rosterKey] || []);
      if (selectedNames.has(memberName)) selectedNames.delete(memberName);
      else selectedNames.add(memberName);
      return { ...current, attacks: { ...current.attacks, [rosterKey]: [...selectedNames] } };
    });
  }
  function moveMember(sourceIndex, targetIndex) {
    if (sourceIndex === targetIndex || targetIndex < 0 || targetIndex >= members.length) return;
    updateAdminDraft((current) => {
      const reordered = [...current.members];
      const [movedMember] = reordered.splice(sourceIndex, 1);
      reordered.splice(targetIndex, 0, movedMember);
      return { ...current, members: reordered };
    });
  }
  function resetAdminDraft() {
    localStorage.removeItem(ADMIN_DRAFT_KEY);
    setAdminDraft({ members: [], attacks: {} });
  }
  function downloadRoster() {
    const content = `${JSON.stringify(effectiveRoster, null, 2)}\n`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    link.download = "roster.json";
    link.click();
    URL.revokeObjectURL(link.href);
  }
  if (error) return <main className="loading-screen"><div className="brand-mark">GGE</div><h1>Rift Event data unavailable</h1><p>{error}</p><button className="button primary" onClick={() => window.location.reload()}>Retry</button></main>;
  if (!data) return <main className="loading-screen"><div className="brand-mark">GGE</div><div className="spinner" /><p>Loading the latest Rift Event data...</p></main>;

  const reserveUnits = parseUnits(selectedLevel?.courtyardReserveUnits);
  const totalDefenders = reserveUnits.reduce((sum, unit) => sum + unit.amount, 0);
  const capacity = Number(selectedLevel?.courtyardSize) || 0;
  const attacksTotal = capacity ? Math.ceil(totalDefenders / capacity) : 0;
  const attacksPerStage = stages.length && capacity ? Math.ceil(totalDefenders / stages.length / capacity) : 0;
  const attackedMembers = members.filter((member) => member.attacked).length;

  return <div className="app-shell">
    <header className="topbar">
      <div className="topbar-inner"><div className="brand"><div className="brand-mark">GGE</div><div><strong>{isAdminPath ? "GGE ADMIN" : "GGE HELPER"}</strong><span>{isAdminPath && adminDraft.members.length ? "Unsaved browser draft" : "Rift Event command desk"}</span></div></div>{isAdminPath ? <div className="admin-actions"><button className="text-button" disabled={!adminDraft.members.length} onClick={resetAdminDraft}><RotateCcw size={15} /> Reset</button><button className="button primary" onClick={downloadRoster}><Download size={16} /> Download JSON</button></div> : <div className="live-status"><span className="status-dot" /> Live data <small>{loadedAt?.toLocaleTimeString()}</small></div>}</div>
    </header>
    <main className="content">
      <section className="hero-row"><div><p className="eyebrow">RIFT RAID / BOSS CONTROL</p><h1>Track the fight, stage by stage.</h1><p className="hero-copy">Choose the active boss and level, then track exactly who has attacked it.</p></div></section>
      <section className="controls"><div className="control"><label>Boss</label><div className="select-wrap"><select value={selectedBoss?.raidBossID || ""} onChange={(event) => setBoss(event.target.value)}>{bosses.map((boss) => <option key={boss.raidBossID} value={boss.raidBossID}>{nameForBoss(boss, data.lang)}</option>)}</select><ChevronDown size={16} /></div></div><div className="control"><label>Boss level</label><div className="select-wrap"><select value={selectedLevel?.raidBossLevelID || ""} onChange={(event) => setLevel(event.target.value)}>{levels.map((level) => <option key={level.raidBossLevelID} value={level.raidBossLevelID}>Level {level.level}</option>)}</select><ChevronDown size={16} /></div></div><div className="control refresh-control"><span className="sync-label"><span className="status-dot" /> {nameForBoss(selectedBoss, data.lang)} / Level {selectedLevel?.level}</span><small>{attackedMembers} of {members.length} attacked this target</small></div></section>
      <Roster members={members} attackedCount={attackedMembers} loading={rosterLoading} error={rosterError} targetLabel={`${nameForBoss(selectedBoss, data.lang)} / Level ${selectedLevel?.level}`} compact editable={isAdminPath} onToggle={toggleMember} onMove={moveMember} />
      <section className="summary-grid"><Summary label="Courtyard defenders" value={formatNumber(totalDefenders)} detail={`${reserveUnits.length} unit types in reserve`} icon={<Users />} /><Summary label="Capacity per attack" value={formatNumber(capacity)} detail="From the selected level" icon={<Swords />} /><Summary label="Total attacks" value={formatNumber(attacksTotal)} detail={`${formatNumber(attacksPerStage)} estimated per stage`} icon={<Shield />} /><Summary label="Stage progress" value={`${completed}/${stages.length}`} detail="Completed in this level" icon={<Check />} /></section>
      <section className="stage-panel"><div className="panel-heading"><div><p className="eyebrow">HEALTH TRACKER</p><h2>Level {selectedLevel?.level} stages</h2></div><button className="text-button" onClick={clearStageProgress}><RotateCcw size={15} /> Reset this level</button></div><div className="progress-track">{stages.map((stage, index) => <button key={stage.raidBossStageID} className={progress.completedStages[stage.raidBossStageID] ? "progress-segment complete" : index === currentStageIndex ? "progress-segment current" : "progress-segment"} onClick={() => updateProgress({ currentStage: index })}><span>{index + 1}</span></button>)}</div><div className="stage-grid">{stages.map((stage, index) => <StageCard key={stage.raidBossStageID} stage={stage} index={index} stageCount={stages.length} active={index === currentStageIndex} complete={!!progress.completedStages[stage.raidBossStageID]} totalDefenders={totalDefenders} capacity={capacity} onToggle={() => toggleStage(stage.raidBossStageID)} />)}</div><div className="stage-nav"><button className="icon-button" disabled={currentStageIndex === 0} onClick={() => updateProgress({ currentStage: currentStageIndex - 1 })}><ChevronLeft size={18} /></button><span>Viewing stage {currentStageIndex + 1} of {stages.length}</span><button className="icon-button" disabled={currentStageIndex === stages.length - 1} onClick={() => updateProgress({ currentStage: currentStageIndex + 1 })}><ChevronRight size={18} /></button></div></section>
      <section className="details-grid"><div className="detail-panel"><div className="panel-heading compact"><div><p className="eyebrow">CURRENT STAGE</p><h2>Stage {currentStageIndex + 1} defender layout</h2></div><span className={progress.completedStages[currentStage?.raidBossStageID] ? "complete-pill" : "active-pill"}>{progress.completedStages[currentStage?.raidBossStageID] ? "Cleared" : "Active"}</span></div><div className="defense-columns"><DefenseList title="Left wall" units={parseUnits(currentStage?.leftWallUnits)} /><DefenseList title="Gate" units={parseUnits(currentStage?.frontWallUnits)} /><DefenseList title="Right wall" units={parseUnits(currentStage?.rightWallUnits)} /><DefenseList title="Courtyard reserve" units={reserveUnits} /></div><EffectList value={currentStage?.defenderBattleEffects} /></div><div className="detail-panel calculation"><div className="panel-heading compact"><div><p className="eyebrow">ATTACK PLAN</p><h2>Courtyard estimate</h2></div><Swords size={20} /></div><div className="formula"><strong>{formatNumber(attacksPerStage)}</strong><span>attacks / stage</span></div><p>Total reserve divided across {stages.length} stages, then rounded up to the nearest attack capacity.</p><button className={progress.completedStages[currentStage?.raidBossStageID] ? "button undo" : "button primary"} onClick={() => toggleStage(currentStage?.raidBossStageID)}>{progress.completedStages[currentStage?.raidBossStageID] ? <><X size={16} /> Reopen stage</> : <><Check size={16} /> Mark stage cleared</>}</button></div></section>
    </main>
  </div>;
}

function Summary({ label, value, detail, icon }) { return <div className="summary-card"><div className="summary-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>; }
function StageCard({ stage, index, active, complete, totalDefenders, capacity, stageCount, onToggle }) { const stageHealth = Math.round(100 / stageCount); const attacks = capacity ? Math.ceil(totalDefenders / stageCount / capacity) : 0; return <article className={`stage-card ${active ? "active" : ""} ${complete ? "complete" : ""}`}><div className="stage-card-top"><span className="stage-number">0{index + 1}</span><span className="stage-state">{complete ? "Cleared" : active ? "In progress" : "Queued"}</span></div><h3>Stage {index + 1}</h3><div className="health-line"><span>Health</span><strong>{stageHealth}%</strong></div><div className="health-bar"><span style={{ width: `${stageHealth}%` }} /></div><div className="stage-meta"><span>{formatNumber(attacks)} attacks est.</span><button className="check-button" onClick={onToggle} aria-label={`Mark stage ${index + 1} cleared`}>{complete && <Check size={15} />}</button></div></article>; }
function DefenseList({ title, units }) { return <div className="defense-list"><h3>{title}</h3>{units.length ? units.map((unit) => <div className="unit-row" key={`${title}-${unit.id}`}><span>Unit {unit.id}</span><strong>{formatNumber(unit.amount)}</strong></div>) : <div className="unit-row muted">No units</div>}</div>; }
function EffectList({ value }) { const effects = String(value || "").split(",").filter(Boolean); return <div className="effects-list"><h3>Defender battle effects</h3><div className="effect-chips">{effects.length ? effects.map((effect) => { const [id, amount] = effect.split("&"); return <span key={effect}>Effect {id} <strong>{amount}</strong></span>; }) : <span className="muted">No stage effects</span>}</div></div>; }
function Roster({ members, attackedCount, loading, error, targetLabel, compact = false, editable = false, onToggle, onMove }) {
  function dropMember(event, targetIndex) {
    event.preventDefault();
    const sourceIndex = Number(event.dataTransfer.getData("text/plain"));
    if (Number.isInteger(sourceIndex)) onMove(sourceIndex, targetIndex);
  }

  return <section className={compact ? "roster-content compact" : "content roster-page"}><div className="hero-row"><div><p className="eyebrow">ALLIANCE OPERATIONS</p><h1>{targetLabel}</h1><p className="hero-copy">{editable ? "Click a member to change status. Drag or use arrows to reorder." : "The shared alliance list updates for everyone."}</p></div></div><div className="roster-toolbar"><span><strong>{attackedCount}</strong> of {members.length} members marked attacked</span></div>{error && <p className="notice error-notice">{error}</p>}{loading ? <div className="empty-roster"><div className="spinner" /><p>Loading the shared roster...</p></div> : members.length ? <div className={`member-list ${editable ? "editable" : ""}`}>{members.map((member, index) => editable ? <div className={member.attacked ? "member-row attacked" : "member-row"} key={`${member.name}-${index}`} draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", String(index))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropMember(event, index)}><GripVertical className="drag-handle" size={15} /><button className="member-toggle" onClick={() => onToggle(index)}><span className="member-name">{member.name}</span><span className="member-status">{member.attacked ? <><Check size={14} /> Attacked</> : "Awaiting"}</span></button><span className="move-buttons"><button className="move-button" disabled={index === 0} onClick={() => onMove(index, index - 1)} aria-label={`Move ${member.name} up`}><ChevronUp size={14} /></button><button className="move-button" disabled={index === members.length - 1} onClick={() => onMove(index, index + 1)} aria-label={`Move ${member.name} down`}><ChevronDown size={14} /></button></span></div> : <div className={member.attacked ? "member-row attacked" : "member-row"} key={`${member.name}-${index}`}><span className="member-name">{member.name}</span><span className="member-status">{member.attacked ? <><Check size={14} /> Attacked</> : "Awaiting"}</span></div>)}</div> : <div className="empty-roster"><Users size={28} /><h2>No alliance list yet</h2><p>The roster file is empty.</p></div>}</section>;
}

createRoot(document.getElementById("root")).render(<App />);
