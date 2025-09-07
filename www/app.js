// OPD LoggerX – v16 (export-stability patch)
const APP_VERSION = "v16";
const KEY = "opdVisitsV6";

const Genders = ["Male", "Female"];
const AgeLabels = { Under5: "<5", FiveToFourteen: "5-14", FifteenToSeventeen: "15-17", EighteenPlus: "≥18" };
const AgeKeys = Object.keys(AgeLabels);
const WWOpts = ["WW", "NonWW"];
const Dispositions = ["Discharged", "Admitted", "Referred to ED", "Referred out"];

const Diagnoses = [
  [1, "Respiratory Tract Infection", "Medical"],
  [2, "Acute Watery Diarrhea", "Medical"],
  [3, "Acute Bloody Diarrhea", "Medical"],
  [4, "Acute Viral Hepatitis", "Medical"],
  [5, "Other GI Diseases", "Medical"],
  [6, "Scabies", "Medical"],
  [7, "Skin Infection", "Medical"],
  [8, "Other Skin Diseases", "Medical"],
  [9, "Genitourinary Diseases", "Medical"],
  [10, "Musculoskeletal Diseases", "Medical"],
  [11, "Hypertension", "Medical"],
  [12, "Diabetes", "Medical"],
  [13, "Epilepsy", "Medical"],
  [14, "Eye Diseases", "Medical"],
  [15, "ENT Diseases", "Medical"],
  [16, "Other Medical Diseases", "Medical"],
  [17, "Fracture", "Surgical"],
  [18, "Burn", "Surgical"],
  [19, "Gunshot Wound (GSW)", "Surgical"],
  [20, "Other Wound", "Surgical"],
  [21, "Other Surgical", "Surgical"]
];
const DiagByNo = Object.fromEntries(Diagnoses.map(([n, name, cat]) => [n, { name, cat }]));

function loadAll(){ try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch(e){ return []; } }
function saveAll(list){ localStorage.setItem(KEY, JSON.stringify(list)); }
function sortedAll(){ return loadAll().slice().sort((a,b)=>b.timestamp-a.timestamp); }

// selections
let selPID=""; let selGender=null; let selAge=null;
let selDiags=[]; let selWW=null; let selDisp=null;
let editUid=null;

// DOM refs
let pidDisplay, pidStatus, err; let scrNew, scrSum, scrData;

window.initOPD = function initOPD(){
  const vEl = document.getElementById("version");
  if (vEl) vEl.textContent = " " + APP_VERSION;

  pidDisplay = document.getElementById("pid-display");
  pidStatus  = document.getElementById("pid-status");
  err        = document.getElementById("error");
  scrNew     = document.getElementById("screen-new");
  scrSum     = document.getElementById("screen-summary");
  scrData    = document.getElementById("screen-data");

  const _nn=document.getElementById('nav-new'); if(_nn) _nn.onclick=()=>showScreen('new');
  const _ns=document.getElementById('nav-summary'); if(_ns) _ns.onclick=()=>{ showScreen('summary'); renderSummary(); };
  const _nd=document.getElementById('nav-data'); if(_nd) _nd.onclick=()=>{ showScreen('data'); renderTable(); };

  document.querySelectorAll(".k").forEach(btn => btn.onclick = onKeypad);

  const saveNewBtn = document.getElementById("save-new"); if (saveNewBtn) saveNewBtn.onclick = () => onSave(true);
  const updateBtn  = document.getElementById("update");  if (updateBtn)  updateBtn.onclick  = onUpdate;
  const cancelBtn  = document.getElementById("cancel-edit"); if (cancelBtn) cancelBtn.onclick = cancelEdit;
  const resetBtn   = document.getElementById("reset");   if (resetBtn)   resetBtn.onclick   = resetForm;

  // Export buttons with debounce
  const ecsv = document.getElementById("export-csv");
  const exls = document.getElementById("export-xls");
  if (ecsv) ecsv.onclick = debounce(() => downloadCSV(sortedAll()));
  if (exls) exls.onclick = debounce(() => downloadXLS(sortedAll()));

  const bjson = document.getElementById("backup-json"); if (bjson) bjson.onclick = () => downloadJSON(sortedAll());
  const rbtn  = document.getElementById("restore-btn");
  const rfile = document.getElementById("restore-json");
  if (rbtn && rfile){ rbtn.onclick = () => rfile.click(); rfile.onchange = restoreJSON; }
  const clear = document.getElementById("clear-all"); if (clear) clear.onclick = clearAll;

  buildSelectors();
  updatePID();
  showScreen("new");
};

function showScreen(name){
  scrNew.style.display = (name==="new")?"":"none";
  scrSum.style.display = (name==="summary")?"":"none";
  scrData.style.display = (name==="data")?"":"none";
}

// ... [unchanged selectors, keypad, save/update/edit, summary, data-table code here] ...

/* ===== Helpers for reliability ===== */
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function debounce(fn, ms=350){
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
function isNative(){
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}
function toBase64Chunked(str){
  const utf8 = unescape(encodeURIComponent(str));
  const chunkSize = 0x8000;
  let result = "";
  for (let i = 0; i < utf8.length; i += chunkSize) {
    result += btoa(utf8.slice(i, i + chunkSize));
  }
  return result;
}

/* Robust save + share with retries */
async function saveAndShareNative(filename, mime, base64Data){
  const Cap = window.Capacitor;
  const FS = Cap && (Cap.Filesystem || Cap.Plugins?.Filesystem);
  const Share = Cap && (Cap.Share || Cap.Plugins?.Share);
  if (!FS) return;

  const ts = new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);
  const safeName = filename.replace(/(\.[a-z0-9]+)$/i, `_${ts}$1`);

  await FS.writeFile({ path: safeName, data: base64Data, directory: FS.Directory.Cache, recursive: true });

  let uri=null;
  for(let i=0;i<3;i++){
    try{
      const res = await FS.getUri({ path: safeName, directory: FS.Directory.Cache });
      uri = res?.uri; if(uri) break;
    }catch(e){}
    await sleep(150+i*150);
  }

  if(uri && Share){
    try{ await Share.share({ title:`Export ${filename}`, text:`Exported ${filename}`, url:uri }); return; }
    catch(e){ console.warn("Share failed:",e); }
  }

  // Fallback: Downloads
  try{
    const dlPath=`Download/${safeName}`;
    await FS.writeFile({ path: dlPath, data: base64Data, directory: FS.Directory.ExternalStorage, recursive: true });
    const res=await FS.getUri({ path: dlPath, directory: FS.Directory.ExternalStorage });
    if(res?.uri && Share) await Share.share({ title:`Export ${filename}`, text:"Saved to Downloads", url:res.uri });
  }catch(e2){ console.error("Fallback failed:",e2); }
}

/* ---------- Export CSV ---------- */
async function downloadCSV(list){
  const header=["timestamp","patient_id","gender","age_group","diagnosis_nos","diagnosis_names","clinical_category","ww_flag","disposition"];
  const rows=[header].concat(list.map(v=>[
    v.timestamp,v.patientId||"",v.gender,v.ageLabel||"",
    v.diagnosisNoStr||(Array.isArray(v.diagnosisNos)?v.diagnosisNos.join("+"):(v.diagnosisNo??"")),
    v.diagnosisNameStr||(Array.isArray(v.diagnosisNames)?v.diagnosisNames.join(" + "):(v.diagnosisName??"")),
    v.clinicalCategory||"",v.wwFlag||"NA",v.disposition||""
  ]));
  const csv=rows.map(r=>r.map(x=>(""+x).replace(/,/g,";")).join(",")).join("\n");
  const filename=`OPD_${new Date().toISOString().slice(0,10)}.csv`;

  if(isNative()){ await sleep(50); await saveAndShareNative(filename,"text/csv;charset=utf-8",toBase64Chunked(csv)); }
  else { const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=filename; a.click(); URL.revokeObjectURL(a.href); }
}

/* ---------- Export Excel ---------- */
async function downloadXLS(list){
  const header=["timestamp","patient_id","gender","age_group","diagnosis_nos","diagnosis_names","clinical_category","ww_flag","disposition"];
  const rows=list.map(v=>[
    v.timestamp,v.patientId||"",v.gender,v.ageLabel||"",
    v.diagnosisNoStr||(Array.isArray(v.diagnosisNos)?v.diagnosisNos.join("+"):(v.diagnosisNo??"")),
    v.diagnosisNameStr||(Array.isArray(v.diagnosisNames)?v.diagnosisNames.join(" + "):(v.diagnosisName??"")),
    v.clinicalCategory||"",v.wwFlag||"NA",v.disposition||""
  ]);
  const esc=s=>String(s).replace(/[<&>]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]));
  let table='<table border="1"><tr>'+header.map(h=>`<th>${esc(h)}</th>`).join('')+'</tr>';
  rows.forEach(r=>{ table+='<tr>'+r.map(x=>`<td>${esc(x)}</td>`).join('')+'</tr>'; }); table+='</table>';
  const workbookHTML=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>${table}</body></html>`;
  const filename=`OPD_${new Date().toISOString().slice(0,10)}.xls`;

  if(isNative()){ await sleep(50); await saveAndShareNative(filename,"application/vnd.ms-excel;charset=utf-8",toBase64Chunked(workbookHTML)); }
  else { const blob=new Blob([workbookHTML],{type:"application/vnd.ms-excel;charset=utf-8"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url); }
}

// ... [backup/restore/clear functions here, unchanged] ...
