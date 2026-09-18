import type { Lead, ScriptBeat } from "./types";
import { phonePretty } from "./format";

export function scriptFor(lead: Lead | null): ScriptBeat[] {
  if (!lead) {
    return [
      {
        id: "wait",
        label: "Standby",
        say: "Pick a yard. The talk track is who books outbound freight, then specs, then a blank quote. No rate until they give you one.",
        cue: "No client selected",
      },
    ];
  }

  if (lead.dnc) {
    return [
      {
        id: "dnc",
        label: "Stop",
        say: `${lead.name} is do-not-contact. Do not dial. Close it and take the next published number.`,
        cue: "Suppressed",
      },
    ];
  }

  const first = lead.name.split(" ")[0] || "there";
  const city = lead.city ? ` in ${lead.city}` : "";
  const item = lead.equipmentType || lead.listingTitle || "the unit";
  const yard = lead.label === "Dealer" || lead.label === "Rental" || lead.label === "Shipper";

  return [
    {
      id: "open",
      label: "Opening",
      say: `${first} — Michael. Quick one on outbound freight${city}. Who books the truck when a machine sells?`,
      cue: `${phonePretty(lead.phone) || "No published phone"} · ${lead.attempts ? `attempt ${lead.attempts + 1}` : "first try"}`,
    },
    {
      id: "permission",
      label: "Permission",
      say: `Thirty seconds. Backup on the routing guide — not replace their guy. Fair?`,
      cue: "Get a yes before you pitch",
    },
    {
      id: "who",
      label: "Who books",
      say: yard
        ? `When that ${item} leaves the yard, is that dispatch, the sales guy, or a third-party broker already?`
        : `Pickup only at the yard, or do they need a truck if the buyer is out of state?`,
      cue: "Write the name. Direct line only if they give it.",
    },
    {
      id: "specs",
      label: "Specs",
      say: `If something is moving: photo, length, height sitting on the trailer, pounds. I will not quote from a catalog guess.`,
      cue: "Then Intel. Leave the rate blank.",
    },
    {
      id: "next",
      label: "Next step",
      say: lead.nextAction || `I’ll send a blank quote once I have dest and specs. No number until you give me one.`,
      cue: "Quote sheet. Convert only when they accept.",
    },
    {
      id: "vm",
      label: "Voicemail",
      say: `${first}, Michael — looking for whoever books outbound freight at ${lead.name}. I’ll try again. You can reach me on this number.`,
      cue: "Under 15 seconds · wrap Voicemail",
    },
  ];
}

export function objectionsFor(lead: Lead | null): ScriptBeat[] {
  const first = lead?.name.split(" ")[0] || "them";
  return [
    {
      id: "got-broker",
      label: "We already have a broker",
      say: `Not looking to replace ${first}'s guy. Backup when their truck is covered or a weird piece shows up. Who should I send that to?`,
      cue: "Stay on the routing guide",
    },
    {
      id: "rate",
      label: "What’s your rate?",
      say: `I don’t invent a number. Give me dest, length, height on the deck, and pounds. Then I quote what I can actually cover.`,
      cue: "Never use the listing ask",
    },
    {
      id: "email",
      label: "Just email me",
      say: `I will. Who books freight so it doesn’t die in the general inbox?`,
      cue: "Name + follow-up",
    },
    {
      id: "busy",
      label: "Busy / call back",
      say: `What day actually holds — tomorrow or Thursday? I’ll put it on the board.`,
      cue: "Set a real follow-up",
    },
  ];
}
