(() => {
  'use strict';

  const PROFILE_KEY = 'conduit.compliance.v1';
  const DIALER_KEY = 'conduitDialerV1';
  const DEFAULT_PROFILE = {
    approvedStates: [],
    legalReviewConfirmed: false,
    allowScrubbedCold: false,
    dncMaxAgeDays: 31,
    callStart: '09:00',
    callEnd: '20:00',
    attemptLimit: 6,
    minimumRetryMinutes: 240,
    singleLineOnly: true,
    recordingEnabled: false,
  };
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const readJson = (key, fallback) => { try { return {...fallback, ...JSON.parse(localStorage.getItem(key) || '{}')}; } catch { return {...fallback}; } };
  const profile = () => readJson(PROFILE_KEY, DEFAULT_PROFILE);
  const dialer = () => { try { return JSON.parse(localStorage.getItem(DIALER_KEY) || '{}'); } catch { return {}; } };
  const saveDialer = (value) => { localStorage.setItem(DIALER_KEY, JSON.stringify(value)); window.dispatchEvent(new CustomEvent('conduit:dialer-updated')); };
  const nowLocalInput = () => { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16); };
  const activeLead = (state = dialer()) => (state.leads || []).find((lead) => lead.id === state.activeId) || null;

  let serverPolicy = null;
  let serverAudit = [];
  let serverDnc = null;
  let transcriptionData = null;

  function localClock(timezone) {
    try { return new Intl.DateTimeFormat('en-GB', {timeZone: timezone, hour:'2-digit', minute:'2-digit', hour12:false}).format(new Date()); }
    catch { return null; }
  }

  function ageDays(value) {
    const time = new Date(value || '').getTime();
    return Number.isFinite(time) ? (Date.now() - time) / 86400000 : Infinity;
  }

  function evaluate(lead, workspaceSettings = {}, options = {}) {
    if (!lead) return {ok:false, reason:'No lead selected', reasons:['No lead selected'], basisValidated:false};
    const live = options.live === true;
    const cfg = profile();
    const c = lead.compliance || {};
    const reasons = [];
    const warnings = [];
    const stateCode = String(c.stateCode || lead.stateCode || '').trim().toUpperCase();
    const timezone = c.timezone || lead.timezone || '';
    const clock = localClock(timezone);
    const start = cfg.callStart || workspaceSettings.callStart || '09:00';
    const end = cfg.callEnd || workspaceSettings.callEnd || '20:00';
    if (!/^[A-Z]{2}$/.test(stateCode)) reasons.push('Homeowner state required');
    else if (!cfg.approvedStates.includes(stateCode)) reasons.push(`${stateCode} not locally approved`);
    if (!cfg.legalReviewConfirmed) reasons.push('Pilot legal review not confirmed');
    if (!clock) reasons.push('Valid homeowner time zone required');
    else if (clock < start || clock >= end) reasons.push(`Outside ${start}–${end} local window`);
    if (lead.dnc || c.internalDncPermanent) reasons.push('Internal DNC suppression active');
    if (c.nationalDnc !== 'clear') reasons.push('National DNC not clear');
    if (c.stateDnc !== 'clear') reasons.push('State DNC not clear');
    if (!c.dncCheckedAt) reasons.push('DNC check date required');
    else if (ageDays(c.dncCheckedAt) > Number(cfg.dncMaxAgeDays || 31)) reasons.push(`DNC check older than ${cfg.dncMaxAgeDays || 31} days`);
    if (!String(c.sourceName || lead.source || '').trim()) reasons.push('Lead source/vendor required');
    if (!String(c.sourceUrl || '').trim()) reasons.push('Origin URL or manual-source reference required');
    if (!c.acquiredAt) reasons.push('Acquisition timestamp required');
    let basisValidated = false;
    if (c.consentBasis === 'direct-written' || c.consentBasis === 'established-business-relationship') {
      basisValidated = Boolean(c.consentCapturedAt && String(c.consentEvidence || '').trim());
      if (!basisValidated) reasons.push('Consent/relationship evidence incomplete');
    } else if (c.consentBasis === 'scrubbed-cold') {
      basisValidated = cfg.allowScrubbedCold && cfg.legalReviewConfirmed && cfg.approvedStates.includes(stateCode);
      if (!cfg.allowScrubbedCold) reasons.push('Scrubbed cold calling disabled');
      warnings.push('Scrubbed data is not consumer consent');
    } else reasons.push('Documented call basis required');
    if (c.dialingMode === 'predictive') reasons.push('Predictive dialing disabled');
    if (c.liveAgent === false) reasons.push('Live agent required');
    if ((lead.attempts || 0) >= Number(cfg.attemptLimit || 6)) reasons.push(`Attempt limit ${cfg.attemptLimit || 6} reached`);
    if (lead.lastContactAt && (Date.now() - new Date(lead.lastContactAt).getTime()) / 60000 < Number(cfg.minimumRetryMinutes || 240)) reasons.push(`Retry cooldown ${cfg.minimumRetryMinutes || 240} minutes`);
    if (live && (!serverPolicy?.liveReady || !serverPolicy?.policy?.approvedStates?.includes(stateCode))) reasons.push('State not approved by server policy');
    return {ok: reasons.length === 0, reason: reasons[0] || 'Compliance ready', reasons, warnings, basisValidated, stateCode, timezone, localTime:clock};
  }

  function snapshot(lead) {
    const c = lead?.compliance || {};
    return {
      stateCode: c.stateCode || lead?.stateCode || '',
      timezone: c.timezone || lead?.timezone || '',
      sourceName: c.sourceName || lead?.source || '',
      sourceUrl: c.sourceUrl || '',
      acquiredAt: c.acquiredAt || lead?.createdAt || '',
      consentBasis: c.consentBasis || 'unknown',
      consentCapturedAt: c.consentCapturedAt || '',
      consentEvidence: c.consentEvidence || '',
      internalDnc: Boolean(lead?.dnc || c.internalDncPermanent),
      nationalDnc: c.nationalDnc || 'unknown',
      stateDnc: c.stateDnc || 'unknown',
      dncCheckedAt: c.dncCheckedAt || '',
      dialingMode: 'one-to-one-power',
      liveAgent: true,
      attempts: Number(lead?.attempts || 0),
      lastAttemptAt: lead?.lastContactAt || '',
      recordingConsent: c.recordingConsent === true,
    };
  }

  const shouldRecord = (lead) => profile().recordingEnabled === true && lead?.compliance?.recordingConsent === true;
  window.conduitCompliance = { evaluate, snapshot, profile, shouldRecord };

  function injectLeadCapture() {
    const form = $('dialerLeadForm');
    if (!form || form.querySelector('.conduit-compliance-capture')) return;
    const block = document.createElement('fieldset');
    block.className = 'conduit-compliance-capture';
    block.innerHTML = `<legend>Compliance intake</legend><div class="conduit-compliance-form-grid">
      <label>Homeowner state<input id="dialerLeadState" maxlength="2" placeholder="AZ" required></label>
      <label>Homeowner time zone<input id="dialerLeadTimezone" placeholder="America/Phoenix" required></label>
      <label>Lead vendor/source<input id="dialerLeadSourceName" placeholder="Vendor or manual referral" required></label>
      <label>Acquired at<input id="dialerLeadAcquiredAt" type="datetime-local" required></label>
      <label class="wide">Origin URL/reference<input id="dialerLeadSourceUrl" placeholder="https://… or manual-referral/record-id" required></label>
      <label>Call basis<select id="dialerLeadBasis"><option value="direct-written">Direct written permission</option><option value="established-business-relationship">Established business relationship</option><option value="scrubbed-cold">Scrubbed cold · human only</option><option value="unknown">Unknown · blocked</option></select></label>
      <label>Basis timestamp<input id="dialerLeadConsentAt" type="datetime-local"></label>
      <label class="wide">Evidence/certificate<input id="dialerLeadEvidence" placeholder="Consent certificate, exact language, inquiry, or relationship record"></label>
      <label>National DNC<select id="dialerLeadNationalDnc"><option value="unknown">Not checked</option><option value="clear">Clear</option><option value="listed">Listed · block</option></select></label>
      <label>State DNC<select id="dialerLeadStateDnc"><option value="unknown">Not checked</option><option value="clear">Clear</option><option value="listed">Listed · block</option></select></label>
      <label>DNC checked at<input id="dialerLeadDncCheckedAt" type="datetime-local"></label>
    </div><p>Entering “clear” records an external scrub result; Conduit does not query government registries without your authorized DNC source.</p>`;
    form.querySelector('button[type="submit"]')?.before(block);
    $('dialerLeadAcquiredAt').value = nowLocalInput();
  }

  function injectActiveCompliance() {
    const callNotice = $('dialerCallNotice');
    if (!callNotice || $('conduitActiveCompliance')) return;
    const panel = document.createElement('section');
    panel.id = 'conduitActiveCompliance';
    panel.className = 'conduit-active-compliance';
    panel.innerHTML = `<header><div><span>LIVE CALL GATE</span><h3>Compliance record</h3></div><strong id="conduitComplianceDecision">BLOCKED</strong></header>
      <div id="conduitComplianceReasons" class="conduit-compliance-reasons"></div>
      <details class="conduit-compliance-details"><summary>Review provenance, permission, and DNC evidence</summary><div class="conduit-compliance-form-grid compact">
        <label>State<input id="conduitLeadState" maxlength="2" placeholder="AZ"></label>
        <label>Time zone<input id="conduitLeadTimezone" placeholder="America/Phoenix"></label>
        <label>Vendor/source<input id="conduitLeadSourceName"></label>
        <label>Acquired at<input id="conduitLeadAcquiredAt" type="datetime-local"></label>
        <label class="wide">Origin URL/reference<input id="conduitLeadSourceUrl"></label>
        <label>Call basis<select id="conduitLeadBasis"><option value="unknown">Unknown</option><option value="direct-written">Direct written permission</option><option value="established-business-relationship">Established relationship</option><option value="scrubbed-cold">Scrubbed cold · human only</option></select></label>
        <label>Basis timestamp<input id="conduitLeadConsentAt" type="datetime-local"></label>
        <label class="wide">Evidence/certificate<input id="conduitLeadEvidence"></label>
        <label>National DNC<select id="conduitLeadNationalDnc"><option value="unknown">Not checked</option><option value="clear">Clear</option><option value="listed">Listed</option></select></label>
        <label>State DNC<select id="conduitLeadStateDnc"><option value="unknown">Not checked</option><option value="clear">Clear</option><option value="listed">Listed</option></select></label>
        <label>DNC checked at<input id="conduitLeadDncCheckedAt" type="datetime-local"></label>
        <label class="conduit-check wide"><input id="conduitLeadRecordingConsent" type="checkbox"> Recording consent documented for this lead</label>
      </div><div class="conduit-compliance-actions"><button type="button" id="conduitSaveCompliance">Save compliance review</button><button type="button" id="conduitSuppressPermanent">Permanent do not call</button></div></details>`;
    callNotice.after(panel);
  }

  function injectOperations() {
    const timeline = $('dialerTimeline');
    if (!timeline || $('conduitComplianceOperations')) return;
    const panel = document.createElement('section');
    panel.id = 'conduitComplianceOperations';
    panel.className = 'conduit-compliance-operations';
    panel.innerHTML = `<article><header><div><span>SOLO OPERATING POLICY</span><h3>Pilot compliance</h3></div><strong id="conduitServerPolicyBadge">SERVER CHECK</strong></header>
      <div class="conduit-policy-grid"><label>Locally approved states<input id="conduitApprovedStates" placeholder="AZ, CA"></label><label>DNC maximum age<input id="conduitDncAge" type="number" min="1" max="31"></label><label>Retry cooldown · minutes<input id="conduitRetryMinutes" type="number" min="60"></label><label>Attempt limit<input id="conduitAttemptLimit" type="number" min="1" max="12"></label></div>
      <label class="conduit-check"><input id="conduitLegalReview" type="checkbox"> State-specific calling review completed</label>
      <label class="conduit-check"><input id="conduitAllowCold" type="checkbox"> Permit scrubbed cold records in locally approved states</label>
      <label class="conduit-check"><input id="conduitEnableRecording" type="checkbox"> Enable carrier recording only when the active lead has documented consent</label>
      <button type="button" id="conduitSavePolicy">Save local pilot policy</button><p id="conduitServerPolicyText"></p></article>
      <article><header><div><span>DATA + CASH CAPACITY</span><h3>Six-hour solo planner</h3></div></header><div class="conduit-policy-grid"><label>Hours/day<input id="conduitPlanHours" type="number" value="6" min="1" max="12"></label><label>Attempts/hour<input id="conduitPlanRate" type="number" value="80" min="10" max="150"></label><label>Working days<input id="conduitPlanDays" type="number" value="22" min="1" max="31"></label><label>Touches/lead<input id="conduitPlanTouches" type="number" value="5" min="1" max="12"></label><label>Lead-list size<input id="conduitPlanListSize" type="number" value="1000" min="1" step="100"></label><label>Lead price<input id="conduitPlanPrice" type="number" value="1" min="0" step="0.01"></label><label>Billable leg-min/day<input id="conduitPlanMinutes" type="number" value="180" min="0" max="720"></label><label>Carrier $/minute<input id="conduitPlanCarrierRate" type="number" value="0.014" min="0" step="0.001"></label><label>Phone number/month<input id="conduitPlanNumberCost" type="number" value="1.15" min="0" step="0.01"></label></div><div id="conduitPlannerOutput" class="conduit-planner-output"></div><p>The bridge can create two billable call legs while connected. Conduit software, call logs, DNC matching, and local transcription have $0 usage fees; carrier and lead data remain external.</p></article>
      <article><header><div><span>OWNED SUPPRESSION REGISTRY</span><h3>Persistent DNC scrub</h3></div><strong id="conduitDncRegistryBadge">LOCAL</strong></header><p>Import an authorized suppression file into Conduit. Files are parsed in this browser; the server stores keyed phone hashes, never the clear file or clear phone numbers.</p><div class="conduit-policy-grid"><label>Source label<input id="conduitDncSource" placeholder="National DNC · Aug 2026"></label><label>Scope<select id="conduitDncScope"><option value="national">National</option><option value="state">State</option><option value="vendor">Vendor suppression</option></select></label></div><label class="conduit-check"><input id="conduitDncAuthorized" type="checkbox"> I confirm this is an authorized suppression source</label><input id="conduitDncFile" type="file" accept=".csv,.txt,text/csv,text/plain"><p id="conduitDncFileResult"></p></article>
      <article><header><div><span>OWNED CALL INTELLIGENCE</span><h3>Local recording & transcription</h3></div><strong id="conduitWhisperBadge">CHECKING</strong></header><p>Store consented audio privately and transcribe it on this Mac with local Whisper. No transcription API or call-intelligence subscription is used.</p><label class="conduit-check"><input id="conduitRecordingConsent" type="checkbox"> Recording consent is documented for this audio</label><input id="conduitAudioFile" type="file" accept="audio/mpeg,audio/wav,audio/mp4,audio/webm,audio/ogg"><button type="button" id="conduitTranscribeAudio">Store & transcribe locally</button><p id="conduitTranscriptionResult"></p><div id="conduitCallRecordSummary" class="conduit-server-audit"></div></article>
      <article><header><div><span>SERVER AUDIT</span><h3>Verified provider events</h3></div></header><div id="conduitServerAudit" class="conduit-server-audit"></div></article>`;
    timeline.after(panel);
  }

  function injectSettings() {
    const settingsBody = document.querySelector('.page[data-page="settings"] .body');
    if (!settingsBody || $('conduitComplianceSettings')) return;
    const card = document.createElement('section');
    card.id = 'conduitComplianceSettings';
    card.className = 'glass settings-card conduit-settings-compliance';
    card.dataset.settingCategory = 'dialer security integrations developer';
    card.innerHTML = `<div class="mono am">CONDUIT-OWNED CALLING STACK</div><h3>Low-subscription solo power dialer</h3><p>Conduit owns the one-to-one queue, compliance gate, hashed DNC registry, local bulk scrub, append-only call logs, private recording metadata, and local Whisper transcription. Recording stays disabled until documented consent is attached.</p><div class="conduit-settings-status"><span>Predictive dialing</span><b>DISABLED</b><span>Recording policy</span><b id="conduitSettingsRecording">OFF</b><span>Persistent DNC</span><b>BUILT IN</b><span>Local transcription</span><b id="conduitSettingsWhisper">CHECKING</b><span>Server gate</span><b>ENFORCED</b><span>Live states</span><b id="conduitSettingsLiveStates">NONE</b></div><p id="conduitSettingsComplianceMessage">Checking server compliance configuration…</p></section>`;
    settingsBody.prepend(card);
  }

  function toInputDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
  }

  function renderActive() {
    const state = dialer();
    const lead = activeLead(state);
    const c = lead?.compliance || {};
    const fields = {
      conduitLeadState:c.stateCode || lead?.stateCode || '', conduitLeadTimezone:c.timezone || lead?.timezone || '', conduitLeadSourceName:c.sourceName || lead?.source || '',
      conduitLeadAcquiredAt:toInputDate(c.acquiredAt || lead?.createdAt), conduitLeadSourceUrl:c.sourceUrl || '', conduitLeadBasis:c.consentBasis || 'unknown',
      conduitLeadConsentAt:toInputDate(c.consentCapturedAt), conduitLeadEvidence:c.consentEvidence || '', conduitLeadNationalDnc:c.nationalDnc || 'unknown',
      conduitLeadStateDnc:c.stateDnc || 'unknown', conduitLeadDncCheckedAt:toInputDate(c.dncCheckedAt),
    };
    Object.entries(fields).forEach(([id,value]) => { const node=$(id); if (node && document.activeElement !== node) node.value=value; });
    if ($('conduitLeadRecordingConsent') && document.activeElement !== $('conduitLeadRecordingConsent')) $('conduitLeadRecordingConsent').checked = c.recordingConsent === true;
    const settings = typeof window.readConduitSettings === 'function' ? window.readConduitSettings() : {};
    const decision = evaluate(lead, settings, {live:state.mode === 'provider'});
    const badge = $('conduitComplianceDecision');
    if (badge) { badge.textContent = decision.ok ? 'READY' : 'BLOCKED'; badge.classList.toggle('ready', decision.ok); }
    const reasons = $('conduitComplianceReasons');
    if (reasons) reasons.innerHTML = decision.ok ? `<b>Ready:</b> one-to-one human call may proceed under the saved local policy.${decision.warnings.length?` <span>${esc(decision.warnings.join(' '))}</span>`:''}` : `<b>${decision.reasons.length} gate${decision.reasons.length===1?'':'s'}:</b> ${decision.reasons.map(esc).join(' · ')}`;
    const trust = document.querySelectorAll('.dialer-trust-row span');
    if (trust[0]) {
      const basis = c.consentBasis === 'direct-written' ? 'Direct consent' : c.consentBasis === 'established-business-relationship' ? 'Relationship recorded' : c.consentBasis === 'scrubbed-cold' ? 'Scrubbed cold data' : 'Call basis review';
      trust[0].textContent = basis; trust[0].className = decision.basisValidated ? 'good' : 'warn';
    }
    if (trust[1]) {
      trust[1].textContent = lead?.dnc || c.internalDncPermanent ? 'DNC suppressed' : decision.ok ? 'Compliance ready' : 'Compliance blocked';
      trust[1].className = decision.ok ? 'good' : 'bad';
    }
    if (trust[3]) {
      const ready = (state.leads || []).filter(item => evaluate(item, settings, {live:state.mode === 'provider'}).ok).length;
      const callbacks = (state.leads || []).filter(item => item.callbackAt && new Date(item.callbackAt) > new Date()).length;
      trust[3].textContent = `${ready} ready · ${callbacks} callbacks`; trust[3].className = 'info';
    }
  }

  function saveActiveCompliance() {
    const state = dialer(); const lead = activeLead(state); if (!lead) return;
    const iso = (id) => $(id).value ? new Date($(id).value).toISOString() : '';
    lead.compliance = {
      ...(lead.compliance || {}), stateCode:$('conduitLeadState').value.trim().toUpperCase(), timezone:$('conduitLeadTimezone').value.trim(), sourceName:$('conduitLeadSourceName').value.trim(),
      acquiredAt:iso('conduitLeadAcquiredAt'), sourceUrl:$('conduitLeadSourceUrl').value.trim(), consentBasis:$('conduitLeadBasis').value,
      consentCapturedAt:iso('conduitLeadConsentAt'), consentEvidence:$('conduitLeadEvidence').value.trim(), nationalDnc:$('conduitLeadNationalDnc').value,
      stateDnc:$('conduitLeadStateDnc').value, dncCheckedAt:iso('conduitLeadDncCheckedAt'), dialingMode:'one-to-one-power', liveAgent:true,
      recordingConsent:$('conduitLeadRecordingConsent').checked,
    };
    lead.timezone = lead.compliance.timezone;
    if (lead.compliance.consentBasis === 'direct-written' || lead.compliance.consentBasis === 'established-business-relationship') lead.consent = 'verified';
    if (lead.compliance.nationalDnc === 'listed' || lead.compliance.stateDnc === 'listed') { lead.dnc = true; lead.compliance.internalDncPermanent = true; }
    state.events = state.events || [];
    state.events.unshift({id:crypto.randomUUID?.() || String(Date.now()), type:'compliance', detail:'Compliance record reviewed and saved; no external registry queried', leadId:lead.id, at:new Date().toISOString()});
    saveDialer(state);
  }

  function renderPolicy() {
    const cfg = profile();
    if ($('conduitApprovedStates')) $('conduitApprovedStates').value = cfg.approvedStates.join(', ');
    if ($('conduitDncAge')) $('conduitDncAge').value = cfg.dncMaxAgeDays;
    if ($('conduitRetryMinutes')) $('conduitRetryMinutes').value = cfg.minimumRetryMinutes;
    if ($('conduitAttemptLimit')) $('conduitAttemptLimit').value = cfg.attemptLimit;
    if ($('conduitLegalReview')) $('conduitLegalReview').checked = cfg.legalReviewConfirmed;
    if ($('conduitAllowCold')) $('conduitAllowCold').checked = cfg.allowScrubbedCold;
    if ($('conduitEnableRecording')) $('conduitEnableRecording').checked = cfg.recordingEnabled;
    if ($('conduitSettingsRecording')) $('conduitSettingsRecording').textContent = cfg.recordingEnabled ? 'CONSENT-GATED' : 'OFF';
    const badge=$('conduitServerPolicyBadge'); if (badge) { badge.textContent=serverPolicy?.liveReady?'SERVER READY':'SERVER BLOCKED'; badge.classList.toggle('ready',!!serverPolicy?.liveReady); }
    const states=serverPolicy?.policy?.approvedStates || [];
    if ($('conduitServerPolicyText')) $('conduitServerPolicyText').textContent = states.length ? `Live API approved states: ${states.join(', ')}. Local settings cannot expand this server list.` : 'Live calling remains blocked until CONDUIT_APPROVED_CALLING_STATES is configured on the server.';
    if ($('conduitSettingsLiveStates')) $('conduitSettingsLiveStates').textContent = states.length ? states.join(', ') : 'NONE';
    if ($('conduitSettingsComplianceMessage')) $('conduitSettingsComplianceMessage').textContent = serverPolicy?.liveReady ? `Server enforcement is active for ${states.join(', ')}; provider credentials are checked separately.` : 'Server enforcement is active and intentionally blocks every live state until the pilot market is configured.';
  }

  function calculatePlanner() {
    const hours=Number($('conduitPlanHours')?.value||6),rate=Number($('conduitPlanRate')?.value||80),days=Number($('conduitPlanDays')?.value||22),touches=Math.max(1,Number($('conduitPlanTouches')?.value||5)),listSize=Number($('conduitPlanListSize')?.value||1000),price=Number($('conduitPlanPrice')?.value||0),minutes=Number($('conduitPlanMinutes')?.value||180),carrierRate=Number($('conduitPlanCarrierRate')?.value||.014),numberCost=Number($('conduitPlanNumberCost')?.value||1.15);
    const daily=hours*rate,monthly=daily*days,unique=Math.ceil(monthly/touches),listDays=listSize*touches/Math.max(1,daily),spend=unique*price,carrier=minutes*days*carrierRate+numberCost,total=spend+carrier;
    if ($('conduitPlannerOutput')) $('conduitPlannerOutput').innerHTML=`<div><span>Attempts/day</span><b>${daily.toLocaleString()}</b></div><div><span>Attempts/month</span><b>${monthly.toLocaleString()}</b></div><div><span>Unique leads needed</span><b>${unique.toLocaleString()}</b></div><div><span>${listSize.toLocaleString()} leads last</span><b>${listDays.toLocaleString(undefined,{maximumFractionDigits:1})} days</b></div><div><span>Estimated lead spend</span><b>$${spend.toLocaleString(undefined,{maximumFractionDigits:0})}</b></div><div><span>Estimated carrier</span><b>$${carrier.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</b></div><div><span>Leads + carrier</span><b>$${total.toLocaleString(undefined,{maximumFractionDigits:0})}</b></div>`;
  }

  function renderOwnedCallLogs() {
    const body=document.querySelector('.page[data-page="conversations-calls"] .body');
    if(!body)return;
    let panel=body.querySelector('.conduit-owned-call-logs');
    if(!panel){panel=document.createElement('section');panel.className='crm-product-card conduit-owned-call-logs';body.append(panel);}
    const calls=transcriptionData?.calls||[],jobs=transcriptionData?.jobs||[],completed=jobs.filter(job=>job.status==='completed').length,processing=jobs.filter(job=>job.status==='processing'||job.status==='queued').length;
    panel.innerHTML=`<div class="crm-product-head"><div><span>CONDUIT-OWNED RECORDS</span><h2>Persistent calls, recordings & transcripts</h2><p>Stored in local SQLite and private local media storage. Local Whisper has no per-minute API charge.</p></div><strong class="${transcriptionData?.runtime?.ready?'ready':''}">${transcriptionData?.runtime?.ready?'LOCAL WHISPER READY':'WHISPER NOT FOUND'}</strong></div><div class="conduit-owned-call-metrics"><div><span>Server call records</span><b>${calls.length}</b></div><div><span>Completed transcripts</span><b>${completed}</b></div><div><span>Processing</span><b>${processing}</b></div><div><span>Transcription API cost</span><b>$0</b></div></div><div class="conduit-owned-call-list">${calls.map(call=>`<article><div><b>${esc(call.leadReference)}</b><span>${esc(call.provider)} · ${esc(call.status)} · ${new Date(call.startedAt).toLocaleString()}</span></div><strong>${call.hasLocalRecording?'LOCAL AUDIO':call.hasProviderRecording?'PROVIDER AUDIO':'LOG ONLY'}</strong>${call.transcriptText?`<p>${esc(call.transcriptText)}</p>`:'<p>No transcript stored for this call.</p>'}</article>`).join('')||'<p>No server call records yet. Completed provider calls and consented local audio imports will appear here.</p>'}</div>`;
  }

  async function refreshServer() {
    try {
      const [policyResponse,auditResponse,dncResponse,transcriptionResponse]=await Promise.all([fetch('/api/telephony/compliance',{cache:'no-store'}),fetch('/api/telephony/audit?limit=8',{cache:'no-store'}),fetch('/api/telephony/dnc',{cache:'no-store'}),fetch('/api/telephony/transcription?limit=6',{cache:'no-store'})]);
      serverPolicy=await policyResponse.json(); const audit=await auditResponse.json(); serverAudit=audit.events || []; serverDnc=await dncResponse.json(); transcriptionData=await transcriptionResponse.json();
    } catch { serverPolicy={liveReady:false,policy:{approvedStates:[]}}; serverAudit=[]; serverDnc=null; transcriptionData=null; }
    renderPolicy();
    if ($('conduitServerAudit')) $('conduitServerAudit').innerHTML=serverAudit.length?serverAudit.map((event)=>`<div><b>${esc(event.classification)} · ${esc(event.eventType)}</b><span>${esc(event.detail)}</span><time>${new Date(event.occurredAt).toLocaleString()}</time></div>`).join(''):'<p>No verified provider events yet.</p>';
    const dncBadge=$('conduitDncRegistryBadge'),hardened=Boolean(serverDnc?.registry?.hardenedHashKey);if(dncBadge){dncBadge.textContent=hardened?`${Number(serverDnc?.registry?.total||0).toLocaleString()} HASHES`:'LOCAL KEY';dncBadge.classList.toggle('ready',hardened);}
    if($('conduitDncFileResult')&&!$('conduitDncFileResult').textContent)$('conduitDncFileResult').textContent=hardened?'Persistent keyed hashing is production configured.':'Set CONDUIT_DNC_HASH_KEY before importing real production data; the local fallback is for development only.';
    const whisperReady=Boolean(transcriptionData?.runtime?.ready),whisperBadge=$('conduitWhisperBadge');if(whisperBadge){whisperBadge.textContent=whisperReady?'LOCAL READY':'INSTALL NEEDED';whisperBadge.classList.toggle('ready',whisperReady);}
    if($('conduitSettingsWhisper'))$('conduitSettingsWhisper').textContent=whisperReady?'READY · $0 API':'NOT FOUND';
    const calls=transcriptionData?.calls||[],jobs=transcriptionData?.jobs||[];
    if($('conduitCallRecordSummary'))$('conduitCallRecordSummary').innerHTML=`<div><b>${calls.length} recent call record${calls.length===1?'':'s'}</b><span>${jobs.filter(job=>job.status==='completed').length} transcript${jobs.filter(job=>job.status==='completed').length===1?'':'s'} completed · ${jobs.filter(job=>job.status==='processing'||job.status==='queued').length} processing</span></div>${calls.filter(call=>call.transcriptText).slice(0,2).map(call=>`<div><b>${esc(call.leadReference)} · ${esc(call.transcriptModel)}</b><span>${esc(call.transcriptText.slice(0,180))}${call.transcriptText.length>180?'…':''}</span></div>`).join('')}`;
    renderActive();renderOwnedCallLogs();
  }

  async function persistInternalDnc(lead) {
    try { await fetch('/api/telephony/dnc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'internal',phone:lead.phone,leadId:lead.id,sourceReference:`dialer:${lead.id}`})}); }
    catch { /* Browser suppression remains active even while the local API is unavailable. */ }
  }

  function bind() {
    $('dialerLeadForm')?.addEventListener('submit', (event) => {
      event.preventDefault(); event.stopImmediatePropagation();
      const phone=$('dialerLeadPhone').value.trim();
      if (!/^\+[1-9]\d{7,14}$/.test(phone)) { $('dialerCallNotice').textContent='Lead was not added: phone must use E.164 format.'; return; }
      const iso=(id)=>$(id).value?new Date($(id).value).toISOString():'';
      const state=dialer(); state.leads=state.leads||[]; state.events=state.events||[];
      const lead={id:crypto.randomUUID?.()||`lead-${Date.now()}`,name:$('dialerLeadName').value.trim(),company:$('dialerLeadCompany').value.trim(),phone,priority:$('dialerLeadPriority').value,dnc:$('dialerLeadDnc').checked,consent:'unknown',stage:'Prospect',notes:'',attempts:0,callbackAt:'',createdAt:new Date().toISOString(),timezone:$('dialerLeadTimezone').value.trim(),source:$('dialerLeadSourceName').value.trim(),compliance:{stateCode:$('dialerLeadState').value.trim().toUpperCase(),timezone:$('dialerLeadTimezone').value.trim(),sourceName:$('dialerLeadSourceName').value.trim(),sourceUrl:$('dialerLeadSourceUrl').value.trim(),acquiredAt:iso('dialerLeadAcquiredAt'),consentBasis:$('dialerLeadBasis').value,consentCapturedAt:iso('dialerLeadConsentAt'),consentEvidence:$('dialerLeadEvidence').value.trim(),nationalDnc:$('dialerLeadNationalDnc').value,stateDnc:$('dialerLeadStateDnc').value,dncCheckedAt:iso('dialerLeadDncCheckedAt'),dialingMode:'one-to-one-power',liveAgent:true}};
      if (lead.compliance.consentBasis==='direct-written'||lead.compliance.consentBasis==='established-business-relationship') lead.consent='verified';
      if (lead.dnc||lead.compliance.nationalDnc==='listed'||lead.compliance.stateDnc==='listed') {lead.dnc=true;lead.compliance.internalDncPermanent=true;}
      state.leads.unshift(lead);state.activeId=lead.id;state.events.unshift({id:crypto.randomUUID?.()||String(Date.now()),type:'lead',detail:'Lead added with compliance provenance record',leadId:lead.id,at:new Date().toISOString()});saveDialer(state);event.target.reset();$('dialerLeadAcquiredAt').value=nowLocalInput();
    }, true);
    $('conduitSaveCompliance')?.addEventListener('click', saveActiveCompliance);
    $('conduitSuppressPermanent')?.addEventListener('click',async()=>{const state=dialer(),lead=activeLead(state);if(!lead||!confirm(`Permanently suppress ${lead.name} from Conduit calling?`))return;lead.dnc=true;lead.compliance={...(lead.compliance||{}),internalDncPermanent:true};state.events.unshift({id:crypto.randomUUID?.()||String(Date.now()),type:'compliance',detail:'Permanent company-specific DNC suppression enabled in browser and server registry',leadId:lead.id,at:new Date().toISOString()});saveDialer(state);await persistInternalDnc(lead);refreshServer();});
    $('dialerActiveDnc')?.addEventListener('change',async(event)=>{const state=dialer(),lead=activeLead(state);if(!lead)return;if(!event.target.checked&&lead.compliance?.internalDncPermanent){event.preventDefault();event.stopImmediatePropagation();event.target.checked=true;$('dialerCallNotice').textContent='Permanent internal DNC cannot be removed from the Dialer.';}else if(event.target.checked){lead.dnc=true;lead.compliance={...(lead.compliance||{}),internalDncPermanent:true};state.events.unshift({id:crypto.randomUUID?.()||String(Date.now()),type:'compliance',detail:'Permanent company-specific DNC suppression enabled in browser and server registry',leadId:lead.id,at:new Date().toISOString()});saveDialer(state);await persistInternalDnc(lead);refreshServer();}},true);
    $('dialerClearEvents').disabled=true;$('dialerClearEvents').textContent='Append-only';$('dialerClearEvents').title='Compliance audit events cannot be cleared from the Dialer.';
    $('conduitSavePolicy')?.addEventListener('click',()=>{const approvedStates=$('conduitApprovedStates').value.split(',').map(x=>x.trim().toUpperCase()).filter(x=>/^[A-Z]{2}$/.test(x));const next={...profile(),approvedStates:[...new Set(approvedStates)],dncMaxAgeDays:Math.min(31,Math.max(1,Number($('conduitDncAge').value||31))),minimumRetryMinutes:Math.max(60,Number($('conduitRetryMinutes').value||240)),attemptLimit:Math.min(12,Math.max(1,Number($('conduitAttemptLimit').value||6))),legalReviewConfirmed:$('conduitLegalReview').checked,allowScrubbedCold:$('conduitAllowCold').checked,recordingEnabled:$('conduitEnableRecording').checked};localStorage.setItem(PROFILE_KEY,JSON.stringify(next));renderPolicy();renderActive();});
    ['conduitPlanHours','conduitPlanRate','conduitPlanDays','conduitPlanTouches','conduitPlanListSize','conduitPlanPrice','conduitPlanMinutes','conduitPlanCarrierRate','conduitPlanNumberCost'].forEach(id=>$(id)?.addEventListener('input',calculatePlanner));
    $('conduitDncFile')?.addEventListener('change',async(event)=>{const file=event.target.files?.[0];if(!file)return;const output=$('conduitDncFileResult'),source=$('conduitDncSource').value.trim();if(!$('conduitDncAuthorized').checked||!source){output.textContent='Import blocked: enter the source label and confirm it is an authorized suppression source.';event.target.value='';return;}const text=await file.text(),numbers=[...new Set((text.match(/\+?1?\D*\d{3}\D*\d{3}\D*\d{4}/g)||[]).map(value=>{const digits=value.replace(/\D/g,'');return `+${digits.length===10?'1'+digits:digits}`;}))];const state=dialer();let matches=0;(state.leads||[]).forEach(lead=>{if(numbers.includes(lead.phone)){lead.dnc=true;lead.compliance={...(lead.compliance||{}),internalDncPermanent:true,nationalDnc:'listed',dncCheckedAt:new Date().toISOString()};matches++;}});try{let accepted=0;for(let start=0;start<numbers.length;start+=25000){const response=await fetch('/api/telephony/dnc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'import',numbers:numbers.slice(start,start+25000),scope:$('conduitDncScope').value,sourceLabel:source,acknowledgedAuthorizedSource:true})}),data=await response.json();if(!response.ok)throw new Error(data.error||'DNC import failed');accepted+=Number(data.accepted||0);}state.events=state.events||[];state.events.unshift({id:crypto.randomUUID?.()||String(Date.now()),type:'compliance',detail:`Authorized suppression source added to persistent registry: ${accepted} hashes, ${matches} queue matches`,at:new Date().toISOString()});saveDialer(state);output.textContent=`${accepted} keyed hashes stored; ${matches} matching queue records permanently suppressed. The source file and clear numbers were not stored.`;await refreshServer();}catch(error){output.textContent=`Persistent import failed: ${error.message}. No call eligibility was expanded.`;}event.target.value='';});
    $('conduitTranscribeAudio')?.addEventListener('click',async()=>{const file=$('conduitAudioFile').files?.[0],lead=activeLead();const output=$('conduitTranscriptionResult');if(!file){output.textContent='Choose an audio file first.';return}if(!$('conduitRecordingConsent').checked){output.textContent='Blocked: document recording consent before storing or transcribing audio.';return}const form=new FormData();form.append('audio',file);form.append('leadId',lead?.id||'unlinked');form.append('recordingConsent','true');output.textContent='Storing audio privately and starting local Whisper…';try{const response=await fetch('/api/telephony/transcription',{method:'POST',body:form}),data=await response.json();if(!response.ok)throw new Error(data.error||'Transcription could not start');output.textContent=`Local job ${data.job.status}. Conduit will show the transcript here when Whisper finishes; API cost $0.`;$('conduitAudioFile').value='';setTimeout(refreshServer,1500);}catch(error){output.textContent=`Local transcription failed: ${error.message}`;}});
    $('dialerSaveOutcome')?.addEventListener('click',()=>setTimeout(renderActive,50));
  }

  function install() {
    injectLeadCapture();injectActiveCompliance();injectOperations();injectSettings();bind();renderPolicy();calculatePlanner();renderActive();refreshServer();
    setInterval(()=>{if(document.querySelector('.page[data-page="dialer"].active'))renderActive();if(document.querySelector('.page[data-page="conversations-calls"].active'))renderOwnedCallLogs();},1500);
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
})();
