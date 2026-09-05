(() => {
  'use strict';

  // One-way compatibility bridge for data created before Conduit became the
  // canonical code, URL, API, and runtime namespace.
  const storageMigrations = [
    ['henry.crm.v1', 'conduit.crm.v1'],
    ['henryDialerV1', 'conduitDialerV1'],
    ['henryPipelineV1', 'conduitPipelineV1'],
    ['henryLeadMetaV1', 'conduitLeadMetaV1'],
    ['henry.crm.product.v2', 'conduit.crm.product.v2'],
    ['henry.crm.route.v2', 'conduit.crm.route.v2'],
    ['henry.crm.experience.v1', 'conduit.crm.experience.v1'],
    ['henry.crm.sectionNotes.v1', 'conduit.crm.sectionNotes.v1'],
    ['henry.crm.integrations.v1', 'conduit.crm.integrations.v1'],
    ['henry.dialer.v2', 'conduit.dialer.v2'],
    ['henry.settings.2026', 'conduit.settings.2026'],
    ['henry.workflow.settings', 'conduit.workflow.settings'],
    ['henry.operator.ui.v1', 'conduit.operator.ui.v1'],
    ['henry.operator.ui.v2', 'conduit.operator.ui.v2'],
    ['henry.solar.calendar.settings.v1', 'conduit.solar.calendar.settings.v1'],
    ['henry.solar.sunroof.assets.v1', 'conduit.solar.sunroof.assets.v1'],
    ['henry.solar.sunroof.selected.v1', 'conduit.solar.sunroof.selected.v1'],
    ['henry.agent.open', 'conduit.agent.open'],
    ['henry.page', 'conduit.page'],
    ['henry.mode', 'conduit.mode'],
  ];

  try {
    for (const [legacyKey, conduitKey] of storageMigrations) {
      if (localStorage.getItem(conduitKey) !== null) continue;
      const legacyValue = localStorage.getItem(legacyKey);
      if (legacyValue !== null) localStorage.setItem(conduitKey, legacyValue);
    }
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }

  const runtimeAliases = [
    ['henryCRM', 'conduitCRM'],
    ['henrySolarExpansion', 'conduitSolarExpansion'],
    ['henryMoneyAction', 'conduitMoneyAction'],
    ['henryConsoleAction', 'conduitConsoleAction'],
  ];

  for (const [legacyName, conduitName] of runtimeAliases) {
    if (Object.prototype.hasOwnProperty.call(window, legacyName)) continue;
    Object.defineProperty(window, legacyName, {
      configurable: true,
      get: () => window[conduitName],
      set: (value) => { window[conduitName] = value; },
    });
  }

  for (const [conduitEvent, legacyEvent] of [
    ['conduit:crm-updated', 'henry:crm-updated'],
    ['conduit:dialer-updated', 'henry:dialer-updated'],
    ['conduit:attention-open', 'henry:attention-open'],
  ]) {
    window.addEventListener(conduitEvent, () => window.dispatchEvent(new CustomEvent(legacyEvent)));
  }
})();
