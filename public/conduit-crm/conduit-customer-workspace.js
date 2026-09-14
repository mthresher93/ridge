(() => {
  'use strict';

  const CRM_KEY = 'conduit.crm.v1';
  const PRODUCT_KEY = 'conduit.crm.product.v2';
  const DIALER_KEY = 'conduitDialerV1';
  const DRAFT_KEY = 'dialerMessageDrafts';
  const SCRIPT_KEY = 'conduit.dialer.script.v1';
  const SCRIPT_REGION_KEY = 'conduit.dialer.script.region.v1';
  const SCRIPT_EXPANDED_KEY = 'conduit.dialer.script.expanded.v1';
  const SUNROOF_SELECTED_KEY = 'conduit.solar.sunroof.selected.v1';
  const STAGES = ['New Lead','Attempting Contact','Contacted','Qualified','Promising Callback','Appointment Set','Appointment Confirmed','Appointment Sat','Proposal','Contract Sent','Contract Signed','Site Survey','Design','Permitting','Installation Scheduled','Installed','PTO','Closed Won','Closed Lost','Cancelled','Prospect'];
  const TABS = [
    ['overview','home','Overview'],
    ['conversation','conversation','Conversation'],
    ['qualification','qualification','Qualification'],
    ['followup','followup','Follow-up'],
    ['appointment','appointment','Appointment brief'],
    ['proposal','proposal','Proposal & property'],
    ['notes','notes','Notes & files'],
    ['edit','edit','Edit contact']
  ];
  const TAB_ICON_PATHS={
    home:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>',
    conversation:'<path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.7-5A8 8 0 1 1 21 15Z"/><path d="M8 10h8M8 14h5"/>',
    qualification:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    followup:'<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 8A7 7 0 0 1 20 12M17.9 16A7 7 0 0 1 4 12"/>',
    appointment:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h3M8 17h6"/>',
    proposal:'<path d="M4 17 8 7h12l-4 10Z"/><path d="M6 12h12M10 7 7 17M14 7l-3 10"/>',
    notes:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
    edit:'<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="13" cy="18" r="2"/>'
  };
  const tabIcon=key=>`<span class="cw-tab-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${TAB_ICON_PATHS[key]}</svg></span>`;
  const ui = { leadId:null, tab:'overview', channel:'SMS', priorHash:'', opening:false };
  const uid = prefix => `${prefix}-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money = value => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(value)||0);
  const read = (key, fallback) => { try { return {...fallback,...JSON.parse(localStorage.getItem(key)||'{}')}; } catch { return fallback; } };
  const readArray = key => { try { const value=JSON.parse(localStorage.getItem(key)||'[]'); return Array.isArray(value)?value:[]; } catch { return []; } };
  const db = () => window.conduitCRM?.load?.() || read(CRM_KEY,{leads:[],opportunities:[],callbacks:[],appointments:[],tasks:[],activities:[]});
  const save = data => { if(window.conduitCRM?.save) window.conduitCRM.save(data); else { data.updatedAt=new Date().toISOString(); localStorage.setItem(CRM_KEY,JSON.stringify(data)); window.dispatchEvent(new CustomEvent('conduit:crm-updated')); } };
  const product = () => read(PRODUCT_KEY,{calls:[],geo:{}});
  const formatDate = value => { if(!value)return 'Not set'; const d=new Date(value); return Number.isNaN(d.valueOf())?String(value):d.toLocaleString([], {month:'short',day:'numeric',year:d.getFullYear()!==new Date().getFullYear()?'numeric':undefined,hour:'numeric',minute:'2-digit'}); };
  const localDateTime = value => { if(!value)return ''; const d=new Date(value); if(Number.isNaN(d.valueOf()))return ''; return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,16); };
  const initials = name => String(name||'?').split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase();
  const options = (values,current) => values.map(value=>`<option value="${esc(value)}" ${String(value)===String(current)?'selected':''}>${esc(value)}</option>`).join('');
  const field = (label,name,value,type='text',extra='') => `<div class="cw-field ${extra}"><label>${esc(label)}</label><input name="${esc(name)}" type="${type}" value="${esc(value ?? '')}"></div>`;
  const select = (label,name,value,values,extra='') => `<div class="cw-field ${extra}"><label>${esc(label)}</label><select name="${esc(name)}">${options(values,value)}</select></div>`;
  const textarea = (label,name,value,extra='full') => `<div class="cw-field ${extra}"><label>${esc(label)}</label><textarea name="${esc(name)}">${esc(value||'')}</textarea></div>`;
  const activity = (data,leadId,type,detail) => { data.activities=data.activities||[]; data.activities.unshift({id:uid('activity'),entityType:'lead',entityId:leadId,type,detail,at:new Date().toISOString()}); data.activities=data.activities.slice(0,500); };
  const getLead = () => db().leads?.find(item=>item.id===ui.leadId);

  function qualification(lead,data){
    const appointment=(data.appointments||[]).some(x=>x.leadId===lead.id&&!['cancelled','no-show'].includes(x.status));
    const proposal=(data.opportunities||[]).some(x=>x.leadId===lead.id&&['Proposal','Contract Sent','Contract Signed','Site Survey','Design','Permitting','Installation Scheduled','Installed','PTO','Closed Won'].includes(x.stage));
    const factors=[
      ['Callable phone',/^\+[1-9]\d{7,14}$/.test(lead.phone||''),12],
      ['Consent verified',lead.consent==='verified',12],
      ['Homeowner confirmed',['Owner','Co-owner','owner','co-owner'].includes(lead.homeowner||lead.ownership),15],
      ['Utility bill captured',Number(lead.monthlyBill)>0,12],
      ['Utility identified',Boolean(lead.utility),8],
      ['Roof context reviewed',Boolean(lead.roofType||lead.roofAge||lead.roofFit||lead.annualSunHours),10],
      ['Motivation documented',Boolean(lead.motivation),10],
      ['Decision timeline known',Boolean(lead.decisionTimeline),8],
      ['Appointment booked',appointment,7],
      ['Proposal in progress',proposal,3],
      ['Next action assigned',Boolean(lead.nextAction),3]
    ];
    const score=lead.dnc?0:Math.min(100,factors.reduce((sum,item)=>sum+(item[1]?item[2]:0),0));
    const band=lead.dnc?'Do not contact':score>=80?'Closer ready':score>=60?'Qualified':score>=35?'Developing':'Early';
    return {score,band,factors};
  }

  function timeline(lead,data){
    const items=(data.activities||[]).filter(x=>(x.entityId===lead.id||x.leadId===lead.id)&&/call|dial|disposition|appointment|email|sms/.test(x.type||'')).map(x=>({at:x.at,type:x.type||'activity',detail:x.detail||'',mode:/appointment/.test(x.type||'')?'appointment':/call|dial|disposition/.test(x.type||'')?'call':'draft'}));
    readArray(DRAFT_KEY).filter(x=>x.leadId===lead.id||x.leadId===`crm-${lead.id}`).forEach(x=>items.push({at:x.createdAt,type:`${x.channel||'message'} draft`,detail:x.text||'',mode:'draft'}));
    (product().calls||[]).filter(x=>x.leadId===lead.id).forEach(x=>items.push({at:x.startedAt,type:`${x.direction||''} call · ${x.outcome||'logged'}`,detail:x.notes||`${x.duration||0} seconds`,mode:'call'}));
    (data.appointments||[]).filter(x=>x.leadId===lead.id).forEach(x=>items.push({at:x.createdAt||x.startsAt,type:`Appointment · ${x.status||'scheduled'}`,detail:`${x.type||'Solar consultation'} · ${formatDate(x.startsAt)}${x.notes?` · ${x.notes}`:''}`,mode:'appointment'}));
    try{
      const dialer=JSON.parse(localStorage.getItem(DIALER_KEY)||'{}'),queued=(dialer.leads||[]).filter(x=>x.crmLeadId===lead.id||x.phone===lead.phone),ids=new Set(queued.map(x=>x.id));
      (dialer.events||[]).filter(x=>ids.has(x.leadId)&&/call|dial|disposition|callback|dtmf|audio/.test(x.type||'')).forEach(x=>items.push({at:x.at,type:x.type||'dialer',detail:x.detail||'',mode:'call'}));
    }catch{}
    return items.filter(x=>x.at).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  }

  function metric(label,value,helper=''){
    return `<div class="cw-metric"><span>${esc(label)}</span><b>${esc(value)}</b>${helper?`<small>${esc(helper)}</small>`:''}</div>`;
  }
  function facts(rows){
    return `<dl class="cw-facts">${rows.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value||'—')}</dd></div>`).join('')}</dl>`;
  }
  function panelHead(title,copy,actions=''){
    return `<div class="cw-panel-head"><div><h2>${esc(title)}</h2><p>${esc(copy)}</p></div>${actions?`<div class="cw-actions">${actions}</div>`:''}</div>`;
  }

  function conversationPanel(lead,data){
    const items=timeline(lead,data),opp=(data.opportunities||[]).find(x=>x.leadId===lead.id),appointment=(data.appointments||[]).filter(x=>x.leadId===lead.id&&Date.parse(x.startsAt)>=Date.now()).sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt))[0];
    const channel=ui.channel==='Email'?'Email':'SMS';
    return `${panelHead('Customer conversation','Messages, call records, and appointments stay here. Internal notes and proposal work are kept separate.')}
      <section class="cw-conversation-snapshot">
        <article><span>CUSTOMER</span><h3>${esc(lead.name)}</h3><p>${esc(channel==='SMS'?(lead.phone||'No phone'):(lead.email||'No email'))}</p></article>
        <article><span>OWNERSHIP</span><h3>${esc(lead.status||'New Lead')}</h3><p>${esc([lead.owner&&`Owner: ${lead.owner}`,lead.setter&&`Setter: ${lead.setter}`,lead.closer&&`Closer: ${lead.closer}`].filter(Boolean).join(' · ')||'Team not assigned')}</p></article>
        <article><span>SOLAR SNAPSHOT</span><h3>${esc(lead.utility||'Utility unknown')} ${lead.monthlyBill?`· ${esc(money(lead.monthlyBill))}/mo`:''}</h3><p>${esc([lead.homeowner||lead.ownership||'Ownership unknown',lead.roofFit||lead.sunroofStatus||'Roof not reviewed'].join(' · '))}</p></article>
        <article><span>DEAL & NEXT STEP</span><h3>${esc(opp?.stage||'No opportunity')} ${opp?`· ${esc(money(opp.value))}`:''}</h3><p>${esc(appointment?`Appointment ${formatDate(appointment.startsAt)}`:(lead.nextAction||'Next action not set'))}</p></article>
      </section>
      <div class="cw-conversation-layout">
        <section class="cw-card cw-thread">
          <header><div><span class="cw-section-label">COMMUNICATION TIMELINE</span><h3>Messages, calls & appointments</h3><p>${esc(lead.phone||'No phone')} ${lead.email?`· ${esc(lead.email)}`:''}</p></div><button class="cw-button" data-cw-open-dialer>Open dialer</button></header>
          <div class="cw-timeline">${items.length?items.map(item=>`<article class="cw-event ${esc(item.mode)}"><span>${esc(String(item.type).replaceAll('_',' '))}</span><p>${esc(item.detail)}</p><time>${esc(formatDate(item.at))}</time></article>`).join(''):'<div class="cw-empty"><b>No customer communication recorded yet.</b><br>Save a reviewed message draft below or open the dialer. Nothing is marked sent without a provider response.</div>'}</div>
          <form class="cw-message-composer" data-cw-form="message">
            <header><div><span class="cw-section-label">MESSAGE HOMEOWNER</span><h3>Compose a ${esc(channel)}</h3></div><div class="cw-channel-switch"><button type="button" class="${channel==='SMS'?'active':''}" data-cw-channel="SMS">SMS</button><button type="button" class="${channel==='Email'?'active':''}" data-cw-channel="Email">Email</button></div></header>
            <input type="hidden" name="channel" value="${esc(channel)}"><textarea name="text" placeholder="${channel==='SMS'?'Write a concise homeowner text message…':'Write the email body for this homeowner…'}" required></textarea>
            <div class="cw-message-actions"><div><b>${esc(channel==='SMS'?(lead.phone||'No phone number'):(lead.email||'No email address'))}</b><small>Review before any delivery.</small></div><button class="cw-button" type="button" disabled title="Configure and verify a messaging provider before sending">Send requires provider</button><button class="cw-button primary" type="submit">Save ${esc(channel)} draft</button></div>
          </form>
        </section>
        <aside class="cw-conversation-side">
          <section class="cw-card cw-note-card"><header><div><span class="cw-section-label">TEAM ONLY</span><h3>Internal note</h3><p>Not visible to the homeowner and never sent.</p></div></header><form data-cw-form="note"><textarea name="detail" required placeholder="Add an objection, roof detail, decision-maker note, or closer context…"></textarea><button class="cw-button primary" type="submit">Save internal note</button></form><button class="cw-text-link" data-cw-tab="notes">View all notes & files →</button></section>
          <section class="cw-card cw-linked-work"><header><div><span class="cw-section-label">LINKED WORK</span><h3>Follow-up & proposal</h3></div></header><button data-cw-tab="followup"><b>Plan follow-up</b><span>${esc(lead.nextAction||'Set the next action')}</span></button><button data-cw-tab="proposal"><b>Proposal & property</b><span>${esc(opp?.stage||'Open project details')}</span></button><button data-cw-tab="appointment"><b>Appointment brief</b><span>${esc(appointment?formatDate(appointment.startsAt):'No appointment booked')}</span></button></section>
          <div class="cw-provider"><b>PROVIDER BOUNDARY · REQUIRES SETUP</b><p>SMS, email, recordings, transcripts, and external delivery are not live until a verified provider is connected. Drafts and notes remain local.</p></div>
        </aside>
      </div>`;
  }

  function overviewPanel(lead,data){
    const q=qualification(lead,data),opp=(data.opportunities||[]).find(x=>x.leadId===lead.id),calls=(product().calls||[]).filter(x=>x.leadId===lead.id),tasks=(data.tasks||[]).filter(x=>x.leadId===lead.id&&x.status!=='completed'),callbacks=(data.callbacks||[]).filter(x=>x.leadId===lead.id&&x.status==='open'),appointment=(data.appointments||[]).filter(x=>x.leadId===lead.id&&Date.parse(x.startsAt)>=Date.now()&&!['cancelled','no-show'].includes(x.status)).sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt))[0],recent=(data.activities||[]).filter(x=>x.entityId===lead.id||x.leadId===lead.id).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,5),callable=/^\+[1-9]\d{7,14}$/.test(lead.phone||''),contactability=lead.dnc?'DNC suppressed':lead.consent!=='verified'?'Consent needs review':callable?'Ready for reviewed call':'Phone needs E.164';
    return `${panelHead('Customer command center','The decision-ready facts, next action, and active work for this homeowner.')}
      <section class="cw-priority-strip ${lead.dnc?'blocked':''}"><div class="cw-priority-action"><span>NEXT BEST ACTION</span><h2>${esc(lead.nextAction||'Complete solar qualification')}</h2><p>${esc(lead.nextFollowUp?`Due ${formatDate(lead.nextFollowUp)}`:'No due time set')} · ${esc(lead.owner||'Owner unassigned')}</p></div><div class="cw-priority-facts"><article><span>CONTACTABILITY</span><b>${esc(contactability)}</b></article><article><span>DEAL</span><b>${esc(opp?.stage||lead.status||'New Lead')} ${opp?`· ${esc(money(opp.value))}`:''}</b></article><article><span>NEXT APPOINTMENT</span><b>${esc(appointment?formatDate(appointment.startsAt):'Not booked')}</b></article></div><div class="cw-priority-buttons"><button class="cw-button primary" data-cw-open-dialer ${lead.dnc||!callable?'disabled':''}>Open Dialer</button><button class="cw-button" data-cw-tab="followup">Plan follow-up</button><button class="cw-button" data-cw-tab="appointment">Book appointment</button></div></section>
      <div class="cw-metrics">${metric('Qualification',`${q.score}/100`,q.band)}${metric('Pipeline',opp?.stage||lead.status||'New Lead')}${metric('Estimated value',money(opp?.value||lead.estimatedValue||0),'Estimate, not contracted')}${metric('Recorded calls',calls.length,'Metadata only')}</div>
      <div class="cw-grid">
        <section class="cw-card cw-span-8"><header><div><h3>Contact & solar readiness</h3><p>The facts needed before calling, qualifying, or building a proposal.</p></div><button class="cw-text-link" data-cw-tab="edit">Edit contact →</button></header>${facts([['Phone',lead.phone||'Not captured'],['Email',lead.email||'Not captured'],['Address',[lead.address,lead.city,lead.state].filter(Boolean).join(', ')||'Not captured'],['Source',lead.source||'Manual'],['Consent',lead.consent||'Unknown'],['DNC',lead.dnc?'Suppressed':'No'],['Utility',lead.utility||'Not captured'],['Monthly bill',lead.monthlyBill?money(lead.monthlyBill):'Not captured'],['Roof',lead.roofType||lead.roofFit||'Not reviewed'],['System target',lead.recommendedKw?`${lead.recommendedKw} kW`:'Not estimated']])}</section>
        <section class="cw-card cw-span-4"><header><div><h3>Open work</h3><p>What is currently waiting on this record.</p></div></header>${facts([['Next action',lead.nextAction||'Complete qualification'],['Due',formatDate(lead.nextFollowUp)],['Category',lead.followUpCategory||'Uncategorized'],['Cadence',lead.followUpCadence||'Not set'],['Open tasks',String(tasks.length)],['Open callbacks',String(callbacks.length)]])}</section>
        <section class="cw-card cw-span-7"><header><div><h3>Setter-to-closer handoff</h3><p>Motivation, decision process, objections, and appointment preparation.</p></div><button class="cw-text-link" data-cw-tab="qualification">Update qualification →</button></header>${facts([['Motivation',lead.motivation||'Not documented'],['Timeline',lead.decisionTimeline||'Unknown'],['Decision makers',lead.decisionMakers||'Not documented'],['Primary objection',lead.primaryObjection||'None documented'],['Appointment goal',lead.appointmentGoal||'Not documented'],['Closer notes',lead.closerNotes||'Not documented']])}</section>
        <section class="cw-card cw-span-5"><header><div><h3>Recent record activity</h3><p>The latest internal movements on this customer.</p></div><button class="cw-text-link" data-cw-tab="conversation">Open conversation →</button></header><div class="cw-list">${recent.map(x=>`<article class="cw-list-item"><div><b>${esc(String(x.type||'activity').replaceAll('_',' '))}</b><span>${esc(x.detail||'Record updated')}</span></div><time>${esc(formatDate(x.at))}</time></article>`).join('')||'<div class="cw-empty">No recent activity recorded.</div>'}</div></section>
      </div>`;
  }

  function qualificationPanel(lead,data){
    const q=qualification(lead,data);
    return `${panelHead('Qualification','A transparent solar-readiness score based only on recorded project facts—not demographic inference.')}
      <div class="cw-grid">
        <section class="cw-card cw-span-5"><div class="cw-score-summary"><div class="cw-score-ring" style="--score:${q.score}"><strong>${q.score}</strong><span>OF 100</span></div><div class="cw-score-copy"><h3>${esc(q.band)}</h3><p>Score improves as the team verifies contact permission, homeowner status, utility cost, roof context, motivation, and decision timing.</p></div></div><div class="cw-score-factors">${q.factors.map(([name,ok,points])=>`<div class="cw-score-factor ${ok?'good':''}"><span>${ok?'✓':'○'} ${esc(name)}</span><b>${ok?`+${points}`:`0/${points}`}</b></div>`).join('')}</div></section>
        <section class="cw-card cw-span-7"><header><div><h3>Qualification worksheet</h3><p>Save facts the setter and closer can actually use.</p></div></header><form class="cw-form" data-cw-form="qualification">
          ${select('Homeowner status','homeowner',lead.homeowner||lead.ownership||'Unknown',['Unknown','Owner','Co-owner','Renter','Other'])}
          ${field('Monthly utility bill','monthlyBill',lead.monthlyBill||'','number')}
          ${field('Utility provider','utility',lead.utility||'')}
          ${select('Roof review','roofFit',lead.roofFit||'Not reviewed',['Not reviewed','Strong fit','Possible fit','Needs site survey','Limited fit','Not suitable'])}
          ${select('Decision timeline','decisionTimeline',lead.decisionTimeline||'Unknown',['Unknown','0–30 days','1–3 months','3–6 months','6+ months'])}
          ${field('Decision makers','decisionMakers',lead.decisionMakers||'')}
          ${select('Property access','propertyAccess',lead.propertyAccess||'Unknown',['Unknown','Confirmed','Needs coordination','Restricted'])}
          ${select('Storage interest','storageInterest',lead.storageInterest||'Unknown',['Unknown','Interested','Maybe','Not interested'])}
          ${textarea('Primary motivation','motivation',lead.motivation||'')}
          ${textarea('Qualification notes','qualificationNotes',lead.qualificationNotes||'')}
          <div class="cw-savebar cw-field full"><span>Changes update this customer record and qualification score.</span><button class="cw-button primary" type="submit">Save qualification</button></div>
        </form></section>
      </div>`;
  }

  function followupPanel(lead,data){
    const callbacks=(data.callbacks||[]).filter(x=>x.leadId===lead.id&&x.status==='open').sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt)),tasks=(data.tasks||[]).filter(x=>x.leadId===lead.id&&x.status!=='completed').sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt));
    return `${panelHead('Follow-up plan','Define urgency, channel, cadence, ownership, and the exact next action.')}
      <div class="cw-grid"><section class="cw-card cw-span-7"><header><div><h3>Follow-up strategy</h3><p>One plan shared across the contact, Inbox, Dialer, and pipeline.</p></div></header><form class="cw-form" data-cw-form="followup">
        ${select('Category','followUpCategory',lead.followUpCategory||'Warm',['Immediate action','Hot','Warm','Nurture','Long-term','Do not contact'])}
        ${field('Next follow-up','nextFollowUp',localDateTime(lead.nextFollowUp),'datetime-local')}
        ${field('Next action','nextAction',lead.nextAction||'')}
        ${select('Cadence','followUpCadence',lead.followUpCadence||'One-time',['One-time','Daily until reached','Every 2 days','Weekly','Monthly'])}
        ${select('Preferred channel','preferredChannel',lead.preferredChannel||'Call',['Call','SMS','Email','Call + SMS','No outreach'])}
        ${field('Owner','owner',lead.owner||'')}
        ${field('Setter','setter',lead.setter||'')}
        ${field('Closer','closer',lead.closer||'')}
        ${textarea('Follow-up context','followUpNotes',lead.followUpNotes||'')}
        <div class="cw-savebar cw-field full"><span>Creates an open local callback at the selected time. No message or call is sent.</span><button class="cw-button primary" type="submit">Save plan & callback</button></div>
      </form></section>
      <section class="cw-card cw-span-5"><header><div><h3>Open work</h3><p>Callbacks and tasks connected to this customer.</p></div></header><div class="cw-list">${[...callbacks.map(x=>({title:`${x.type||'Follow-up'} callback`,detail:x.reason||x.notes||'No reason recorded',at:x.dueAt})),...tasks.map(x=>({title:x.title||'Task',detail:`${x.owner||'Unassigned'} · ${x.priority||'Normal'}`,at:x.dueAt}))].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).map(x=>`<article class="cw-list-item"><div><b>${esc(x.title)}</b><span>${esc(x.detail)}</span></div><time>${esc(formatDate(x.at))}</time></article>`).join('')||'<div class="cw-empty">No open follow-up work.</div>'}</div></section></div>`;
  }

  function appointmentPanel(lead,data){
    const appointments=(data.appointments||[]).filter(x=>x.leadId===lead.id).sort((a,b)=>Date.parse(b.startsAt)-Date.parse(a.startsAt));
    return `${panelHead('Appointment & closer brief','Book locally, then give the closer the context needed to run a useful solar consultation.')}
      <div class="cw-grid"><section class="cw-card cw-span-5"><header><div><h3>Appointments</h3><p>External calendar invitations require provider setup.</p></div></header><div class="cw-list">${appointments.map(x=>`<article class="cw-list-item"><div><b>${esc(x.type||'Solar consultation')} · ${esc(x.status||'scheduled')}</b><span>${esc(x.closer||lead.closer||'Closer unassigned')} · ${esc(x.location||x.address||'Location pending')}</span></div><time>${esc(formatDate(x.startsAt))}</time></article>`).join('')||'<div class="cw-empty">No appointment recorded.</div>'}</div><div class="cw-section-divider"></div><form class="cw-form" data-cw-form="appointment"><div class="cw-field full"><label>Starts</label><input name="startsAt" type="datetime-local" value="${esc(localDateTime(new Date(Date.now()+86400000).toISOString()))}" required></div>${select('Type','type','Solar consultation',['Solar consultation','Site survey','Proposal review','Closing call'])}${field('Duration (minutes)','duration','45','number')}${field('Setter','setter',lead.setter||'')}${field('Closer','closer',lead.closer||'')}${field('Location','location',lead.address||'','text','full')}${textarea('Appointment notes','notes','','full')}<button class="cw-button primary cw-field full" type="submit">Book locally</button></form></section>
      <section class="cw-card cw-span-7"><header><div><h3>Closer brief</h3><p>Persistent handoff notes, separate from the contact editor.</p></div></header><form class="cw-form" data-cw-form="brief">${field('Appointment goal','appointmentGoal',lead.appointmentGoal||'')}${field('Primary objection','primaryObjection',lead.primaryObjection||'')}${textarea('Why they are considering solar','motivation',lead.motivation||'')}${textarea('Decision makers & dynamics','decisionMakers',lead.decisionMakers||'')}${textarea('Bill, roof, and property context','propertyBrief',lead.propertyBrief||'')}${textarea('Financing boundaries discussed','financingNotes',lead.financingNotes||'')}${textarea('Questions the closer must ask','mustAsk',lead.mustAsk||'')}${textarea('Closer-only preparation notes','closerNotes',lead.closerNotes||'')}<div class="cw-savebar cw-field full"><span>Visible to the team inside this local workspace.</span><button class="cw-button primary" type="submit">Save closer brief</button></div></form></section></div>`;
  }

  function proposalPanel(lead,data){
    const opp=(data.opportunities||[]).find(x=>x.leadId===lead.id),geo=product().geo?.[lead.id]||{},roofPreview=window.conduitSolarExpansion?.roofPreviewMarkup?.(lead,'contact')||'<div class="cw-empty">Open Proposal Buildout to load address-level aerial roof imagery.</div>';
    return `${panelHead('Proposal & property','Keep design inputs local, then use Proposal Buildout for the working solar estimate.',`<button class="cw-button primary" data-cw-build-proposal>Open Proposal Buildout</button>`)}
      <div class="cw-metrics">${metric('Opportunity',opp?.stage||'Not created')}${metric('Estimate',money(opp?.value||lead.estimatedValue||0),'Not a contract')}${metric('System target',lead.recommendedKw?`${lead.recommendedKw} kW`:'Not estimated')}${metric('Roof status',lead.sunroofStatus||lead.roofFit||'Not reviewed')}</div>
      <div class="cw-grid"><section class="cw-card cw-span-7"><header><div><h3>Property & existing-roof inputs</h3><p>Proposal Buildout is the local workflow. Google Project Sunroof is verification only.</p></div></header><form class="cw-form" data-cw-form="property">${field('Street address','address',lead.address||geo.address||'')}${field('City','city',lead.city||geo.city||'')}${field('State','state',lead.state||geo.state||'')}${field('Utility','utility',lead.utility||'')}${field('Monthly bill','monthlyBill',lead.monthlyBill||'','number')}${field('Annual usage (kWh)','annualUsageKwh',lead.annualUsageKwh||'','number')}${select('Roof type','roofType',lead.roofType||'Unknown',['Unknown','Asphalt shingle','Concrete tile','Clay tile','Standing seam metal','Corrugated metal','Flat membrane','Composite','Other'])}${field('Roof age','roofAge',lead.roofAge||'','number')}${select('Existing-roof condition','roofCondition',lead.roofCondition||'Not inspected',['Not inspected','Good','Serviceable','Repair before install','Replace before install'])}${select('Retrofit scope','retrofitScope',lead.retrofitScope||'Mount over existing roof',['Mount over existing roof','Repair then mount','Re-roof then mount','Roof-integrated system'])}${select('Deck / structure','deckType',lead.deckType||'Unknown',['Unknown','Plywood / OSB','Plank deck','Concrete','Metal deck','Engineered truss'])}${field('Annual sun hours','annualSunHours',lead.annualSunHours||'','number')}${field('Usable roof (sq ft)','usableRoofSqFt',lead.usableRoofSqFt||'','number')}${field('Shade loss (%)','shadeLoss',lead.shadeLoss||'','number')}${field('Recommended system (kW)','recommendedKw',lead.recommendedKw||'','number')}${textarea('Site and design notes','propertyNotes',lead.propertyNotes||'')}<div class="cw-savebar cw-field full"><span>Local retrofit inputs only; site survey and provider engineering remain required.</span><button class="cw-button primary" type="submit">Save property</button></div></form></section>
      <section class="cw-card cw-span-5 cw-roof-preview-card"><header><div><h3>Property design preview</h3><p>Shows the saved street map, satellite roof, or user-supplied 3D house source from Proposal Buildout.</p></div></header>${roofPreview}<button class="cw-button primary cw-roof-open" data-cw-build-proposal>Open multi-view roof design</button></section>
      <section class="cw-card cw-span-12"><header><div><h3>Project readiness</h3><p>What is available before proposal review.</p></div></header>${facts([['Homeowner',lead.homeowner||lead.ownership||'Unknown'],['Utility bill',lead.monthlyBill?money(lead.monthlyBill):'Missing'],['Roof fit',lead.roofFit||'Not reviewed'],['Existing roof',lead.roofCondition||'Not inspected'],['Retrofit scope',lead.retrofitScope||'Not set'],['Site survey',lead.siteSurveyStatus||'Not scheduled'],['Storage',lead.storageInterest||'Unknown'],['Opportunity owner',opp?.owner||lead.owner||'Unassigned'],['Next action',opp?.nextAction||lead.nextAction||'Not set']])}<div class="cw-provider" style="margin-top:14px"><b>EXTERNAL VERIFICATION</b><p>Map, satellite, and user-supplied 3D sources support planning, but final model scale, production, current utility rates, incentives, permitting, measurements, structure, attachments, and engineering require verified sources.</p></div></section></div>`;
  }

  function notesPanel(lead,data){
    const notes=(data.activities||[]).filter(x=>x.entityId===lead.id&&/note|brief|objection/.test(x.type||'')).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
    let assets=[]; try { const all=JSON.parse(localStorage.getItem('conduit.solar.sunroof.assets.v1')||'{}'); assets=Array.isArray(all)?all.filter(x=>x.leadId===lead.id):(all[lead.id]||[]); } catch {}
    return `${panelHead('Notes & files','Keep internal context together. Durable file storage remains provider-dependent.')}
      <div class="cw-grid"><section class="cw-card cw-span-7"><header><div><h3>Team notes</h3><p>Chronological internal context for this customer.</p></div></header><form class="cw-form" data-cw-form="note"><div class="cw-field full"><label>New internal note</label><textarea name="detail" required placeholder="Add roof, bill, objection, family decision, or follow-up context"></textarea></div><button class="cw-button primary cw-field full" type="submit">Save internal note</button></form><div class="cw-section-divider"></div><div class="cw-list">${notes.map(x=>`<article class="cw-list-item"><div><b>${esc(String(x.type).replaceAll('_',' '))}</b><span>${esc(x.detail||'')}</span></div><time>${esc(formatDate(x.at))}</time></article>`).join('')||'<div class="cw-empty">No team notes recorded.</div>'}</div></section>
      <section class="cw-card cw-span-5"><header><div><h3>Property files</h3><p>References attached to the local proposal workflow.</p></div></header><div class="cw-list">${assets.map(x=>`<article class="cw-list-item"><div><b>${esc(x.name||x.fileName||'Property asset')}</b><span>${esc(x.type||x.kind||'Local reference')}</span></div><time>${esc(formatDate(x.createdAt||x.at))}</time></article>`).join('')||'<div class="cw-empty">No files attached for this customer.<br>Durable upload and sharing require configured storage.</div>'}</div><div class="cw-provider" style="margin-top:14px"><b>NO FALSE UPLOAD STATE</b><p>Conduit will not show a successful cloud upload until a durable storage adapter is connected.</p></div></section></div>`;
  }

  function editPanel(lead){
    return `${panelHead('Edit contact','Update identity, ownership, assignment, consent, and core solar details without losing the operational workspace.')}
      <section class="cw-card"><form class="cw-form" data-cw-form="edit">${field('Name','name',lead.name||'')}${field('Property / household label','company',lead.company||'')}${field('Phone · E.164','phone',lead.phone||'','tel')}${field('Email','email',lead.email||'','email')}${select('Stage','status',lead.status||'New Lead',STAGES)}${select('Priority','priority',lead.priority||'Medium',['Low','Medium','High','Critical'])}${field('Owner','owner',lead.owner||'')}${field('Setter','setter',lead.setter||'')}${field('Closer','closer',lead.closer||'')}${field('Tags · comma separated','tags',Array.isArray(lead.tags)?lead.tags.join(', '):(lead.tags||''))}${field('Source','source',lead.source||'')}${field('Source URL','sourceUrl',lead.sourceUrl||'','url')}${select('Consent','consent',lead.consent||'unknown',['unknown','verified','missing'])}${field('Consent source','consentSource',lead.consentSource||'')}${field('Estimated value','estimatedValue',lead.estimatedValue||'','number')}${field('Street address','address',lead.address||'')}${field('City','city',lead.city||'')}${field('State','state',lead.state||'')}${textarea('Contact notes','notes',lead.notes||'')}<div class="cw-field full"><label class="cw-check"><input type="checkbox" name="dnc" ${lead.dnc?'checked':''}> Internal do-not-contact suppression</label></div><div class="cw-savebar cw-field full"><span>Edits persist to the canonical Conduit contact record.</span><button class="cw-button primary" type="submit">Save contact</button></div></form></section>`;
  }

  function render(){
    const data=db(),lead=(data.leads||[]).find(x=>x.id===ui.leadId); if(!lead){ closeWorkspace(false); return; }
    const q=qualification(lead,data),existing=document.querySelector('.conduit-contact-workspace'),workspace=existing||document.createElement('section');
    workspace.className='conduit-contact-workspace'; workspace.dataset.leadId=lead.id; workspace.setAttribute('aria-label',`${lead.name} customer workspace`);
    const panel={conversation:conversationPanel,overview:overviewPanel,qualification:qualificationPanel,followup:followupPanel,appointment:appointmentPanel,proposal:proposalPanel,notes:notesPanel,edit:editPanel}[ui.tab]||overviewPanel;
    workspace.innerHTML=`<header class="cw-topbar"><div class="cw-contact-heading"><button class="cw-back" data-cw-close aria-label="Back to ${esc(document.body.dataset.page||'previous view')}">←</button><div class="cw-avatar">${esc(initials(lead.name))}</div><div class="cw-title"><h1>${esc(lead.name||'Unnamed contact')}</h1><p>${esc([lead.phone,lead.email,[lead.city,lead.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')||'Contact details not captured')}</p><div class="cw-title-line"><span class="cw-status">${esc(lead.status||'Lead')}</span><span class="cw-score-pill">${q.score}/100 · ${esc(q.band)}</span>${lead.dnc?'<span class="cw-truth">DNC suppressed</span>':''}</div></div></div><div class="cw-top-actions"><button class="primary" data-cw-open-dialer ${lead.dnc?'disabled':''}>Open Dialer</button><button data-cw-tab="followup">Plan follow-up</button><button data-cw-tab="appointment">Book appointment</button><button data-cw-build-proposal>Build proposal</button><button data-cw-tab="edit">Edit contact</button></div></header><div class="cw-shell"><nav class="cw-tabs" aria-label="Customer sections">${TABS.map(([id,icon,label])=>`<button class="${ui.tab===id?'active':''}" data-cw-tab="${id}">${tabIcon(icon)}<strong>${esc(label)}</strong></button>`).join('')}</nav><main class="cw-stage">${panel(lead,data)}</main></div>`;
    if(!existing){ const host=document.querySelector('.main')||document.body; host.appendChild(workspace); }
    document.body.dataset.contactWorkspace='open';
  }

  function openWorkspace(leadId,tab='overview'){
    const data=db(); if(!data.leads?.some(x=>x.id===leadId))return;
    if(!ui.leadId)ui.priorHash=location.hash.startsWith('#contact/')?'':location.hash;
    ui.leadId=leadId; ui.tab=tab; ui.opening=true;
    history.replaceState(null,'',`#contact/${encodeURIComponent(leadId)}`);
    render(); requestAnimationFrame(()=>{ui.opening=false; document.querySelector('.cw-stage')?.scrollTo(0,0);});
  }
  function closeWorkspace(restoreHash=true){
    document.querySelector('.conduit-contact-workspace')?.remove(); document.body.removeAttribute('data-contact-workspace');
    ui.leadId=null; ui.tab='overview';
    if(restoreHash&&location.hash.startsWith('#contact/'))history.replaceState(null,'',ui.priorHash||`${location.pathname}${location.search}`);
  }
  function routeTo(route){
    const direct=document.querySelector(`[data-crm-route="${CSS.escape(route)}"]`);if(direct){direct.click();return;}
    const module=route.startsWith('contacts-')?'contacts':route.startsWith('conversations-')?'conversations':route.startsWith('sales-')?'sales':route.startsWith('marketing-')?'marketing':route.startsWith('reports-')?'reports':route.startsWith('settings-')||route==='agent-tools'?'configure':'home';
    document.querySelector(`[data-crm-module="${module}"]`)?.click();setTimeout(()=>document.querySelector(`[data-crm-route="${CSS.escape(route)}"]`)?.click(),40);
  }
  function openDialer(lead){
    window.conduitCRM?.addToDialer?.(lead);
    try{const state=JSON.parse(localStorage.getItem(DIALER_KEY)||'{}'),queued=(state.leads||[]).find(x=>x.crmLeadId===lead.id||x.phone===lead.phone);if(queued){state.activeId=queued.id;localStorage.setItem(DIALER_KEY,JSON.stringify(state));window.dispatchEvent(new CustomEvent('conduit:dialer-updated'));}}catch{}
    closeWorkspace(); routeTo('conversations-dialer'); setTimeout(installDialerEnhancements,80);
  }
  function openProposal(lead){
    localStorage.setItem(SUNROOF_SELECTED_KEY,lead.id); closeWorkspace(); routeTo('conversations-sunroof');
  }

  function values(form){return Object.fromEntries(new FormData(form).entries());}
  function assign(data,lead,form,numeric=[]){const v=values(form);for(const [key,value] of Object.entries(v))lead[key]=numeric.includes(key)?(value===''?null:Number(value)):String(value).trim();lead.updatedAt=new Date().toISOString();return v;}
  function saveLeadSection(form,type,detail,numeric=[]){const data=db(),lead=data.leads.find(x=>x.id===ui.leadId);if(!lead)return;assign(data,lead,form,numeric);activity(data,lead.id,type,detail);save(data);render();}

  function handleSubmit(event){
    const form=event.target.closest('[data-cw-form]'); if(!form)return; event.preventDefault(); const kind=form.dataset.cwForm,data=db(),lead=data.leads.find(x=>x.id===ui.leadId); if(!lead)return;
    if(kind==='note'){const detail=String(new FormData(form).get('detail')||'').trim();if(!detail)return;activity(data,lead.id,'internal_note',detail);save(data);render();return;}
    if(kind==='message'){const v=values(form),text=String(v.text||'').trim(),channel=v.channel==='Email'?'Email':'SMS';if(!text)return;const records=readArray(DRAFT_KEY);records.unshift({id:uid('draft'),leadId:lead.id,channel,text,status:'draft',createdAt:new Date().toISOString()});localStorage.setItem(DRAFT_KEY,JSON.stringify(records));activity(data,lead.id,'message_draft_saved',`${channel} draft saved locally · not sent`);save(data);render();return;}
    if(kind==='qualification'){saveLeadSection(form,'qualification_updated','Solar qualification worksheet updated',['monthlyBill']);return;}
    if(kind==='brief'){saveLeadSection(form,'closer_brief_updated','Setter-to-closer brief updated');return;}
    if(kind==='property'){saveLeadSection(form,'property_updated','Property and proposal inputs updated',['monthlyBill','annualUsageKwh','roofAge','annualSunHours','usableRoofSqFt','shadeLoss','recommendedKw']);return;}
    if(kind==='edit'){
      const priorDnc=lead.dnc; assign(data,lead,form,['estimatedValue']); lead.dnc=form.elements.dnc.checked; lead.tags=String(form.elements.tags.value||'').split(',').map(x=>x.trim()).filter(Boolean); activity(data,lead.id,'contact_updated','Contact identity and assignment fields updated'); if(priorDnc!==lead.dnc)activity(data,lead.id,'dnc_updated',lead.dnc?'Contact suppressed':'Contact suppression removed'); save(data); render(); return;
    }
    if(kind==='followup'){
      const v=assign(data,lead,form); lead.nextFollowUp=v.nextFollowUp?new Date(v.nextFollowUp).toISOString():''; if(v.followUpCategory==='Do not contact'){lead.dnc=true;lead.preferredChannel='No outreach';}
      data.callbacks=data.callbacks||[]; if(lead.nextFollowUp)data.callbacks.unshift({id:uid('callback'),leadId:lead.id,type:String(v.followUpCategory||'follow-up').toLowerCase(),dueAt:lead.nextFollowUp,reason:lead.nextAction||'Follow up',assignedUser:lead.owner||'Unassigned',notes:lead.followUpNotes||'',status:'open',createdAt:new Date().toISOString()}); activity(data,lead.id,'followup_planned',`${lead.followUpCategory||'Follow-up'} · ${lead.nextAction||'Next action not specified'}`); save(data); render(); return;
    }
    if(kind==='appointment'){
      const v=values(form),startsAt=new Date(v.startsAt).toISOString(); data.appointments=data.appointments||[]; const item={id:uid('appointment'),leadId:lead.id,type:String(v.type),startsAt,duration:Number(v.duration)||45,setter:String(v.setter||''),closer:String(v.closer||''),location:String(v.location||''),notes:String(v.notes||''),status:'needs confirmation',createdAt:new Date().toISOString()}; data.appointments.unshift(item); Object.assign(lead,{status:'Appointment Set',appointmentId:item.id,setter:item.setter||lead.setter,closer:item.closer||lead.closer,nextAction:'Confirm appointment',updatedAt:new Date().toISOString()}); activity(data,lead.id,'appointment_set',`${item.type} · ${formatDate(item.startsAt)} · local booking only`); save(data); render();
    }
  }

  function leadIdFromTarget(target){
    if(target.closest('[data-add-dialer],[data-map-call],[data-map-lead],[data-conversation-call],input,select,textarea,a[href]'))return null;
    const explicit=target.closest('[data-lead-row],[data-conversation-lead],[data-popup-lead],[data-sunroof-lead]');
    if(explicit)return explicit.dataset.leadRow||explicit.dataset.conversationLead||explicit.dataset.popupLead||explicit.dataset.sunroofLead;
    /* Opportunity rows have their own editable pipeline drawer. Treating the
       whole card as a contact link makes stage, value, and next-action editing
       unreachable, so only explicit contact surfaces open this workspace. */
    const named=target.closest('strong,b,[data-lead-name]'),namedText=(named?.textContent||'').trim().toLowerCase();if(namedText){const match=db().leads?.find(x=>String(x.name||'').trim().toLowerCase()===namedText);if(match)return match.id;}
    if(target.closest('button,[role="button"]'))return null;
    const row=target.closest('tr,.crm-agenda-row,.crm-product-table-row'); if(!row)return null;
    const text=(row.querySelector('strong,b')?.textContent||'').trim().toLowerCase(); if(!text)return null;
    return db().leads?.find(x=>String(x.name||'').trim().toLowerCase()===text)?.id||null;
  }

  function handleClick(event){
    if(event.target.closest('.conduit-contact-workspace')){
      const lead=getLead(); if(!lead)return;
      if(event.target.closest('[data-cw-close]')){event.preventDefault();closeWorkspace();return;}
      const tab=event.target.closest('[data-cw-tab]');if(tab){event.preventDefault();ui.tab=tab.dataset.cwTab;render();return;}
      const channel=event.target.closest('[data-cw-channel]');if(channel){event.preventDefault();ui.channel=channel.dataset.cwChannel==='Email'?'Email':'SMS';render();return;}
      if(event.target.closest('[data-cw-open-dialer]')){event.preventDefault();openDialer(lead);return;}
      if(event.target.closest('[data-cw-build-proposal]')){event.preventDefault();openProposal(lead);return;}
      const draft=event.target.closest('[data-cw-draft]');if(draft){event.preventDefault();const records=readArray(DRAFT_KEY);records.unshift({id:uid('draft'),leadId:lead.id,channel:draft.dataset.cwDraft,text:`Draft for ${lead.name} — review and complete before sending.`,status:'draft',createdAt:new Date().toISOString()});localStorage.setItem(DRAFT_KEY,JSON.stringify(records));render();return;}
      return;
    }
    const leadId=leadIdFromTarget(event.target); if(!leadId)return;
    event.preventDefault(); event.stopImmediatePropagation(); openWorkspace(leadId);
  }

  const SCRIPTS={
    inquiry:{name:'New solar inquiry',opener:'Hi {first}, this is [your name] with [company]. You recently asked about solar options for your home. Is now a bad time for a quick two-minute check-in?',questions:['What prompted you to look into solar right now?','Roughly what is the monthly utility bill?','Do you own the home, and is anyone else part of the decision?','Is the goal savings, backup power, predictability, or something else?'],transition:'Based on that, the useful next step is a solar consultation to review the bill, roof fit, and realistic options. Let’s find a time that works.'},
    bill:{name:'Utility bill qualification',opener:'Hi {first}, I want to make sure we size the conversation around the actual property—not a generic estimate. Can I confirm a few utility and homeowner details?',questions:['Which utility serves the property?','What is a typical bill, and what are the highest summer months?','Has usage changed because of an EV, pool, HVAC, or future plans?','Do you have a recent bill available for the consultation?'],transition:'Perfect. I’ll attach that context so the closer can focus the appointment on your actual usage and roof.'},
    confirm:{name:'Appointment confirmation',opener:'Hi {first}, this is [your name] confirming your solar consultation. I want to make sure the time and preparation still work for you.',questions:['Does the scheduled time still work?','Will every homeowner or decision maker be available?','Can you have a recent utility bill ready?','Is there one question you most want answered on the appointment?'],transition:'Great. I’ll update the closer brief and mark the appointment ready. No external invitation is sent from this local workspace unless calendar delivery is configured.'},
    proposal:{name:'Proposal follow-up',opener:'Hi {first}, I’m following up on the solar proposal review. I’m not calling to rush a decision—I want to understand what still needs clarity.',questions:['What part of the proposal felt strongest?','What feels uncertain: design, savings assumptions, financing, timing, or trust?','Has every decision maker reviewed it?','What information would make the next conversation useful?'],transition:'I’ll document that precisely and schedule the right next step with the proposal owner.'},
    noShow:{name:'No-show recovery',opener:'Hi {first}, we missed each other for the solar appointment. I wanted to check that everything is okay and see whether the conversation is still useful.',questions:['Was the timing the main issue, or has the project priority changed?','Would a shorter call or a different time be easier?','Is there anything you want answered before rescheduling?'],transition:'No problem. I’ll update the record accurately and only reserve another time if it works for you.'},
    referral:{name:'Referral / past customer',opener:'Hi {first}, this is [your name] with [company]. I’m reaching out regarding a solar referral connected to your household. I want to verify the context before assuming anything.',questions:['Who referred you, and what did they share?','What made solar worth exploring now?','Do you own the property?','What utility and approximate monthly bill should we plan around?'],transition:'Thanks. I’ll record the source correctly and set a consultation only if it makes sense for the property.'}
  };
  const SCRIPT_REGIONS={
    national:{name:'National · neutral',prompt:'Confirm the property address, utility provider, current bill, ownership, and decision makers. Keep every incentive, rate, production, and savings statement conditional until the property is verified.',questions:['Which utility serves the home?','Are there any HOA, roof, shade, or service-panel concerns we should document?']},
    california:{name:'California',prompt:'California calls should surface utility territory, time-of-use exposure, current rate plan, backup-power goals, roof condition, and fire-zone or permitting questions. Do not promise NEM, tax-credit, battery, or rate outcomes.',questions:['Is the home served by PG&E, SCE, SDG&E, LADWP, or another utility?','Are evening time-of-use charges or outage resilience part of the reason for exploring solar?']},
    illinois:{name:'Illinois',prompt:'Illinois calls should capture ComEd or Ameren territory, seasonal electric bills, roof age and shade, heating-fuel context, and homeowner timing. Do not promise SREC, rebate, tax, or interconnection outcomes.',questions:['Is the property in ComEd, Ameren, or another utility territory?','How different are the summer and winter electric bills, and is the roof clear of mature-tree shade?']},
    texas:{name:'Texas',prompt:'Texas calls should capture retail electric provider, utility/TDU territory, contract timing, outage concerns, roof exposure, and household usage. Never promise buyback rates or savings.',questions:['Who is the retail electric provider and which utility delivers the power?','Is the main goal bill control, outage resilience, or both?']},
    florida:{name:'Florida',prompt:'Florida calls should capture utility territory, storm-resilience interest, roof age, insurance or permitting questions, shade, and pool/HVAC load. Do not promise net-metering, insurance, or production outcomes.',questions:['Which utility serves the property, and how old is the roof?','Are storm outages, pool load, or air-conditioning costs part of the motivation?']}
  };
  function activeDialerContext(){let state={leads:[]};try{state=JSON.parse(localStorage.getItem(DIALER_KEY)||'{}')}catch{}const queued=(state.leads||[]).find(x=>x.id===state.activeId)||(state.leads||[]).find(x=>x.name===document.getElementById('dialerActiveName')?.textContent)||(state.leads||[])[0],data=db(),lead=(data.leads||[]).find(x=>x.id===queued?.crmLeadId||x.id===queued?.crmContactId||x.phone===queued?.phone);return{state,queued,lead,data}}
  function scriptMarkup(key,first,regionKey){const script=SCRIPTS[key]||SCRIPTS.inquiry,region=SCRIPT_REGIONS[regionKey]||SCRIPT_REGIONS.national,fill=text=>esc(text.replaceAll('{first}',first||'there'));return `<article class="conduit-script-document"><p class="script-opener">${fill(script.opener)}</p><p class="script-region"><b>${esc(region.name)} context:</b> ${esc(region.prompt)}</p><h4>Discovery flow</h4><ul>${[...script.questions,...region.questions].map(x=>`<li>${fill(x)}</li>`).join('')}</ul><h4>Move to the next step</h4><p class="script-next-step">${fill(script.transition)}</p><footer class="conduit-script-foot"><span>Use only verified CRM facts. </span><b>Never invent savings, incentives, eligibility, or prior activity.</b></footer></article>`;}
  function callCoachState(){
    const{state,queued,lead}=activeDialerContext(),notes=[lead?.notes,lead?.qualificationNotes,queued?.notes,document.getElementById('dialerNotes')?.value,document.getElementById('dialerPropertyNotes')?.value].filter(Boolean).join(' ').toLowerCase(),qualification=queued?.qualification||{},has=(value,pattern)=>Boolean(value&&String(value).trim())||pattern.test(notes),facts=[
      {key:'homeowner',label:'Homeowner',complete:has(lead?.homeowner||qualification.homeowner||document.getElementById('dialerHomeowner')?.value?.replace('unknown',''),/homeowner|own(?:s|er|ed)? the (?:home|property)/),prompt:'Before we get into numbers, do you own the home, and is anyone else part of the decision?'},
      {key:'utility',label:'Utility',complete:has(lead?.utility,/\b(?:utility|pge|pg&e|sce|sdg&e|ladwp|comed|ameren|electric provider)\b/),prompt:'Which utility company serves the property?'},
      {key:'bill',label:'Utility bill',complete:has(lead?.monthlyBill||qualification.billRange||document.getElementById('dialerBillRange')?.value,/\b(?:bill|monthly electric|per month|\/mo)\b/),prompt:'About what is a typical monthly electric bill, and which months run highest?'},
      {key:'motivation',label:'Motivation',complete:has(lead?.solarMotivation||lead?.motivation,/\b(?:saving|savings|backup|outage|predictab|environment|solar because|goal)\b/),prompt:'What made solar worth exploring right now—bill control, backup power, predictability, or something else?'},
      {key:'roof',label:'Roof fit',complete:has(lead?.roofType||lead?.sunroofStatus||qualification.propertyNotes||document.getElementById('dialerPropertyNotes')?.value,/\b(?:roof|shade|shading|tree|panel|hoa)\b/),prompt:'What should we know about the roof—its age, shade, HOA, or electrical-panel concerns?'},
      {key:'usage',label:'Usage changes',complete:has(lead?.annualUsageKwh||qualification.usage||document.getElementById('dialerUsage')?.value,/\b(?:usage|kwh|ev|electric vehicle|pool|hvac|heat pump)\b/),prompt:'Do you expect usage to change from an EV, pool, HVAC, heat pump, or other plans?'},
      {key:'decision',label:'Decision makers',complete:has(lead?.decisionMakers||lead?.decisionMakerStatus,/\b(?:decision maker|spouse|partner|co-owner|both homeowner)\b/),prompt:'Who else should be part of the decision or the proposal appointment?'},
      {key:'timing',label:'Timing',complete:has(lead?.purchaseTimeline||lead?.timeline,/\b(?:timeline|this month|this year|as soon|before|timing)\b/),prompt:'If the property is a fit, what timing would feel realistic for the next step?'}
    ],missing=facts.filter(x=>!x.complete),complete=facts.length-missing.length,connected=state?.acceptedCall?.status==='connected',blocked=lead?.dnc||queued?.dnc,next=blocked?'This contact is DNC-suppressed. End outreach and document the reason.':missing[0]?.prompt||'You have the core qualification facts. Recap what you heard, confirm the next step, and book the right consultation only if the homeowner agrees.';
    return{facts,missing,complete,next,connected,blocked,name:lead?.name||queued?.name||'this homeowner'};
  }
  function updateCallCoach(){
    const coach=document.querySelector('.conduit-live-call-coach');if(!coach)return;const x=callCoachState(),markup=`<header><div><span>LOCAL CALL COACH · ${x.connected?'CONNECTED':'ACTIVE'}</span><h4>Recommended next line</h4></div><strong>${x.complete}/${x.facts.length} covered</strong></header><blockquote>“${esc(x.next)}”</blockquote><div class="conduit-coach-gaps"><span>${x.missing.length?'Still to cover':'Core qualification complete'}</span>${(x.missing.length?x.missing:x.facts).map(item=>`<b class="${item.complete?'done':''}">${item.complete?'✓ ':''}${esc(item.label)}</b>`).join('')}</div><footer><span>Updates from saved contact facts, live notes, and qualification fields.</span><button type="button" data-coach-qualification>Open qualification</button></footer>`;if(coach.innerHTML!==markup)coach.innerHTML=markup;
    const ai=document.getElementById('dialerTabAi');if(ai){const aiMarkup=`<section class="conduit-coach-tab"><span>LOCAL GUIDANCE · NO REMOTE MODEL</span><h3>Next recommendation for ${esc(x.name)}</h3><p>${esc(x.next)}</p><strong>${x.complete}/${x.facts.length} core questions covered</strong><small>${x.missing.length?`Missing: ${x.missing.map(item=>esc(item.label)).join(' · ')}`:'Ready to recap and agree on the next action.'}</small></section>`;if(ai.innerHTML!==aiMarkup)ai.innerHTML=aiMarkup;}
  }
  function updateDialerPreflight(){const panel=document.querySelector('.conduit-dialer-preflight');if(!panel)return;const{lead,queued}=activeDialerContext(),bill=lead?.monthlyBill||queued?.qualification?.billRange,utility=lead?.utility,roof=lead?.roofType||lead?.sunroofStatus,next=lead?.nextAction||queued?.nextAction;panel.innerHTML=`<header><div><span>CALL PREP</span><h3>Verify before dialing</h3></div><b>${lead?.consent==='verified'||queued?.consent==='verified'?'READY TO REVIEW':'NEEDS REVIEW'}</b></header><div><article><span>Consent & DNC</span><strong>${lead?.dnc||queued?.dnc?'Suppressed':lead?.consent==='verified'||queued?.consent==='verified'?'Consent recorded':'Confirm consent'}</strong></article><article><span>Utility & bill</span><strong>${esc([utility,bill&&(typeof bill==='number'?money(bill)+'/mo':bill)].filter(Boolean).join(' · ')||'Ask on call')}</strong></article><article><span>Roof context</span><strong>${esc(roof||'Not reviewed')}</strong></article><article><span>Next action</span><strong>${esc(next||'Set during call')}</strong></article></div><p>Provider state is shown above. This checklist does not place a call or verify regional eligibility.</p>`}
  function updateDialerLowerZones(){
    const left=document.querySelector('.conduit-dialer-call-path'),right=document.querySelector('.conduit-dialer-queue-insight');if(!left&&!right)return;
    const{state,queued}=activeDialerContext(),coachState=callCoachState(),leads=Array.isArray(state?.leads)?state.leads:[],settings=typeof window.readConduitSettings==='function'?window.readConduitSettings():{leadConsentRule:'verified',attemptLimit:6,minimumLeadScore:0,timezone:'UTC',callStart:'00:00',callEnd:'23:59'},eligible=x=>{if(!x||x.dnc)return false;if(settings.leadConsentRule==='verified'&&x.consent!=='verified')return false;if(!/^\+[1-9]\d{7,14}$/.test(String(x.phone||'')))return false;if((x.attempts||0)>=Number(settings.attemptLimit||6)||Number(x.score||0)<Number(settings.minimumLeadScore||0))return false;try{const local=new Intl.DateTimeFormat('en-GB',{timeZone:x.timezone||settings.timezone,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());return local>=settings.callStart&&local<settings.callEnd}catch{return false}},eligibleLeads=leads.filter(eligible),blockedLeads=leads.filter(x=>!eligible(x)),callbackLeads=leads.filter(x=>x?.callbackAt&&new Date(x.callbackAt)>new Date()),nextLeads=eligibleLeads.filter(x=>x.id!==state?.activeId).slice(0,3),connected=state?.acceptedCall?.status==='connected',sessionActive=Boolean(state?.sessionStartedAt)||state?.session==='active',lastOutcome=queued?.lastDisposition||queued?.disposition||'',providerReady=Boolean(state?.provider?.ready),mode=state?.mode==='provider'?'Provider calling':'Local simulation';
    if(left){
      const steps=[
        {label:'Record review',detail:queued?'Active homeowner loaded':'Select a homeowner',done:Boolean(queued)},
        {label:'Session',detail:sessionActive?'Session is running':'Start when ready',done:sessionActive},
        {label:'Conversation',detail:connected?'Call connected':providerReady?'Provider ready':'Awaiting call start',done:connected},
        {label:'Qualification',detail:`${coachState.complete}/${coachState.facts.length} facts covered`,done:coachState.complete===coachState.facts.length},
        {label:'Outcome',detail:lastOutcome||'Save after the call',done:Boolean(lastOutcome)}
      ];
      const markup=`<header><div><span>CALL PATH</span><h3>Keep the conversation moving</h3></div><b>${esc(mode)}</b></header><div class="conduit-call-path-grid">${steps.map((step,index)=>`<article class="${step.done?'done':''}"><i>${step.done?'✓':String(index+1).padStart(2,'0')}</i><div><strong>${esc(step.label)}</strong><small>${esc(step.detail)}</small></div></article>`).join('')}</div><footer><span>${coachState.missing.length?`Next qualification focus: ${esc(coachState.missing[0].label)}.`:'Core qualification is covered; recap and agree on the next step.'}</span><div><button type="button" data-dialer-lower-action="notes">Open notes</button><button type="button" data-dialer-lower-action="qualification">Qualification</button><button type="button" data-dialer-lower-action="outcome">Record outcome</button></div></footer>`;
      if(left.innerHTML!==markup)left.innerHTML=markup;
    }
    if(right){
      const nextMarkup=nextLeads.length?nextLeads.map((lead,index)=>`<article><i>${index+1}</i><div><strong>${esc(lead.name||'Unnamed homeowner')}</strong><small>${esc([lead.priority,lead.phone].filter(Boolean).join(' · ')||'Eligible record')}</small></div></article>`).join(''):'<p class="conduit-queue-empty">No additional eligible homeowners are waiting.</p>',markup=`<header><div><span>QUEUE INSIGHT</span><h3>What needs attention next</h3></div><b>${eligibleLeads.length} ready</b></header><div class="conduit-queue-metrics"><article><strong>${leads.length}</strong><span>Total</span></article><article><strong>${eligibleLeads.length}</strong><span>Eligible</span></article><article><strong>${callbackLeads.length}</strong><span>Callbacks</span></article><article><strong>${blockedLeads.length}</strong><span>Needs review</span></article></div><div class="conduit-queue-next"><span>UP NEXT</span>${nextMarkup}</div><footer><button type="button" data-dialer-lower-action="next"${nextLeads.length?'':' disabled'}>Load next eligible</button><button type="button" data-dialer-lower-action="callbacks">Open callbacks</button></footer>`;
      if(right.innerHTML!==markup)right.innerHTML=markup;
    }
  }
  function updateScript(){const coach=document.querySelector('.conduit-dialer-script-coach');if(!coach)return;const key=coach.querySelector('[data-script-type]')?.value||'inquiry',regionKey=coach.querySelector('[data-script-region]')?.value||'national',first=(document.getElementById('dialerActiveName')?.textContent||'').trim().split(/\s+/)[0],body=coach.querySelector('.conduit-script-body'),markup=scriptMarkup(key,/no lead/i.test(first)?'there':first,regionKey);if(body.innerHTML!==markup)body.innerHTML=markup;updateDialerPreflight();updateCallCoach();}
  function setScriptExpanded(coach,expanded){if(!coach)return;const body=coach.querySelector('.conduit-script-body'),button=coach.querySelector('[data-script-expand]');coach.classList.toggle('expanded',expanded);if(body)body.hidden=!expanded;if(button){button.setAttribute('aria-expanded',String(expanded));button.textContent=expanded?'Hide full script':'Show full script';}localStorage.setItem(SCRIPT_EXPANDED_KEY,String(expanded));}
  function installDialerNoteColumn(call){
    const workbench=call?.querySelector('.dialer-call-workbench'),dialpad=call?.querySelector('.dialpad'),notes=call?.querySelector('#dialerTabNotes');if(!workbench||!dialpad||!notes)return;
    let column=call.querySelector(':scope > .conduit-dialer-pad-column');if(!column){column=document.createElement('section');column.className='conduit-dialer-pad-column';call.insertBefore(column,dialpad);}
    if(dialpad.parentElement!==column)column.append(dialpad);
    const compliance=call.querySelector('#dialerActiveDnc')?.closest('div'),notice=call.querySelector('#dialerCallNotice');if(notes.parentElement!==column)column.append(notes);notes.hidden=false;if(compliance&&compliance.parentElement!==column)column.append(compliance);if(notice&&notice.parentElement!==column)column.append(notice);
    const noteTab=call.querySelector('[data-dialer-tab="notes"]');if(noteTab){noteTab.hidden=true;noteTab.setAttribute('aria-hidden','true');noteTab.tabIndex=-1;}
  }
  function rebalanceDialerOperations(shell,queue,session){
    const operations=document.getElementById('conduitComplianceOperations');
    if(!operations||!shell||!queue)return;
    operations.classList.add('conduit-dialer-operations');
    if(operations.parentElement!==shell){
      if(session?.parentElement===shell)session.after(operations);
      else shell.append(operations);
    }
  }
  function installDialerEnhancements(){
    const shell=document.querySelector('.page[data-page="dialer"] .dialer-shell');if(!shell)return;const panels=[...shell.children].filter(x=>x.classList.contains('dialer-panel'));if(panels.length<2)return;
    panels.forEach(panel=>panel.classList.remove('conduit-dialer-session','conduit-dialer-call','conduit-dialer-queue'));
    const session=panels.find(x=>x.querySelector('#dialerCampaign')),call=panels.find(x=>x.querySelector('#dialerActiveName')),queue=panels.find(x=>x.querySelector('#dialerQueue'));
    if(!call)return;shell.classList.add('conduit-dialer-ready');session?.classList.add('conduit-dialer-session');call.classList.add('conduit-dialer-call');queue?.classList.add('conduit-dialer-queue');
    if(!call.querySelector('.conduit-dialer-script-coach')){const saved=localStorage.getItem(SCRIPT_KEY)||'inquiry',savedRegion=localStorage.getItem(SCRIPT_REGION_KEY)||'national',expanded=localStorage.getItem(SCRIPT_EXPANDED_KEY)==='true',coach=document.createElement('section');coach.className='conduit-dialer-script-coach';coach.innerHTML=`<header><div><h3>Live solar call script</h3><p>Keep the live coach visible; open the full guide only when needed.</p></div><div class="conduit-script-selectors"><label>Call purpose<select data-script-type aria-label="Select dialer script">${Object.entries(SCRIPTS).map(([key,x])=>`<option value="${key}" ${key===saved?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label><label>Location<select data-script-region aria-label="Select script location">${Object.entries(SCRIPT_REGIONS).map(([key,x])=>`<option value="${key}" ${key===savedRegion?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label></div></header><section class="conduit-live-call-coach" aria-live="polite"></section><button type="button" class="conduit-script-expand" data-script-expand aria-expanded="${expanded}">${expanded?'Hide full script':'Show full script'}</button><div class="conduit-script-body" ${expanded?'':'hidden'}></div>`;const workbench=call.querySelector('.dialer-call-workbench'),dialpad=call.querySelector('.dialpad');workbench?workbench.prepend(coach):dialpad?.before(coach);coach.querySelector('[data-script-type]').addEventListener('change',event=>{localStorage.setItem(SCRIPT_KEY,event.target.value);updateScript();});coach.querySelector('[data-script-region]').addEventListener('change',event=>{localStorage.setItem(SCRIPT_REGION_KEY,event.target.value);updateScript();});coach.querySelector('[data-script-expand]').addEventListener('click',event=>setScriptExpanded(coach,event.currentTarget.getAttribute('aria-expanded')!=='true'));}
    const coach=call.querySelector('.conduit-dialer-script-coach'),workbench=call.querySelector('.dialer-call-workbench'),dialpad=call.querySelector('.dialpad'),mobile=matchMedia('(max-width: 820px)').matches;
    if(dialpad&&!call.querySelector('.conduit-dialer-preflight')){const preflight=document.createElement('section');preflight.className='conduit-dialer-preflight';dialpad.after(preflight);}
    const preflight=call.querySelector('.conduit-dialer-preflight');if(preflight&&!call.querySelector('.conduit-dialer-call-path')){const path=document.createElement('section');path.className='conduit-dialer-call-path';preflight.after(path);}
    const timeline=queue?.querySelector('#dialerTimeline');if(timeline&&!queue.querySelector('.conduit-dialer-queue-insight')){const insight=document.createElement('section');insight.className='conduit-dialer-queue-insight';timeline.after(insight);}
    if(coach&&mobile&&dialpad&&coach.parentElement===workbench){const padColumn=call.querySelector(':scope > .conduit-dialer-pad-column'),target=padColumn||dialpad;if(target.parentElement===call)call.insertBefore(coach,target);else target.before(coach);}
    else if(coach&&!mobile&&workbench&&coach.parentElement!==workbench)workbench.prepend(coach);
    installDialerNoteColumn(call);rebalanceDialerOperations(shell,queue,session);updateScript();updateDialerLowerZones();
  }

  function boot(){
    document.addEventListener('click',handleClick,true);document.addEventListener('submit',handleSubmit,true);
    document.addEventListener('click',event=>{if(event.target.closest('[data-coach-qualification]'))document.querySelector('[data-dialer-tab="qualification"]')?.click();if(event.target.closest('[data-dialer-tab]'))requestAnimationFrame(()=>{const notes=document.getElementById('dialerTabNotes');if(notes)notes.hidden=false;});const action=event.target.closest('[data-dialer-lower-action]')?.dataset.dialerLowerAction;if(!action)return;if(action==='notes'){const notes=document.getElementById('dialerNotes');notes?.scrollIntoView({behavior:'smooth',block:'center'});notes?.focus({preventScroll:true});}else if(action==='qualification')document.querySelector('[data-dialer-tab="qualification"]')?.click();else if(action==='outcome')document.getElementById('dialerDisposition')?.scrollIntoView({behavior:'smooth',block:'center'});else if(action==='next'){const button=document.getElementById('dialerLoadNext');if(button&&!button.disabled)button.click();else document.getElementById('dialerCallNext')?.click();}else if(action==='callbacks')document.querySelector('[data-pg="callbacks"]')?.click();});
    document.addEventListener('input',event=>{if(event.target.closest('#dialerNotes,#dialerHomeowner,#dialerBillRange,#dialerUsage,#dialerPropertyNotes'))requestAnimationFrame(updateCallCoach)});document.addEventListener('change',event=>{if(event.target.closest('#dialerHomeowner,#dialerBillRange,#dialerUsage,#dialerPropertyNotes'))requestAnimationFrame(updateCallCoach)});
    window.addEventListener('hashchange',()=>{if(ui.opening)return;const match=location.hash.match(/^#contact\/(.+)$/);if(match)openWorkspace(decodeURIComponent(match[1]));else if(ui.leadId)closeWorkspace(false);});
    window.addEventListener('conduit:crm-updated',()=>{if(ui.leadId)render();});window.addEventListener('conduit:dialer-updated',()=>setTimeout(()=>{installDialerEnhancements();updateScript();updateDialerLowerZones();},30));
    let enhancementQueued=false;const observer=new MutationObserver(()=>{if(enhancementQueued)return;enhancementQueued=true;requestAnimationFrame(()=>{enhancementQueued=false;installDialerEnhancements();if(ui.leadId&&!document.querySelector('.conduit-contact-workspace'))render();});});observer.observe(document.body,{childList:true,subtree:true});
    installDialerEnhancements();const match=location.hash.match(/^#contact\/(.+)$/);if(match)openWorkspace(decodeURIComponent(match[1]));
    window.conduitCustomerWorkspace={open:openWorkspace,close:closeWorkspace};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
