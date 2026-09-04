(function () {
  "use strict";
  try {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", "/api/workspace", false);
    xhr.send();
    if (xhr.status === 200) {
      const data = JSON.parse(xhr.responseText);
      if (data.store && typeof data.store === "object") {
        Object.entries(data.store).forEach(([key, value]) => {
          if (typeof value === "string") localStorage.setItem(key, value);
        });
      } else if (data.workspace?.leads) {
        localStorage.setItem(
          "conduit.crm.v1",
          JSON.stringify({
            version: 2,
            leads: data.workspace.leads.map((lead) => ({
              ...lead,
              company: lead.property || lead.company,
            })),
            opportunities: data.workspace.opportunities || [],
            callbacks: data.workspace.callbacks || [],
            appointments: data.workspace.appointments || [],
            activities: data.workspace.activities || [],
            kpiEvents: data.workspace.kpiEvents || [],
            updatedAt: data.workspace.updatedAt,
          }),
        );
      }
    }
  } catch {
    /* local-only until the API is up */
  }

  const collect = () => {
    const store = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith("conduit")) store[key] = localStorage.getItem(key) || "";
    }
    return store;
  };

  let timer = 0;
  const flush = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      fetch("/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store: collect() }),
      }).catch(() => {});
    }, 400);
  };

  const hookSave = () => {
    const api = window.conduitCRM;
    if (!api?.save || api.save.__conduitPersisted) return;
    const original = api.save.bind(api);
    const wrapped = (db) => {
      original(db);
      flush();
    };
    wrapped.__conduitPersisted = true;
    api.save = wrapped;
  };

  window.addEventListener("conduit:crm-updated", () => {
    hookSave();
    flush();
  });
  window.addEventListener("conduit:dialer-updated", flush);
  window.addEventListener("storage", (event) => {
    if (event.key && event.key.startsWith("conduit")) flush();
  });
  document.addEventListener("DOMContentLoaded", () => {
    hookSave();
    flush();
  });
})();
