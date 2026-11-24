/* NextOffer Internship Finder 1.0 — public job feed, private per-user reviews.
   No paid API, browser automation, secret keys, or implied submissions. */
(()=>{
  'use strict';
  const FEED='https://raw.githubusercontent.com/Harshini118/internshiptracker/main/jobs/feed.json';
  const LOCAL='./jobs/feed.json';
  const FILTERS=['all','spring','summer'];
  const CATS=[['all','All relevant roles'],['analytics','Data / Business Analytics'],['bi','Business Intelligence'],['ds','Data Science / ML'],['product','Product / PM'],['tpm','TPM / Project'],['ops','Operations / Strategy']];
  const SKILLS=[
    ['SQL',/\bsql\b|postgres|bigquery|snowflake|redshift|sql server/i],
    ['Python',/\bpython\b|\bpandas\b|numpy/i],['Excel',/\bexcel\b|spreadsheets?/i],
    ['Power BI',/power\s*bi|\bdax\b/i],['Tableau',/\btableau\b/i],
    ['BigQuery',/bigquery|google cloud data warehouse/i],['A/B Testing',/a\/b testing|experimentation|randomized experiment/i],
    ['Statistics',/statistics?|hypothesis testing|confidence interval|significance/i],
    ['Forecasting',/forecasting|predictive model|time series/i],
    ['ETL',/\betl\b|data pipelines?|data engineering/i],
    ['Data Visualization',/visuali[sz]ation|dashboards?|reporting/i],
    ['Product Analytics',/product analytics?|cohort|funnel|retention/i],
    ['PRD',/\bprd\b|product requirements?|requirements document/i],
    ['Stakeholder Management',/stakeholders?|cross.functional collaboration/i],
    ['Project Management',/project management|program management|project milestones?|critical path/i],
    ['Notion',/\bnotion\b/i],['Jira',/\bjira\b/i],['Figma',/\bfigma\b/i],
    ['React',/\breact\b/i],['TypeScript',/typescript/i],['REST APIs',/rest\s*api|\bapi\s+integration/i],
    ['Machine Learning',/machine learning|\bml\b|scikit.learn/i],
    ['Customer Research',/user research|customer research|user interviews?/i],
    ['Financial Analysis',/financial analy|budgeting|capital expenditure|cash flow/i],
    ['Communication',/communication|executive presentation|presentations?/i]
  ];
  let feed={jobs:[],generated_at:null,source_status:{}},loading=false,error='',syncedAt='';
  let search='',selected=null,showOnlyFresh=false,showOnlySaved=false,terms='all',category='all',minScore=70;
  let lastFeedSignature='',requestBusy=false;
  const local=new Set();
  function E(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function jobState(){if(!state.jobFinder || typeof state.jobFinder!=='object')state.jobFinder={};
    const j=state.jobFinder;
    if(!j.status)j.status={}; if(!j.jd)j.jd={}; if(!j.profile)j.profile=null;
    if(!j.settings)j.settings={notify:false,notifyScore:82,profileImported:false};
    if(!Array.isArray(j.seenIds))j.seenIds=[]; if(!Array.isArray(j.readIds))j.readIds=[];
    return j;
  }
  function persistReview(){const j=jobState(); if(j.seenIds.length>3500)j.seenIds=j.seenIds.slice(-3500); if(j.readIds.length>3500)j.readIds=j.readIds.slice(-3500); save();}
  function isoTime(s){try{let d=new Date(s);return isNaN(d)?'Not provided':d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}catch{return 'Unknown'}}
  function catFor(j){let t=j.title.toLowerCase();
    if(/technical program|tpm|project manag|program manag|project coordina/.test(t))return 'tpm';
    if(/product manag|product owner|product strategy|product operations/.test(t))return 'product';
    if(/business intelligence|\bbi\b/.test(t))return 'bi';
    if(/data scientist|data science|machine learning|\bml\b/.test(t))return 'ds';
    if(/operations|strategy|supply chain|financial analyst|planning/.test(t))return 'ops';
    return 'analytics';
  }
  function roleFit(j){let t=j.title.toLowerCase();
    if(/product analytics|product data analy/.test(t))return 91;
    if(/business intelligence|\bbi\b/.test(t))return 91;
    if(/data analy|business analy|analytics intern|insights intern|reporting analy/.test(t))return 90;
    if(/data science|data scientist/.test(t))return 83;
    if(/product manag/.test(t))return 81;
    if(/technical program|tpm/.test(t))return 81;
    if(/project manag|program manag|product operations/.test(t))return 77;
    if(/operations|strategy|financial analyst|supply chain/.test(t))return 73;
    return 65;
  }
  function kw(text){return SKILLS.filter(([,rx])=>rx.test(text)).map(([n])=>n)}
  function score(j){
    const usr=jobState(), jd=usr.jd?.[j.id]||'', profile=usr.profile;
    const titleScore=roleFit(j);
    const terms=kw(jd), known=(profile?.skills||[]).map(x=>String(x).toLowerCase());
    const matches=terms.filter(x=>known.includes(x.toLowerCase()));
    const gaps=terms.filter(x=>!known.includes(x.toLowerCase()));
    // Full-JD compatibility is a transparent heuristic, not an ATS prediction.
    let v=titleScore;
    if(jd.trim().length>150 && profile && terms.length){v=Math.round(0.60*titleScore+0.40*(100*matches.length/terms.length));}
    if(/\bphd|ph\.d|doctoral|masters only|master.s degree required/i.test(j.title+' '+jd))v-=18;
    if(/\b20(29|30|31)\b/.test(j.title))v-=12;
    if(j.term==='Spring / off-cycle')v+=3;
    return {value:Math.min(98,Math.max(20,Math.round(v))),matches,gaps,level:profile?(jd.length>150?'JD + profile estimate':'Title-only estimate (profile imported)'):'Title-based estimate only',hasJD:jd.length>150,hasProfile:!!profile};
  }
  function roleAdvice(j){
    const c=catFor(j);
    if(c==='bi'||c==='analytics')return 'Lead with SQL, operational dashboards, your deployed 65+ stakeholder analytics platform, and quantified KPI/reporting outcomes. Include CampaignLift for experimentation-heavy JDs.';
    if(c==='ds')return 'Lead with forecasting performance (R² > 0.78), CampaignLift experimental design, and RecipeRank NDCG@10 lift. Explain validation and business impact.';
    if(c==='product')return 'Lead with early-stage Develop for Good PRDs, five user groups, client feedback, and the shipped CPM analytics product. Do not claim the DfG app has launched.';
    if(c==='tpm')return 'Lead with documented PRDs, Notion task coordination, biweekly stakeholder reviews, project visibility, and technical integration planning. Do not invent blocker escalation experience.';
    return 'Lead with CPM cost/spending analysis (14+ years, ~200 projects), dashboards, stakeholder reporting, and evidence-based operational recommendations.';
  }
  function link(url,label,extra=''){let u=String(url||'');if(!/^https?:\/\//i.test(u))return E(label);return `<a href="${E(u)}" target="_blank" rel="noopener noreferrer" ${extra}>${E(label)}</a>`;}
  function normalizeJob(j){return j&&j.id&&j.title&&j.company&&/^https?:\/\//.test(j.url||'')}
  function isNew(j){let s=jobState();return !s.readIds.includes(j.id)}
  function status(j){return jobState().status[j.id]||'new'}
  function rows(){let a=(feed.jobs||[]).filter(normalizeJob).map(j=>({...j,fit:score(j),cat:catFor(j)}));
    return a.filter(j=>{
      if(terms==='spring' && j.term!=='Spring / off-cycle')return false;
      if(terms==='summer' && j.term!=='Summer')return false;
      if(category!=='all' && j.cat!==category)return false;
      if(j.fit.value<minScore)return false;
      if(showOnlyFresh&&!isNew(j))return false;
      if(showOnlySaved&&!['saved','approved','started','submitted'].includes(status(j)))return false;
      if(status(j)==='dismissed')return false;
      if(search && !`${j.title} ${j.company} ${j.location} ${j.source}`.toLowerCase().includes(search.toLowerCase()))return false;
      return true;
    }).sort((a,b)=> (status(a)==='approved'?1:0) === (status(b)==='approved'?1:0) ?
      b.fit.value-a.fit.value || (b.posted_at||'').localeCompare(a.posted_at||'') : (status(a)==='approved'?-1:1));
  }
  function stateBadge(j){const s=status(j);return {new:'New',saved:'Saved',approved:'Approved',started:'Opened • verify',submitted:'Marked submitted',dismissed:'Hidden'}[s]||s;}
  function eligibilityNotice(j){const q=(jobState().jd[j.id]||'');
    if(/\b(phd|ph\.d|doctoral|masters only)\b/i.test(j.title+' '+q))return 'Possible degree mismatch. Verify eligibility.';
    if(/work authorization|sponsorship|citizenship|visa|right to work|co-op program|must be enrolled/i.test(q))return 'Check work authorization, enrollment and co-op term in the original posting.';
    return 'Graduation eligibility, hours and work authorization not verified from board metadata.';
  }
  function cards(list){return list.map(j=>`<article class="nf-job"><div class="nf-top"><div><strong>${E(j.title)}</strong><p>${E(j.company)} · ${E(j.location)}</p></div><div class="nf-fit"><b>${j.fit.value}</b><small>fit estimate</small></div></div><div class="nf-chips"><span class="nf-chip">${E(j.term)}</span><span class="nf-chip">${E(stateBadge(j))}</span><span class="nf-chip">${E(j.source)}</span>${isNew(j)?'<span class="nf-chip nf-new">NEW</span>':''}${j.stale?'<span class="nf-chip">Source temporarily unavailable</span>':''}</div><p class="nf-note">${E(j.fit.level)} · ${E(eligibilityNotice(j))}</p><div class="nf-actions"><button class="btn secondary" data-nf="review" data-id="${E(j.id)}">Review fit + resume</button><button class="btn secondary" data-nf="save" data-id="${E(j.id)}">${status(j)==='saved'?'Saved ✓':'Save'}</button>${link(j.url,'View job posting','class="nf-link"')}</div></article>`).join('');}
  function detail(j){const o=score(j), s=jobState(), note=s.jd[j.id]||'', record=s.status[j.id]||'new';
    const skills=o.hasJD ? `<div class="nf-split"><div><h4>JD keywords supported by your profile</h4><p>${o.matches.length?o.matches.map(E).join(', '):'None detected or verified yet.'}</p></div><div><h4>Not yet evidenced in your profile</h4><p>${o.gaps.length?o.gaps.map(E).join(', '):'No keyword gaps detected from the available JD text.'}</p><small>Not evidenced does not mean you lack the skill. Add proof only when accurate.</small></div></div>` : '<p class="nf-note">Paste the complete job description below for a more useful gap analysis. GitHub lists usually include only job titles, not requirements.</p>';
    return `<section class="nf-panel"><div class="nf-top"><div><h3>${E(j.title)}</h3><p>${E(j.company)} · ${E(j.location)} · ${E(j.term)}</p></div><button class="btn secondary" data-nf="close">Close</button></div><div class="nf-chips"><span class="nf-chip">${o.value}/100 heuristic fit</span><span class="nf-chip">${E(o.level)}</span><span class="nf-chip">${E(stateBadge(j))}</span></div><p class="nf-note"><strong>Eligibility:</strong> ${E(eligibilityNotice(j))}</p><h4>Recommended resume emphasis</h4><p>${E(roleAdvice(j))}</p>${!s.profile?'<div class="nf-warning"><strong>Import your private verified resume profile</strong> to compare job requirements against your real experience; until then, scores are title-based only.</div>':''}<div class="nf-field"><label for="nf-jd">Paste the FULL job description (private to your NextOffer progress)</label><textarea id="nf-jd" rows="5" maxlength="20000" placeholder="Paste requirements, graduation window, authorization, responsibilities ...">${E(note)}</textarea><button class="btn secondary" data-nf="savejd" data-id="${E(j.id)}">Save JD + recalculate fit</button></div>${skills}<div class="nf-actions"><button class="btn secondary" data-nf="prompt" data-id="${E(j.id)}">Copy truthful tailoring prompt</button><button class="btn secondary" data-nf="approve" data-id="${E(j.id)}">${record==='approved'?'Approved ✓':'Approve to apply'}</button></div><div class="nf-actions">${record==='approved'||record==='started'||record==='submitted'?`<button class="btn primary" data-nf="open" data-id="${E(j.id)}">Open employer application ↗</button>`:'<button class="btn secondary" disabled title="Approve the job first">Approve before opening</button>'}<button class="btn secondary" data-nf="submitted" data-id="${E(j.id)}" ${record==='started'||record==='submitted'?'':'disabled'}>Mark submitted (after confirmation)</button>${link(j.url,'Source link')}</div><p class="nf-note"><strong>OpenApply / Simplify:</strong> OpenApply can fill supported forms in its local browser; Simplify's free extension can autofill in your browser. Neither is directly invoked by NextOffer yet. Opening a link is never counted as a submission.</p></section>`;
  }
  function view(){let j=jobState(),list=rows(),newHigh=(feed.jobs||[]).filter(k=>normalizeJob(k)&&isNew(k)&&score(k).value>=j.settings.notifyScore).length;
    return `<div class="nf-wrap"><div class="nf-hero"><div><div class="eyebrow">NEXT OFFER / LIVE DISCOVERY</div><h1>Internship Finder</h1><p>Free GitHub-board scanner · estimated fit and resume gap review · explicit application approval.</p></div><div class="nf-refresh"><strong>${feed.total||0}</strong><small>indexed matches</small><button class="btn secondary" data-nf="refresh" ${loading?'disabled':''}>${loading?'Checking…':'Refresh feed'}</button></div></div><div class="nf-statrow"><div class="nf-stat"><small>Last cloud scan</small><b>${E(isoTime(feed.generated_at))}</b></div><div class="nf-stat"><small>Potentially new high matches</small><b>${newHigh}</b></div><div class="nf-stat"><small>Approval queue</small><b>${Object.values(j.status).filter(v=>v==='approved').length}</b></div></div>${error?`<div class="nf-warning">${E(error)}</div>`:''}${!feed.jobs.length?'<div class="nf-warning"><strong>No live jobs in the feed yet.</strong> Upload the files and run the “NextOffer internship scan” GitHub Action once. This dashboard deliberately does not invent placeholder jobs.</div>':''}<div class="nf-toolbar"><label>Term <select id="nf-term"><option value="all" ${terms==='all'?'selected':''}>Spring + Summer</option><option value="spring" ${terms==='spring'?'selected':''}>Spring / co-op</option><option value="summer" ${terms==='summer'?'selected':''}>Summer 2027</option></select></label><label>Track <select id="nf-cat">${CATS.map(([v,l])=>`<option value="${v}" ${category===v?'selected':''}>${E(l)}</option>`).join('')}</select></label><label>Minimum fit <select id="nf-min">${[55,65,70,75,80,85,90].map(x=>`<option value="${x}" ${minScore===x?'selected':''}>${x}+</option>`).join('')}</select></label><form id="nf-search-form"><label>Find company/role <input id="nf-search" placeholder="SQL, co-op, company..." value="${E(search)}"></label><button class="btn secondary" type="submit">Search</button></form></div><div class="nf-actions"><label class="nf-checkbox"><input type="checkbox" id="nf-fresh" ${showOnlyFresh?'checked':''}> New since your first view</label><label class="nf-checkbox"><input type="checkbox" id="nf-saved" ${showOnlySaved?'checked':''}> Saved / approved only</label><button class="btn secondary" data-nf="markreadall">Mark all seen</button></div><div class="nf-split"><div><h3>Matched jobs (${list.length})</h3><p class="nf-note">Fit values are transparent heuristics, <strong>not ATS scores</strong>. Open employer listings to check dates and eligibility.</p></div><div class="nf-side"><h3>Notifications</h3><p class="nf-note">Desktop alerts for newly discovered ${j.settings.notifyScore}+ matches while this tab/browser runs and notification permission is granted.</p><button class="btn secondary" data-nf="notify">${j.settings.notify?'Notifications enabled ✓':'Enable desktop alerts'}</button><button class="btn secondary" data-nf="test-notify">Test alert</button><h3>Private resume profile</h3><p class="nf-note">${j.profile?'Verified profile imported ✓':'Import PRIVATE_PROFILE_IMPORT.json locally; do not upload it to a public GitHub repo.'}</p><input type="file" accept="application/json,.json" id="nf-profile" aria-label="Import verified resume profile"><small>Your imported profile and saved JDs are kept in your NextOffer account state when cloud sync is enabled.</small></div></div>${selected&&feed.jobs.find(k=>k.id===selected)?detail(feed.jobs.find(k=>k.id===selected)) : ''}<div class="nf-grid">${cards(list.slice(0,90))||'<div class="nf-warning">No matches for these filters. Try lowering the minimum score or selecting all tracks.</div>'}</div>${list.length>90?`<p class="nf-note">Displaying the top 90 of ${list.length} matches. Narrow filters to see more.</p>`:''}<p class="nf-note">Sources: ${Object.entries(feed.source_status||{}).map(([k,v])=>`${E(k)} (${v.status==='ok'?'OK':'temporarily unavailable'})`).join(' · ')}. The scanner aims to run every 3 hours; GitHub schedule delays are possible.</p></div>`;
  }
  async function copy(text){try{await navigator.clipboard.writeText(text); showToast('Copied to clipboard.');}catch{window.prompt('Copy the following:',text)}}
  function makePrompt(j){const stateJ=jobState(), detail=stateJ.jd[j.id]||'', p=stateJ.profile;
    return `Tailor my existing ONE-PAGE resume to this internship using Google XYZ bullets. Preserve my original Computer Modern serif resume layout, headings, and dates. Use ONLY these verified facts; never invent numbers, tools, timelines, responsibilities, releases, or work authorization. Do not say my Develop for Good registration app launched, and do not claim any measured registration-time improvement. Keep no more than 3 bullets per role. Produce a clear gap analysis of supported vs unsupported JD requirements and explain the strongest 3 evidence points.\n\nJOB: ${j.title} at ${j.company}\nLOCATION: ${j.location}\nURL: ${j.url}\nJOB DESCRIPTION: ${detail||'[PASTE FULL JD BEFORE REQUESTING A PDF]'}\n\nVERIFIED PROFILE:\n${p?JSON.stringify(p.experience||[],null,2):'[ATTACH MY VERIFIED CURRENT RESUME; DO NOT INFER EXPERIENCE FROM JOB TITLES]'}\n\nSKILLS: ${p?(p.skills||[]).join(', '):'[ATTACH VERIFIED SKILLS]'}\n\nMake no claims about eligibility without the full job description and my confirmed work authorization.`;
  }
  function alerts(jobs){const s=jobState(),all=jobs.filter(normalizeJob),seen=new Set(s.seenIds), fresh=all.filter(x=>!seen.has(x.id));
    if(!s.seenIds.length){s.seenIds=all.map(x=>x.id).slice(-3500);s.readIds=Array.from(new Set([...s.readIds,...s.seenIds])).slice(-3500);persist();return;}
    s.seenIds=Array.from(new Set([...s.seenIds,...all.map(x=>x.id)])).slice(-3500);
    if(fresh.length)persist();
    if(!s.settings.notify || !s.profile || !('Notification' in window) || Notification.permission!=='granted' || !fresh.length)return;
    const hit=fresh.filter(x=>score(x).value>=s.settings.notifyScore);
    if(!hit.length)return;
    try{const n=new Notification(`NextOffer: ${hit.length} new internship match${hit.length>1?'es':''}`,{body:hit.slice(0,2).map(x=>`${x.company} — ${x.title}`).join(' | '),tag:'nextoffer-matches'});n.onclick=()=>{window.focus();go('finder')}}catch(e){console.warn('Notification unavailable',e)}
  }
  async function fetchFeed(force=false){if(requestBusy)return;
    requestBusy=true;loading=true;
    let data=null;error='';
    const stamp=Math.floor(Date.now()/300000);
    for(const url of [`${FEED}?v=${stamp}`,`${LOCAL}?v=${stamp}`]){
      try{const response=await fetch(url,{cache:'no-store',mode:'cors'});if(!response.ok)throw new Error('HTTP '+response.status);
        const json=await response.json();if(!Array.isArray(json.jobs))throw new Error('Missing jobs array');data=json;break;
      }catch(e){error='Feed not reachable yet. Upload files and run the GitHub Action once.';}
    }
    if(data){
      feed=data;error='';const sig=(feed.generated_at||'')+'|'+(feed.total||0);
      if(sig!==lastFeedSignature){alerts(feed.jobs);lastFeedSignature=sig;}
      syncedAt=new Date().toISOString();
    }
    requestBusy=false;loading=false;
    if(typeof page!=='undefined'&&page==='finder')render();
  }
  async function eventAction(action,id){const s=jobState(),j=(feed.jobs||[]).find(x=>x.id===id);
    if(action==='refresh'){void fetchFeed(true);return}
    if(action==='markreadall'){s.readIds=Array.from(new Set([...(s.readIds||[]),...(feed.jobs||[]).map(x=>x.id)])).slice(-3500);persistReview();return}
    if(action==='close'){selected=null;render();return}
    if(action==='notify'){
      if(!('Notification' in window)){alert('Desktop notifications are not supported in this browser.');return}
      if(Notification.permission!=='granted'){
        const perm=await Notification.requestPermission();if(perm!=='granted'){alert('Allow notifications in browser settings to enable alerts.');return}
      }
      s.settings.notify=!s.settings.notify;persistReview();return;
    }
    if(action==='test-notify'){
      if(!('Notification' in window)||Notification.permission!=='granted'){alert('Enable notifications first.');return}
      new Notification('NextOffer notification test',{body:'You will see alerts for new matching jobs while NextOffer remains open.'});return;
    }
    if(!j)return;
    if(action==='review'){selected=id;if(!s.readIds.includes(id)){s.readIds.push(id);persistReview()}else render();document.querySelector('.nf-panel')?.scrollIntoView({behavior:'smooth',block:'start'});return}
    if(action==='save'){s.status[id]=s.status[id]==='saved'?'new':'saved';persistReview();return}
    if(action==='savejd'){const jd=document.querySelector('#nf-jd')?.value||'';s.jd[id]=jd.trim().slice(0,20000);persistReview();return}
    if(action==='prompt'){void copy(makePrompt(j));return}
    if(action==='approve'){s.status[id]='approved';persistReview();return}
    if(action==='open'){
      if(!['approved','started','submitted'].includes(s.status[id])){alert('Approve the role first.');return}
      const u=j.url;if(!/^https?:\/\//.test(u))return;
      const win=window.open(u,'_blank');
      if(win===null){alert('Pop-up blocked. Use the original posting link above, then return to this review.');return}
      try{win.opener=null}catch(e){}
      if(s.status[id]!=='submitted')s.status[id]='started';persistReview();return;
    }
    if(action==='submitted'){
      if(!['started','submitted'].includes(s.status[id]))return;
      if(!confirm('Only mark as submitted if you received an employer confirmation or verified the submission. Did you submit it?'))return;
      s.status[id]='submitted';persistReview();return;
    }
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-nf]');if(!b)return;
    e.preventDefault();void eventAction(b.dataset.nf,b.dataset.id);
  });
  document.addEventListener('change',e=>{
    const x=e.target;
    if(x.id==='nf-term'){terms=FILTERS.includes(x.value)?x.value:'all';render()}
    if(x.id==='nf-cat'){category=CATS.some(y=>y[0]===x.value)?x.value:'all';render()}
    if(x.id==='nf-min'){minScore=Number(x.value)||70;render()}
    if(x.id==='nf-fresh'){showOnlyFresh=x.checked;render()}
    if(x.id==='nf-saved'){showOnlySaved=x.checked;render()}
    if(x.id==='nf-profile'){
      const f=x.files?.[0];if(!f)return;
      if(f.size>100000){alert('Profile must be below 100KB.');return}
      f.text().then(t=>{
        let x=JSON.parse(t);
        if(!Array.isArray(x.skills)||!Array.isArray(x.experience)||x.skills.length<2)throw Error('Profile must contain skills[] and experience[]');
        const safe={version:1,skills:x.skills.map(z=>String(z).slice(0,70)).slice(0,100),experience:x.experience.slice(0,30).map(z=>({label:String(z.label||'').slice(0,200),statement:String(z.statement||'').slice(0,1200),tags:(z.tags||[]).map(String).slice(0,40)})),graduation:String(x.graduation||'').slice(0,100),notes:String(x.notes||'').slice(0,1000)};
        jobState().profile=safe;persistReview();showToast('Private verified resume profile imported.');
      }).catch(err=>alert('Could not import: '+err.message));
    }
  });
  document.addEventListener('submit',e=>{if(e.target.id!=='nf-search-form')return;e.preventDefault();search=document.getElementById('nf-search')?.value.trim()||'';render()});
  const css=document.createElement('style');css.textContent=`
    .nf-wrap{max-width:1100px}.nf-hero{background:#172b3c;color:#fff;border-radius:20px;padding:25px;display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:16px}.nf-hero h1{font:700 30px 'Space Grotesk';margin:4px 0 8px}.nf-hero p{font-size:13px;color:#c5d6df;max-width:590px}.nf-refresh{text-align:right;display:flex;align-items:center;flex-direction:column;gap:4px}.nf-refresh strong{font:700 32px 'Space Grotesk'}.nf-refresh small{font-size:11px;color:#c5d6df}.nf-statrow{display:grid;grid-template-columns:repeat(3,1fr);gap:11px;margin-bottom:15px}.nf-stat{background:#fff;border:1px solid #e3e9e6;padding:14px;border-radius:13px}.nf-stat small{color:#677986;display:block;font-size:10px;text-transform:uppercase;letter-spacing:.04em}.nf-stat b{font-size:18px}.nf-toolbar{display:flex;flex-wrap:wrap;gap:8px;background:#fff;padding:12px;border:1px solid #e3e9e6;border-radius:13px;align-items:end}.nf-toolbar label,.nf-field label{font-size:11px;font-weight:700;color:#3c4e5b;display:grid;gap:3px}.nf-toolbar input,.nf-toolbar select,.nf-field textarea{padding:9px;border:1px solid #d5dedb;border-radius:8px;background:#fff;font-size:12px;max-width:100%}.nf-toolbar form{display:flex;align-items:end;gap:8px;flex:1}.nf-toolbar form label{flex:1}.nf-checkbox{display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer}.nf-wrap .nf-actions{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin:10px 0}.nf-wrap .nf-actions .btn{font-size:12px}.nf-wrap .nf-link{font-size:12px;color:#2a6279;font-weight:700}.nf-wrap h3{font:700 17px 'Space Grotesk';margin:12px 0 4px}.nf-wrap h4{font-size:12px;margin:10px 0 3px}.nf-note{font-size:11px!important;color:#71818e;line-height:1.5}.nf-split{display:grid;grid-template-columns:2fr 1fr;gap:14px;align-items:start;margin-top:16px}.nf-side,.nf-panel{background:white;padding:16px;border:1px solid #e3e9e6;border-radius:14px}.nf-side p{margin-top:5px}.nf-side input[type=file]{font-size:11px;width:100%}.nf-side small{font-size:10px;color:#687d8c;line-height:1.4}.nf-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:18px 0}.nf-job{background:white;border:1px solid #e3e9e6;border-radius:14px;padding:16px;min-width:0}.nf-job p{margin:5px 0}.nf-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.nf-top strong{font-size:14px}.nf-top p{font-size:12px;color:#6e808c}.nf-fit{text-align:center;border-radius:10px;background:#eff9df;color:#284927;padding:5px 9px;min-width:66px}.nf-fit b{font-size:20px;display:block}.nf-fit small{font-size:9px;line-height:1}.nf-chips{display:flex;flex-wrap:wrap;gap:5px;margin:9px 0}.nf-chip{font-size:10px;color:#405666;background:#f0f4f5;padding:4px 7px;border-radius:30px}.nf-new{background:#e7f5cc;color:#345319}.nf-panel{margin-top:16px;border:2px solid #b8d99a}.nf-panel p{font-size:13px}.nf-field{margin:12px 0}.nf-field textarea{display:block;width:100%;margin:5px 0 8px;min-height:115px}.nf-warning{border:1px solid #e2d3a6;background:#fff9e5;padding:13px;border-radius:10px;font-size:12px;line-height:1.5;margin:12px 0}.nf-panel .nf-split{grid-template-columns:1fr 1fr}.nf-panel .nf-split p{font-size:12px}.nf-panel .nf-split small{font-size:10px;color:#667}.nf-wrap .btn:disabled{opacity:.4;cursor:not-allowed}@media(max-width:850px){.nf-grid,.nf-split,.nf-panel .nf-split{grid-template-columns:1fr}.nf-hero{flex-direction:column;align-items:stretch}.nf-refresh{flex-direction:row;align-items:center;justify-content:space-between}.nf-statrow{grid-template-columns:1fr 1fr}.nf-toolbar form{min-width:100%}}`;
  document.head.appendChild(css);
  window.NextOfferJobs={view,refresh:fetchFeed,score};
  void fetchFeed();
  setInterval(()=>void fetchFeed(),15*60*1000);
  window.addEventListener('focus',()=>void fetchFeed());
})();
