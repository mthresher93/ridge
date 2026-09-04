(() => {
  'use strict';

  const CRM_STORE = 'conduit.crm.v1';
  const SUNROOF_SELECTED = 'conduit.solar.sunroof.selected.v1';
  const SUNROOF_ASSETS = 'conduit.solar.sunroof.assets.v1';
  const ROOF_DESIGNS = 'conduit.solar.roof-designs.v1';
  const ROOF_MODEL_DB = 'conduit-roof-models-v1';
  const PROPOSAL_STEP = 'conduit.solar.proposal-step.v1';
  const PROPOSAL_DRAFTS = 'conduit.solar.proposal-drafts.v1';
  const CALENDAR_PREFS = 'conduit.solar.calendar.settings.v1';
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(+value || 0);
  const loadCRM = () => window.conduitCRM?.load?.() || JSON.parse(localStorage.getItem(CRM_STORE) || '{}');
  const saveCRM = (database) => window.conduitCRM?.save?.(database) || localStorage.setItem(CRM_STORE, JSON.stringify(database));
  const readJSON = (key, fallback) => { try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch { return fallback; } };
  const solarProfiles = [
    ['Austin Energy', 238, 'Asphalt shingle', 8, 1832, 912, 8, 9.6, 'Strong fit', 'Interested'],
    ['APS', 312, 'Concrete tile', 11, 2110, 1040, 5, 11.2, 'Strong fit', 'Maybe'],
    ['Xcel Energy', 194, 'Asphalt shingle', 6, 1764, 824, 12, 8.4, 'Strong fit', 'Interested'],
    ['Georgia Power', 267, 'Standing seam', 4, 1896, 936, 7, 10.1, 'Strong fit', 'Interested'],
    ['LADWP', 351, 'Concrete tile', 16, 2042, 876, 15, 9.3, 'Review', 'Maybe'],
    ['Seattle City Light', 186, 'Composite', 9, 1428, 742, 18, 7.1, 'Review', 'Interested'],
    ['ComEd', 224, 'Asphalt shingle', 14, 1584, 812, 16, 7.9, 'Review', 'No'],
    ['FPL', 289, 'Concrete tile', 7, 1968, 962, 9, 10.4, 'Strong fit', 'Interested'],
    ['Con Edison', 328, 'Flat membrane', 12, 1540, 688, 20, 6.8, 'Review', 'Maybe'],
    ['Eversource', 203, 'Asphalt shingle', 18, 1606, 754, 17, 7.4, 'Review', 'No'],
    ['Oncor', 278, 'Asphalt shingle', 5, 2028, 998, 6, 10.8, 'Strong fit', 'Interested'],
    ['NES', 217, 'Metal', 3, 1882, 910, 8, 9.7, 'Strong fit', 'Maybe'],
    ['PG&E', 382, 'Composite', 19, 2070, 846, 19, 8.8, 'Review', 'Interested'],
    ['Portland General', 198, 'Asphalt shingle', 10, 1512, 728, 15, 7.2, 'Review', 'Maybe'],
    ['Pepco', 246, 'Asphalt shingle', 7, 1718, 862, 11, 8.7, 'Strong fit', 'Interested']
  ];
  const appointmentTypes = ['Solar consultation', 'Roof & shade review', 'Site survey', 'Utility bill review', 'Proposal review', 'Design handoff', 'Installation readiness'];
  const starterLocations = [
    ['Austin', 'TX', '310 Congress Ave, Austin, TX'], ['Phoenix', 'AZ', '125 W Monroe St, Phoenix, AZ'], ['Denver', 'CO', '1700 Lincoln St, Denver, CO'],
    ['Atlanta', 'GA', '191 Peachtree St, Atlanta, GA'], ['Los Angeles', 'CA', '600 S Spring St, Los Angeles, CA']
  ];
  let homeCalendarCursor = new Date();
  let homeCalendarOwner = 'all';
  let homeCalendarStatus = 'all';
  let kpiRange = 30;
  let seeding = false;
  const roofMapInstances = new Map();
  const roofModelUrls = new Map();

  function kpiTrendData(database, range = kpiRange) {
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const start = new Date(end); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - range + 1);
    const dates = Array.from({ length: range }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
    const accumulate = (records, dateFor, valueFor = () => 1) => {
      const daily = Array(range).fill(0);
      records.forEach((record) => {
        const stamp = Date.parse(dateFor(record) || '');
        if (!Number.isFinite(stamp) || stamp < start.getTime() || stamp > end.getTime()) return;
        const index = Math.min(range - 1, Math.max(0, Math.floor((stamp - start.getTime()) / 86400000)));
        daily[index] += +valueFor(record) || 0;
      });
      let running = 0;
      return daily.map((value) => (running += value));
    };
    const opportunities = database.opportunities || [], appointments = database.appointments || [], tasks = database.tasks || [], callbacks = database.callbacks || [], now = Date.now();
    const stalledDeals = opportunities.filter((item) => now - Date.parse(item.stageEnteredAt || item.updatedAt || item.createdAt || now) > 14 * 86400000);
    const overdueActions = [
      ...tasks.filter((item) => item.status !== 'completed' && Date.parse(item.dueAt || '') < now).map((item) => ({ _date: item.dueAt || item.updatedAt || item.createdAt })),
      ...callbacks.filter((item) => item.status === 'open' && Date.parse(item.dueAt || '') < now).map((item) => ({ _date: item.dueAt || item.updatedAt || item.createdAt }))
    ];
    const definitions = [
      { key: 'revenue', label: 'Revenue moved', color: '#0f9f5f', values: accumulate(opportunities, (item) => item.stageEnteredAt || item.updatedAt || item.createdAt, (item) => item.value), format: money, note: 'Pipeline value entering a stage' },
      { key: 'appointments', label: 'Appointments set', color: '#54b875', values: accumulate(appointments, (item) => item.startsAt || item.updatedAt || item.createdAt), format: (value) => `${value} ${value === 1 ? 'appointment' : 'appointments'}`, note: 'Scheduled customer meetings' },
      { key: 'stalled', label: 'Stalled deals', color: '#e04455', values: accumulate(stalledDeals, (item) => item.stageEnteredAt || item.updatedAt || item.createdAt), format: (value) => `${value} ${value === 1 ? 'deal' : 'deals'}`, note: 'More than 14 days in stage' },
      { key: 'overdue', label: 'Overdue actions', color: '#b92f45', values: accumulate(overdueActions, (item) => item._date), format: (value) => `${value} ${value === 1 ? 'action' : 'actions'}`, note: 'Tasks and callbacks past due' }
    ];
    definitions.forEach((series) => { const maximum = Math.max(1, ...series.values); series.normalized = series.values.map((value) => value / maximum * 100); series.total = series.values.at(-1) || 0; });
    return { dates, series: definitions, range };
  }

  function kpiTrendMarkup(database, context = 'home') {
    const payload = kpiTrendData(database), left = 64, right = 974, top = 32, bottom = 240, width = right - left, height = bottom - top;
    const point = (index, value) => [left + index / Math.max(1, payload.dates.length - 1) * width, bottom - value / 100 * height];
    const pathFor = (values) => {
      const points = values.map((value, index) => point(index, value));
      return points.slice(1).reduce((path, current, index) => { const previous = points[index], midpoint = (previous[0] + current[0]) / 2; return `${path} C${midpoint.toFixed(1)} ${previous[1].toFixed(1)},${midpoint.toFixed(1)} ${current[1].toFixed(1)},${current[0].toFixed(1)} ${current[1].toFixed(1)}`; }, `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`);
    };
    const labelIndexes = [...new Set([0, Math.round((payload.dates.length - 1) / 4), Math.round((payload.dates.length - 1) / 2), Math.round((payload.dates.length - 1) * .75), payload.dates.length - 1])];
    const title = context === 'reports' ? 'Revenue & conversion momentum' : 'KPI momentum over time';
    return `<section class="kpi-trend" data-kpi-context="${context}"><header><div><span class="solar-eyebrow">INTERACTIVE PERFORMANCE TREND</span><h2>${title}</h2><p>Green tracks revenue movement and appointments. Red isolates stalled deals and overdue actions. Every line has one operational purpose and uses real CRM timestamps.</p></div><div class="kpi-range" aria-label="Trend period">${[7,30,90].map((days) => `<button class="${kpiRange === days ? 'active' : ''}" data-kpi-range="${days}" aria-pressed="${kpiRange === days}">${days}D</button>`).join('')}</div></header><div class="kpi-summary">${payload.series.map((series) => `<button data-kpi-series="${series.key}" aria-pressed="true"><i style="--series:${series.color}"></i><span>${series.label}<small>${series.note}</small></span><b>${series.format(series.total)}</b></button>`).join('')}</div><div class="kpi-chart-shell"><div class="kpi-chart-canvas"><svg viewBox="0 0 1000 280" role="img" aria-label="${payload.range}-day line chart of revenue, appointments, stalled deals, and overdue actions" preserveAspectRatio="none"><g class="kpi-grid">${[0,25,50,75,100].map((value) => { const y = bottom - value / 100 * height; return `<line x1="${left}" x2="${right}" y1="${y}" y2="${y}"></line>`; }).join('')}</g>${payload.series.map((series) => { const path = pathFor(series.normalized); return `<g class="kpi-series" data-kpi-series-line="${series.key}" style="--series:${series.color}"><path class="kpi-line-glow" d="${path}"></path><path class="kpi-line-main" d="${path}"></path><circle data-kpi-dot="${series.key}" r="5" cx="${point(payload.dates.length - 1, series.normalized.at(-1) || 0)[0]}" cy="${point(payload.dates.length - 1, series.normalized.at(-1) || 0)[1]}"></circle></g>`; }).join('')}<line class="kpi-guide" x1="${right}" x2="${right}" y1="${top}" y2="${bottom}"></line><rect class="kpi-hit" x="${left}" y="${top}" width="${width}" height="${height}"></rect></svg><div class="kpi-y-scale" aria-hidden="true">${[100,75,50,25,0].map((value) => `<span style="top:${(bottom - value / 100 * height) / 2.8}%">${value}</span>`).join('')}</div><div class="kpi-x-scale" aria-hidden="true">${labelIndexes.map((index) => `<span style="left:${point(index,0)[0] / 10}%">${payload.dates[index].toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>`).join('')}</div><div class="kpi-tooltip" aria-hidden="true"></div></div></div><footer><span>0–100 momentum index</span><small>Actual local CRM records · no invented historical snapshots</small></footer></section>`;
  }

  function enhanceKpiTrends() {
    document.querySelectorAll('.kpi-trend:not([data-kpi-enhanced])').forEach((section) => {
      section.dataset.kpiEnhanced = 'true';
      const payload = kpiTrendData(loadCRM()), svg = section.querySelector('svg'), tooltip = section.querySelector('.kpi-tooltip'), guide = section.querySelector('.kpi-guide');
      const move = (event) => {
        const rect = svg.getBoundingClientRect(), raw = (event.clientX - rect.left) / Math.max(1, rect.width), ratio = Math.min(1, Math.max(0, (raw - .064) / .91)), index = Math.round(ratio * (payload.dates.length - 1)), x = 64 + index / Math.max(1, payload.dates.length - 1) * 910;
        guide.setAttribute('x1', x); guide.setAttribute('x2', x); guide.classList.add('visible');
        const active = payload.series.filter((series) => !section.querySelector(`[data-kpi-series="${series.key}"]`)?.classList.contains('is-off'));
        active.forEach((series) => { const dot = section.querySelector(`[data-kpi-dot="${series.key}"]`), y = 240 - (series.normalized[index] || 0) / 100 * 208; dot?.setAttribute('cx', x); dot?.setAttribute('cy', y); });
        tooltip.innerHTML = `<b>${payload.dates[index].toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</b>${active.map((series) => `<span><i style="--series:${series.color}"></i>${series.label}<strong>${series.format(series.values[index] || 0)}</strong></span>`).join('')}`;
        tooltip.style.left = `clamp(118px, ${x / 10}%, calc(100% - 118px))`; tooltip.classList.add('visible'); tooltip.setAttribute('aria-hidden', 'false');
      };
      svg.addEventListener('pointermove', move);
      svg.addEventListener('pointerleave', () => { tooltip.classList.remove('visible'); tooltip.setAttribute('aria-hidden', 'true'); guide.classList.remove('visible'); });
    });
  }

  function refreshKpiTrends() {
    document.querySelectorAll('.kpi-trend').forEach((section) => { const template = document.createElement('template'); template.innerHTML = kpiTrendMarkup(loadCRM(), section.dataset.kpiContext || 'home'); section.replaceWith(template.content.firstElementChild); });
    enhanceKpiTrends();
  }

  function profileFor(lead, index) {
    const profile = solarProfiles[index % solarProfiles.length];
    return {
      vertical: 'Residential solar', propertyType: lead.propertyType || 'Single-family home', ownership: lead.ownership || 'Owner',
      utility: lead.utility || profile[0], monthlyBill: +lead.monthlyBill || profile[1], roofType: lead.roofType || profile[2],
      roofAge: +lead.roofAge || profile[3], annualSunHours: +lead.annualSunHours || profile[4], usableRoofSqFt: +lead.usableRoofSqFt || profile[5],
      shadeLoss: Number.isFinite(+lead.shadeLoss) ? +lead.shadeLoss : profile[6], recommendedKw: +lead.recommendedKw || profile[7],
      sunroofStatus: lead.sunroofStatus || profile[8], storageInterest: lead.storageInterest || profile[9]
    };
  }

  function ensureSolarData() {
    if (seeding) return;
    const database = loadCRM();
    if (!database.starterWorkspace || !Array.isArray(database.leads) || !database.leads.length) return;
    seeding = true;
    let changed = false;
    database.leads.forEach((lead, index) => {
      const profile = profileFor(lead, index);
      for (const [key, value] of Object.entries(profile)) if (lead[key] === undefined || lead[key] === '') { lead[key] = value; changed = true; }
      const location = starterLocations[index];
      if (location && !lead.address) { [lead.city, lead.state, lead.address] = location; changed = true; }
      if (lead.id === 'starter-lead-1' && lead.company === 'BrightPeak Solar') { lead.company = 'Lee Residence'; changed = true; }
    });
    (database.opportunities || []).forEach((opportunity) => { const lead = database.leads.find((item) => item.id === opportunity.leadId); if (lead?.company && opportunity.company !== lead.company) { opportunity.company = lead.company; changed = true; } });
    database.appointments = database.appointments || [];
    const base = new Date();
    base.setMinutes(0, 0, 0);
    const statuses = ['confirmed', 'scheduled', 'needs confirmation', 'completed', 'confirmed', 'scheduled', 'confirmed', 'completed', 'needs confirmation', 'scheduled', 'confirmed', 'scheduled', 'confirmed', 'scheduled'];
    for (let index = database.appointments.length; index < 16; index += 1) {
      const lead = database.leads[index % database.leads.length];
      const startsAt = new Date(base);
      startsAt.setDate(base.getDate() + index - 5);
      startsAt.setHours(9 + (index % 6), index % 2 ? 30 : 0);
      database.appointments.push({
        id: `solar-appointment-${index + 1}`, leadId: lead.id, type: appointmentTypes[index % appointmentTypes.length], startsAt: startsAt.toISOString(),
        duration: [30, 45, 60, 90][index % 4], setter: ['Avery', 'Nina', 'Michael'][index % 3], closer: ['Michael', 'Nina', 'Avery'][index % 3],
        location: index % 3 === 0 ? lead.address || `${lead.city}, ${lead.state}` : index % 3 === 1 ? 'Video consultation' : 'Phone consultation',
        status: statuses[index % statuses.length], utility: lead.utility, monthlyBill: lead.monthlyBill, roofReview: lead.sunroofStatus,
        appointmentGoal: appointmentTypes[index % appointmentTypes.length], travelBuffer: index % 3 === 0 ? 30 : 0,
        reminderPolicy: index % 2 ? '24h + 2h SMS' : '24h email + 1h SMS', notes: `Solar handoff: verify ${lead.utility} bill, ${lead.roofType.toLowerCase()} roof, and ${lead.recommendedKw} kW planning range.`, starter: true
      });
      changed = true;
    }
    database.tasks = database.tasks || [];
    const solarTasks = [
      ['Collect latest utility bill', 0, 'High'], ['Review roof age and material', 1, 'High'], ['Confirm site-survey access', 2, 'Medium'],
      ['Prepare battery option', 3, 'Medium'], ['Check proposal assumptions', 4, 'High'], ['Confirm installation timeline', 5, 'Medium']
    ];
    for (const [label, offset, priority] of solarTasks) if (!database.tasks.some((task) => task.title === label)) {
      const due = new Date(base); due.setDate(base.getDate() + offset);
      database.tasks.push({ id: `solar-task-${offset + 1}`, leadId: database.leads[offset % database.leads.length].id, title: label, dueAt: due.toISOString(), status: 'open', priority, owner: ['Avery', 'Michael', 'Nina'][offset % 3], starter: true });
      changed = true;
    }
    if (changed) saveCRM(database);
    seeding = false;
  }

  function solarScore(lead) {
    return Math.max(30, Math.min(98, Math.round(62 + (+lead.annualSunHours - 1300) / 22 - +lead.shadeLoss * .55 - Math.max(0, +lead.roofAge - 14) * .7)));
  }

  function sunroofAssets() {
    const read = (storage) => { try { return JSON.parse(storage.getItem(SUNROOF_ASSETS) || '{}'); } catch { return {}; } };
    const local = read(localStorage), session = read(sessionStorage), merged = { ...local };
    Object.entries(session).forEach(([id, assets]) => { merged[id] = { ...(merged[id] || {}), ...assets }; });
    return merged;
  }

  function saveSunroofAsset(leadId, patch, sessionOnly = false) {
    const storage = sessionOnly ? sessionStorage : localStorage;
    let assets = {};
    try { assets = JSON.parse(storage.getItem(SUNROOF_ASSETS) || '{}'); } catch {}
    assets[leadId] = { ...(assets[leadId] || {}), ...patch };
    try { storage.setItem(SUNROOF_ASSETS, JSON.stringify(assets)); return true; } catch { return false; }
  }

  function estimateFor(lead) {
    const panelWatts = +lead.panelWatts || 425, utilityRate = +lead.utilityRate || .16, targetOffset = +lead.targetOffset || 90;
    const annualUse = +lead.annualKwh || Math.round((+lead.monthlyBill || 0) / utilityRate * 12);
    const sunYield = Math.max(850, (+lead.annualSunHours || 1500) * (1 - (+lead.shadeLoss || 0) / 100) * .78);
    const requiredKw = annualUse ? annualUse * targetOffset / 100 / sunYield : (+lead.recommendedKw || 0);
    const roofPanelCapacity = Math.max(1, Math.floor((+lead.usableRoofSqFt || 0) / 22));
    const requestedKw = +lead.estimateSystemKw || +lead.recommendedKw || requiredKw;
    const panelCount = Math.max(1, Math.min(roofPanelCapacity, Math.ceil(requestedKw * 1000 / panelWatts)));
    const systemKw = Math.round(panelCount * panelWatts / 100) / 10;
    const annualProduction = Math.round(systemKw * sunYield), offset = annualUse ? Math.min(100, Math.round(annualProduction / annualUse * 100)) : 0;
    const pricePerWatt = +lead.pricePerWatt || 3.05, incentivePercent = Number.isFinite(+lead.incentivePercent) ? +lead.incentivePercent : 30;
    const grossPrice = Math.round(systemKw * 1000 * pricePerWatt), incentive = Math.round(grossPrice * incentivePercent / 100), netPrice = grossPrice - incentive;
    const annualSavings = Math.round(Math.min(annualUse || annualProduction, annualProduction) * utilityRate), payback = annualSavings ? netPrice / annualSavings : 0;
    const years = +lead.financeYears || 20, apr = +lead.financeApr || 6.99, months = years * 12, monthlyRate = apr / 1200;
    const monthlyPayment = monthlyRate && months ? Math.round(netPrice * monthlyRate * (1 + monthlyRate) ** months / ((1 + monthlyRate) ** months - 1)) : Math.round(netPrice / Math.max(1, months));
    return { panelWatts, utilityRate, targetOffset, annualUse, roofPanelCapacity, panelCount, systemKw, annualProduction, offset, pricePerWatt, incentivePercent, grossPrice, incentive, netPrice, annualSavings, payback, years, apr, monthlyPayment };
  }

  const proposalSteps = [
    ['property', 'Property', 'Address and source'],
    ['consumption', 'Consumption', 'Bill and usage'],
    ['roof-design', 'Roof design', 'Planes and modules'],
    ['system', 'System', 'Production and offset'],
    ['pricing', 'Pricing', 'Price and financing'],
    ['review', 'Review', 'Readiness and versions']
  ];
  function proposalDrafts(){try{return JSON.parse(localStorage.getItem(PROPOSAL_DRAFTS)||'{}')}catch{return{}}}
  function proposalDraftFor(leadId){return proposalDrafts()[leadId]||{}}
  function saveProposalDraft(leadId,patch){const drafts=proposalDrafts();drafts[leadId]={...(drafts[leadId]||{}),...patch,updatedAt:new Date().toISOString()};localStorage.setItem(PROPOSAL_DRAFTS,JSON.stringify(drafts));return drafts[leadId]}
  function clearProposalDraft(leadId){const drafts=proposalDrafts();delete drafts[leadId];localStorage.setItem(PROPOSAL_DRAFTS,JSON.stringify(drafts))}
  function currentProposalStep(leadId){try{return JSON.parse(localStorage.getItem(PROPOSAL_STEP)||'{}')[leadId]||'property'}catch{return'property'}}
  function saveProposalStep(leadId,step){let steps={};try{steps=JSON.parse(localStorage.getItem(PROPOSAL_STEP)||'{}')}catch{}steps[leadId]=proposalSteps.some(([id])=>id===step)?step:'property';localStorage.setItem(PROPOSAL_STEP,JSON.stringify(steps))}
  function proposalReadinessFor(lead,design,estimate,assets={}){
    const address=String(lead.address||'').trim(),callable=/^\+[1-9]\d{7,14}$/.test(lead.phone||''),hasConsumption=+lead.monthlyBill>0||+lead.annualKwh>0,hasDesign=estimate.panelCount>0&&estimate.systemKw>0,hasPricing=+estimate.pricePerWatt>0&&+estimate.years>0&&Number.isFinite(+estimate.apr);
    const groups=[
      {id:'property',label:'Property',checks:[['Complete address',address.length>8],['Mapped property',Boolean(design.roofLocation||address)],['Property source',Boolean(design.sourceMode)]]},
      {id:'consumption',label:'Consumption',checks:[['Monthly bill or annual usage',hasConsumption],['Utility identified',Boolean(lead.utility)],['Usage source documented',Boolean(assets.billName||lead.utilityBillDocument||+lead.annualKwh>0)]]},
      {id:'roof-design',label:'Roof design',checks:[['Roof material recorded',Boolean(design.roofMaterial&&design.roofMaterial!=='Unknown')],['Existing-roof condition reviewed',Boolean(design.roofCondition&&design.roofCondition!=='Not inspected')],['Module layout saved',hasDesign]]},
      {id:'system',label:'System',checks:[['Panel rating selected',+estimate.panelWatts>0],['System size calculated',+estimate.systemKw>0],['Production and offset calculated',+estimate.annualProduction>0&&+estimate.offset>0]]},
      {id:'pricing',label:'Pricing',checks:[['Installed price set',+estimate.pricePerWatt>0],['Finance assumptions set',hasPricing],['Net price calculated',+estimate.netPrice>0]]},
      {id:'review',label:'Review',checks:[['Contact route available',callable||Boolean(lead.email)],['Planning estimate saved',Boolean(lead.estimateUpdatedAt)],['Proposal version saved',Boolean(lead.proposalVersions?.length)]]}
    ];
    const checks=groups.flatMap((group)=>group.checks.map(([label,ok])=>({group:group.id,label,ok:Boolean(ok)}))),complete=checks.filter((item)=>item.ok).length,percent=Math.round(complete/Math.max(1,checks.length)*100),missing=checks.filter((item)=>!item.ok);
    return{groups:groups.map((group)=>({...group,complete:group.checks.filter(([,ok])=>ok).length,total:group.checks.length})),checks,complete,total:checks.length,percent,missing,status:percent===100?'Ready for verified review':percent>=72?'Needs verification':percent>=45?'Needs input':'Blocked by missing inputs'}
  }
  function proposalCommandMarkup(lead,readiness,draft){
    const active=currentProposalStep(lead.id),updated=draft.updatedAt||lead.estimateUpdatedAt||lead.roofDesignUpdatedAt||lead.updatedAt;
    return `<section class="proposal-command" data-proposal-workspace data-lead-id="${esc(lead.id||'')}" data-proposal-current-step="${esc(active)}"><header><div><span class="solar-eyebrow">GUIDED PROPOSAL WORKSPACE</span><h2>${esc(lead.name||'Select a homeowner')}</h2><p>${esc(lead.address||'Add a complete property address')} · ${draft.updatedAt?'Working assumptions auto-saved':updated?`Last saved ${new Date(updated).toLocaleString()}`:'Not saved yet'}</p></div><div class="proposal-readiness"><strong>${readiness.percent}%</strong><span>${esc(readiness.status)}</span><small>${readiness.missing.length?`${readiness.missing.length} checks still need attention`:'All local planning checks complete'}</small></div></header><nav aria-label="Proposal build steps">${proposalSteps.map(([id,label,copy],index)=>{const group=readiness.groups.find((item)=>item.id===id),complete=group?.complete===group?.total;return`<button type="button" class="${active===id?'active':''} ${complete?'complete':''}" data-proposal-step="${id}" aria-current="${active===id?'step':'false'}"><i>${complete?'✓':index+1}</i><span>${label}<small>${copy}</small></span><b>${group?.complete||0}/${group?.total||0}</b></button>`}).join('')}</nav><footer><button type="button" class="btn" data-proposal-prev>← Previous</button><div><span data-proposal-step-summary>${esc(proposalSteps.find(([id])=>id===active)?.[1]||'Property')}</span><small>Changes to estimate fields are auto-saved as a working draft.</small></div><button type="button" class="btn pri" data-proposal-next>Continue →</button></footer></section>`
  }
  function proposalReviewMarkup(lead,design,estimate,readiness,opportunity){
    const versions=(lead.proposalVersions||[]).slice().reverse();
    return `<section class="proposal-review" data-proposal-panel="review"><header><div><span class="solar-eyebrow">PROPOSAL REVIEW & VERSION HISTORY</span><h2>Review before anything is presented</h2><p>The snapshot below is local planning work. Missing checks stay visible and every explicit version preserves the assumptions used at that moment.</p></div><label>Status<select data-proposal-status data-lead-id="${esc(lead.id)}">${['Draft','Internal review','Ready for verified review','Presented','Revision requested'].map((value)=>`<option ${value===(lead.proposalStatus||'Draft')?'selected':''}>${value}</option>`).join('')}</select></label></header><div class="proposal-review-grid"><article class="proposal-readiness-card"><div class="proposal-readiness-score" style="--proposal-score:${readiness.percent}"><strong>${readiness.percent}</strong><span>OF 100</span></div><div><h3>${esc(readiness.status)}</h3><p>${readiness.missing.length?`${readiness.missing.length} local checks remain. Open a step below to complete or verify them.`:'Every local planning check is complete. Field and provider verification still control the final proposal.'}</p><div class="proposal-missing-list">${readiness.missing.slice(0,8).map((item)=>`<button type="button" data-proposal-step="${item.group}"><span>${esc(item.label)}</span><b>Open ${esc(proposalSteps.find(([id])=>id===item.group)?.[1]||item.group)} →</b></button>`).join('')||'<span class="proposal-complete-state">✓ Local planning inputs complete</span>'}</div></div></article><article class="proposal-review-summary"><div><span>HOMEOWNER / PROPERTY</span><b>${esc(lead.name||'Unnamed')} · ${esc(lead.address||'Address required')}</b><small>${esc(lead.utility||'Utility required')} · ${money(lead.monthlyBill)}/month</small></div><div><span>ARRAY</span><b>${estimate.panelCount} modules · ${estimate.systemKw} kW</b><small>${esc(design.sourceMode)} · ${estimate.annualProduction.toLocaleString()} kWh/year · ${estimate.offset}% offset</small></div><div><span>PLANNING PRICE</span><b>${money(estimate.netPrice)} · ${money(estimate.monthlyPayment)}/month</b><small>${money(estimate.grossPrice)} gross · ${estimate.years} years at ${estimate.apr}% planning APR</small></div><div><span>DEAL</span><b>${esc(opportunity.stage||lead.status||'No stage')} · ${money(opportunity.value||lead.estimatedValue)}</b><small>${esc(opportunity.nextAction||lead.nextAction||'Set the next accountable action')}</small></div><p>Not permit engineering, a financing offer, tax advice, or a production guarantee. Verify dimensions, structure, attachments, shade, code, utility rates, incentives, equipment, and provider approvals.</p><div class="proposal-review-actions"><button type="button" class="btn pri" data-proposal-save-version="${esc(lead.id)}">Save proposal version</button><button type="button" class="btn" data-sunroof-download="${esc(lead.id)}">Export structured estimate</button></div></article></div><section class="proposal-versions"><header><h3>Saved versions</h3><span>${versions.length} preserved</span></header>${versions.length?versions.slice(0,8).map((version,index)=>`<article><i>V${versions.length-index}</i><div><b>${new Date(version.createdAt).toLocaleString()}</b><span>${version.panelCount} modules · ${version.systemKw} kW · ${money(version.netPrice)} · ${esc(version.sourceMode)}</span></div><strong>${esc(version.status||'Draft')}</strong></article>`).join(''):'<div class="proposal-version-empty"><b>No proposal version saved yet.</b><span>Working roof and estimate drafts remain editable until you preserve a review version.</span></div>'}</section></section>`
  }

  function homeFlowMarkup(database) {
    const leads = database.leads || [], opportunities = database.opportunities || [], appointments = database.appointments || [];
    const ids = (records) => new Set(records.map((item) => item.leadId || item.id).filter(Boolean));
    const valueFor = (leadIds) => opportunities.filter((item) => leadIds.has(item.leadId)).reduce((sum, item) => sum + (+item.value || 0), 0);
    const contacted = leads.filter((lead) => +lead.attempts > 0 || !/^new/i.test(lead.status || '') || lead.nextFollowUp);
    const qualified = leads.filter((lead) => +lead.monthlyBill > 0 && lead.ownership === 'Owner');
    const roofScreened = leads.filter((lead) => lead.sunroofStatus && +lead.usableRoofSqFt > 0);
    const validAppointments = appointments.filter((item) => !/cancelled|no-show/i.test(item.status || ''));
    const appointmentIds = ids(validAppointments);
    const proposals = opportunities.filter((item) => /proposal|contract/i.test(item.stage || ''));
    const installs = opportunities.filter((item) => /site survey|design|permit|install|pto|closed won/i.test(item.stage || ''));
    const energized = opportunities.filter((item) => /energized|pto|installed|closed won/i.test(item.stage || ''));
    const makeStage = (number, label, records, leadIds, attention, detail, owner, inputs, outputs, route, action) => ({ number, label, records, value: valueFor(leadIds), attention, detail, owner, inputs, outputs, route, action });
    const stages = [
      makeStage('01', 'Inquiry', leads.length, ids(leads), leads.filter((lead) => !lead.owner || !lead.consent || !lead.nextAction).length, 'Capture the homeowner, property, source, consent state, and the first accountable next action.', 'Intake + routing', ['Source', 'Consent', 'Contact details'], ['Owned record', 'Response task'], 'contacts-list', 'Open homeowners'),
      makeStage('02', 'Contacted', contacted.length, ids(contacted), contacted.filter((lead) => !lead.nextFollowUp && !lead.nextAction).length, 'Turn the inquiry into a useful conversation with a logged outcome, follow-up date, and clear owner.', 'Setter team', ['Call outcome', 'Homeowner intent', 'Follow-up date'], ['Connected lead', 'Next action'], 'contacts-followup', 'Open follow-up queue'),
      makeStage('03', 'Qualified', qualified.length, ids(qualified), leads.length - qualified.length, 'Confirm ownership, utility bill, usage economics, decision-makers, property type, and timeline.', 'Solar advisor', ['Ownership', 'Utility bill', 'Timeline'], ['Qualified homeowner', 'Missing-data tasks'], 'contacts-segments', 'Open solar segments'),
      makeStage('04', 'Roof fit', roofScreened.length, ids(roofScreened), roofScreened.filter((lead) => !/strong/i.test(lead.sunroofStatus || '') || +lead.roofAge > 15).length, 'Review roof area, age, material, sunshine, shade, panel capacity, and battery interest before making claims.', 'Design intake', ['Roof image', 'Sun + shade', 'Usable area'], ['Fit score', 'System range'], 'conversations-sunroof', 'Build roof estimate'),
      makeStage('05', 'Appointment', appointmentIds.size, appointmentIds, appointments.filter((item) => /needs confirmation|no-show/i.test(item.status || '')).length, 'Coordinate the setter-to-closer handoff, confirmation, site access, agenda, bill, and roof context.', 'Setter + closer', ['Confirmed time', 'Bill + roof context', 'Decision-makers'], ['Consult outcome', 'Next milestone'], 'conversations-appointments', 'Open calendar'),
      { ...makeStage('06', 'Proposal', proposals.length, ids(proposals), proposals.filter((item) => !item.nextAction || Date.now() - Date.parse(item.stageEnteredAt || item.updatedAt || 0) > 7 * 86400000).length, 'Package system size, panel count, financing, incentives, assumptions, proof, exclusions, and decision date.', 'Closer', ['System design', 'Price + financing', 'Verified assumptions'], ['Proposal', 'Decision task'], 'sales-opportunities', 'Review proposal pipeline'), value: proposals.reduce((sum, item) => sum + (+item.value || 0), 0) },
      { ...makeStage('07', 'Installation', installs.length, ids(installs), installs.filter((item) => !item.nextAction).length, 'Carry signed work through site survey, design, permits, utility coordination, installation, and inspection.', 'Project team', ['Signed agreement', 'Site survey', 'Permit package'], ['Installed array', 'Inspection result'], 'sales-opportunities', 'Review project pipeline'), value: installs.reduce((sum, item) => sum + (+item.value || 0), 0) },
      { ...makeStage('08', 'Energized', energized.length, ids(energized), energized.filter((item) => !item.nextAction).length, 'Confirm PTO or energized status, production handoff, monitoring access, outcome notes, and referral follow-up.', 'Customer success', ['PTO approval', 'Monitoring setup', 'Final handoff'], ['Producing system', 'Referral follow-up'], 'reports-overview', 'Open performance reports'), value: energized.reduce((sum, item) => sum + (+item.value || 0), 0) }
    ];
    stages.forEach((stage, index) => { const previous = stages[index - 1]?.records || stage.records; stage.conversion = index ? Math.min(100, Math.round(stage.records / Math.max(1, previous) * 100)) : 100; stage.health = stage.attention > Math.max(2, Math.ceil(stage.records * .35)) ? 'critical' : stage.attention ? 'attention' : 'healthy'; });
    const node = (stage, index) => `${index ? '<span class="home-flow-edge" aria-hidden="true"><i></i></span>' : ''}<button class="home-flow-node ${index === 0 ? 'active' : ''}" type="button" data-home-flow-node data-number="${stage.number}" data-title="${esc(stage.label)}" data-records="${stage.records}" data-value="${stage.value}" data-attention="${stage.attention}" data-conversion="${stage.conversion}" data-detail="${esc(stage.detail)}" data-owner="${esc(stage.owner)}" data-inputs="${esc(stage.inputs.join('|'))}" data-outputs="${esc(stage.outputs.join('|'))}" data-route="${stage.route}" data-action="${esc(stage.action)}" data-health="${stage.health}" aria-label="${esc(stage.label)}: ${stage.records} records, ${stage.attention} need attention"><span class="home-flow-number">${stage.number}</span><span class="home-flow-node-health ${stage.health}">${stage.health === 'healthy' ? 'On track' : stage.health === 'attention' ? 'Watch' : 'Act now'}</span><strong class="home-flow-label">${esc(stage.label)}</strong><span class="home-flow-node-metric"><b data-home-flow-primary>${stage.records}</b><small data-home-flow-primary-label>records</small></span><span class="home-flow-node-foot">${stage.conversion}% from prior</span></button>`;
    const first = stages[0];
    return `<section class="home-journey-graph" data-home-flow-mode-current="records"><header><div><span class="solar-eyebrow">INTERACTIVE SOLAR REVENUE JOURNEY</span><h3>Inquiry → energized system</h3><p>Hover, focus, or click a stage to inspect volume, pipeline value, attention, conversion, required inputs, and the next workspace.</p></div><div class="home-flow-header-actions"><div class="home-flow-controls" aria-label="Choose journey metric"><button class="active" data-home-flow-mode="records">Records</button><button data-home-flow-mode="value">Pipeline value</button><button data-home-flow-mode="attention">Needs attention</button></div><button class="btn" data-crm-route="sales-opportunities">Open pipeline</button></div></header><div class="home-flow-canvas" role="group" aria-label="Interactive residential solar customer journey"><div class="home-flow-rail">${stages.map(node).join('')}</div></div><div class="home-flow-detail-panel" aria-live="polite"><div class="home-flow-detail-head"><div><span data-flow-stage-number>${first.number} · SELECTED STAGE</span><h4>${first.label}</h4><p data-flow-owner>${first.owner}</p></div><span class="home-flow-node-health ${first.health}" data-flow-health>${first.health === 'healthy' ? 'On track' : first.health === 'attention' ? 'Watch' : 'Act now'}</span></div><div class="home-flow-detail-metrics"><article data-flow-detail-records><span>Active records</span><b>${first.records}</b><small>Current stage volume</small></article><article data-flow-detail-value><span>Pipeline value</span><b>${money(first.value)}</b><small>Connected opportunities</small></article><article data-flow-detail-attention><span>Needs attention</span><b>${first.attention}</b><small>Missing or stalled work</small></article><article data-flow-detail-conversion><span>Stage conversion</span><b>${first.conversion}%</b><small>From the previous stage</small></article></div><div class="home-flow-detail-body"><div><span>WHAT HAPPENS HERE</span><p data-flow-detail-copy>${esc(first.detail)}</p></div><div><span>REQUIRED INPUTS</span><div class="home-flow-tags" data-flow-inputs>${first.inputs.map((item) => `<i>${esc(item)}</i>`).join('')}</div></div><div><span>COMPLETION OUTPUTS</span><div class="home-flow-tags" data-flow-outputs>${first.outputs.map((item) => `<i>${esc(item)}</i>`).join('')}</div></div><button class="btn pri" data-flow-action data-crm-route="${first.route}">${esc(first.action)} →</button></div></div></section>`;
  }

  function startOfHomeWeek(date) { const result = new Date(date); result.setDate(result.getDate() - ((result.getDay() + 6) % 7)); result.setHours(0, 0, 0, 0); return result; }
  function homeCalendarMarkup(database) {
    const appointments = (database.appointments || []).slice().sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    const leads = database.leads || [], start = startOfHomeWeek(homeCalendarCursor), days = Array.from({ length: 7 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
    const owners = [...new Set(appointments.flatMap((item) => [item.setter, item.closer]).filter(Boolean))];
    const filtered = appointments.filter((item) => (homeCalendarOwner === 'all' || [item.setter, item.closer].includes(homeCalendarOwner)) && (homeCalendarStatus === 'all' || item.status === homeCalendarStatus));
    const dayMarkup = days.map((day) => {
      const events = filtered.filter((item) => new Date(item.startsAt).toDateString() === day.toDateString());
      return `<section class="home-calendar-day ${day.toDateString() === new Date().toDateString() ? 'today' : ''}"><header><div><span>${day.toLocaleDateString([], { weekday: 'short' })}</span><b>${day.getDate()}</b><small>${day.toLocaleDateString([], { month: 'short' })}</small></div><button data-home-calendar-day="${day.toISOString()}" aria-label="Book appointment on ${day.toDateString()}">+</button></header><div>${events.slice(0, 4).map((item) => { const lead = leads.find((record) => record.id === item.leadId), tone = /needs confirmation/i.test(item.status) ? 'attention' : /confirmed|completed/i.test(item.status) ? 'healthy' : /no-show|cancelled/i.test(item.status) ? 'critical' : 'scheduled'; return `<button class="home-calendar-event ${tone}" data-home-appointment="${esc(item.id)}"><time>${new Date(item.startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time><strong>${esc(lead?.name || 'Unlinked')}</strong><span>${esc(item.type || 'Solar appointment')}</span><small>${esc(String(item.status || 'scheduled').replaceAll('-', ' '))}</small></button>`; }).join('') || '<p>No appointments</p>'}${events.length > 4 ? `<button class="home-calendar-more" data-crm-route="conversations-appointments">+${events.length - 4} more</button>` : ''}</div></section>`;
    }).join('');
    const period = `${days[0].toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;
    return `<section class="home-solar-calendar"><header><div><span class="solar-eyebrow">EDITABLE WEEKLY CALENDAR</span><h3>Solar appointments and field work</h3><p>Open any event to edit it, or use + on a day to create a local appointment.</p></div><div class="home-calendar-nav"><button data-home-calendar-nav="prev" aria-label="Previous week">‹</button><button data-home-calendar-nav="today">Today</button><button data-home-calendar-nav="next" aria-label="Next week">›</button><b>${period}</b></div><div class="home-calendar-actions"><select data-home-calendar-owner aria-label="Filter calendar by owner"><option value="all">All owners</option>${owners.map((owner) => `<option ${homeCalendarOwner === owner ? 'selected' : ''}>${esc(owner)}</option>`).join('')}</select><select data-home-calendar-status aria-label="Filter calendar by status"><option value="all">All statuses</option>${['scheduled', 'needs confirmation', 'confirmed', 'completed', 'no-show', 'cancelled'].map((status) => `<option ${homeCalendarStatus === status ? 'selected' : ''}>${status}</option>`).join('')}</select><button class="btn pri" data-home-calendar-book>Book appointment</button></div></header><div class="home-calendar-week">${dayMarkup}</div><footer><span><i class="scheduled"></i>Scheduled</span><span><i class="attention"></i>Needs confirmation</span><span><i class="healthy"></i>Confirmed/completed</span><span><i class="critical"></i>No-show/cancelled</span><button data-crm-route="conversations-appointments">Open advanced calendar →</button></footer></section>`;
  }

  function renderHomeCalendar() {
    const host = document.querySelector('.page[data-page="home"].active .home-solar-calendar');
    if (host) host.outerHTML = homeCalendarMarkup(loadCRM());
  }

  function openHomeAppointmentEditor(id = '', dayValue = '') {
    const database = loadCRM(), existing = (database.appointments || []).find((item) => item.id === id) || {}, preferences = calendarPrefs();
    const start = existing.startsAt ? new Date(existing.startsAt) : dayValue ? new Date(dayValue) : new Date(Date.now() + 86400000);
    if (!existing.startsAt) start.setHours(10, 0, 0, 0);
    const localValue = new Date(start - start.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    document.querySelector('#homeAppointmentEditor')?.remove();
    document.body.insertAdjacentHTML('beforeend', `<div class="crm-overlay" id="homeAppointmentEditor"><aside class="crm-drawer" style="transform:none"><div class="crm-drawer-head"><div><span class="solar-eyebrow">${existing.id ? 'EDIT APPOINTMENT' : 'NEW APPOINTMENT'}</span><h2>${existing.id ? 'Update solar appointment' : 'Book solar appointment'}</h2><p>Saved locally. External invitations and reminders still require a configured provider.</p></div><button class="btn" data-home-appointment-close>Close</button></div><form class="crm-product-form" data-home-appointment-form><input type="hidden" name="id" value="${esc(existing.id || '')}"><label>Homeowner<select name="leadId" required>${(database.leads || []).map((lead) => `<option value="${esc(lead.id)}" ${lead.id === existing.leadId ? 'selected' : ''}>${esc(lead.name)} · ${esc(lead.company)}</option>`).join('')}</select></label><label>Appointment type<select name="type">${[...new Set([...appointmentTypes, ...(preferences.customTypes || [])])].map((value) => `<option ${value === (existing.type || 'Solar consultation') ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label><label>Starts<input name="startsAt" type="datetime-local" value="${localValue}" required></label><label>Duration<select name="duration">${[30, 45, 60, 90].map((value) => `<option value="${value}" ${String(existing.duration || preferences.duration) === String(value) ? 'selected' : ''}>${value} minutes</option>`).join('')}</select></label><label>Status<select name="status">${['scheduled', 'needs confirmation', 'confirmed', 'completed', 'no-show', 'cancelled'].map((value) => `<option ${value === (existing.status || 'needs confirmation') ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label>Setter<input name="setter" value="${esc(existing.setter || 'Avery')}"></label><label>Closer<input name="closer" value="${esc(existing.closer || 'Michael')}"></label><label>Location<input name="location" value="${esc(existing.location || '')}" placeholder="Customer site, video, or phone"></label><label>Travel buffer<select name="travelBuffer">${[0, 15, 30, 45, 60].map((value) => `<option value="${value}" ${String(existing.travelBuffer ?? preferences.travelBuffer) === String(value) ? 'selected' : ''}>${value} minutes</option>`).join('')}</select></label><label>Reminder policy<select name="reminderPolicy">${['24h + 2h SMS', '24h email + 1h SMS', '48h + 24h + 2h', 'Manual confirmation'].map((value) => `<option ${value === (existing.reminderPolicy || preferences.reminderPolicy) ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label>Utility<input name="utility" value="${esc(existing.utility || '')}"></label><label>Monthly bill<input name="monthlyBill" type="number" min="0" value="${esc(existing.monthlyBill || '')}"></label><label style="grid-column:1/-1">Notes<textarea name="notes" rows="4">${esc(existing.notes || '')}</textarea></label><button class="btn pri" type="submit">${existing.id ? 'Save appointment' : 'Book locally'}</button>${existing.id ? '<button class="btn danger" type="button" data-home-appointment-delete>Delete appointment</button>' : ''}</form></aside></div>`);
  }

  function roofPanelSvg(panelCount) {
    return Array.from({ length: Math.min(panelCount, 30) }, (_, index) => {
      const column = index % 10, row = Math.floor(index / 10), x = 310 + column * 31, y = 163 + row * 44;
      return `<rect class="solar-aerial-module" x="${x}" y="${y}" width="26" height="40" rx="1.8"/>`;
    }).join('');
  }

  function conceptRoofAerialMarkup(lead, estimate, score) {
    return `<div class="solar-roof-map solar-roof-aerial" aria-label="Aerial-style roof screening model with ${estimate.panelCount} planned photovoltaic modules">
      <svg viewBox="0 0 900 520" role="img" aria-label="Concept roof layout showing roof planes, obstructions, setbacks, shade, and a ${estimate.panelCount}-panel array">
        <defs>
          <linearGradient id="aerialLawn" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#809a68"/><stop offset=".55" stop-color="#688758"/><stop offset="1" stop-color="#58754e"/></linearGradient>
          <linearGradient id="aerialRoofMain" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#5b6570"/><stop offset=".5" stop-color="#3f4954"/><stop offset="1" stop-color="#2f3944"/></linearGradient>
          <linearGradient id="aerialRoofSide" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#46515c"/><stop offset="1" stop-color="#27313b"/></linearGradient>
          <linearGradient id="aerialDrive" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#b8b7ae"/><stop offset="1" stop-color="#97978f"/></linearGradient>
          <pattern id="aerialGrass" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M2 15 5 9M11 18l3-7M16 7l2-5" stroke="#d5e6b7" stroke-opacity=".1" stroke-width="1"/></pattern>
          <pattern id="aerialShingles" width="18" height="12" patternUnits="userSpaceOnUse"><path d="M0 1h18M0 7h18M4 1v6M13 7v5" stroke="#c9d1d7" stroke-opacity=".13" stroke-width=".8"/></pattern>
          <pattern id="aerialPanelCells" width="7.5" height="9.4" patternUnits="userSpaceOnUse"><rect width="7.5" height="9.4" fill="#123d64"/><path d="M0 0h7.5v9.4H0z" fill="none" stroke="#5da5ca" stroke-opacity=".7" stroke-width=".7"/><path d="M3.75 0v9.4" stroke="#74b8da" stroke-opacity=".32" stroke-width=".45"/></pattern>
          <filter id="aerialShadow" x="-30%" y="-30%" width="180%" height="180%"><feDropShadow dx="0" dy="14" stdDeviation="13" flood-color="#14202a" flood-opacity=".45"/></filter>
          <filter id="treeShadow" x="-50%" y="-50%" width="220%" height="220%"><feGaussianBlur stdDeviation="9"/></filter>
        </defs>
        <rect width="900" height="520" fill="url(#aerialLawn)"/>
        <rect width="900" height="520" fill="url(#aerialGrass)"/>
        <path d="M0 421C184 405 331 437 512 421s271-8 388 5v94H0Z" fill="#59626a"/>
        <path d="M0 430C185 414 333 446 514 430s270-8 386 5" fill="none" stroke="#e6e8e6" stroke-opacity=".72" stroke-width="5"/>
        <path d="M40 483h105m70 0h105m70 0h105m70 0h105m70 0h105" fill="none" stroke="#f4d96e" stroke-opacity=".62" stroke-width="4" stroke-linecap="round"/>
        <path d="M584 294 739 282 806 429 607 426Z" fill="url(#aerialDrive)" stroke="#d5d3ca" stroke-opacity=".55" stroke-width="2"/>
        <path d="M605 317 716 310 761 416 623 414Z" fill="#8b8c87" opacity=".26"/>
        <ellipse cx="430" cy="332" rx="302" ry="92" fill="#17232b" opacity=".38" filter="url(#treeShadow)"/>
        <g filter="url(#aerialShadow)">
          <path d="M239 186 450 91 708 205 462 332Z" fill="url(#aerialRoofMain)" stroke="#bac7cf" stroke-opacity=".45" stroke-width="3"/>
          <path d="M239 186 462 332 283 397 115 258Z" fill="url(#aerialRoofSide)" stroke="#aebbc4" stroke-opacity=".38" stroke-width="3"/>
          <path d="M462 332 708 205 780 282 565 411Z" fill="#36414b" stroke="#aebbc4" stroke-opacity=".4" stroke-width="3"/>
          <path d="M239 186 450 91 708 205 462 332Z" fill="url(#aerialShingles)" opacity=".75"/>
          <path d="M239 186 462 332 283 397 115 258Z" fill="url(#aerialShingles)" opacity=".55"/>
          <path d="M462 332 708 205 780 282 565 411Z" fill="url(#aerialShingles)" opacity=".45"/>
          <path d="M239 186 462 332 708 205M462 332l103 79" fill="none" stroke="#d9e1e5" stroke-opacity=".4" stroke-width="3"/>
          <path d="M450 91 239 186M450 91l258 114" fill="none" stroke="#eef4f6" stroke-opacity=".52" stroke-width="4"/>
        </g>
        <path d="M268 183 447 111 673 211 461 309Z" fill="none" stroke="#ffcf67" stroke-opacity=".9" stroke-width="2" stroke-dasharray="9 7"/>
        <g class="solar-aerial-array" transform="rotate(12 465 214)">${roofPanelSvg(estimate.panelCount)}</g>
        <g class="solar-roof-obstruction"><ellipse cx="585" cy="191" rx="12" ry="8" fill="#19242d"/><ellipse cx="585" cy="188" rx="8" ry="5" fill="#9daab2"/><path d="M578 188v-18h14v18" fill="#707d85" stroke="#c3cdd2" stroke-width="1.5"/></g>
        <g class="solar-roof-obstruction"><ellipse cx="388" cy="287" rx="9" ry="6" fill="#17222a"/><ellipse cx="388" cy="284" rx="5" ry="3.5" fill="#9fabb2"/><path d="M383 284v-12h10v12" fill="#6f7b82"/></g>
        <g opacity=".9"><ellipse cx="118" cy="129" rx="55" ry="30" fill="#203628" opacity=".48" filter="url(#treeShadow)"/><circle cx="98" cy="107" r="39" fill="#315d3c"/><circle cx="132" cy="116" r="43" fill="#3b6c43"/><circle cx="116" cy="80" r="34" fill="#47784b"/><circle cx="147" cy="84" r="25" fill="#365f3d"/></g>
        <g opacity=".86"><ellipse cx="790" cy="144" rx="52" ry="28" fill="#203628" opacity=".44" filter="url(#treeShadow)"/><circle cx="779" cy="113" r="38" fill="#3d7046"/><circle cx="818" cy="126" r="35" fill="#315e3d"/><circle cx="810" cy="91" r="28" fill="#4b7d4d"/></g>
      </svg>
      <div class="solar-aerial-badge"><span>CONCEPT ARRAY</span><b>${estimate.panelCount} × ${estimate.panelWatts} W</b><small>${estimate.systemKw} kW planning system</small></div>
      <div class="solar-aerial-plane"><span>PRIMARY PLANE</span><b>Southwest · ${score}% fit</b><small>${(+lead.usableRoofSqFt || 0).toLocaleString()} ft² usable · ${+lead.shadeLoss || 0}% shade loss</small></div>
      <span class="solar-north" aria-label="North direction"><i></i>N</span>
      <div class="solar-roof-legend"><span><i class="array"></i>PV modules</span><span><i class="setback"></i>Planning setback</span><span><i class="obstruction"></i>Roof obstruction</span><strong>AERIAL CONCEPT · VERIFY ON SITE</strong></div>
    </div>`;
  }

  function roofAerialMarkup(lead, estimate, score, context = 'proposal',mapStyle='satellite') {
    const address = lead.address || [lead.city, lead.state].filter(Boolean).join(', ') || lead.company || '';
    return `<div class="solar-roof-map solar-live-roof ${context === 'contact' ? 'solar-live-roof-contact' : ''}" data-live-roof-shell data-lead-id="${esc(lead.id || '')}">
      <div class="solar-live-roof-canvas" data-live-roof-map="preview" data-roof-map-style="${mapStyle}" data-lead-id="${esc(lead.id || '')}" data-address="${esc(address)}" aria-label="${mapStyle==='map'?'Street map':'Satellite roof imagery'} for ${esc(address || lead.name || 'selected property')}"></div>
      <div class="solar-live-roof-loading"><b>Locating the actual roof…</b><span>${esc(address || 'Add a complete U.S. property address')}</span></div>
      <div class="solar-live-roof-crosshair" aria-hidden="true"></div>
      <div class="solar-aerial-badge"><span>${mapStyle==='map'?'STREET / PROPERTY MAP':'ADDRESS-LEVEL SATELLITE'}</span><b>${estimate.panelCount} × ${estimate.panelWatts} W</b><small>${estimate.systemKw} kW planning system</small></div>
      <div class="solar-aerial-plane"><span>SELECTED PROPERTY</span><b>${score}% planning fit</b><small>${esc(address || 'Address required for aerial imagery')}</small></div>
      <span class="solar-north" aria-label="North direction"><i></i>N</span>
      <div class="solar-roof-legend"><span><i class="array"></i>Panel plan below</span><span><i class="setback"></i>Center target</span><strong>${mapStyle==='map'?'MAP © OPENSTREETMAP CONTRIBUTORS':'IMAGERY © ESRI AND PROVIDERS'} · VERIFY ON SITE</strong></div>
    </div>`;
  }

  function roofPreviewMarkup(lead,context='contact'){
    const design=roofDesignFor(lead,estimateFor(lead));
    if(design.sourceMode!=='model'||!design.houseModel)return roofAerialMarkup(lead,estimateFor(lead),solarScore(lead),context,design.sourceMode==='map'?'map':'satellite');
    return `<div class="solar-roof-map solar-live-roof roof-model-preview" data-live-roof-shell data-lead-id="${esc(lead.id||'')}"><model-viewer data-roof-model-viewer data-lead-id="${esc(lead.id||'')}" camera-controls interaction-prompt="none" shadow-intensity="1" exposure="1" environment-image="neutral" aria-label="3D house model for ${esc(lead.address||lead.name||'selected property')}">${roofModelHotspots(design)}</model-viewer><div class="solar-live-roof-loading roof-model-empty"><b>Loading exact-house model…</b><span>${esc(design.houseModel.name)}</span></div><div class="solar-aerial-badge"><span>USER-SUPPLIED 3D HOUSE</span><b>${(design.modelPanels||[]).length} model placements</b><small>${esc(design.houseModel.name)}</small></div><div class="solar-roof-legend"><span><i class="array"></i>3D module markers</span><strong>VERIFY MODEL SCALE AND SITE CONDITIONS</strong></div></div>`
  }

  const roofPlanes = [
    { id: 'southwest', label: 'Southwest main', azimuth: 225, blocked: [0,1,8,9,10,19,50,59] },
    { id: 'southeast', label: 'Southeast plane', azimuth: 135, blocked: [0,9,20,29,50,59] },
    { id: 'garage', label: 'Garage plane', azimuth: 180, blocked: [0,1,2,7,8,9,40,49,50,59] }
  ];
  function loadRoofDesigns(){try{return JSON.parse(localStorage.getItem(ROOF_DESIGNS)||'{}')}catch{return{}}}
  function customRoofExclusions(design,planeId){return new Set(design?.exclusions?.[planeId]||[])}
  function availableRoofCells(planeId,design){const blocked=new Set([...(roofPlanes.find((item)=>item.id===planeId)?.blocked||[]),...customRoofExclusions(design,planeId)]);return Array.from({length:60},(_,index)=>index).filter((index)=>!blocked.has(index))}
  function defaultRoofPanels(count){const planes={southwest:[],southeast:[],garage:[]};let remaining=Math.max(0,+count||0);for(const plane of roofPlanes){const cells=availableRoofCells(plane.id).slice(0,remaining);planes[plane.id]=cells;remaining-=cells.length;if(!remaining)break}return planes}
  function roofDesignFor(lead,estimate){
    const base={sourceMode:'satellite',toolMode:'panels',selectedPlane:'southwest',orientation:'portrait',azimuth:225,tilt:24,setback:36,overlayRotation:0,overlayScale:68,panelWatts:estimate.panelWatts,targetPanels:estimate.panelCount,roofMaterial:lead.roofType||'Unknown',roofAge:+lead.roofAge||0,roofCondition:lead.roofCondition||'Not inspected',retrofitScope:lead.retrofitScope||'Mount over existing roof',deckType:lead.deckType||'Unknown',planes:{southwest:[],southeast:[],garage:[]},exclusions:{southwest:[],southeast:[],garage:[]},modelPanels:[]};
    const saved=loadRoofDesigns()[lead.id];if(saved)return{...base,...saved,planes:{...base.planes,...(saved.planes||{})},exclusions:{...base.exclusions,...(saved.exclusions||{})},modelPanels:Array.isArray(saved.modelPanels)?saved.modelPanels:[]};
    return{...base,planes:defaultRoofPanels(estimate.panelCount)}
  }
  function saveRoofDesignDraft(leadId,design){const all=loadRoofDesigns();all[leadId]={...design,updatedAt:new Date().toISOString()};localStorage.setItem(ROOF_DESIGNS,JSON.stringify(all))}
  function roofDesignStats(lead,design){const aerialCount=Object.values(design.planes||{}).reduce((sum,cells)=>sum+(cells?.length||0),0),panelCount=design.sourceMode==='model'&&design.houseModel?(design.modelPanels||[]).length:aerialCount,systemKw=Math.round(panelCount*(+design.panelWatts||425))/1000,sunYield=Math.max(850,(+lead.annualSunHours||1500)*(1-(+lead.shadeLoss||0)/100)*.78),annualProduction=Math.round(systemKw*sunYield),annualUse=+lead.annualKwh||Math.round((+lead.monthlyBill||0)/(+lead.utilityRate||.16)*12),offset=annualUse?Math.min(120,Math.round(annualProduction/annualUse*100)):0;return{panelCount,systemKw:+systemKw.toFixed(2),annualProduction,offset,roofUse:panelCount*22}}
  function openRoofModelDB(){return new Promise((resolve,reject)=>{const request=indexedDB.open(ROOF_MODEL_DB,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('models'))request.result.createObjectStore('models')};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('Local 3D model storage is unavailable'))})}
  async function roofModelTransaction(mode,leadId,value){const database=await openRoofModelDB();return new Promise((resolve,reject)=>{const transaction=database.transaction('models',mode),store=transaction.objectStore('models'),request=value===undefined?store.get(leadId):value===null?store.delete(leadId):store.put(value,leadId);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('Could not access the local 3D model'));transaction.oncomplete=()=>database.close()})}
  const storeRoofModel=(leadId,file)=>roofModelTransaction('readwrite',leadId,file);
  const readRoofModel=(leadId)=>roofModelTransaction('readonly',leadId);
  const deleteRoofModel=(leadId)=>roofModelTransaction('readwrite',leadId,null);
  function bytesLabel(value){const bytes=+value||0;return bytes>=1048576?`${(bytes/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(bytes/1024))} KB`}
  function roofModelHotspots(design){return(design.modelPanels||[]).map((panel,index)=>`<button type="button" class="roof-model-panel" slot="hotspot-${esc(panel.id)}" data-position="${esc(panel.position)}" data-normal="${esc(panel.normal)}" data-roof-model-panel="${esc(panel.id)}" aria-label="Remove panel ${index+1} from ${esc(roofPlanes.find((item)=>item.id===panel.planeId)?.label||'3D house model')}"><i></i></button>`).join('')}
  function roofSourceSurface(lead,design,cells,address){
    if(design.sourceMode==='model')return `<div class="roof-design-surface roof-model-surface ${design.houseModel?'has-model':''} ${design.toolMode==='panels'?'is-model-placing':''}"><model-viewer data-roof-model-viewer data-lead-id="${esc(lead.id)}" camera-controls interaction-prompt="none" shadow-intensity="1" exposure="1" environment-image="neutral" aria-label="Interactive 3D house model for ${esc(address||lead.name||'selected property')}">${roofModelHotspots(design)}</model-viewer><div class="roof-model-empty"><span>3D HOUSE MODEL</span><b>${design.houseModel?`Loading ${esc(design.houseModel.name)}…`:'Upload the exact house model'}</b><p>${design.houseModel?'The self-contained GLB stays in this browser and is connected to this property.':'Use a drone, photogrammetry, LiDAR, CAD, or design export saved as a self-contained GLB.'}</p><label class="btn pri"><input type="file" accept=".glb,model/gltf-binary" data-roof-model-upload data-lead-id="${esc(lead.id)}">${design.houseModel?'Replace 3D model':'Import 3D model'}</label></div>${design.houseModel?`<div class="roof-model-file"><span>USER-SUPPLIED MODEL</span><b>${esc(design.houseModel.name)}</b><small>${bytesLabel(design.houseModel.size)} · saved locally</small><button type="button" data-roof-model-remove>Remove</button></div>`:''}<small class="roof-model-help">Orbit: drag · Zoom: wheel/pinch · ${design.toolMode==='panels'?'Click a roof surface to place a module marker':'Switch to Place on model to add modules'}</small></div>`;
    const style=design.sourceMode==='map'?'map':'satellite';
    return `<div class="roof-design-surface ${esc(design.orientation)} ${design.toolMode==='position'?'is-positioning':''} ${design.toolMode==='exclusions'?'is-marking-exclusions':''}" style="--roof-rotation:${+design.overlayRotation||0}deg;--roof-scale:${+design.overlayScale||68}%"><div class="roof-satellite-canvas" data-live-roof-map="designer" data-roof-map-style="${style}" data-lead-id="${esc(lead.id)}" data-address="${esc(address)}" aria-label="Interactive ${style==='map'?'street map':'satellite imagery'} for ${esc(address)}"></div><div class="solar-live-roof-loading"><b>Loading the ${style==='map'?'property map':'actual roof'}…</b><span>${esc(address||'Add a complete property address')}</span></div><div class="roof-design-grid">${cells}</div><span class="roof-design-ridge">${design.toolMode==='exclusions'?'MARK ROOF OBSTRUCTIONS':'ARRAY ALIGNMENT'}</span><i class="roof-design-north">N</i><small class="roof-imagery-credit">${style==='map'?'Map © OpenStreetMap contributors':'Imagery © Esri and providers'}</small></div>`
  }
  function roofDesignerMarkup(lead,estimate){
    const design=roofDesignFor(lead,estimate),plane=roofPlanes.find((item)=>item.id===design.selectedPlane)||roofPlanes[0],active=new Set(design.planes[plane.id]||[]),fixedBlocked=new Set(plane.blocked),customBlocked=customRoofExclusions(design,plane.id),stats=roofDesignStats(lead,design);
    const cells=Array.from({length:60},(_,index)=>{const fixed=fixedBlocked.has(index),custom=customBlocked.has(index),blocked=fixed||custom,label=design.toolMode==='exclusions'?(custom?'Remove existing-roof exclusion':'Mark roof obstruction or exclusion'):(active.has(index)?'Remove':'Place')+' panel';return`<button type="button" class="roof-design-cell ${active.has(index)?'active':''} ${blocked?'blocked':''} ${custom?'custom-blocked':''}" data-roof-cell="${index}" ${fixed?'disabled':''} aria-label="${fixed?'Fixed roof setback or obstruction':`${label} at grid position ${index+1}`}"><i></i></button>`}).join('');
    const address=lead.address||[lead.city,lead.state].filter(Boolean).join(', ')||lead.company||'';
    const sourceLabels={map:'STREET / PROPERTY MAP',satellite:'ADDRESS-LEVEL SATELLITE',model:'USER-SUPPLIED 3D HOUSE'};
    return `<section class="solar-roof-designer" data-roof-designer="${esc(lead.id)}" data-proposal-panel="roof-design"><header><div><span class="solar-eyebrow">MULTI-VIEW EXISTING-ROOF DESIGN</span><h2>Design on the property that is actually there</h2><p>Switch among a street/property map, satellite roof imagery, and an exact 3D house model supplied from a site scan or CAD workflow. Existing-roof condition and exclusions stay attached to the proposal.</p></div><span class="crm-status">LOCAL DESIGN DRAFT</span></header><div class="roof-source-switch" role="group" aria-label="Property design view"><button type="button" class="${design.sourceMode==='map'?'active':''}" data-roof-source="map"><i>⌖</i><span>Street map<small>Property context</small></span></button><button type="button" class="${design.sourceMode==='satellite'?'active':''}" data-roof-source="satellite"><i>▦</i><span>Satellite roof<small>Address-level imagery</small></span></button><button type="button" class="${design.sourceMode==='model'?'active':''}" data-roof-source="model"><i>3D</i><span>Exact house model<small>Import self-contained GLB</small></span></button></div><div class="roof-designer-layout"><aside class="roof-design-controls"><div class="roof-existing-card"><span>EXISTING ROOF / RETROFIT</span><b>${esc(design.roofMaterial)} · ${design.roofAge?`${+design.roofAge} years`:'age unknown'}</b><small>${esc(design.roofCondition)} · ${esc(design.retrofitScope)}</small></div><div class="roof-plane-tabs">${roofPlanes.map((item)=>`<button type="button" class="${item.id===plane.id?'active':''}" data-roof-plane="${item.id}"><span>${esc(item.label)}</span><b>${design.sourceMode==='model'?(design.modelPanels||[]).filter((panel)=>panel.planeId===item.id).length:(design.planes[item.id]||[]).length} / ${availableRoofCells(item.id,design).length}</b></button>`).join('')}</div><div class="roof-plane-health"><span>ACTIVE PLANE</span><b>${esc(plane.label)}</b><small>${design.sourceMode==='model'?(design.modelPanels||[]).filter((panel)=>panel.planeId===plane.id).length:active.size} modules · ${customBlocked.size} field exclusions · ${sourceLabels[design.sourceMode]}</small></div><div class="roof-control-grid roof-retrofit-grid"><label>Roof material<select data-roof-control="roofMaterial">${['Unknown','Asphalt shingle','Concrete tile','Clay tile','Standing seam metal','Corrugated metal','Flat membrane','Composite'].map((value)=>`<option ${design.roofMaterial===value?'selected':''}>${value}</option>`).join('')}</select></label><label>Roof age (years)<input data-roof-control="roofAge" type="number" min="0" max="100" value="${+design.roofAge||0}"></label><label>Condition<select data-roof-control="roofCondition">${['Not inspected','Good','Serviceable','Repair before install','Replace before install'].map((value)=>`<option ${design.roofCondition===value?'selected':''}>${value}</option>`).join('')}</select></label><label>Retrofit scope<select data-roof-control="retrofitScope">${['Mount over existing roof','Repair then mount','Re-roof then mount','Roof-integrated system'].map((value)=>`<option ${design.retrofitScope===value?'selected':''}>${value}</option>`).join('')}</select></label><label>Deck / structure<select data-roof-control="deckType">${['Unknown','Plywood / OSB','Plank deck','Concrete','Metal deck','Engineered truss'].map((value)=>`<option ${design.deckType===value?'selected':''}>${value}</option>`).join('')}</select></label><label>Panel rating<select data-roof-control="panelWatts">${[400,410,425,440,450].map((value)=>`<option value="${value}" ${+design.panelWatts===value?'selected':''}>${value} W</option>`).join('')}</select></label><label>Orientation<select data-roof-control="orientation"><option value="portrait" ${design.orientation==='portrait'?'selected':''}>Portrait</option><option value="landscape" ${design.orientation==='landscape'?'selected':''}>Landscape</option></select></label><label>Azimuth<input data-roof-control="azimuth" type="number" min="0" max="359" value="${+design.azimuth||plane.azimuth}"></label><label>Tilt<input data-roof-control="tilt" type="number" min="0" max="60" value="${+design.tilt||0}"></label><label>Setback (in)<input data-roof-control="setback" type="number" min="0" max="120" value="${+design.setback||0}"></label><label>Target panels<input data-roof-control="targetPanels" type="number" min="0" max="120" value="${+design.targetPanels||0}"></label><label>Overlay rotation<input data-roof-control="overlayRotation" type="number" min="-180" max="180" value="${+design.overlayRotation||0}"></label><label>Overlay width (%)<input data-roof-control="overlayScale" type="number" min="35" max="95" value="${+design.overlayScale||68}"></label></div><div class="roof-design-actions"><button type="button" class="btn" data-roof-auto ${design.sourceMode==='model'?'disabled':''}>Auto-fill plane</button><button type="button" class="btn" data-roof-clear>Clear ${design.sourceMode==='model'?'3D plane':'plane'}</button><button type="button" class="btn pri" data-roof-save>Save design to proposal</button></div><small class="solar-design-save-state">The source view, exact model metadata, retrofit facts, panel positions, exclusions, rotation, and sizing persist locally. Site measurements and engineering still control final construction.</small></aside><div class="roof-design-stage"><div class="roof-design-heading"><div><span>${sourceLabels[design.sourceMode]} · ${esc(plane.label)}</span><b>${+design.azimuth||plane.azimuth}° azimuth · ${+design.tilt||0}° tilt</b></div><div class="roof-design-mode" role="group" aria-label="Roof design tool">${design.sourceMode==='model'?`<button type="button" class="${design.toolMode==='orbit'?'active':''}" data-roof-mode="orbit">Orbit model</button><button type="button" class="${design.toolMode!=='orbit'?'active':''}" data-roof-mode="panels">Place on model</button>`:`<button type="button" class="${design.toolMode==='panels'?'active':''}" data-roof-mode="panels">Place panels</button><button type="button" class="${design.toolMode==='exclusions'?'active':''}" data-roof-mode="exclusions">Mark exclusions</button><button type="button" class="${design.toolMode==='position'?'active':''}" data-roof-mode="position">Move view</button>`}</div></div>${roofSourceSurface(lead,design,cells,address)}<div class="roof-design-metrics"><article><span>Modules</span><b data-roof-output="panels">${stats.panelCount}</b><small>${design.sourceMode==='model'?'Placed on 3D surfaces':`Across ${roofPlanes.filter((item)=>(design.planes[item.id]||[]).length).length} planes`}</small></article><article><span>System size</span><b data-roof-output="kw">${stats.systemKw} kW</b><small>${+design.panelWatts||425} W modules</small></article><article><span>Roof used</span><b data-roof-output="area">${stats.roofUse} ft²</b><small>${(+lead.usableRoofSqFt||0).toLocaleString()} ft² screened</small></article><article><span>Production</span><b data-roof-output="production">${stats.annualProduction.toLocaleString()} kWh</b><small data-roof-output="offset">${stats.offset}% planning offset</small></article></div></div></div><footer><b>Existing-roof planning design—not permit engineering.</b><span>Verify model scale, dimensions, roof condition, deck and structure, attachment method, fire pathways, shading, electrical routing, code, interconnection, and equipment compatibility before presentation or installation.</span></footer></section>`
  }
  function replaceRoofDesigner(leadId){const database=loadCRM(),lead=(database.leads||[]).find((item)=>item.id===leadId),host=document.querySelector(`[data-roof-designer="${CSS.escape(leadId)}"]`);if(!lead||!host)return;const template=document.createElement('template');template.innerHTML=roofDesignerMarkup(lead,estimateFor(lead));host.replaceWith(template.content.firstElementChild);requestAnimationFrame(()=>{installLiveRoofMaps();installRoofModels()})}
  function roofDesignFromControls(host){const database=loadCRM(),lead=(database.leads||[]).find((item)=>item.id===host.dataset.roofDesigner),design=roofDesignFor(lead,estimateFor(lead));host.querySelectorAll('[data-roof-control]').forEach((input)=>{design[input.dataset.roofControl]=input.type==='number'||input.tagName==='SELECT'&&input.dataset.roofControl==='panelWatts'?+input.value:input.value});return{lead,design}}

  function productGeoFor(leadId){try{return JSON.parse(localStorage.getItem('conduit.crm.product.v2')||'{}').geo?.[leadId]||{}}catch{return{}}}
  function storedRoofLocation(lead){
    const design=loadRoofDesigns()[lead.id]||{},geo=productGeoFor(lead.id),latitude=Number(design.roofLocation?.latitude??lead.latitude??lead.lat??geo.lat),longitude=Number(design.roofLocation?.longitude??lead.longitude??lead.lng??geo.lng),zoom=Number(design.roofLocation?.zoom)||20;
    return Number.isFinite(latitude)&&Number.isFinite(longitude)?{latitude,longitude,zoom,label:design.roofLocation?.label||lead.address||geo.address||''}:null
  }
  async function resolveRoofLocation(lead,address){
    const stored=storedRoofLocation(lead);if(stored&&(!address||stored.label===address||stored.label===lead.address))return stored;
    const query=String(address||lead.address||[lead.city,lead.state].filter(Boolean).join(', ')).trim();if(query.length<3)throw new Error('Add a complete U.S. property address');
    const response=await fetch(`/api/conduit/geocode?q=${encodeURIComponent(query)}`,{cache:'no-store'}),payload=await response.json();if(!response.ok||!payload.results?.length)throw new Error(payload.error||'No U.S. address matched');
    const result=payload.results[0],design=roofDesignFor(lead,estimateFor(lead));design.roofLocation={latitude:Number(result.latitude),longitude:Number(result.longitude),zoom:20,label:result.label,source:result.source,updatedAt:new Date().toISOString()};saveRoofDesignDraft(lead.id,design);return design.roofLocation
  }
  function removeDisconnectedRoofMaps(){for(const[canvas,map]of roofMapInstances){if(canvas.isConnected)continue;try{map.remove()}catch{}roofMapInstances.delete(canvas)}}
  async function installLiveRoofMap(canvas){
    if(!canvas||canvas.dataset.roofMapReady||!window.L)return;canvas.dataset.roofMapReady='loading';const database=loadCRM(),lead=(database.leads||[]).find((item)=>item.id===canvas.dataset.leadId);if(!lead){canvas.dataset.roofMapReady='error';return}
    const shell=canvas.parentElement,loading=shell?.querySelector('.solar-live-roof-loading');
    try{
      const location=await resolveRoofLocation(lead,canvas.dataset.address),designer=canvas.dataset.liveRoofMap==='designer';if(!canvas.isConnected)return;
      const mapStyle=canvas.dataset.roofMapStyle||'satellite',street=mapStyle==='map',positioning=designer&&shell?.classList.contains('is-positioning'),map=L.map(canvas,{zoomControl:designer,attributionControl:false,dragging:positioning,scrollWheelZoom:designer,doubleClickZoom:designer,boxZoom:false,keyboard:designer,touchZoom:designer,zoomSnap:.25,zoomDelta:.5,minZoom:street?14:16,maxZoom:21,fadeAnimation:true,zoomAnimation:true});roofMapInstances.set(canvas,map);
      const tiles=L.tileLayer(street?'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png':'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:21,maxNativeZoom:street?19:20,crossOrigin:true,keepBuffer:3,updateWhenIdle:true,attribution:street?'Map © OpenStreetMap contributors':'Imagery © Esri and providers'}).addTo(map);
      map.setView([location.latitude,location.longitude],location.zoom||20,{animate:false});
      if(designer){L.control.scale({imperial:true,metric:false,position:'bottomright'}).addTo(map);map.on('moveend',()=>{if(!shell?.classList.contains('is-positioning'))return;const current=map.getCenter(),design=roofDesignFor(lead,estimateFor(lead));design.roofLocation={latitude:current.lat,longitude:current.lng,zoom:map.getZoom(),label:canvas.dataset.address||lead.address||location.label,source:'User-positioned Esri aerial',updatedAt:new Date().toISOString()};saveRoofDesignDraft(lead.id,design)})}
      tiles.once('load',()=>{shell?.classList.add('roof-imagery-ready');loading?.remove()});tiles.on('tileerror',()=>{if(loading){loading.innerHTML='<b>Satellite tile unavailable</b><span>Try zooming out one level or check the imagery connection.</span>'}});setTimeout(()=>{if(!canvas.isConnected||roofMapInstances.get(canvas)!==map||!map._mapPane)return;map.invalidateSize();shell?.classList.add('roof-imagery-ready');loading?.remove()},900);canvas.dataset.roofMapReady='true'
    }catch(error){canvas.dataset.roofMapReady='error';if(loading)loading.innerHTML=`<b>Actual roof unavailable</b><span>${esc(error?.message||'Confirm the full property address and try again.')}</span>`}
  }
  function installLiveRoofMaps(){removeDisconnectedRoofMaps();document.querySelectorAll('[data-live-roof-map]:not([data-roof-map-ready])').forEach((canvas)=>installLiveRoofMap(canvas))}
  function removeDisconnectedRoofModels(){for(const[viewer,url]of roofModelUrls){if(viewer.isConnected)continue;URL.revokeObjectURL(url);roofModelUrls.delete(viewer)}}
  async function installRoofModel(viewer){
    if(!viewer||viewer.dataset.roofModelReady)return;viewer.dataset.roofModelReady='loading';const leadId=viewer.dataset.leadId,surface=viewer.closest('.roof-model-surface'),empty=surface?.querySelector('.roof-model-empty');
    try{const blob=await readRoofModel(leadId);if(!blob){viewer.dataset.roofModelReady='missing';if(empty){const title=empty.querySelector('b'),copy=empty.querySelector('p,span');if(title)title.textContent='3D model file is missing';if(copy)copy.textContent='Re-import the self-contained GLB for this property.'}return}const url=URL.createObjectURL(blob);roofModelUrls.set(viewer,url);viewer.src=url;viewer.addEventListener('load',()=>{surface?.classList.add('roof-model-ready');viewer.closest('.roof-model-preview')?.classList.add('roof-model-ready');viewer.dataset.roofModelReady='true'},{once:true});viewer.addEventListener('error',()=>{viewer.dataset.roofModelReady='error';if(empty){const title=empty.querySelector('b'),copy=empty.querySelector('p,span');if(title)title.textContent='3D model could not be opened';if(copy)copy.textContent='Export the house as a self-contained binary GLB and import it again.'}},{once:true})}catch(error){viewer.dataset.roofModelReady='error';if(empty){const title=empty.querySelector('b'),copy=empty.querySelector('p,span');if(title)title.textContent='3D model storage unavailable';if(copy)copy.textContent=error?.message||'This browser could not read the locally stored model.'}}
  }
  function installRoofModels(){removeDisconnectedRoofModels();document.querySelectorAll('[data-roof-model-viewer]:not([data-roof-model-ready])').forEach((viewer)=>installRoofModel(viewer))}
  async function handleRoofModelUpload(input){
    const file=input.files?.[0],leadId=input.dataset.leadId;if(!file||!leadId)return;const extension=file.name.split('.').pop()?.toLowerCase();if(extension!=='glb'){alert('Import a self-contained .glb house model. Linked .gltf folders cannot be stored safely as one local property file.');input.value='';return}if(file.size>100*1024*1024){alert('The 3D house model must be 100 MB or smaller for local browser storage.');input.value='';return}
    try{await storeRoofModel(leadId,file);const database=loadCRM(),lead=(database.leads||[]).find((item)=>item.id===leadId);if(!lead)return;const design=roofDesignFor(lead,estimateFor(lead));design.sourceMode='model';design.toolMode='orbit';design.houseModel={name:file.name,size:file.size,type:file.type||'model/gltf-binary',source:'User-supplied exact-house model',storedAt:new Date().toISOString()};design.modelPanels=design.modelPanels||[];saveRoofDesignDraft(leadId,design);replaceRoofDesigner(leadId)}catch(error){alert(error?.message||'The 3D house model could not be stored in this browser.')}
  }
  async function searchRoofAddress(form){
    const query=String(new FormData(form).get('address')||'').trim(),leadId=form.dataset.roofAddressSearch,database=loadCRM(),lead=(database.leads||[]).find((item)=>item.id===leadId);if(!lead||query.length<3)return;
    const response=await fetch(`/api/conduit/geocode?q=${encodeURIComponent(query)}`,{cache:'no-store'}),payload=await response.json();if(!response.ok||!payload.results?.length)throw new Error(payload.error||'No U.S. address matched');
    const result=payload.results[0],design=roofDesignFor(lead,estimateFor(lead)),now=new Date().toISOString();lead.address=result.label;lead.updatedAt=now;design.roofLocation={latitude:Number(result.latitude),longitude:Number(result.longitude),zoom:20,label:result.label,source:result.source,updatedAt:now};saveCRM(database);saveRoofDesignDraft(lead.id,design);localStorage.setItem(SUNROOF_SELECTED,lead.id);document.querySelector('[data-crm-route="conversations-sunroof"]')?.click()
  }

  function sunroofWorkspace() {
    ensureSolarData();
    const database = loadCRM();
    const leads = database.leads || [];
    const saved = localStorage.getItem(SUNROOF_SELECTED);
    const lead = leads.find((item) => item.id === saved) || leads[0] || {};
    const opportunity = (database.opportunities || []).find((item) => item.leadId === lead.id) || {};
    const draft=proposalDraftFor(lead.id),workingLead={...lead,...draft},baseEstimate=estimateFor(workingLead),design=roofDesignFor(lead,baseEstimate),designStats=roofDesignStats(workingLead,design),sizedEstimate=designStats.panelCount?estimateFor({...workingLead,panelWatts:design.panelWatts,estimateSystemKw:designStats.systemKw}):baseEstimate,estimate={...sizedEstimate,panelCount:designStats.panelCount,systemKw:designStats.systemKw,annualProduction:designStats.annualProduction,offset:designStats.offset},assets = sunroofAssets()[lead.id] || {},readiness=proposalReadinessFor(workingLead,design,estimate,assets);
    const score = solarScore(lead);
    const panelOverlay = Array.from({ length: Math.min(estimate.panelCount, 42) }, () => '<i></i>').join('');
    const roofVisual = design.sourceMode==='model'&&design.houseModel?roofPreviewMarkup(lead):assets.roofImage ? `<div class="solar-roof-photo"><img src="${assets.roofImage}" alt="Uploaded roof for ${esc(lead.name)}"><div class="solar-panel-overlay" aria-label="Illustrative placement for ${estimate.panelCount} panels">${panelOverlay}</div><span>${estimate.panelCount} module concept overlay · verify dimensions</span></div>` : roofPreviewMarkup(lead);
    const billPreview = assets.billImage ? `<img src="${assets.billImage}" alt="Uploaded utility bill preview">` : '<span class="solar-upload-icon">BILL</span>';
    const rows = leads.map((item) => `<button class="solar-record-row ${item.id === lead.id ? 'active' : ''}" data-sunroof-lead="${esc(item.id)}"><span><b>${esc(item.name)}</b><small>${esc(item.address || item.location || item.company || 'Address not collected')}</small></span><span><small>Utility bill</small><b>${money(item.monthlyBill)}/mo</b></span><span><small>Sunshine</small><b>${(+item.annualSunHours || 0).toLocaleString()} hrs</b></span><span class="solar-fit ${solarScore(item) > 75 ? 'strong' : 'review'}">${solarScore(item)} · ${esc(item.sunroofStatus)}</span></button>`).join('');
    return `${proposalCommandMarkup(lead,readiness,draft)}<div class="proposal-step-panel" data-proposal-panel="property"><div class="solar-sunroof-toolbar">
      <label>Property<select data-sunroof-select>${leads.map((item) => `<option value="${esc(item.id)}" ${item.id === lead.id ? 'selected' : ''}>${esc(item.name)} · ${esc(item.city && item.state ? `${item.city}, ${item.state}` : item.company || 'Address needed')}</option>`).join('')}</select></label>
      <form class="solar-roof-address-search" data-roof-address-search="${esc(lead.id || '')}"><label>Find actual roof<input name="address" autocomplete="street-address" value="${esc(lead.address || '')}" placeholder="Enter any complete U.S. property address" required></label><button class="btn pri" type="submit">Load aerial roof</button></form>
      <span class="crm-product-spacer"></span><button class="btn" data-crm-route="conversations-map">Open Connected Deal Map</button>
      <a class="btn pri" href="https://sunroof.withgoogle.com/" target="_blank" rel="noopener noreferrer">Verify in Google Project Sunroof ↗</a>
    </div>
    <div class="solar-boundary"><div><b>Street map + satellite roof + exact-house 3D model</b><p>The property can be reviewed on a standard map, aligned against address-level Esri satellite imagery, or modeled from a user-supplied self-contained GLB. Retrofit facts, roof exclusions, and panel placements stay with the proposal; final model scale, dimensions, shade, structure, code, and engineering still require field or provider verification.</p></div><span class="crm-status warn">MULTI-VIEW PLANNING · VERIFY ON SITE</span></div>
    <div class="solar-sunroof-layout">
      <section class="solar-card solar-roof-card"><div class="solar-card-head"><div><span class="solar-eyebrow">PROPOSAL ROOF DESIGN</span><h2>${esc(lead.company || `${lead.name} property`)}</h2></div><span class="solar-fit ${score > 75 ? 'strong' : 'review'}">${score}% fit</span></div>
        ${roofVisual}
        <div class="solar-roof-design-summary"><div><span>SAVED ${design.sourceMode==='model'?'3D MODEL':'ARRAY'} PLAN</span><b>${designStats.panelCount} modules · ${designStats.systemKw} kW</b><small>${esc(design.sourceMode)} · ${esc(design.retrofitScope)} · ${esc(design.orientation)} · ${+design.azimuth||225}° azimuth · ${+design.tilt||0}° tilt · ${+design.setback||0}" setback</small></div><div class="solar-plane-summary">${roofPlanes.map((plane)=>`<span><i>${design.sourceMode==='model'?(design.modelPanels||[]).filter((panel)=>panel.planeId===plane.id).length:(design.planes[plane.id]||[]).length}</i>${esc(plane.label)}</span>`).join('')}</div><button type="button" class="btn" data-roof-jump>Build / edit layout</button></div>
        <p class="solar-disclaimer">${design.sourceMode==='model'&&design.houseModel?`User-supplied 3D house model (${esc(design.houseModel.name)}) with local surface placements.`:assets.roofImage?'Uploaded roof image with a dimensionally unverified module overlay.':'Address-level property imagery for the selected property.'} This is not an engineered design or roof-condition finding; verify model scale, measurements, fire setbacks, roof/deck structure, attachments, electrical routing, imagery recency, and final placement on site or in a connected design platform.</p>
      </section>
      <aside class="solar-card"><div class="solar-card-head"><div><span class="solar-eyebrow">SOLAR QUALIFICATION</span><h2>${esc(lead.name || 'Select a lead')}</h2></div><button class="btn sm" data-sunroof-call="${esc(lead.id || '')}">Open in Dialer</button></div>
        <div class="solar-detail-grid"><div><span>Address</span><b>${esc(lead.address || lead.location || 'Not collected')}</b></div><div><span>Utility</span><b>${esc(lead.utility || 'Not collected')}</b></div><div><span>Monthly bill</span><b>${money(lead.monthlyBill)}</b></div><div><span>Roof</span><b>${esc(lead.roofType || 'Unknown')} · ${+lead.roofAge || 0} yrs</b></div><div><span>Shade loss</span><b>${+lead.shadeLoss || 0}%</b></div><div><span>Battery</span><b>${esc(lead.storageInterest || 'Unknown')}</b></div><div><span>Deal stage</span><b>${esc(opportunity.stage || lead.status || 'New')}</b></div><div><span>Deal value</span><b>${money(opportunity.value || lead.estimatedValue)}</b></div></div>
        <div class="solar-production"><div><span>Planning production</span><b>${estimate.annualProduction.toLocaleString()} kWh/yr</b></div><div><span>Planning bill offset</span><b>${estimate.offset}%</b></div></div>
        <button class="btn pri solar-wide" data-sunroof-edit="${esc(lead.id || '')}">Edit roof & utility inputs</button>
      </aside>
    </div></div>
    ${roofDesignerMarkup(lead, estimate)}
    <div class="solar-metrics" data-proposal-panel="system">
      <article><span>Solar fit</span><b>${score}/100</b><small>${esc(lead.sunroofStatus || 'Review')}</small></article>
      <article><span>Annual sunshine</span><b>${(+lead.annualSunHours || 0).toLocaleString()} hrs</b><small>Local planning input</small></article>
      <article><span>Usable roof area</span><b>${(+lead.usableRoofSqFt || 0).toLocaleString()} ft²</b><small>${esc(lead.roofType || 'Roof not set')}</small></article>
      <article><span>Suggested system</span><b>${estimate.systemKw} kW</b><small>${estimate.panelCount} × ${estimate.panelWatts} W panels</small></article>
    </div>
    <section class="solar-estimate-builder" data-sunroof-estimator="${esc(lead.id || '')}" data-proposal-panel="consumption system pricing"><header><div><span class="solar-eyebrow">SOLAR ESTIMATE BUILDER</span><h2>Confirm the active step’s assumptions</h2><p>Working fields auto-save locally. Use Save estimate to promote the current assumptions to the homeowner record.</p></div><span class="crm-status">${draft.updatedAt?'WORKING DRAFT AUTO-SAVED':'LOCAL PLANNING ESTIMATE'}</span></header><div class="solar-estimate-layout"><div class="solar-estimate-intake"><div class="solar-upload-grid" data-proposal-part="consumption"><label class="solar-upload-card"><input type="file" accept="image/*" data-sunroof-upload="roof" data-lead-id="${esc(lead.id || '')}"><span class="solar-upload-preview">${assets.roofImage ? `<img src="${assets.roofImage}" alt="Roof upload preview">` : '<span class="solar-upload-icon">ROOF</span>'}</span><b>${assets.roofName ? esc(assets.roofName) : 'Upload roof image'}</b><small>JPG, PNG, or HEIC · stored locally when size permits</small></label><label class="solar-upload-card"><input type="file" accept="image/*,.pdf,application/pdf" data-sunroof-upload="bill" data-lead-id="${esc(lead.id || '')}"><span class="solar-upload-preview">${billPreview}</span><b>${assets.billName ? esc(assets.billName) : 'Upload utility bill'}</b><small>${assets.billName ? 'Attached for review · confirm values below' : 'PDF or image · OCR connector requires setup'}</small></label></div><div class="solar-bill-analysis ${assets.billName ? 'ready' : ''}" data-proposal-part="consumption"><span>${assets.billName ? 'DOCUMENT ATTACHED' : 'UTILITY ANALYSIS INTAKE'}</span><b>${assets.billName ? `${esc(assets.billName)} is connected to this estimate` : 'Add a bill to document the usage source'}</b><p>${assets.billName ? `The working estimate uses the confirmed values below. Automatic OCR and line-item extraction require a configured vision or document provider.` : 'Build from confirmed bill and rate values now. Uploading preserves the source document; it does not pretend to extract unread values.'}</p></div><form class="solar-estimate-form" data-sunroof-estimate-form><input type="hidden" name="leadId" value="${esc(lead.id || '')}"><label data-proposal-part="consumption">Average monthly bill ($)<input name="monthlyBill" type="number" min="0" step="1" value="${+workingLead.monthlyBill || 0}" data-estimate-input></label><label data-proposal-part="consumption">Annual usage (kWh)<input name="annualKwh" type="number" min="0" step="1" value="${estimate.annualUse}" data-estimate-input></label><label data-proposal-part="consumption">Utility rate ($/kWh)<input name="utilityRate" type="number" min="0.01" step="0.001" value="${estimate.utilityRate}" data-estimate-input></label><label data-proposal-part="system">Target offset (%)<input name="targetOffset" type="number" min="10" max="120" step="1" value="${estimate.targetOffset}" data-estimate-input></label><label data-proposal-part="system">Panel rating<select name="panelWatts" data-estimate-input>${[400, 410, 425, 440, 450].map((value) => `<option value="${value}" ${value === estimate.panelWatts ? 'selected' : ''}>${value} W</option>`).join('')}</select></label><label data-proposal-part="system">Planning system (kW)<input name="estimateSystemKw" type="number" min="0.5" step="0.1" value="${+workingLead.estimateSystemKw || +workingLead.recommendedKw || estimate.systemKw}" data-estimate-input></label><label data-proposal-part="pricing">Installed price ($/W)<input name="pricePerWatt" type="number" min="0.1" step="0.01" value="${estimate.pricePerWatt}" data-estimate-input></label><label data-proposal-part="pricing">Planning incentive (%)<input name="incentivePercent" type="number" min="0" max="100" step="1" value="${estimate.incentivePercent}" data-estimate-input></label><label data-proposal-part="pricing">Financing term<select name="financeYears" data-estimate-input>${[10, 15, 20, 25].map((value) => `<option value="${value}" ${value === estimate.years ? 'selected' : ''}>${value} years</option>`).join('')}</select></label><label data-proposal-part="pricing">Planning APR (%)<input name="financeApr" type="number" min="0" max="30" step="0.01" value="${estimate.apr}" data-estimate-input></label><div class="solar-estimate-form-actions"><button class="btn pri" type="submit">Save estimate to CRM</button><button class="btn" type="button" data-sunroof-download="${esc(lead.id || '')}">Export working estimate</button></div></form></div><aside class="solar-estimate-summary"><div class="solar-estimate-system" data-proposal-part="system pricing"><span class="solar-eyebrow">PROPOSED ARRAY</span><strong><b data-estimate-output="panelCount">${estimate.panelCount}</b> panels</strong><small><span data-estimate-output="systemKw">${estimate.systemKw}</span> kW · ${estimate.panelWatts} W modules · roof capacity ${estimate.roofPanelCapacity} panels</small><div class="solar-panel-mini">${panelOverlay}</div></div><div class="solar-estimate-results"><article data-proposal-part="consumption system"><span>Annual production</span><b data-estimate-output="annualProduction">${estimate.annualProduction.toLocaleString()} kWh</b><small>Planning model</small></article><article data-proposal-part="consumption system"><span>Estimated offset</span><b data-estimate-output="offset">${estimate.offset}%</b><small>Against confirmed use</small></article><article data-proposal-part="pricing"><span>Net planning price</span><b data-estimate-output="netPrice">${money(estimate.netPrice)}</b><small>After planning incentive</small></article><article data-proposal-part="pricing"><span>Estimated payment</span><b data-estimate-output="monthlyPayment">${money(estimate.monthlyPayment)}/mo</b><small>${estimate.years} years at ${estimate.apr}% APR</small></article></div><div class="solar-price-stack" data-proposal-part="pricing"><div><span>Gross system price</span><b data-estimate-output="grossPrice">${money(estimate.grossPrice)}</b></div><div><span>Planning incentive</span><b data-estimate-output="incentive">−${money(estimate.incentive)}</b></div><div class="total"><span>Net planning price</span><b data-estimate-output="netPriceLine">${money(estimate.netPrice)}</b></div><div><span>Estimated annual savings</span><b data-estimate-output="annualSavings">${money(estimate.annualSavings)}</b></div><div><span>Simple payback</span><b data-estimate-output="payback">${estimate.payback ? `${estimate.payback.toFixed(1)} years` : 'Needs usage'}</b></div></div><p>Planning estimate only. Final production, incentives, tax eligibility, financing, price, engineering, and savings require verified inputs and provider approvals.</p></aside></div></section>
    ${proposalReviewMarkup(workingLead,design,estimate,readiness,opportunity)}
    <section class="solar-platform-links" data-proposal-panel="review"><header><div><span class="solar-eyebrow">CONNECTED DESIGN & DATA HANDOFFS</span><h2>Move verified inputs into the rest of the solar stack</h2><p>These are explicit handoffs. Live synchronization and automatic imports require each platform’s credentials and API configuration.</p></div><span class="crm-status warn">PROVIDER CONNECTIONS · SETUP REQUIRED</span></header><div><a href="https://sunroof.withgoogle.com/" target="_blank" rel="noopener noreferrer"><b>Google Project Sunroof</b><span>Verify address-level roof context</span><strong>Open ↗</strong></a><a href="https://pvwatts.nrel.gov/" target="_blank" rel="noopener noreferrer"><b>NREL PVWatts</b><span>Validate production assumptions</span><strong>Open ↗</strong></a><a href="https://www.opensolar.com/" target="_blank" rel="noopener noreferrer"><b>OpenSolar</b><span>Design and proposal handoff</span><strong>Connect ↗</strong></a><a href="https://aurorasolar.com/" target="_blank" rel="noopener noreferrer"><b>Aurora Solar</b><span>Remote design and shading workflow</span><strong>Connect ↗</strong></a><a href="https://www.energytoolbase.com/" target="_blank" rel="noopener noreferrer"><b>Energy Toolbase</b><span>Rates, storage, and financial modeling</span><strong>Connect ↗</strong></a></div></section>
    <section class="solar-card solar-records" data-proposal-panel="review"><div class="solar-card-head"><div><span class="solar-eyebrow">SOLAR SCREENING QUEUE</span><h2>${leads.length} homeowner properties</h2></div><a href="https://developers.google.com/maps/documentation/solar/overview" target="_blank" rel="noopener noreferrer">Solar API setup docs ↗</a></div><div class="solar-record-list">${rows}</div></section>`;
  }

  function ensureHomeCalendar(page) {
    if (!page || page.querySelector('.home-solar-calendar')) return;
    const template = document.createElement('template');
    template.innerHTML = homeCalendarMarkup(loadCRM());
    const calendar = template.content.firstElementChild;
    const anchor = page.querySelector('.solar-home-command') || page.querySelector('.home-journey-graph');
    anchor?.insertAdjacentElement('afterend', calendar);
  }

  function homeCommandCenter() {
    const page = document.querySelector('.page[data-page="home"].active');
    if (!page) return;
    page.querySelector('.conduit-process-flow')?.remove();
    if (page.querySelector('.solar-home-command')) { ensureHomeCalendar(page); enhanceKpiTrends(); return; }
    const database = loadCRM();
    const leads = database.leads || [];
    if (!leads.length) return;
    const appointments = database.appointments || [];
    const now = Date.now(), week = now + 7 * 86400000;
    const upcoming = appointments.filter((item) => Date.parse(item.startsAt) >= now && Date.parse(item.startsAt) <= week).length;
    const screened = leads.filter((lead) => lead.sunroofStatus).length;
    const billReady = leads.filter((lead) => +lead.monthlyBill > 0).length;
    const proposalValue = (database.opportunities || []).filter((item) => /qualified|appointment|proposal/i.test(item.stage)).reduce((sum, item) => sum + (+item.value || 0), 0);
    const queue = leads.slice().sort((a, b) => solarScore(b) - solarScore(a)).slice(0, 5).map((lead) => `<div class="solar-queue-row"><span class="solar-score">${solarScore(lead)}</span><div><b>${esc(lead.name)}</b><small>${esc(lead.city)}, ${esc(lead.state)} · ${esc(lead.utility)}</small></div><div><small>Bill</small><b>${money(lead.monthlyBill)}/mo</b></div><div><small>Roof</small><b>${esc(lead.sunroofStatus)}</b></div><button class="btn sm" data-solar-select="${esc(lead.id)}">Screen roof</button></div>`).join('');
    const section = document.createElement('section');
    section.className = 'solar-home-command';
    section.innerHTML = `<div class="solar-home-head"><div><span class="solar-eyebrow">SOLAR OPERATING DESK</span><h2>Qualification and revenue readiness</h2><p>One view from utility bill and roof fit to appointment and proposal.</p></div><button class="btn pri" data-crm-route="conversations-sunroof">Open Proposal Buildout</button></div>
      <div class="solar-home-metrics"><article><span>Roofs screened</span><b>${screened}/${leads.length}</b><small>Planning data present</small></article><article><span>Utility bills captured</span><b>${billReady}/${leads.length}</b><small>Qualification coverage</small></article><article><span>Visits next 7 days</span><b>${upcoming}</b><small>Calls and site surveys</small></article><article><span>Proposal-ready value</span><b>${money(proposalValue)}</b><small>Qualified through proposal</small></article></div>
      <div class="solar-home-grid"><div class="solar-card"><div class="solar-card-head"><div><span class="solar-eyebrow">PRIORITY QUEUE</span><h3>Best next solar actions</h3></div><span>${leads.length} total leads</span></div>${queue}</div>
      <div class="solar-card"><div class="solar-card-head"><div><span class="solar-eyebrow">LIFECYCLE COVERAGE</span><h3>From inquiry to install</h3></div></div><div class="solar-funnel">${[['Inquiry', leads.length], ['Bill captured', billReady], ['Roof screened', screened], ['Appointment', appointments.length], ['Proposal', (database.opportunities || []).filter((item) => /proposal/i.test(item.stage)).length], ['Won', (database.opportunities || []).filter((item) => /won/i.test(item.stage)).length]].map(([label, value], index) => `<div><span>${index + 1}</span><b>${esc(label)}</b><strong>${value}</strong></div>`).join('')}</div><button class="btn" data-crm-route="conversations-appointments">Open Calendar</button></div></div>`;
    const dashboard = page.querySelector('.conduit-crm-dashboard');
    const template = document.createElement('template'); template.innerHTML = homeFlowMarkup(database); const journey = template.content.firstElementChild;
    const trendTemplate = document.createElement('template'); trendTemplate.innerHTML = kpiTrendMarkup(database, 'home'); const trend = trendTemplate.content.firstElementChild;
    const anchor = dashboard?.querySelector('.conduit-dash-metrics') || dashboard?.querySelector('.conduit-dash-head') || page.querySelector('.conduit-section-tools');
    anchor?.insertAdjacentElement('afterend', journey);
    journey?.insertAdjacentElement('afterend', section);
    section.insertAdjacentElement('afterend', trend);
    ensureHomeCalendar(page);
    enhanceKpiTrends();
  }

  function solarLeadLayer() {
    const page = document.querySelector('.page[data-page="leads"].active');
    const workspace = page?.querySelector('#leadCrmWorkspace,.crm-workspace');
    if (!page || !workspace) return;
    const replacements = [
      ['#leadCrmSearch,#crmLeadSearch', 'placeholder', 'Search homeowner, property, phone, email, location'],
      ['#leadFieldCompany', 'label', 'Property / account'], ['#leadFieldTitle', 'label', 'Lead type']
    ];
    replacements.forEach(([selector, kind, value]) => { const element = page.querySelector(selector); if (!element) return; if (kind === 'placeholder') element.placeholder = value; else if (element.parentElement?.tagName === 'LABEL' && !element.parentElement.dataset.solarLabeled) { element.parentElement.childNodes[0].textContent = value; element.parentElement.dataset.solarLabeled = 'true'; } });
    const headers = page.querySelectorAll('.lead-crm-table th');
    if (headers[1]) headers[1].textContent = 'Homeowner';
    if (headers[2]) headers[2].textContent = 'Property / account';
    const recordLabel = page.querySelector('#leadCrmDrawer .mono'); if (recordLabel) recordLabel.textContent = 'SOLAR LEAD RECORD';
    const introCopy = page.querySelector(':scope > .intro p'); if (introCopy) introCopy.textContent = 'Residential solar lead operations from inquiry through roof screening, consultation, proposal, and installation handoff.';
    const importHeading = page.querySelector('#leadImportPanel h2'); if (importHeading) importHeading.textContent = 'Map and validate solar contacts';
    const importCopy = page.querySelector('#leadImportPanel p'); if (importCopy) importCopy.innerHTML = 'Required columns: <b>property_name/company</b>, <b>full_name/name</b>, and <b>lead_type/role</b>. Utility, monthly_bill, roof_type, address, phone, email, notes, and source_url are optional.';
    if (!workspace.querySelector('.solar-lead-summary')) {
      const database = loadCRM(), leads = database.leads || [];
      workspace.insertAdjacentHTML('afterbegin', `<div class="solar-lead-summary"><span><b>RESIDENTIAL SOLAR ONLY</b><small>Homeowner and property qualification</small></span><span><b>${leads.filter((lead) => lead.utility).length}/${leads.length}</b><small>utility captured</small></span><span><b>${leads.filter((lead) => lead.sunroofStatus).length}/${leads.length}</b><small>roof screened</small></span><button class="btn sm" data-crm-route="conversations-sunroof">Proposal Buildout</button></div>`);
    }
  }

  function solarizeLegacyCopy() {
    const active = document.querySelector('.page.active');
    if (!active) return;
    const walker = document.createTreeWalker(active, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const replacements = [
      [/school-growth/gi, 'solar-growth'], [/school-wedge/gi, 'solar-wedge'], [/school CRM/gi, 'solar CRM'],
      [/school offers?/gi, (match) => match.toLowerCase().endsWith('s') ? 'solar offers' : 'solar offer'],
      [/school accounts?/gi, (match) => match.toLowerCase().endsWith('s') ? 'homeowner accounts' : 'homeowner account'],
      [/school signals?/gi, (match) => match.toLowerCase().endsWith('s') ? 'roof and utility signals' : 'roof and utility signal'],
      [/school budgets?/gi, (match) => match.toLowerCase().endsWith('s') ? 'solar budgets' : 'solar budget'],
      [/parent demand/gi, 'homeowner demand'], [/\bschool\b/gi, 'solar'], [/\bparents?\b/gi, 'homeowners'],
      [/\badmissions?\b/gi, 'solar consultations'], [/\benrollment\b/gi, 'qualification'], [/\bstudents?\b/gi, 'homeowners'], [/\bcampus\b/gi, 'property']
    ];
    nodes.forEach((node) => {
      if (node.parentElement?.closest('script,style')) return;
      let value = node.nodeValue;
      replacements.forEach(([pattern, replacement]) => { value = value.replace(pattern, replacement); });
      if (value !== node.nodeValue) node.nodeValue = value;
    });
  }

  function deepRouteWorkspace(route, database) {
    const leads = database.leads || [], opportunities = database.opportunities || [], appointments = database.appointments || [], tasks = database.tasks || [];
    const pipeline = opportunities.reduce((sum, item) => sum + (+item.value || 0), 0);
    const weighted = opportunities.reduce((sum, item) => sum + (+item.value || 0) * (+item.probability || 0) / 100, 0);
    const proposalCount = opportunities.filter((item) => /proposal|contract/i.test(item.stage)).length;
    const strongRoofs = leads.filter((lead) => solarScore(lead) >= 78).length;
    const billReady = leads.filter((lead) => +lead.monthlyBill > 0).length;
    const confirmed = appointments.filter((item) => /confirmed|completed/i.test(item.status)).length;
    const attention = appointments.filter((item) => /needs confirmation|no-show/i.test(item.status)).length;
    const openTasks = tasks.filter((task) => task.status !== 'completed').length;
    const ownerRows = [...new Set(opportunities.map((item) => item.owner).filter(Boolean))].map((owner) => {
      const records = opportunities.filter((item) => item.owner === owner);
      return [owner, money(records.reduce((sum, item) => sum + (+item.value || 0), 0)), `${records.length} active solar opportunities`];
    });
    const stageRows = [...new Set(opportunities.map((item) => item.stage).filter(Boolean))].slice(0, 5).map((stage) => {
      const records = opportunities.filter((item) => item.stage === stage);
      return [stage, records.length, money(records.reduce((sum, item) => sum + (+item.value || 0), 0))];
    });
    const sourceRows = [...new Set(leads.map((lead) => lead.source).filter(Boolean))].map((source) => {
      const records = leads.filter((lead) => lead.source === source);
      return [source, records.length, `${records.filter((lead) => solarScore(lead) >= 78).length} strong-fit roofs`];
    });
    const specifications = {
      'sales-products': ['Offer configuration desk', [['Offers', '4', 'Solar, storage, audit, service'], ['Bill-ready', `${billReady}/${leads.length}`, 'Pricing input coverage'], ['Storage interest', leads.filter((lead) => /interested|maybe/i.test(lead.storageInterest)).length, 'Expansion candidates'], ['Proposals', proposalCount, 'In active pipeline']], 'Proposal package readiness', [['System sizing', `${leads.filter((lead) => +lead.recommendedKw > 0).length}/${leads.length}`, 'Planning ranges captured'], ['Utility context', `${leads.filter((lead) => lead.utility).length}/${leads.length}`, 'Territory captured'], ['Roof context', `${leads.filter((lead) => lead.sunroofStatus).length}/${leads.length}`, 'Screen before claims'], ['Financing', 'Review', 'Provider configuration required']], 'Offer rules', [['Core solar', 'Default', 'Size + utility + roof'], ['Solar + storage', 'Optional', 'Use homeowner interest'], ['Energy audit', 'Attach', 'For uncertain consumption'], ['Service plan', 'Follow-up', 'Post-install retention']]],
      'sales-proof': ['Proof governance desk', [['Strong roofs', strongRoofs, 'Best matching candidates'], ['Utilities', new Set(leads.map((lead) => lead.utility)).size, 'Territories represented'], ['Proof types', '4', 'Production, photos, bills, stories'], ['Approval gate', 'Required', 'Before proposal use']], 'Coverage checklist', [['Production assumptions', 'Review', 'Keep attributable and dated'], ['Install photography', 'Ready', 'Match roof and system type'], ['Bill examples', 'Review', 'Match utility territory'], ['Customer stories', 'Ready', 'Document consent']], 'Claim safety', [['Sun exposure', 'Verify', 'Use the Google Project Sunroof handoff'], ['Savings', 'Model', 'No guaranteed outcomes'], ['Timeline', 'Range', 'Utility and permit dependent'], ['Battery benefit', 'Qualify', 'Match homeowner goals']]],
      'marketing-campaigns': ['Lifecycle campaign planner', [['Leads', leads.length, 'Local solar audience'], ['High-priority', leads.filter((lead) => /high/i.test(lead.priority)).length, 'Immediate follow-up'], ['Need confirmation', attention, 'Appointment rescue'], ['Open tasks', openTasks, 'Owner workload']], 'Campaign schedule', [['New inquiry', '< 5 min', 'Consent check → call + SMS'], ['Bill collection', 'Day 1–3', 'Stop when uploaded'], ['No-show recovery', 'Same day', 'Offer reschedule link'], ['Proposal reactivation', 'Day 3–14', 'Owner review before send']], 'Readiness gates', [['Consent', 'Required', 'Before automation'], ['Owner', 'Required', 'Clear accountability'], ['Stop condition', 'Required', 'Prevent redundant outreach'], ['Attribution', 'Required', 'Source through revenue']]],
      'marketing-audiences': ['Solar audience builder', [['Strong fit', strongRoofs, 'Roof score 78+'], ['High bill', leads.filter((lead) => +lead.monthlyBill >= 250).length, '$250+ monthly'], ['Battery curious', leads.filter((lead) => /interested|maybe/i.test(lead.storageInterest)).length, 'Interested or maybe'], ['Site-ready', leads.filter((lead) => +lead.roofAge <= 12 && solarScore(lead) >= 70).length, 'Roof age + fit']], 'Live qualification segments', sourceRows, 'Activation rules', [['Consent verified', leads.filter((lead) => lead.consent === 'verified').length, 'Eligible for approved outreach'], ['Do not call', leads.filter((lead) => lead.dnc).length, 'Always suppress'], ['Utility known', leads.filter((lead) => lead.utility).length, 'Territory content'], ['Roof reviewed', leads.filter((lead) => lead.sunroofStatus).length, 'Use relevant proof']]],
      'marketing-content': ['Content operations desk', [['Core guides', '4', 'Consultation, roof, battery, install'], ['Utilities', new Set(leads.map((lead) => lead.utility)).size, 'Localization opportunities'], ['Roof types', new Set(leads.map((lead) => lead.roofType)).size, 'Visual variants'], ['Approval', 'Human', 'Required before sending']], 'Content production queue', [['Consultation prep', 'Ready', 'Bill + decision makers'], ['Roof review explainer', 'Review', 'Clarify external verification'], ['Battery comparison', 'Draft', 'Goals before products'], ['Install timeline', 'Ready', 'Use ranges, not promises']], 'Reuse map', [['New inquiry', 'Prep guide', 'Reduce appointment friction'], ['Roof screened', 'Roof explainer', 'Set accurate expectations'], ['Proposal', 'Proof package', 'Support the decision'], ['Project', 'Timeline guide', 'Keep homeowner informed']]],
      'reports-sales': ['Solar sales intelligence', [['Gross pipeline', money(pipeline), `${opportunities.length} opportunities`], ['Weighted', money(weighted), 'Probability-adjusted'], ['Proposal deals', proposalCount, 'Decision-stage work'], ['Strong-fit roofs', strongRoofs, 'Qualification quality']], 'Owner forecast', ownerRows, 'Lifecycle conversion', stageRows],
      'reports-calls': ['Call readiness and follow-up', [['Leads', leads.length, 'Reachable records'], ['Attempts logged', leads.reduce((sum, lead) => sum + (+lead.attempts || 0), 0), 'Across solar leads'], ['Next action', leads.filter((lead) => lead.nextAction).length, 'Records with direction'], ['Open callbacks', (database.callbacks || []).filter((item) => item.status !== 'completed').length, 'Due work']], 'Calling priorities', leads.slice().sort((a, b) => solarScore(b) - solarScore(a)).slice(0, 4).map((lead) => [lead.name, solarScore(lead), lead.nextAction || 'Set next action']), 'Quality controls', [['Consent verified', leads.filter((lead) => lead.consent === 'verified').length, 'Before outreach'], ['DNC suppressed', leads.filter((lead) => lead.dnc).length, 'No-call records'], ['Utility captured', leads.filter((lead) => lead.utility).length, 'Useful call context'], ['Bill captured', billReady, 'Qualification context']]],
      'reports-appointments': ['Appointment performance desk', [['Appointments', appointments.length, 'Local calendar records'], ['Confirmed / complete', confirmed, 'Healthy handoffs'], ['Need attention', attention, 'Confirm or recover'], ['Site surveys', appointments.filter((item) => /site survey/i.test(item.type)).length, 'Field capacity']], 'Readiness coverage', [['Utility context', appointments.filter((item) => item.utility).length, 'Available in appointment'], ['Bill context', appointments.filter((item) => +item.monthlyBill > 0).length, 'Available in appointment'], ['Reminder policy', appointments.filter((item) => item.reminderPolicy).length, 'Locally configured'], ['Travel buffer', appointments.filter((item) => +item.travelBuffer > 0).length, 'Field-aware bookings']], 'Appointment mix', [...new Set(appointments.map((item) => item.type))].slice(0, 5).map((type) => [type, appointments.filter((item) => item.type === type).length, 'scheduled records'])],
      'reports-pipeline': ['Pipeline health desk', [['Gross pipeline', money(pipeline), `${opportunities.length} deals`], ['Weighted value', money(weighted), 'Current probabilities'], ['Proposal stage', proposalCount, 'Decision-ready'], ['At risk', opportunities.filter((item) => Date.now() - Date.parse(item.stageEnteredAt || item.updatedAt) > 14 * 86400000).length, '14+ days in stage']], 'Lifecycle distribution', stageRows, 'Risk controls', [['Next action', opportunities.filter((item) => item.nextAction).length, 'Deals with direction'], ['Owner assigned', opportunities.filter((item) => item.owner).length, 'Accountability coverage'], ['Probability set', opportunities.filter((item) => +item.probability > 0).length, 'Forecast coverage'], ['Roof screened', leads.filter((lead) => lead.sunroofStatus).length, 'Qualification coverage']]],
      'reports-marketing': ['Source quality intelligence', [['Lead sources', new Set(leads.map((lead) => lead.source)).size, 'Attribution groups'], ['Solar leads', leads.length, 'Local records'], ['Strong-fit', strongRoofs, 'Quality indicator'], ['Pipeline', money(pipeline), 'Sourced opportunity value']], 'Source quality', sourceRows, 'Measurement model', [['Qualified roof', `${strongRoofs}/${leads.length}`, 'Better than raw volume'], ['Bill capture', `${billReady}/${leads.length}`, 'Intent + value context'], ['Appointment set', appointments.length, 'Lifecycle progression'], ['Revenue link', opportunities.length, 'Opportunity attribution']]],
      'reports-agents': ['Workflow and agent controls', [['Audit events', (database.agentAudit || []).length, 'Recorded agent actions'], ['Human owners', new Set(leads.map((lead) => lead.owner).filter(Boolean)).size, 'Assigned operators'], ['Open work', openTasks, 'Tasks requiring action'], ['External actions', 'Approval', 'Provider actions remain gated']], 'Operational boundaries', [['Research', 'Allowed', 'Read-only qualification support'], ['Drafting', 'Allowed', 'Human reviews output'], ['Send / call', 'Gated', 'Provider + approval required'], ['Pricing claims', 'Gated', 'Verified assumptions required']], 'Workflow health', [['Lead ownership', `${leads.filter((lead) => lead.owner).length}/${leads.length}`, 'Assigned'], ['Next actions', `${leads.filter((lead) => lead.nextAction).length}/${leads.length}`, 'Documented'], ['Task ownership', `${tasks.filter((task) => task.owner).length}/${tasks.length}`, 'Assigned'], ['Audit trail', (database.agentAudit || []).length, 'Recorded events']]]
    }[route];
    if (!specifications) return '';
    const [title, metrics, leftTitle, leftRows, rightTitle, rightRows] = specifications;
    const rows = (items) => items.map(([label, value, note]) => `<div><span>${esc(label)}</span><b>${esc(value)}</b><small>${esc(note)}</small></div>`).join('');
    return `<section class="solar-deep-workspace"><header><div><span class="solar-eyebrow">WORKING SOLAR CRM DATA</span><h2>${esc(title)}</h2></div><small>Local workspace · editable records · no external actions</small></header><div class="solar-deep-metrics">${metrics.map(([label, value, note]) => `<article><span>${esc(label)}</span><b>${esc(value)}</b><small>${esc(note)}</small></article>`).join('')}</div><div class="solar-deep-panels"><article><h3>${esc(leftTitle)}</h3><div>${rows(leftRows)}</div></article><article><h3>${esc(rightTitle)}</h3><div>${rows(rightRows)}</div></article></div></section>`;
  }

  function taskOrganizer() {
    const page = document.querySelector('.page[data-page="tasks"].active'), workspace = page?.querySelector('.task-workspace');
    if (!page || !workspace || page.querySelector('.solar-task-organizer')) return;
    const database = loadCRM(), tasks = database.tasks || [], now = new Date(), todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    const open = tasks.filter((task) => task.status !== 'completed'), overdue = open.filter((task) => Date.parse(task.dueAt) < now), today = open.filter((task) => Date.parse(task.dueAt) >= now && Date.parse(task.dueAt) < todayEnd), high = open.filter((task) => /high/i.test(task.priority));
    workspace.insertAdjacentHTML('beforebegin', `<section class="solar-task-organizer"><div><span class="solar-eyebrow">ORGANIZED SOLAR WORKDAY</span><h2>Tasks by urgency and customer journey</h2><p>Use the task list below to edit work; use these counts to decide what moves first.</p></div><div class="solar-task-metrics"><span><b>${today.length}</b><small>due today</small></span><span class="critical"><b>${overdue.length}</b><small>overdue</small></span><span class="attention"><b>${high.length}</b><small>high priority</small></span><span><b>${open.length}</b><small>open total</small></span></div><div class="solar-task-links"><button data-crm-route="conversations-appointments">Calendar</button><button data-crm-route="sales-opportunities">Pipeline</button></div></section>`);
  }

  function routeEnrichment() {
    const page = document.querySelector('.page.active.crm-product-page');
    if (!page || page.querySelector('.solar-route-insight')) return;
    const route = page.dataset.page;
    // Reports own their final analytical composition in crm-product-pass.js.
    // The former shared insight, momentum chart, and deep-workspace stack made
    // all seven report routes look alike and buried the useful content.
    if (route?.startsWith('reports-')) return;
    const database = loadCRM();
    const leads = database.leads || [], opportunities = database.opportunities || [];
    const content = {
      'sales-products': ['Solar offer readiness', ['Core solar', 'Solar + storage', 'Energy audit', 'Service & maintenance'], 'Tie system size, battery interest, financing, utility territory, and proof assets to every proposal.'],
      'sales-proof': ['Solar proof coverage', ['Production proof', 'Install photos', 'Utility bill examples', 'Customer stories'], 'Keep every claim attributable, approved, current, and matched to the homeowner’s utility and roof situation.'],
      'marketing-campaigns': ['Solar lifecycle campaigns', ['New inquiry speed-to-lead', 'Utility-bill collection', 'No-show recovery', 'Proposal reactivation'], 'Use consent-aware SMS and email sequences with owner, stop conditions, and attribution.'],
      'marketing-audiences': ['Solar qualification segments', ['High bill + strong roof', 'Battery interested', 'Site-survey ready', 'Proposal stalled'], 'Segment by homeowner intent, territory, utility, roof fit, bill range, consent, and lifecycle stage.'],
      'marketing-content': ['Solar content kit', ['Consultation prep', 'Roof review explainer', 'Battery comparison', 'Install timeline'], 'Build reusable answers around the questions homeowners ask before appointment and proposal.'],
      'reports-overview': ['Solar operating scorecard', [`${leads.filter((lead) => solarScore(lead) > 78).length} strong-fit roofs`, `${leads.filter((lead) => +lead.monthlyBill >= 250).length} high-bill homes`, `${opportunities.filter((item) => /proposal/i.test(item.stage)).length} proposals`, `${money(opportunities.reduce((sum, item) => sum + (+item.value || 0), 0))} pipeline`], 'Track the qualification inputs that explain conversion—not only calls and revenue.'],
      'reports-sales': ['Sales performance and forecast', ['Gross and weighted pipeline', 'Owner performance', 'Lifecycle conversion', 'Qualification quality'], 'Read the revenue forecast alongside solar-fit inputs, ownership, next actions, and time in stage.'],
      'reports-calls': ['Solar call quality', ['Consent coverage', 'Attempts and callbacks', 'Qualification context', 'Next-action coverage'], 'Measure whether calling creates useful homeowner progress—not only raw activity.'],
      'reports-appointments': ['Solar appointment quality', ['Bill collected', 'Roof reviewed', 'Decision makers present', 'Outcome logged'], 'Measure readiness, sit rate, outcome, travel buffer, and setter-to-closer handoff quality.'],
      'reports-pipeline': ['Solar pipeline health', ['Lifecycle distribution', 'Time in stage', 'Next-action coverage', 'Weighted value'], 'Separate forecast health from urgency so operators can see what needs movement without turning the whole page into an alarm.'],
      'reports-marketing': ['Source-to-install quality', ['Cost per qualified roof', 'Bill capture rate', 'Appointment set rate', 'Revenue by source'], 'Judge acquisition sources by qualified solar pipeline and won revenue, not raw lead volume.'],
      'reports-agents': ['Workflow and agent governance', ['Human ownership', 'Approval boundaries', 'Audit trail', 'Provider readiness'], 'Keep research and drafting helpful while calls, sends, pricing claims, and other external actions remain explicit and reviewable.']
    }[route];
    if (!content) return;
    const section = document.createElement('section');
    section.className = 'solar-route-insight solar-card';
    section.innerHTML = `<div><span class="solar-eyebrow">SOLAR OPERATING LAYER</span><h2>${esc(content[0])}</h2><p>${esc(content[2])}</p></div><div class="solar-insight-items">${content[1].map((item) => `<span>${esc(item)}</span>`).join('')}</div>`;
    const workspace = page.querySelector('.crm-product-workspace');
    workspace?.insertAdjacentElement('afterbegin', section);
    let insertionAnchor = section;
    if (route.startsWith('reports-')) { const template = document.createElement('template'); template.innerHTML = kpiTrendMarkup(database, 'reports'); const trend = template.content.firstElementChild; section.insertAdjacentElement('afterend', trend); insertionAnchor = trend; }
    const deeper = deepRouteWorkspace(route, database); if (deeper) insertionAnchor.insertAdjacentHTML('afterend', deeper);
    enhanceKpiTrends();
  }

  function calendarPrefs() { return readJSON(CALENDAR_PREFS, { owner: 'all', type: 'all', weekends: true, workdayStart: '08:00', workdayEnd: '18:00', duration: '45', travelBuffer: '30', reminderPolicy: '24h + 2h SMS', colorBy: 'type', customTypes: [] }); }
  function calendarSettings() {
    const page = document.querySelector('.page[data-page="conversations-appointments"].active');
    if (!page || page.querySelector('.solar-calendar-settings')) return;
    const database = loadCRM(), appointments = database.appointments || [], preferences = calendarPrefs();
    const owners = [...new Set(appointments.flatMap((item) => [item.setter, item.closer]).filter(Boolean))];
    const types = [...new Set([...appointmentTypes, ...(preferences.customTypes || []), ...appointments.map((item) => item.type)].filter(Boolean))];
    const panel = document.createElement('details'); panel.open = true; panel.className = 'solar-calendar-settings';
    panel.innerHTML = `<summary><span><b>Calendar controls</b><small>Availability, ownership, appointment types, reminders, and travel</small></span><span>Customize ▾</span></summary>
      <div class="solar-calendar-controls"><label>Owner<select data-cal-pref="owner"><option value="all">All owners</option>${owners.map((value) => `<option ${preferences.owner === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label><label>Appointment type<select data-cal-pref="type"><option value="all">All types</option>${types.map((value) => `<option ${preferences.type === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label><label>Workday starts<input type="time" data-cal-pref="workdayStart" value="${esc(preferences.workdayStart)}"></label><label>Workday ends<input type="time" data-cal-pref="workdayEnd" value="${esc(preferences.workdayEnd)}"></label><label>Default duration<select data-cal-pref="duration">${[30,45,60,90].map((value) => `<option value="${value}" ${String(preferences.duration) === String(value) ? 'selected' : ''}>${value} minutes</option>`).join('')}</select></label><label>Travel buffer<select data-cal-pref="travelBuffer">${[0,15,30,45,60].map((value) => `<option value="${value}" ${String(preferences.travelBuffer) === String(value) ? 'selected' : ''}>${value} minutes</option>`).join('')}</select></label><label>Color by<select data-cal-pref="colorBy"><option value="type" ${preferences.colorBy === 'type' ? 'selected' : ''}>Appointment type</option><option value="status" ${preferences.colorBy === 'status' ? 'selected' : ''}>Status</option><option value="owner" ${preferences.colorBy === 'owner' ? 'selected' : ''}>Owner</option></select></label><label class="solar-check"><input type="checkbox" data-cal-pref="weekends" ${preferences.weekends ? 'checked' : ''}> Show weekends</label><label class="solar-custom-type">New appointment type<input data-cal-custom placeholder="Permit review"></label><button class="btn" data-cal-add>Add type</button><button class="btn pri" data-cal-save>Save calendar settings</button><span class="solar-save-state" role="status">Filters apply to appointment cards.</span></div>`;
    const toolbar = page.querySelector('.crm-product-toolbar'); toolbar?.insertAdjacentElement('afterend', panel);
    page.querySelector('.crm-product-metrics')?.insertAdjacentHTML('afterend', `<div class="solar-capacity-strip"><span><b>${appointments.filter((item) => /confirmed/i.test(item.status)).length}</b> confirmed</span><span><b>${appointments.filter((item) => /needs confirmation/i.test(item.status)).length}</b> need confirmation</span><span><b>${appointments.filter((item) => /site survey/i.test(item.type)).length}</b> site surveys</span><span><b>${appointments.filter((item) => /proposal/i.test(item.type)).length}</b> proposal reviews</span></div>`);
    applyCalendarSettings(page);
  }

  function applyCalendarSettings(page = document.querySelector('.page[data-page="conversations-appointments"].active')) {
    if (!page) return;
    const preferences = calendarPrefs(), database = loadCRM();
    page.classList.toggle('solar-hide-weekends', !preferences.weekends);
    page.dataset.calendarColor = preferences.colorBy;
    page.querySelectorAll('[data-appointment-detail]').forEach((button) => {
      const appointment = (database.appointments || []).find((item) => item.id === button.dataset.appointmentDetail);
      if (!appointment) return;
      button.dataset.owner = `${appointment.setter || ''} ${appointment.closer || ''}`;
      button.dataset.type = appointment.type || '';
      button.dataset.status = appointment.status || '';
      button.hidden = (preferences.owner !== 'all' && !button.dataset.owner.includes(preferences.owner)) || (preferences.type !== 'all' && button.dataset.type !== preferences.type);
    });
  }

  function enrichAppointmentModal() {
    const form = document.querySelector('#crmAppointmentModal form[data-appointment-form]');
    if (!form || form.querySelector('.solar-appointment-fields')) return;
    const database = loadCRM(), id = form.querySelector('[name="id"]')?.value, existing = (database.appointments || []).find((item) => item.id === id) || {}, preferences = calendarPrefs();
    const typeSelect = form.querySelector('[name="type"]');
    [...new Set([...appointmentTypes, ...(preferences.customTypes || [])])].forEach((value) => { if (![...typeSelect.options].some((option) => option.value === value)) typeSelect.add(new Option(value, value)); });
    if (!id) form.querySelector('[name="duration"]').value = String(preferences.duration);
    const notes = form.querySelector('textarea[name="notes"]')?.closest('label');
    notes?.insertAdjacentHTML('beforebegin', `<div class="solar-appointment-fields"><label>Utility<input name="utility" value="${esc(existing.utility || '')}" placeholder="Utility provider"></label><label>Monthly bill<input name="monthlyBill" type="number" min="0" value="${esc(existing.monthlyBill || '')}" placeholder="250"></label><label>Roof review<select name="roofReview">${['Not screened','Strong fit','Review','Limited'].map((value) => `<option ${existing.roofReview === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label>Appointment goal<select name="appointmentGoal">${appointmentTypes.map((value) => `<option ${existing.appointmentGoal === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label>Travel buffer<select name="travelBuffer">${[0,15,30,45,60].map((value) => `<option value="${value}" ${String(existing.travelBuffer ?? preferences.travelBuffer) === String(value) ? 'selected' : ''}>${value} minutes</option>`).join('')}</select></label><label>Reminder policy<select name="reminderPolicy">${['24h + 2h SMS','24h email + 1h SMS','48h + 24h + 2h','Manual confirmation'].map((value) => `<option ${String(existing.reminderPolicy || preferences.reminderPolicy) === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label></div>`);
  }

  function openSunroofEditor(id) {
    const database = loadCRM(), lead = (database.leads || []).find((item) => item.id === id); if (!lead) return;
    document.querySelector('#solarRoofEditor')?.remove();
    document.body.insertAdjacentHTML('beforeend', `<div class="crm-overlay" id="solarRoofEditor"><aside class="crm-drawer" style="transform:none"><div class="crm-drawer-head"><div><span class="solar-eyebrow">LOCAL PLANNING INPUTS</span><h2>${esc(lead.name)} · roof screen</h2><p>Update qualification inputs. Verify live roof results externally before presenting them.</p></div><button class="btn" data-solar-close>Close</button></div><form class="crm-product-form" data-sunroof-form><input type="hidden" name="id" value="${esc(lead.id)}"><label>Utility<input name="utility" value="${esc(lead.utility)}" required></label><label>Monthly bill<input name="monthlyBill" type="number" min="0" value="${esc(lead.monthlyBill)}"></label><label>Roof type<select name="roofType">${['Asphalt shingle','Concrete tile','Standing seam','Metal','Composite','Flat membrane'].map((value) => `<option ${lead.roofType === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label>Roof age<input name="roofAge" type="number" min="0" value="${esc(lead.roofAge)}"></label><label>Annual sunshine hours<input name="annualSunHours" type="number" min="0" value="${esc(lead.annualSunHours)}"></label><label>Usable roof area (ft²)<input name="usableRoofSqFt" type="number" min="0" value="${esc(lead.usableRoofSqFt)}"></label><label>Shade loss (%)<input name="shadeLoss" type="number" min="0" max="100" value="${esc(lead.shadeLoss)}"></label><label>Suggested system (kW)<input name="recommendedKw" type="number" min="0" step="0.1" value="${esc(lead.recommendedKw)}"></label><label>Roof screen<select name="sunroofStatus">${['Strong fit','Review','Limited'].map((value) => `<option ${lead.sunroofStatus === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label>Battery interest<select name="storageInterest">${['Interested','Maybe','No','Unknown'].map((value) => `<option ${lead.storageInterest === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label><button class="btn pri" type="submit">Save local screening</button></form></aside></div>`);
  }

  function install() {
    ensureSolarData();
    homeCommandCenter();
    taskOrganizer();
    solarLeadLayer();
    routeEnrichment();
    calendarSettings();
    enrichAppointmentModal();
    solarizeLegacyCopy();
    enhanceKpiTrends();
    applyProposalStepState();
    installLiveRoofMaps();
    installRoofModels();
  }

  let scheduled = false;
  const scheduleInstall = () => { if (scheduled) return; scheduled = true; requestAnimationFrame(() => { scheduled = false; install(); }); };
  function updateSunroofEstimatePreview(form) {
    const database = loadCRM(), lead = (database.leads || []).find((item) => item.id === form.leadId.value);
    if (!lead) return;
    const fields = Object.fromEntries(new FormData(form));
    ['monthlyBill','annualKwh','utilityRate','targetOffset','panelWatts','estimateSystemKw','pricePerWatt','incentivePercent','financeYears','financeApr'].forEach((key) => fields[key] = +fields[key] || 0);
    delete fields.leadId;
    saveProposalDraft(lead.id,fields);
    const estimate = estimateFor({ ...lead, ...fields }), host = form.closest('[data-sunroof-estimator]');
    const set = (name, value) => host?.querySelectorAll(`[data-estimate-output="${name}"]`).forEach((node) => node.textContent = value);
    set('panelCount', estimate.panelCount); set('systemKw', estimate.systemKw); set('annualProduction', `${estimate.annualProduction.toLocaleString()} kWh`); set('offset', `${estimate.offset}%`);
    set('grossPrice', money(estimate.grossPrice)); set('incentive', `−${money(estimate.incentive)}`); set('netPrice', money(estimate.netPrice)); set('netPriceLine', money(estimate.netPrice));
    set('monthlyPayment', `${money(estimate.monthlyPayment)}/mo`); set('annualSavings', money(estimate.annualSavings)); set('payback', estimate.payback ? `${estimate.payback.toFixed(1)} years` : 'Needs usage');
    const mini = host?.querySelector('.solar-panel-mini');
    if (mini) mini.innerHTML = Array.from({ length: Math.min(estimate.panelCount, 42) }, () => '<i></i>').join('');
  }
  function applyProposalStepState(step){
    const workspace=document.querySelector('.page.active .proposal-command[data-proposal-workspace]');if(!workspace)return;
    const leadId=workspace.dataset.leadId,current=proposalSteps.some(([id])=>id===step)?step:currentProposalStep(leadId),index=proposalSteps.findIndex(([id])=>id===current);
    saveProposalStep(leadId,current);workspace.dataset.proposalCurrentStep=current;
    document.querySelectorAll('.page.active [data-proposal-panel]').forEach((panel)=>{panel.hidden=!String(panel.dataset.proposalPanel||'').split(/\s+/).includes(current)});
    document.querySelectorAll('.page.active [data-proposal-part]').forEach((part)=>{part.hidden=!String(part.dataset.proposalPart||'').split(/\s+/).includes(current)});
    workspace.querySelectorAll('[data-proposal-step]').forEach((button)=>{const active=button.dataset.proposalStep===current;button.classList.toggle('active',active);button.setAttribute('aria-current',active?'step':'false')});
    const previous=workspace.querySelector('[data-proposal-prev]'),next=workspace.querySelector('[data-proposal-next]'),summary=workspace.querySelector('[data-proposal-step-summary]');if(previous)previous.disabled=index<=0;if(next){next.disabled=index>=proposalSteps.length-1;next.textContent=index>=proposalSteps.length-2?'Open review →':'Continue →'}if(summary)summary.textContent=proposalSteps[index]?.[1]||'Property';
    requestAnimationFrame(()=>{for(const[canvas,map]of roofMapInstances)if(canvas.isConnected&&!canvas.closest('[hidden]'))try{map.invalidateSize()}catch{}installLiveRoofMaps();installRoofModels()})
  }
  function saveProposalVersion(leadId){
    const database=loadCRM(),lead=(database.leads||[]).find((item)=>item.id===leadId);if(!lead)return;const draft=proposalDraftFor(leadId),working={...lead,...draft},estimate=estimateFor(working),design=roofDesignFor(lead,estimate),stats=roofDesignStats(working,design),createdAt=new Date().toISOString(),version={id:`proposal-${globalThis.crypto?.randomUUID?.()||Date.now()}`,createdAt,status:lead.proposalStatus||'Draft',sourceMode:design.sourceMode,panelCount:stats.panelCount,systemKw:stats.systemKw,annualProduction:stats.annualProduction,offset:stats.offset,grossPrice:estimate.grossPrice,netPrice:estimate.netPrice,monthlyPayment:estimate.monthlyPayment,assumptions:{monthlyBill:+working.monthlyBill||0,annualKwh:estimate.annualUse,utilityRate:estimate.utilityRate,targetOffset:estimate.targetOffset,panelWatts:estimate.panelWatts,pricePerWatt:estimate.pricePerWatt,incentivePercent:estimate.incentivePercent,financeYears:estimate.years,financeApr:estimate.apr},verification:'Local planning version — field and provider verification required'};
    lead.proposalVersions=[...(lead.proposalVersions||[]),version].slice(-20);lead.proposalVersionUpdatedAt=createdAt;lead.updatedAt=createdAt;database.activities=database.activities||[];database.activities.unshift({id:`proposal-version-${version.id}`,entityType:'lead',entityId:lead.id,type:'proposal_version_saved',detail:`${version.panelCount} panels · ${version.systemKw} kW · ${money(version.netPrice)} · ${version.status}`,at:createdAt});saveCRM(database);localStorage.setItem(SUNROOF_SELECTED,lead.id);document.querySelector('[data-crm-route="conversations-sunroof"]')?.click()
  }
  function readableImage(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) return resolve('');
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => resolve(reader.result);
        image.onload = () => {
          const scale = Math.min(1, 1280 / Math.max(image.width, image.height)), canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', .82));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  async function handleSunroofUpload(input) {
    const file = input.files?.[0], leadId = input.dataset.leadId, kind = input.dataset.sunroofUpload;
    if (!file || !leadId || !kind) return;
    const preview = await readableImage(file), patch = kind === 'roof' ? { roofName: file.name, roofImage: preview, roofUploadedAt: new Date().toISOString() } : { billName: file.name, billImage: preview, billType: file.type, billSize: file.size, billUploadedAt: new Date().toISOString() };
    if (!saveSunroofAsset(leadId, patch) && !saveSunroofAsset(leadId, patch, true)) { alert('The file is too large for local browser storage. Try a smaller image or keep the estimate inputs without the attachment.'); return; }
    const database = loadCRM(), lead = (database.leads || []).find((item) => item.id === leadId);
    if (lead) { lead[kind === 'roof' ? 'roofDocument' : 'utilityBillDocument'] = { name: file.name, type: file.type, size: file.size, uploadedAt: new Date().toISOString(), extractionStatus: kind === 'bill' ? 'Needs OCR provider or human review' : 'Visual review required' }; lead.updatedAt = new Date().toISOString(); saveCRM(database); }
    localStorage.setItem(SUNROOF_SELECTED, leadId);
    document.querySelector('[data-crm-route="conversations-sunroof"]')?.click();
  }
  function downloadSunroofEstimate(leadId) {
    const database = loadCRM(), lead = (database.leads || []).find((item) => item.id === leadId); if (!lead) return;
    const estimate = estimateFor(lead), design=roofDesignFor(lead,estimate),stats=roofDesignStats(lead,design),payload = { classification: 'LOCAL PLANNING ESTIMATE — VERIFY BEFORE PRESENTING', generatedAt: new Date().toISOString(), homeowner: lead.name, property: lead.address || lead.company, utility: lead.utility, existingRoof:{material:design.roofMaterial,ageYears:+design.roofAge||0,condition:design.roofCondition,retrofitScope:design.retrofitScope,deckType:design.deckType},designSource:{mode:design.sourceMode,houseModel:design.houseModel?{...design.houseModel,storage:'Local browser IndexedDB; binary file not embedded in this export'}:null,roofLocation:design.roofLocation||null,selectedPlane:design.selectedPlane,orientation:design.orientation,azimuth:+design.azimuth,tilt:+design.tilt,setbackInches:+design.setback,fieldExclusions:design.exclusions,modelPanelPlacements:design.modelPanels||[]},assumptions: { monthlyBill: lead.monthlyBill, annualKwh: estimate.annualUse, utilityRate: estimate.utilityRate, targetOffset: estimate.targetOffset, sunshineHours: lead.annualSunHours, shadeLossPercent: lead.shadeLoss, usableRoofSqFt: lead.usableRoofSqFt, panelWatts: estimate.panelWatts, pricePerWatt: estimate.pricePerWatt, incentivePercent: estimate.incentivePercent, financeYears: estimate.years, financeApr: estimate.apr }, estimate: { panelCount: stats.panelCount, systemKw: stats.systemKw, annualProductionKwh: stats.annualProduction, billOffsetPercent: stats.offset, grossPrice: estimate.grossPrice, planningIncentive: estimate.incentive, netPrice: estimate.netPrice, monthlyPayment: estimate.monthlyPayment, annualSavings: estimate.annualSavings, simplePaybackYears: +estimate.payback.toFixed(1) }, caveat: 'Not an engineered design, roof-condition finding, tax opinion, financing offer, production guarantee, or final proposal. Verify model scale, site dimensions, structure, attachments, code, and equipment compatibility.' };
    const link = document.createElement('a'), objectUrl = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    link.href = objectUrl; link.download = `${String(lead.name || 'solar').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-planning-estimate.json`; link.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
  function selectHomeFlowNode(node) {
    if (!node) return;
    const graph = node.closest('.home-journey-graph'), panel = graph?.querySelector('.home-flow-detail-panel');
    graph?.querySelectorAll('[data-home-flow-node]').forEach((item) => item.classList.toggle('active', item === node));
    if (!panel) return;
    panel.querySelector('[data-flow-stage-number]').textContent = `${node.dataset.number} · SELECTED STAGE`;
    panel.querySelector('h4').textContent = node.dataset.title;
    panel.querySelector('[data-flow-owner]').textContent = node.dataset.owner;
    const health = panel.querySelector('[data-flow-health]');
    health.className = `home-flow-node-health ${node.dataset.health}`;
    health.textContent = node.dataset.health === 'healthy' ? 'On track' : node.dataset.health === 'attention' ? 'Watch' : 'Act now';
    panel.querySelector('[data-flow-detail-records] b').textContent = node.dataset.records;
    panel.querySelector('[data-flow-detail-value] b').textContent = money(node.dataset.value);
    panel.querySelector('[data-flow-detail-attention] b').textContent = node.dataset.attention;
    panel.querySelector('[data-flow-detail-conversion] b').textContent = `${node.dataset.conversion}%`;
    panel.querySelector('[data-flow-detail-copy]').textContent = node.dataset.detail;
    panel.querySelector('[data-flow-inputs]').innerHTML = node.dataset.inputs.split('|').map((item) => `<i>${esc(item)}</i>`).join('');
    panel.querySelector('[data-flow-outputs]').innerHTML = node.dataset.outputs.split('|').map((item) => `<i>${esc(item)}</i>`).join('');
    const action = panel.querySelector('[data-flow-action]');
    action.dataset.crmRoute = node.dataset.route;
    action.textContent = `${node.dataset.action} →`;
  }
  function setHomeFlowMode(button) {
    const graph = button.closest('.home-journey-graph'), mode = button.dataset.homeFlowMode;
    if (!graph || !mode) return;
    graph.dataset.homeFlowModeCurrent = mode;
    graph.querySelectorAll('[data-home-flow-mode]').forEach((item) => item.classList.toggle('active', item === button));
    graph.querySelectorAll('[data-home-flow-node]').forEach((node) => {
      const primary = node.querySelector('[data-home-flow-primary]'), label = node.querySelector('[data-home-flow-primary-label]');
      if (mode === 'value') { primary.textContent = money(node.dataset.value); label.textContent = 'pipeline'; }
      else if (mode === 'attention') { primary.textContent = node.dataset.attention; label.textContent = 'need action'; }
      else { primary.textContent = node.dataset.records; label.textContent = 'records'; }
    });
  }
  function refreshHomeWorkspace() {
    document.querySelector('.page[data-page="home"] .solar-home-command')?.remove();
    document.querySelector('.page[data-page="home"] .home-journey-graph')?.remove();
    document.querySelector('.page[data-page="home"] .kpi-trend')?.remove();
    homeCommandCenter();
  }
  document.addEventListener('click', async (event) => {
    const proposalStep=event.target.closest('[data-proposal-step]');if(proposalStep){applyProposalStepState(proposalStep.dataset.proposalStep);return}
    const proposalWorkspace=event.target.closest('.proposal-command[data-proposal-workspace]');
    if(proposalWorkspace&&event.target.closest('[data-proposal-prev],[data-proposal-next]')){const current=proposalWorkspace.dataset.proposalCurrentStep,index=proposalSteps.findIndex(([id])=>id===current),direction=event.target.closest('[data-proposal-next]')?1:-1,next=proposalSteps[Math.max(0,Math.min(proposalSteps.length-1,index+direction))]?.[0];applyProposalStepState(next);return}
    const saveVersion=event.target.closest('[data-proposal-save-version]');if(saveVersion){saveProposalVersion(saveVersion.dataset.proposalSaveVersion);return}
    const range = event.target.closest('[data-kpi-range]');
    if (range) { kpiRange = +range.dataset.kpiRange || 30; refreshKpiTrends(); }
    const seriesToggle = event.target.closest('[data-kpi-series]');
    if (seriesToggle) { const section = seriesToggle.closest('.kpi-trend'), key = seriesToggle.dataset.kpiSeries, off = seriesToggle.classList.toggle('is-off'); seriesToggle.setAttribute('aria-pressed', String(!off)); section?.querySelector(`[data-kpi-series-line="${key}"]`)?.classList.toggle('is-off', off); }
    const select = event.target.closest('[data-sunroof-lead],[data-solar-select]');
    if (select) { localStorage.setItem(SUNROOF_SELECTED, select.dataset.sunroofLead || select.dataset.solarSelect); document.querySelector('[data-crm-route="conversations-sunroof"]')?.click(); }
    const edit = event.target.closest('[data-sunroof-edit]'); if (edit) openSunroofEditor(edit.dataset.sunroofEdit);
    if (event.target.closest('[data-solar-close]')) event.target.closest('.crm-overlay')?.remove();
    const call = event.target.closest('[data-sunroof-call]'); if (call) { const lead = (loadCRM().leads || []).find((item) => item.id === call.dataset.sunroofCall); if (lead) window.conduitCRM?.addToDialer?.(lead); document.querySelector('[data-crm-route="conversations-dialer"]')?.click(); }
    const downloadEstimate = event.target.closest('[data-sunroof-download]'); if (downloadEstimate) downloadSunroofEstimate(downloadEstimate.dataset.sunroofDownload);
    if(event.target.closest('[data-roof-jump]')){applyProposalStepState('roof-design');document.querySelector('[data-roof-designer]')?.scrollIntoView({behavior:'smooth',block:'start'});return}
    const roofHost=event.target.closest('[data-roof-designer]');
    const roofSource=event.target.closest('[data-roof-source]');if(roofHost&&roofSource){const{lead,design}=roofDesignFromControls(roofHost);design.sourceMode=roofSource.dataset.roofSource;design.toolMode=design.sourceMode==='model'?'orbit':'panels';saveRoofDesignDraft(lead.id,design);replaceRoofDesigner(lead.id);return}
    const roofMode=event.target.closest('[data-roof-mode]');if(roofHost&&roofMode){const{lead,design}=roofDesignFromControls(roofHost);design.toolMode=roofMode.dataset.roofMode;saveRoofDesignDraft(lead.id,design);replaceRoofDesigner(lead.id);return}
    const roofPlane=event.target.closest('[data-roof-plane]');if(roofHost&&roofPlane){const{lead,design}=roofDesignFromControls(roofHost);design.selectedPlane=roofPlane.dataset.roofPlane;design.azimuth=roofPlanes.find((item)=>item.id===design.selectedPlane)?.azimuth||design.azimuth;saveRoofDesignDraft(lead.id,design);replaceRoofDesigner(lead.id)}
    const roofCell=event.target.closest('[data-roof-cell]');if(roofHost&&roofCell&&!roofCell.disabled){const{lead,design}=roofDesignFromControls(roofHost),index=+roofCell.dataset.roofCell;if(design.toolMode==='exclusions'){const exclusions=new Set(design.exclusions?.[design.selectedPlane]||[]),panels=new Set(design.planes[design.selectedPlane]||[]);exclusions.has(index)?exclusions.delete(index):(exclusions.add(index),panels.delete(index));design.exclusions={...design.exclusions,[design.selectedPlane]:[...exclusions].sort((a,b)=>a-b)};design.planes[design.selectedPlane]=[...panels].sort((a,b)=>a-b)}else if(design.toolMode==='panels'&&!customRoofExclusions(design,design.selectedPlane).has(index)){const cells=new Set(design.planes[design.selectedPlane]||[]);cells.has(index)?cells.delete(index):cells.add(index);design.planes[design.selectedPlane]=[...cells].sort((a,b)=>a-b)}saveRoofDesignDraft(lead.id,design);replaceRoofDesigner(lead.id)}
    if(roofHost&&event.target.closest('[data-roof-auto]')){const{lead,design}=roofDesignFromControls(roofHost),other=Object.entries(design.planes).filter(([id])=>id!==design.selectedPlane).reduce((sum,[,cells])=>sum+cells.length,0),needed=Math.max(0,(+design.targetPanels||0)-other);design.planes[design.selectedPlane]=availableRoofCells(design.selectedPlane,design).slice(0,needed);saveRoofDesignDraft(lead.id,design);replaceRoofDesigner(lead.id)}
    if(roofHost&&event.target.closest('[data-roof-clear]')){const{lead,design}=roofDesignFromControls(roofHost);if(design.sourceMode==='model')design.modelPanels=(design.modelPanels||[]).filter((panel)=>panel.planeId!==design.selectedPlane);else design.planes[design.selectedPlane]=[];saveRoofDesignDraft(lead.id,design);replaceRoofDesigner(lead.id)}
    const modelPanel=event.target.closest('[data-roof-model-panel]');if(roofHost&&modelPanel){event.stopPropagation();const{lead,design}=roofDesignFromControls(roofHost);design.modelPanels=(design.modelPanels||[]).filter((panel)=>panel.id!==modelPanel.dataset.roofModelPanel);saveRoofDesignDraft(lead.id,design);replaceRoofDesigner(lead.id);return}
    const modelViewer=event.target.closest('[data-roof-model-viewer]');if(roofHost&&modelViewer&&!modelPanel){const{lead,design}=roofDesignFromControls(roofHost);if(design.sourceMode==='model'&&design.toolMode==='panels'&&typeof modelViewer.positionAndNormalFromPoint==='function'){const hit=await Promise.resolve(modelViewer.positionAndNormalFromPoint(event.clientX,event.clientY));if(hit?.position&&hit?.normal){design.modelPanels=[...(design.modelPanels||[]),{id:`model-panel-${globalThis.crypto?.randomUUID?.()||Date.now()}`,planeId:design.selectedPlane,position:String(hit.position),normal:String(hit.normal)}];saveRoofDesignDraft(lead.id,design);replaceRoofDesigner(lead.id)}}}
    if(roofHost&&event.target.closest('[data-roof-model-remove]')){if(!confirm('Remove this property’s locally stored 3D house model and its 3D panel placements?'))return;const{lead,design}=roofDesignFromControls(roofHost);await deleteRoofModel(lead.id);delete design.houseModel;design.modelPanels=[];design.sourceMode='satellite';design.toolMode='panels';saveRoofDesignDraft(lead.id,design);replaceRoofDesigner(lead.id);return}
    if(roofHost&&event.target.closest('[data-roof-save]')){const{lead,design}=roofDesignFromControls(roofHost),stats=roofDesignStats(lead,design),database=loadCRM(),record=(database.leads||[]).find((item)=>item.id===lead.id),now=new Date().toISOString();if(record){Object.assign(record,{roofType:design.roofMaterial,roofAge:+design.roofAge||0,roofCondition:design.roofCondition,retrofitScope:design.retrofitScope,deckType:design.deckType,panelWatts:+design.panelWatts,estimateSystemKw:stats.systemKw,recommendedKw:stats.systemKw,roofDesign:{...design,panelCount:stats.panelCount,systemKw:stats.systemKw,annualProduction:stats.annualProduction,classification:design.sourceMode==='model'?'USER-SUPPLIED 3D HOUSE MODEL · LOCAL PLANNING DESIGN — VERIFY SCALE AND SITE CONDITIONS':'ADDRESS-LEVEL PROPERTY VIEW · LOCAL PLANNING DESIGN — VERIFY ON SITE'},roofDesignUpdatedAt:now,updatedAt:now});database.activities=database.activities||[];database.activities.unshift({id:`roof-design-${globalThis.crypto?.randomUUID?.()||Date.now()}`,entityType:'lead',entityId:record.id,type:'roof_design_saved',detail:`${stats.panelCount} panels · ${stats.systemKw} kW · ${design.sourceMode} · ${design.retrofitScope}`,at:now});saveCRM(database);saveRoofDesignDraft(record.id,design);localStorage.setItem(SUNROOF_SELECTED,record.id);document.querySelector('[data-crm-route="conversations-sunroof"]')?.click()}}
    if (event.target.closest('[data-cal-add]')) { const input = document.querySelector('[data-cal-custom]'), value = input?.value.trim(); if (value) { const prefs = calendarPrefs(); prefs.customTypes = [...new Set([...(prefs.customTypes || []), value])]; localStorage.setItem(CALENDAR_PREFS, JSON.stringify(prefs)); const option = new Option(value, value); document.querySelector('[data-cal-pref="type"]')?.add(option); input.value = ''; document.querySelector('.solar-save-state').textContent = `${value} added.`; } }
    if (event.target.closest('[data-cal-save]')) { const prefs = calendarPrefs(); document.querySelectorAll('[data-cal-pref]').forEach((input) => { prefs[input.dataset.calPref] = input.type === 'checkbox' ? input.checked : input.value; }); localStorage.setItem(CALENDAR_PREFS, JSON.stringify(prefs)); applyCalendarSettings(); const state = document.querySelector('.solar-save-state'); if (state) state.textContent = 'Calendar settings saved locally.'; }
    const flowMode = event.target.closest('[data-home-flow-mode]'); if (flowMode) setHomeFlowMode(flowMode);
    const flowNode = event.target.closest('[data-home-flow-node]'); if (flowNode) selectHomeFlowNode(flowNode);
    const calendarNav = event.target.closest('[data-home-calendar-nav]');
    if (calendarNav) {
      const direction = calendarNav.dataset.homeCalendarNav;
      if (direction === 'today') homeCalendarCursor = new Date();
      else homeCalendarCursor = new Date(homeCalendarCursor.getFullYear(), homeCalendarCursor.getMonth(), homeCalendarCursor.getDate() + (direction === 'next' ? 7 : -7));
      renderHomeCalendar();
    }
    const newDay = event.target.closest('[data-home-calendar-day]'); if (newDay) openHomeAppointmentEditor('', newDay.dataset.homeCalendarDay);
    if (event.target.closest('[data-home-calendar-book]')) openHomeAppointmentEditor();
    const homeAppointment = event.target.closest('[data-home-appointment]'); if (homeAppointment) openHomeAppointmentEditor(homeAppointment.dataset.homeAppointment);
    if (event.target.closest('[data-home-appointment-close]')) event.target.closest('.crm-overlay')?.remove();
    if (event.target.closest('[data-home-appointment-delete]')) {
      const overlay = event.target.closest('.crm-overlay'), id = overlay?.querySelector('[name="id"]')?.value, database = loadCRM();
      database.appointments = (database.appointments || []).filter((item) => item.id !== id);
      saveCRM(database); overlay?.remove(); refreshHomeWorkspace();
    }
  });
  document.addEventListener('pointerover', (event) => { const node = event.target.closest('[data-home-flow-node]'); if (node) selectHomeFlowNode(node); });
  document.addEventListener('focusin', (event) => { const node = event.target.closest('[data-home-flow-node]'); if (node) selectHomeFlowNode(node); });
  document.addEventListener('keydown', (event) => { if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-home-flow-node]')) { event.preventDefault(); selectHomeFlowNode(event.target); } });
  document.addEventListener('change', (event) => {
    if(event.target.matches('[data-proposal-status]')){const database=loadCRM(),lead=(database.leads||[]).find((item)=>item.id===event.target.dataset.leadId);if(lead){lead.proposalStatus=event.target.value;lead.updatedAt=new Date().toISOString();saveCRM(database)}return}
    if (event.target.matches('[data-sunroof-select]')) { localStorage.setItem(SUNROOF_SELECTED, event.target.value); document.querySelector('[data-crm-route="conversations-sunroof"]')?.click(); }
    if (event.target.matches('[data-sunroof-upload]')) handleSunroofUpload(event.target);
    if (event.target.matches('[data-roof-model-upload]')) handleRoofModelUpload(event.target);
    if (event.target.matches('[data-cal-pref="owner"],[data-cal-pref="type"],[data-cal-pref="weekends"]')) { const prefs = calendarPrefs(); prefs[event.target.dataset.calPref] = event.target.type === 'checkbox' ? event.target.checked : event.target.value; localStorage.setItem(CALENDAR_PREFS, JSON.stringify(prefs)); applyCalendarSettings(); }
    if (event.target.matches('[data-home-calendar-owner]')) { homeCalendarOwner = event.target.value; renderHomeCalendar(); }
    if (event.target.matches('[data-home-calendar-status]')) { homeCalendarStatus = event.target.value; renderHomeCalendar(); }
    if(event.target.matches('[data-roof-control]')){const host=event.target.closest('[data-roof-designer]'),{lead,design}=roofDesignFromControls(host);saveRoofDesignDraft(lead.id,design);replaceRoofDesigner(lead.id)}
  });
  document.addEventListener('input', (event) => { if (event.target.matches('[data-estimate-input]')) updateSunroofEstimatePreview(event.target.form); });
  document.addEventListener('submit', async (event) => {
    if(!event.target.matches('[data-roof-address-search]'))return;event.preventDefault();event.stopImmediatePropagation();const button=event.target.querySelector('button[type="submit"]'),original=button?.textContent;if(button){button.disabled=true;button.textContent='Finding roof…'}try{await searchRoofAddress(event.target)}catch(error){alert(error?.message||'No U.S. address matched. Add a complete street, city, state, and ZIP code.');if(button){button.disabled=false;button.textContent=original}}
  },true);
  document.addEventListener('submit', (event) => {
    if (event.target.matches('[data-home-appointment-form]')) {
      event.preventDefault();
      const fields = Object.fromEntries(new FormData(event.target)), database = loadCRM(), current = (database.appointments || []).find((item) => item.id === fields.id);
      ['duration', 'travelBuffer', 'monthlyBill'].forEach((key) => fields[key] = +fields[key] || 0);
      fields.startsAt = new Date(fields.startsAt).toISOString();
      fields.id = current?.id || `home-appointment-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
      const appointment = { ...(current || {}), ...fields, createdAt: current?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
      if (current) Object.assign(current, appointment); else (database.appointments ||= []).push(appointment);
      const lead = (database.leads || []).find((item) => item.id === fields.leadId);
      if (lead && !/completed|cancelled|no-show/i.test(fields.status)) {
        lead.status = 'Appointment Set'; lead.updatedAt = appointment.updatedAt;
        const opportunity = window.conduitCRM?.ensureOpportunity?.(database, lead);
        if (opportunity && !/proposal|contract|site survey|design|permitting|installation|installed|pto|closed/i.test(opportunity.stage || '')) opportunity.stage = 'Appointment Set';
      }
      saveCRM(database); event.target.closest('.crm-overlay')?.remove(); refreshHomeWorkspace();
      return;
    }
    if (event.target.matches('[data-sunroof-estimate-form]')) {
      event.preventDefault(); const fields = Object.fromEntries(new FormData(event.target)), database = loadCRM(), lead = (database.leads || []).find((item) => item.id === fields.leadId); if (!lead) return;
      delete fields.leadId; ['monthlyBill','annualKwh','utilityRate','targetOffset','panelWatts','estimateSystemKw','pricePerWatt','incentivePercent','financeYears','financeApr'].forEach((key) => fields[key] = +fields[key] || 0);
      Object.assign(lead, fields, { estimateUpdatedAt: new Date().toISOString(), estimateStatus: 'Local planning estimate', updatedAt: new Date().toISOString() }); clearProposalDraft(lead.id); saveCRM(database); localStorage.setItem(SUNROOF_SELECTED, lead.id); document.querySelector('[data-crm-route="conversations-sunroof"]')?.click();
      return;
    }
    if (event.target.matches('[data-sunroof-form]')) {
      event.preventDefault(); const fields = Object.fromEntries(new FormData(event.target)); const database = loadCRM(); const lead = (database.leads || []).find((item) => item.id === fields.id); if (!lead) return;
      ['monthlyBill','roofAge','annualSunHours','usableRoofSqFt','shadeLoss','recommendedKw'].forEach((key) => fields[key] = +fields[key]); Object.assign(lead, fields, { updatedAt: new Date().toISOString() }); saveCRM(database); localStorage.setItem(SUNROOF_SELECTED, lead.id); event.target.closest('.crm-overlay')?.remove(); document.querySelector('[data-crm-route="conversations-sunroof"]')?.click();
    }
  });
  window.addEventListener('conduit:crm-updated', scheduleInstall);
  window.conduitSolarExpansion = { sunroofWorkspace, ensureSolarData, roofPreviewMarkup, installLiveRoofMaps, installRoofModels };
  const observeWorkspace=()=>new MutationObserver(()=>{removeDisconnectedRoofMaps();removeDisconnectedRoofModels();scheduleInstall()}).observe(document.body,{childList:true,subtree:true});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { install(); observeWorkspace(); });
  else { install(); observeWorkspace(); }
})();
