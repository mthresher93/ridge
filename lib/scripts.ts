import type { Lead, RoofDesign, ScriptBeat } from "./types";
import { estimateFor } from "./solar";
import { money, phonePretty } from "./format";

export function scriptFor(lead: Lead | null, design?: RoofDesign | null): ScriptBeat[] {
  if (!lead) {
    return [
      {
        id: "wait",
        label: "Standby",
        say: "Pick a person in the queue. The script fills from the rooftop, the bill, and the last note — not a generic opener.",
        cue: "No lead selected",
      },
    ];
  }

  if (lead.dnc) {
    return [
      {
        id: "dnc",
        label: "Stop",
        say: `${lead.name} is on internal DNC. Do not dial. Close the record and move to the next callable.`,
        cue: "Suppressed",
      },
    ];
  }

  if (lead.consent !== "verified") {
    return [
      {
        id: "consent",
        label: "Consent",
        say: `${lead.name} is not verified for a live call. Confirm TCPA consent on the form before the first dial. Do not pitch.`,
        cue: lead.consent === "missing" ? "Consent missing" : "Consent unknown",
      },
    ];
  }

  const est = design ? estimateFor(lead, design) : null;
  const bill = lead.monthlyBill ? money(lead.monthlyBill) : "an unknown bill";
  const first = lead.name.split(" ")[0];
  const roof = design ? `${design.roofAge}-year ${design.roofMaterial.toLowerCase()}` : "roof not surveyed";
  const size = est ? `${est.systemKw} kW / ${est.panelCount} modules` : "system not sized";

  if (/Proposal|Contract/.test(lead.status)) {
    return [
      {
        id: "open",
        label: "Open",
        say: `${first} — Michael. You still have open questions on the ${size} layout. I have ten minutes. Want to knock them out now?`,
        cue: "Do not restart the pitch",
      },
      {
        id: "paper",
        label: "Paper",
        say: `The production sheet is written. If the guarantee language is the hold-up, I can walk the kWh assumption line by line.`,
        cue: lead.nextAction,
      },
      {
        id: "ask",
        label: "Ask",
        say: `If the numbers hold, we sign this week. If they don't, I will say so. Which question is actually blocking you?`,
        cue: "Close or recast — no maybe",
      },
    ];
  }

  if (/Appointment/.test(lead.status)) {
    return [
      {
        id: "open",
        label: "Open",
        say: `${first}, it's Michael confirming the sit. ${lead.nextAction || "I need you and the other signer on the call."}`,
        cue: "Confirm, don't sell",
      },
      {
        id: "prep",
        label: "Prep",
        say: `Have the last twelve months of ${lead.utility} handy. We'll size against ${bill}/mo, not a brochure.`,
        cue: "Bill + both decision makers",
      },
      {
        id: "ask",
        label: "Ask",
        say: `Still good for the time on the calendar? If not, give me one window this week that actually holds.`,
        cue: "Lock or reschedule now",
      },
    ];
  }

  const city = lead.city ? ` in ${lead.city}` : "";
  const attempts = lead.attempts ? `Attempt ${lead.attempts + 1}` : "First attempt";

  return [
    {
      id: "open",
      label: "Opening",
      say: `${first}, Michael with Lumen. You asked for a call on the ${lead.utility} bill at ${lead.property}${city}. Is this still a decent time?`,
      cue: `${attempts} · ${phonePretty(lead.phone)}`,
    },
    {
      id: "permission",
      label: "Permission",
      say: `Two minutes. If it's not a fit I'll tell you and get off the phone. Fair?`,
      cue: "Get a yes before anything else",
    },
    {
      id: "bill",
      label: "Qualify · Bill",
      say: `You're at ${bill} a month with ${lead.utility}. Is that summer-high or the average? I care about the real number, not a savings slide.`,
      cue: "Write the bill back to them",
    },
    {
      id: "roof",
      label: "Qualify · Roof",
      say: `Planning range is ${size} on a ${roof}. ${est ? `Offset pencils around ${est.offset}% if the heading holds.` : "I need a heading before I quote anything."}`,
      cue: design ? `${design.azimuthDeg}° · ${design.tiltDeg}° tilt` : "Open Design to size it",
    },
    {
      id: "owner",
      label: "Qualify · Owner",
      say: `You own the home, and who else signs with you? I need both people on the sit or I'm wasting your evening.`,
      cue: "Owner + all signers",
    },
    {
      id: "value",
      label: "Value",
      say: `Here's the deal: ${est ? `a ${est.systemKw} kW array` : "a properly sized array"} turns a ${bill} variable bill into a fixed payment that doesn't move when ${lead.utility} raises rates. If the design doesn't beat the bill, we stop.`,
      cue: "Dream outcome · zero risk",
    },
    {
      id: "ask",
      label: "Ask",
      say: lead.nextAction || `I want forty-five minutes with whoever signs. Tuesday evening or Saturday morning — which actually works?`,
      cue: "Name two windows. Don't offer a brochure.",
    },
    {
      id: "close",
      label: "Close",
      say: `Locked. I'll text a confirmation to ${phonePretty(lead.phone)}. Have the last twelve months of ${lead.utility} in front of you and we'll size it live.`,
      cue: "Confirm time · confirm bill · confirm signers",
    },
    {
      id: "vm",
      label: "Voicemail",
      say: `${first}, Michael with Lumen about the ${lead.utility} bill at ${lead.property}. Nothing to buy — I have a roof number for you. Call me back or I'll try again tomorrow.`,
      cue: "Under 15 seconds · disposition Voicemail",
    },
  ];
}

export function objectionsFor(lead: Lead | null): ScriptBeat[] {
  const first = lead?.name.split(" ")[0] || "them";
  const bill = lead?.monthlyBill ? money(lead.monthlyBill) : "the bill";
  return [
    {
      id: "price",
      label: "Price",
      say: `I'm not asking you to buy a number you haven't seen. ${bill}/mo is the baseline. If the design doesn't beat that, we stop.`,
      cue: "Don't defend a brochure price",
    },
    {
      id: "roof",
      label: "Roof age",
      say: `If the roof is the issue, we say so before anyone climbs it. I won't sell an array onto a deck that needs replacing.`,
      cue: "Honest, then schedule",
    },
    {
      id: "think",
      label: "Need to think",
      say: `${first}, that's fair. What specifically do you want to think about — the bill, the roof, or who else needs to be on the call?`,
      cue: "Isolate the actual hold",
    },
    {
      id: "spouse",
      label: "Spouse",
      say: `I need both people who sign. Give me one window this week when you're both free and I'll hold it.`,
      cue: "Don't pitch a half-house",
    },
    {
      id: "busy",
      label: "Bad time",
      say: `I won't force it. Give me a time that actually holds and I'll call then — not a maybe.`,
      cue: "Book the callback now",
    },
    {
      id: "quotes",
      label: "Already have quotes",
      say: `Good — then you know the range. Bring the best one to the sit and I'll show you line by line where it beats ${bill} and where it doesn't.`,
      cue: "Compete on the design, not the pitch",
    },
    {
      id: "renter",
      label: "Not the owner",
      say: `Then I'm calling the wrong person and I'll stop here. Is the owner someone you'd want me to reach, or should I close this out?`,
      cue: "Disqualify cleanly",
    },
    {
      id: "scam",
      label: "Is this a scam",
      say: `Fair question. No payment, no contract today. You asked for a call on the ${lead?.utility || "utility"} bill; I'm confirming the numbers before anyone drives out.`,
      cue: "Calm · reference their request",
    },
  ];
}
