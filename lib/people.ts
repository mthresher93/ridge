import { normalizePhone, nowIso, uid } from "./format";
import type { Contact, Lead, Workspace } from "./types";

export function contactsForLead(workspace: Workspace, leadId: string) {
  return (workspace.contacts || []).filter((item) => item.leadId === leadId);
}

export function bookerOf(workspace: Workspace, lead: Lead): Contact | null {
  const people = contactsForLead(workspace, lead.id);
  return people.find((item) => item.role === "Books freight") || people[0] || null;
}

function samePerson(contact: Contact, name: string, phone: string) {
  const wantPhone = normalizePhone(phone);
  const havePhone = normalizePhone(contact.phone);
  if (wantPhone.length >= 7 && havePhone === wantPhone) return true;
  if (name && contact.name.trim().toLowerCase() === name.toLowerCase()) return true;
  return false;
}

export function upsertBooker(
  workspace: Workspace,
  leadId: string,
  extra: { name?: string; phone?: string; role?: string } = {},
) {
  const name = (extra.name || "").trim();
  const phone = (extra.phone || "").trim();
  if (!name && !phone) return { workspace, contact: null as Contact | null, created: false };
  const stamp = nowIso();
  const role = extra.role || "Books freight";
  const people = workspace.contacts || [];
  const existing = people.find((item) => item.leadId === leadId && samePerson(item, name, phone));
  const contact: Contact = existing
    ? {
        ...existing,
        name: name || existing.name,
        phone: phone || existing.phone,
        role: existing.role === "Books freight" ? existing.role : role,
        updatedAt: stamp,
      }
    : {
        id: uid("ct"),
        leadId,
        name: name || "Booker",
        phone,
        role,
        createdAt: stamp,
        updatedAt: stamp,
      };
  return {
    contact,
    created: !existing,
    workspace: {
      ...workspace,
      contacts: existing ? people.map((item) => (item.id === contact.id ? contact : item)) : [contact, ...people],
      leads: workspace.leads.map((item) =>
        item.id === leadId
          ? { ...item, booker: contact.name, bookerPhone: contact.phone || item.bookerPhone, updatedAt: stamp }
          : item,
      ),
      updatedAt: stamp,
    },
  };
}

export function hydrateContacts(workspace: Workspace) {
  let next = { ...workspace, contacts: workspace.contacts || [] };
  for (const lead of workspace.leads || []) {
    const name = (lead.booker || "").trim();
    const phone = (lead.bookerPhone || "").trim();
    if (!name && !phone) continue;
    if (contactsForLead(next, lead.id).some((item) => samePerson(item, name, phone))) continue;
    next = upsertBooker(next, lead.id, { name, phone }).workspace;
  }
  return next;
}

export function unfinishedTalked(workspace: Workspace) {
  const hot = (workspace.callbacks || [])
    .filter((item) => item.status === "open" && item.type === "hot")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  for (const row of hot) {
    const quoted = (workspace.shipments || []).some((item) => item.leadId === row.leadId && item.status === "Quote");
    if (!quoted) return row;
  }
  return null;
}

export function skipQuote(workspace: Workspace, leadId: string) {
  const stamp = nowIso();
  const due = new Date(Date.parse(stamp) + 86400000).toISOString();
  return {
    ...workspace,
    callbacks: (workspace.callbacks || []).map((item) =>
      item.leadId === leadId && item.status === "open" && item.type === "hot"
        ? {
            ...item,
            type: "standard" as const,
            dueAt: due,
            reason: "Finish dest, specs, blank quote.",
            notes: item.notes,
          }
        : item,
    ),
    leads: workspace.leads.map((item) =>
      item.id === leadId ? { ...item, nextAction: "Finish dest, specs, blank quote.", updatedAt: stamp } : item,
    ),
    updatedAt: stamp,
  };
}
