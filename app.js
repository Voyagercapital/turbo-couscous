// Invest Dashboard — local-first PWA (no frameworks)
// Data is stored in LocalStorage (exportable JSON).

const LS_KEY = "invest_dash_v1";
const DEFAULT_SLEEVES = [
  { name: "Liquidity", target: 25 },
  { name: "Defensive", target: 30 },
  { name: "Core Growth", target: 35 },
  { name: "Opportunistic/Private", target: 10 },
];

const DEFAULT_STATE = {
  version: 1,
  updatedAt: null,
  sleeves: DEFAULT_SLEEVES,
  runway: { monthlyBurnNZD: null, sleeveName: "Liquidity" },
  positions: [
    // Example starter row (safe to delete)
    { id: uid(), name: "Cash on Call", sleeve: "Liquidity", type: "Cash", issuer: "Bank", valueNZD: 0, costNZD: 0, currency: "NZD", maturityDate: null, expectedRate: null, tags: ["cash"], notes: "" },
  ],
};

let state = loadState();
let importBuffer = null;

function uid(){ return Math.random().toString(16).slice(2) + Date.now().toString(16); }

function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return structuredClone(DEFAULT_STATE);
    const s = JSON.parse(raw);
    if(!s.sleeves || !Array.isArray(s.sleeves)) s.sleeves = structuredClone(DEFAULT_SLEEVES);
    if(!s.positions || !Array.isArray(s.positions)) s.positions = [];
    if(!s.runway) s.runway = { monthlyBurnNZD: null, sleeveName: "Liquidity" };
    return s;
  }catch(e){
    console.warn("Failed to load state, resetting.", e);
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState(){
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  renderAll();
}

function money(n){
  const x = Number(n || 0);
  return x.toLocaleString(undefined, { style:"currency", currency:"NZD", maximumFractionDigits:0 });
}
function pct(n){
  const x = Number(n || 0);
  return (x).toFixed(1) + "%";
}
function fmtDate(iso){
  if(!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { year:"numeric", month:"short", day:"numeric" });
}
function daysUntil(iso){
  if(!iso) return null;
  const now = new Date();
  const d = new Date(iso + "T00:00:00");
  const ms = d - new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round(ms / (1000*60*60*24));
}
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

// Tabs / views
document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    const view = btn.dataset.view;
    document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
    document.getElementById("view-" + view).classList.remove("hidden");
    if(view === "import") renderImport();
    if(view === "settings") renderSettings();
    if(view === "positions") renderPositions();
    if(view === "overview") renderOverview();
  });
});

// Backup / restore
document.getElementById("btnBackup").addEventListener("click", ()=>{
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const date = new Date().toISOString().slice(0,10);
  a.download = `invest-dashboard-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("btnRestore").addEventListener("change", async (e)=>{
  const f = e.target.files?.[0];
  if(!f) return;
  try{
    const txt = await f.text();
    const s = JSON.parse(txt);
    if(!s.positions || !Array.isArray(s.positions)) throw new Error("Backup missing positions");
    state = s;
    saveState();
    alert("Imported backup successfully.");
  }catch(err){
    alert("Could not import backup: " + err.message);
  }finally{
    e.target.value = "";
  }
});

// Overview calculations
function calc(){
  const positions = state.positions || [];
  const total = positions.reduce((a,p)=>a + (Number(p.valueNZD)||0), 0);
  const bySleeve = {};
  for(const sl of state.sleeves){ bySleeve[sl.name] = 0; }
  for(const p of positions){
    if(!bySleeve.hasOwnProperty(p.sleeve)) bySleeve[p.sleeve] = 0;
    bySleeve[p.sleeve] += (Number(p.valueNZD)||0);
  }
  const actualPct = {};
  for(const k of Object.keys(bySleeve)){
    actualPct[k] = total > 0 ? (bySleeve[k] / total * 100) : 0;
  }
  const drift = {};
  for(const sl of state.sleeves){
    drift[sl.name] = actualPct[sl.name] - Number(sl.target||0);
  }

  const runwaySleeve = state.runway?.sleeveName || "Liquidity";
  const burn = Number(state.runway?.monthlyBurnNZD || 0);
  const runwayValue = bySleeve[runwaySleeve] ?? 0;
  const runwayMonths = burn > 0 ? (runwayValue / burn) : null;

  const upcoming = positions
    .filter(p => p.maturityDate)
    .map(p => ({...p, days: daysUntil(p.maturityDate)}))
    .filter(p => p.days !== null && p.days <= 120)
    .sort((a,b)=>a.days-b.days);

  let maxAbs = 0;
  let maxName = null;
  for(const sl of state.sleeves){
    const d = Math.abs(drift[sl.name] || 0);
    if(d > maxAbs){ maxAbs = d; maxName = sl.name; }
  }

  return { positions, total, bySleeve, actualPct, drift, runwayMonths, runwayValue, burn, upcoming, maxAbs, maxName };
}

function renderOverview(){
  const m = calc();
  document.getElementById("asof").textContent = "As of " + new Date().toLocaleDateString();
  document.getElementById("totalValue").textContent = money(m.total);
  const acctCount = (state.positions || []).filter(p => p.type === "Cash").length;
  document.getElementById("totalMeta").textContent = `${state.positions.length} positions · ${acctCount} cash accounts`;

  document.getElementById("runway").textContent =
    m.runwayMonths === null ? "Set burn"
    : (m.runwayMonths >= 24 ? "24+ mo" : (m.runwayMonths.toFixed(1) + " mo"));

  document.getElementById("maxDrift").textContent = m.maxName ? `${m.maxName}: ${pct(m.maxAbs)}` : "—";

  renderSleeveBars(m);
  renderSleeveTable(m);
  renderUpcoming(m);
  renderMonthlyReview(m);
}

function renderSleeveBars(m){
  const el = document.getElementById("sleeveBars");
  el.innerHTML = "";
  for(const sl of state.sleeves){
    const a = m.actualPct[sl.name] || 0;
    const t = Number(sl.target||0);
    const d = m.drift[sl.name] || 0;

    const row = document.createElement("div");
    row.className = "bar";

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = sl.name;

    const track = document.createElement("div");
    track.className = "track";

    const fill = document.createElement("div");
    fill.className = "fill";
    fill.style.width = clamp(a,0,100) + "%";
    track.appendChild(fill);

    const tgt = document.createElement("div");
    tgt.className = "target";
    tgt.style.left = clamp(t,0,100) + "%";
    track.appendChild(tgt);

    const delta = document.createElement("div");
    delta.className = "delta " + (Math.abs(d) <= 2 ? "good" : (Math.abs(d) <= 6 ? "warn" : "bad"));
    delta.textContent = (d>=0?"+":"") + d.toFixed(1) + "%";

    row.appendChild(label);
    row.appendChild(track);
    row.appendChild(delta);
    el.appendChild(row);
  }
}

function renderSleeveTable(m){
  const el = document.getElementById("sleeveTable");
  const rows = state.sleeves.map(sl=>{
    const v = m.bySleeve[sl.name] || 0;
    const a = m.actualPct[sl.name] || 0;
    const d = m.drift[sl.name] || 0;
    return { sleeve: sl.name, target: Number(sl.target||0), actual: a, value: v, drift: d };
  });

  el.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Sleeve</th>
          <th class="right">Target</th>
          <th class="right">Actual</th>
          <th class="right">Drift</th>
          <th class="right">Value</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r=>`
          <tr>
            <td>${escapeHtml(r.sleeve)}</td>
            <td class="right nowrap">${pct(r.target)}</td>
            <td class="right nowrap">${pct(r.actual)}</td>
            <td class="right nowrap"><span class="badge" style="border-color:${driftColor(r.drift)}">${(r.drift>=0?"+":"") + r.drift.toFixed(1)}%</span></td>
            <td class="right nowrap">${money(r.value)}</td>
          </tr>`).join("")}
      </tbody>
    </table>
  `;
}

function driftColor(d){
  const a = Math.abs(d);
  if(a <= 2) return "rgba(34,197,94,.45)";
  if(a <= 6) return "rgba(245,158,11,.55)";
  return "rgba(239,68,68,.55)";
}

function renderUpcoming(m){
  const el = document.getElementById("upcomingList");
  if(m.upcoming.length === 0){
    el.innerHTML = `<div class="muted small">No maturities/calls within 120 days. Add a maturity date on positions (e.g., TD ladder).</div>`;
    return;
  }
  el.innerHTML = m.upcoming.map(p=>{
    const d = p.days;
    const when = d < 0 ? `Overdue (${Math.abs(d)}d)` : (d === 0 ? "Today" : `In ${d}d`);
    return `
      <div class="item">
        <div class="top">
          <div>
            <div class="name">${escapeHtml(p.name)}</div>
            <div class="meta">${escapeHtml(p.type)} · ${escapeHtml(p.sleeve)} · ${escapeHtml(p.issuer||"")}</div>
          </div>
          <div class="amt">${money(p.valueNZD)}</div>
        </div>
        <div class="meta">${when} · ${fmtDate(p.maturityDate)}</div>
        ${p.expectedRate ? `<div class="tag">rate ${Number(p.expectedRate).toFixed(2)}% p.a.</div>` : ``}
      </div>
    `;
  }).join("");
}

function renderMonthlyReview(m){
  const actions = [];

  for(const sl of state.sleeves){
    const d = m.drift[sl.name] || 0;
    if(Math.abs(d) >= 6){
      actions.push(`Rebalance: ${sl.name} is ${(d>=0?"+":"") + d.toFixed(1)}% vs target.`);
    }
  }

  if(m.burn && m.runwayMonths !== null && m.runwayMonths < 6){
    actions.push(`Liquidity runway is ${m.runwayMonths.toFixed(1)} months — consider topping up ${state.runway.sleeveName} sleeve.`);
  }else if(!m.burn){
    actions.push(`Set your monthly burn in Settings → Runway to calculate liquidity runway.`);
  }

  for(const p of m.upcoming.slice(0,5)){
    const d = p.days;
    if(d !== null && d <= 30){
      actions.push(`Maturity: ${p.name} (${money(p.valueNZD)}) on ${fmtDate(p.maturityDate)}.`);
    }
  }

  if(actions.length === 0) actions.push("No urgent actions flagged from current data.");

  const lines = [];
  lines.push(`# Monthly Investment Review — ${new Date().toLocaleDateString()}`);
  lines.push("");
  lines.push(`## Sleeve drift`);
  for(const sl of state.sleeves){
    const a = m.actualPct[sl.name] || 0;
    const t = Number(sl.target||0);
    const d = m.drift[sl.name] || 0;
    lines.push(`- ${sl.name}: ${a.toFixed(1)}% (target ${t.toFixed(1)}%, drift ${(d>=0?"+":"") + d.toFixed(1)}%) — ${money(m.bySleeve[sl.name]||0)}`);
  }
  lines.push("");
  lines.push(`## Runway`);
  if(m.burn){
    lines.push(`- Monthly burn: ${money(m.burn)}`);
    lines.push(`- Runway sleeve: ${state.runway.sleeveName} (${money(m.runwayValue)})`);
    lines.push(`- Runway: ${m.runwayMonths === null ? "—" : (m.runwayMonths >= 24 ? "24+ months" : m.runwayMonths.toFixed(1) + " months")}`);
  }else{
    lines.push(`- Not set (add monthly burn in Settings).`);
  }
  lines.push("");
  lines.push(`## Upcoming maturities/calls (next 120 days)`);
  if(m.upcoming.length){
    for(const p of m.upcoming.slice(0,10)){
      lines.push(`- ${fmtDate(p.maturityDate)} (${p.days}d): ${p.name} — ${money(p.valueNZD)} · ${p.sleeve} · ${p.type}`);
    }
  }else{
    lines.push(`- None.`);
  }
  lines.push("");
  lines.push(`## Key actions`);
  for(const a of actions) lines.push(`- [ ] ${a}`);
  lines.push("");
  lines.push(`## Notes`);
  lines.push(`- `);

  const txt = lines.join("\n");
  const ta = document.getElementById("reviewText");
  ta.value = txt;
}

document.getElementById("btnCopyReview").addEventListener("click", async ()=>{
  const ta = document.getElementById("reviewText");
  ta.select();
  ta.setSelectionRange(0, 999999);
  try{
    await navigator.clipboard.writeText(ta.value);
    toast("Copied review text.");
  }catch{
    document.execCommand("copy");
    toast("Copied (fallback).");
  }
});

// Positions
const dlg = document.getElementById("dlgPosition");
const form = document.getElementById("positionForm");
const btnDelete = document.getElementById("btnDelete");
let editingId = null;

document.getElementById("btnAddPosition").addEventListener("click", ()=>openPositionDialog(null));

document.getElementById("search").addEventListener("input", renderPositions);
document.getElementById("filterSleeve").addEventListener("change", renderPositions);
document.getElementById("filterType").addEventListener("change", renderPositions);

function renderPositions(){
  const sleeveOpts = state.sleeves.map(s=>s.name);
  const fs = document.getElementById("filterSleeve");
  fs.innerHTML = `<option value="">All sleeves</option>` + sleeveOpts.map(x=>`<option>${escapeHtml(x)}</option>`).join("");

  const q = (document.getElementById("search").value || "").toLowerCase().trim();
  const sleeve = document.getElementById("filterSleeve").value;
  const type = document.getElementById("filterType").value;

  const rows = (state.positions || []).filter(p=>{
    if(sleeve && p.sleeve !== sleeve) return false;
    if(type && p.type !== type) return false;
    if(q){
      const hay = [p.name,p.issuer,(p.tags||[]).join(","),p.notes].filter(Boolean).join(" ").toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  }).sort((a,b)=> (b.valueNZD||0) - (a.valueNZD||0));

  const el = document.getElementById("positionsTable");
  el.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Sleeve</th>
          <th class="right">Value</th>
          <th class="right">Cost</th>
          <th class="right">P/L</th>
          <th class="nowrap">Maturity</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(p=>{
          const cost = Number(p.costNZD||0);
          const val = Number(p.valueNZD||0);
          const pl = cost ? (val - cost) : null;
          const plTxt = pl === null ? "—" : money(pl);
          const plColor = pl === null ? "" : (pl >= 0 ? "color:rgba(34,197,94,.95)" : "color:rgba(239,68,68,.95)");
          return `
            <tr data-id="${p.id}">
              <td>
                <div style="font-weight:850">${escapeHtml(p.name)}</div>
                <div class="mono">${escapeHtml(p.issuer||"")} · ${(p.tags||[]).slice(0,3).map(t=>"#"+escapeHtml(t)).join(" ")}</div>
              </td>
              <td>${escapeHtml(p.type||"")}</td>
              <td>${escapeHtml(p.sleeve||"")}</td>
              <td class="right nowrap">${money(val)}</td>
              <td class="right nowrap">${cost ? money(cost) : "—"}</td>
              <td class="right nowrap" style="${plColor}">${plTxt}</td>
              <td class="nowrap">${p.maturityDate ? fmtDate(p.maturityDate) : "—"}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;

  el.querySelectorAll("tbody tr").forEach(tr=>{
    tr.addEventListener("click", ()=>{
      const id = tr.getAttribute("data-id");
      const p = state.positions.find(x=>x.id===id);
      if(p) openPositionDialog(p);
    });
  });
}

function openPositionDialog(p){
  editingId = p?.id || null;
  btnDelete.style.display = editingId ? "inline-flex" : "none";
  document.getElementById("dlgTitle").textContent = editingId ? "Edit position" : "Add position";

  const sleeveSelect = form.elements["sleeve"];
  sleeveSelect.innerHTML = state.sleeves.map(s=>`<option>${escapeHtml(s.name)}</option>`).join("");

  form.reset();
  if(p){
    form.elements["name"].value = p.name || "";
    form.elements["sleeve"].value = p.sleeve || state.sleeves[0].name;
    form.elements["type"].value = p.type || "Other";
    form.elements["issuer"].value = p.issuer || "";
    form.elements["value"].value = Number(p.valueNZD||0);
    form.elements["cost"].value = p.costNZD ?? "";
    form.elements["currency"].value = p.currency || "NZD";
    form.elements["maturity"].value = p.maturityDate || "";
    form.elements["rate"].value = p.expectedRate ?? "";
    form.elements["tags"].value = (p.tags || []).join(", ");
    form.elements["notes"].value = p.notes || "";
  }else{
    form.elements["sleeve"].value = state.sleeves[0].name;
    form.elements["type"].value = "Cash";
    form.elements["currency"].value = "NZD";
    form.elements["value"].value = 0;
  }

  dlg.showModal();
}

btnDelete.addEventListener("click", ()=>{
  if(!editingId) return;
  if(confirm("Delete this position?")){
    state.positions = state.positions.filter(p=>p.id !== editingId);
    dlg.close();
    saveState();
  }
});

form.addEventListener("submit", (e)=>{
  e.preventDefault();
  const fd = new FormData(form);
  const obj = {
    id: editingId || uid(),
    name: String(fd.get("name")||"").trim(),
    sleeve: String(fd.get("sleeve")||"").trim(),
    type: String(fd.get("type")||"").trim(),
    issuer: String(fd.get("issuer")||"").trim(),
    valueNZD: Number(fd.get("value")||0),
    costNZD: fd.get("cost")==="" ? null : Number(fd.get("cost")||0),
    currency: String(fd.get("currency")||"NZD").trim(),
    maturityDate: String(fd.get("maturity")||"") || null,
    expectedRate: fd.get("rate")==="" ? null : Number(fd.get("rate")||0),
    tags: String(fd.get("tags")||"").split(",").map(s=>s.trim()).filter(Boolean),
    notes: String(fd.get("notes")||"").trim(),
  };

  if(!obj.name){ alert("Name is required."); return; }

  if(editingId){
    const idx = state.positions.findIndex(p=>p.id===editingId);
    if(idx >= 0) state.positions[idx] = obj;
  }else{
    state.positions.push(obj);
  }
  dlg.close();
  saveState();
});

// CSV Import (minimal CSV parsing; handles quoted fields)
function parseCSV(text){
  const rows = [];
  let i=0, field="", row=[], inQuotes=false;
  while(i < text.length){
    const c = text[i];
    if(inQuotes){
      if(c === '"'){
        if(text[i+1] === '"'){ field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }else{
        field += c; i++; continue;
      }
    }else{
      if(c === '"'){ inQuotes = true; i++; continue; }
      if(c === ','){ row.push(field); field=""; i++; continue; }
      if(c === '\n'){
        row.push(field); field="";
        if(row.length===1 && row[0]===""){ row=[]; i++; continue; }
        rows.push(row); row=[]; i++; continue;
      }
      if(c === '\r'){ i++; continue; }
      field += c; i++;
    }
  }
  row.push(field);
  if(row.some(x=>x!=="" )) rows.push(row);
  return rows;
}

function normalizeHeader(h){
  return String(h||"").trim().toLowerCase().replace(/\s+/g,"_");
}

document.getElementById("csvFile").addEventListener("change", async (e)=>{
  const f = e.target.files?.[0];
  if(!f) return;
  const text = await f.text();
  const rows = parseCSV(text);
  if(rows.length < 2){
    alert("CSV looks empty.");
    return;
  }
  const headers = rows[0].map(normalizeHeader);
  const data = rows.slice(1).map(r=>{
    const obj = {};
    headers.forEach((h,idx)=> obj[h] = (r[idx] ?? "").trim());
    return obj;
  });

  importBuffer = { headers, data };
  renderImport();
  e.target.value = "";
});

function renderImport(){
  const el = document.getElementById("importPreview");
  const status = document.getElementById("importStatus");
  const btn = document.getElementById("btnCommitImport");

  if(!importBuffer){
    el.innerHTML = "";
    status.textContent = "No file loaded.";
    btn.disabled = true;
    return;
  }

  const sample = importBuffer.data.slice(0,25);
  el.innerHTML = `
    <table>
      <thead><tr>${importBuffer.headers.map(h=>`<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
      <tbody>
        ${sample.map(r=>`<tr>${importBuffer.headers.map(h=>`<td>${escapeHtml(r[h]||"")}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `;

  status.textContent = `Loaded ${importBuffer.data.length} rows.`;
  btn.disabled = false;
}

document.getElementById("btnClearImport").addEventListener("click", ()=>{
  importBuffer = null;
  renderImport();
});

function pick(row, keys){
  for(const k of keys){
    const nk = normalizeHeader(k);
    if(row.hasOwnProperty(nk) && row[nk] !== "") return row[nk];
  }
  return null;
}
function num(x){
  if(x===null || x===undefined || x==="") return null;
  const s = String(x).replace(/[^0-9.\-]/g,"");
  if(s==="") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function toISODate(x){
  if(!x) return null;
  const s = String(x).trim();
  if(!s) return null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m){
    const dd = String(m[1]).padStart(2,"0");
    const mm = String(m[2]).padStart(2,"0");
    return `${m[3]}-${mm}-${dd}`;
  }
  const d = new Date(s);
  if(Number.isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}
function coerceSleeve(name){
  const n = String(name||"").trim();
  const found = state.sleeves.find(s=>s.name.toLowerCase()===n.toLowerCase());
  return found ? found.name : (n || "Core Growth");
}
function coerceType(t){
  const v = String(t||"Other").trim();
  const allowed = ["Cash","Term Deposit","Managed Fund","ETF","Shares","Crypto","Private","Other"];
  const found = allowed.find(a=>a.toLowerCase()===v.toLowerCase());
  return found || "Other";
}

document.getElementById("btnCommitImport").addEventListener("click", ()=>{
  if(!importBuffer) return;

  const mode = document.querySelector('input[name="importMode"]:checked').value;
  const rows = importBuffer.data;

  if(mode === "positions"){
    const mapped = rows.map(r=>{
      const name = pick(r, ["name", "position", "asset", "security"]);
      const sleeve = pick(r, ["sleeve", "bucket"]) || "Core Growth";
      const type = pick(r, ["type", "asset_type"]) || "Other";
      const issuer = pick(r, ["issuer", "institution", "provider"]);
      const value = num(pick(r, ["value_nzd","value","market_value","balance","amount"]));
      const cost = num(pick(r, ["cost_nzd","cost","principal","book_value"]));
      const currency = pick(r, ["currency"]) || "NZD";
      const maturity = pick(r, ["maturity_date","maturity","matures","call_date"]);
      const rate = num(pick(r, ["expected_rate","rate","interest_rate"]));
      const tags = (pick(r, ["tags"]) || "").split(",").map(s=>s.trim()).filter(Boolean);
      const notes = pick(r, ["notes","memo","description"]) || "";

      if(!name) return null;
      return {
        id: uid(),
        name,
        sleeve: coerceSleeve(sleeve),
        type: coerceType(type),
        issuer: issuer || "",
        valueNZD: value || 0,
        costNZD: cost ?? null,
        currency,
        maturityDate: toISODate(maturity),
        expectedRate: rate ?? null,
        tags,
        notes
      };
    }).filter(Boolean);

    if(mapped.length === 0){ alert("No rows imported (check headers)."); return; }

    let updated=0, added=0;
    for(const p of mapped){
      const existing = state.positions.find(x=>
        (x.name||"").toLowerCase() === p.name.toLowerCase() &&
        (x.issuer||"").toLowerCase() === (p.issuer||"").toLowerCase()
      );
      if(existing){
        Object.assign(existing, p, { id: existing.id });
        updated++;
      }else{
        state.positions.push(p);
        added++;
      }
    }
    saveState();
    importBuffer = null;
    renderImport();
    alert(`Import complete: ${added} added, ${updated} updated.`);
    return;
  }

  if(mode === "balances"){
    const mapped = rows.map(r=>{
      const account = pick(r, ["account","name"]);
      const sleeve = pick(r, ["sleeve","bucket"]) || "Liquidity";
      const value = num(pick(r, ["value_nzd","value","balance","amount"]));
      const notes = pick(r, ["notes","memo","description"]) || "";
      if(!account) return null;
      return { account, sleeve: coerceSleeve(sleeve), value: value || 0, notes };
    }).filter(Boolean);

    if(mapped.length === 0){ alert("No rows imported (check headers)."); return; }

    let updated=0, added=0;
    for(const a of mapped){
      const name = a.account;
      const existing = state.positions.find(x=>x.type==="Cash" && (x.name||"").toLowerCase()===name.toLowerCase());
      if(existing){
        existing.sleeve = a.sleeve;
        existing.valueNZD = a.value;
        existing.notes = a.notes;
        updated++;
      }else{
        state.positions.push({
          id: uid(),
          name,
          sleeve: a.sleeve,
          type: "Cash",
          issuer: "",
          valueNZD: a.value,
          costNZD: null,
          currency: "NZD",
          maturityDate: null,
          expectedRate: null,
          tags: ["cash"],
          notes: a.notes,
        });
        added++;
      }
    }
    saveState();
    importBuffer = null;
    renderImport();
    alert(`Import complete: ${added} added, ${updated} updated.`);
  }
});

// Settings
function renderSettings(){
  const targets = document.getElementById("targetsForm");
  targets.innerHTML = state.sleeves.map(sl=>`
    <div class="trow">
      <b>${escapeHtml(sl.name)}</b>
      <input class="input" data-sleeve="${escapeHtml(sl.name)}" type="number" inputmode="decimal" step="0.1" value="${Number(sl.target||0)}" />
    </div>
  `).join("");

  const sum = state.sleeves.reduce((a,s)=>a+Number(s.target||0), 0);
  document.getElementById("targetsHint").textContent = `Current total: ${sum.toFixed(1)}%`;

  document.getElementById("monthlyBurn").value = state.runway?.monthlyBurnNZD ?? "";
  const rs = document.getElementById("runwaySleeve");
  rs.innerHTML = state.sleeves.map(s=>`<option>${escapeHtml(s.name)}</option>`).join("");
  rs.value = state.runway?.sleeveName || "Liquidity";
}

document.getElementById("btnSaveTargets").addEventListener("click", ()=>{
  const inputs = Array.from(document.querySelectorAll("#targetsForm input"));
  const next = state.sleeves.map(sl=>{
    const inp = inputs.find(i=>i.getAttribute("data-sleeve")===sl.name);
    return { ...sl, target: Number(inp?.value||0) };
  });
  const sum = next.reduce((a,s)=>a+Number(s.target||0), 0);
  if(Math.abs(sum - 100) > 0.01){
    alert(`Targets must sum to 100%. Current sum: ${sum.toFixed(1)}%`);
    return;
  }
  state.sleeves = next;
  saveState();
  toast("Saved targets.");
});

document.getElementById("btnResetTargets").addEventListener("click", ()=>{
  state.sleeves = structuredClone(DEFAULT_SLEEVES);
  saveState();
  toast("Reset targets.");
});

document.getElementById("btnSaveRunway").addEventListener("click", ()=>{
  const burn = document.getElementById("monthlyBurn").value;
  const sleeveName = document.getElementById("runwaySleeve").value;
  state.runway = { monthlyBurnNZD: burn === "" ? null : Number(burn), sleeveName };
  saveState();
  toast("Saved runway settings.");
});

document.getElementById("btnWipe").addEventListener("click", ()=>{
  if(confirm("Wipe all stored data? This cannot be undone.")){
    localStorage.removeItem(LS_KEY);
    state = structuredClone(DEFAULT_STATE);
    saveState();
    toast("Wiped.");
  }
});

// initial render
function renderAll(){
  document.getElementById("subtitle").textContent = `Updated ${state.updatedAt ? new Date(state.updatedAt).toLocaleString() : "—"}`;
  const active = document.querySelector(".tab.active")?.dataset.view || "overview";
  if(active === "overview") renderOverview();
  if(active === "positions") renderPositions();
  if(active === "import") renderImport();
  if(active === "settings") renderSettings();
}
renderAll();

// Utilities
function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
}

let toastTimer=null;
function toast(msg){
  clearTimeout(toastTimer);
  let el = document.getElementById("toast");
  if(!el){
    el = document.createElement("div");
    el.id = "toast";
    el.style.position="fixed";
    el.style.left="50%";
    el.style.bottom="22px";
    el.style.transform="translateX(-50%)";
    el.style.padding="10px 12px";
    el.style.borderRadius="999px";
    el.style.background="rgba(0,0,0,.75)";
    el.style.border="1px solid rgba(255,255,255,.15)";
    el.style.backdropFilter="blur(8px)";
    el.style.color="white";
    el.style.fontWeight="750";
    el.style.zIndex="9999";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity="1";
  toastTimer = setTimeout(()=>{ el.style.opacity="0"; }, 1700);
}

// Register service worker
if("serviceWorker" in navigator){
  window.addEventListener("load", ()=>{
    navigator.serviceWorker.register("sw.js").catch(err=>console.warn("SW registration failed", err));
  });
}
