(function(){
  'use strict';
  const flow=`<section class="conduit-process-flow" aria-labelledby="conduitProcessFlowTitle">
    <header><div><span class="eyebrow">CRM FLOW</span><h3 id="conduitProcessFlowTitle">From new contact to closed loop</h3></div><p>Each step opens the workspace where that part of the customer journey is managed.</p></header>
    <div class="conduit-process-track">
      <button type="button" data-conduit-go="leads"><span>01</span><b>Capture</b><small>Contact + consent</small></button><i aria-hidden="true">→</i>
      <button type="button" data-conduit-go="leads"><span>02</span><b>Qualify</b><small>Fit + next action</small></button><i aria-hidden="true">→</i>
      <button type="button" data-conduit-go="dialer"><span>03</span><b>Converse</b><small>Call + follow-up</small></button><i aria-hidden="true">→</i>
      <button type="button" data-conduit-go="appointments"><span>04</span><b>Book</b><small>Appointment</small></button><i aria-hidden="true">→</i>
      <button type="button" data-conduit-go="pipeline"><span>05</span><b>Propose</b><small>Value + decision</small></button><i aria-hidden="true">→</i>
      <button type="button" data-conduit-go="pipeline"><span>06</span><b>Close loop</b><small>Win or nurture</small></button>
    </div>
  </section>`;
  function install(){
    const dashboard=document.querySelector('.page[data-page="home"] .conduit-crm-dashboard');
    if(!dashboard||dashboard.querySelector('.conduit-process-flow'))return;
    const metrics=dashboard.querySelector('.conduit-dash-metrics');
    metrics?.insertAdjacentHTML('afterend',flow);
  }
  function watch(){
    install();
    const dashboard=document.querySelector('.page[data-page="home"] .conduit-crm-dashboard');
    if(!dashboard)return setTimeout(watch,120);
    new MutationObserver(install).observe(dashboard,{childList:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch,{once:true});else watch();
  window.addEventListener('conduit:crm-updated',()=>setTimeout(install,0));
})();
