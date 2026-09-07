export type PlaybookBlock =
  | { type: "p"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "cards"; items: { title: string; meta?: string; body: string }[] };

export type PlaybookSection = {
  id: string;
  title: string;
  blurb: string;
  blocks: PlaybookBlock[];
};

export const PLAYBOOK: PlaybookSection[] = [
  {
    id: "pick",
    title: "Pick a deck",
    blurb: "Read top to bottom. Stop at the first fail. Cheapest legal deck wins. Photo before you quote.",
    blocks: [
      {
        type: "list",
        items: [
          "1. Height over 10.6' → not hotshot. Over 11' → RGN / lowboy family.",
          "2. Weight over 20,000 lb → not hotshot.",
          "3. Length over 40' → not hotshot. Over 30' in the well → extendable RGN, not a standard RGN.",
          "4. Width over 8.5' → same trailer family, permits / escorts. Do not switch decks just for width.",
          "5. If hotshot, step deck, and flat all pass, use hotshot. Do not jump to RGN because it also fits.",
          "6. Catalog nicknames (sleeper, dump) are estimates. Typed L × W × H and pounds beat the nickname.",
        ],
      },
      {
        type: "p",
        text: "Always TL: RGN, extendable RGN, lowboy, power only, drive-away. Training caps are not a carrier quote.",
      },
    ],
  },
  {
    id: "job",
    title: "The job",
    blurb: "You match shippers with carriers. You do not own the truck. The book of business is yards that already move machines.",
    blocks: [
      {
        type: "p",
        text: "A freight broker negotiates rates and arranges the move. Skills that pay: communication, negotiation, and knowing trailers, lanes, and rules. The market is competitive and rates move. Shippers expect the unit to show up.",
      },
      {
        type: "list",
        items: [
          "Target people who already ship: dealers, rental houses, auction sellers — not one Facebook couch.",
          "Talk track: backup on the routing guide, not “replace your guy.” Yard manager or whoever books outbound freight.",
          "One dealer shipping a few loads a week beats fifty Marketplace ads.",
          "Phone still wins. LinkedIn is for people at those yards, from your own account.",
        ],
      },
    ],
  },
  {
    id: "prospect",
    title: "Finding shippers",
    blurb: "Legal hunt. You open public pages. Haul ranks who looks like they actually ship.",
    blocks: [
      {
        type: "cards",
        items: [
          { title: "Recurring yards", meta: "Best", body: "Machinery Trader dealer directory, Google Maps dealers and rental, Cat / Toyota locators. Capture the published phone." },
          { title: "Live inventory", meta: "Best", body: "Machinery Trader, Equipment Trader, TractorHouse. Prefer a dealer name and a phone over a private seller." },
          { title: "Auction clock", meta: "Time", body: "Ritchie, IronPlanet, Purple Wave, GovPlanet, Copart, IAA, Manheim. After the hammer they have a removal deadline." },
          { title: "People", meta: "Strong", body: "LinkedIn company/people search from your login. ImportYeti only after you have a legal company name." },
          { title: "Volume ads", meta: "One-shot", body: "Marketplace and Craigslist. Commercial iron only. You message from your real profile." },
          { title: "Load boards", meta: "Spot", body: "DAT, Truckstop, uShip fill empty miles. Do not build the book here." },
        ],
      },
      {
        type: "list",
        items: [
          "Referrals from a yard you already moved for.",
          "Regional industry lists: construction, ag, manufacturing in a state you run.",
          "No scraping, no Messenger bots, no fake accounts, no invented numbers.",
        ],
      },
    ],
  },
  {
    id: "trailers",
    title: "Trailers",
    blurb: "Open decks first — these are the ones the matcher uses. Enclosed and specialty are separate.",
    blocks: [
      {
        type: "p",
        text: "Height is cargo on the deck. Ground clearance eats legal height. Example: GC 3.6' and state max 13.6' → about 10' of cargo. Confirm the state.",
      },
      {
        type: "table",
        headers: ["Code", "Name", "Length", "Width", "Height cap", "Deck / GC", "Weight"],
        rows: [
          ["HS", "Hot Shot", "20–40'", "8.5'", "10–10.6'", "GC 3–3.6'", "12–20k lb"],
          ["F", "Flatbed", "48–53'", "8.5'", "~10'", "GC ~5'", "45k lb"],
          ["SDL", "Step deck", "53'", "8.5'", "~10'", "GC ~3.6'", "45k lb"],
          ["LSDL", "Low-profile SD", "53'", "8.5'", "~11'", "GC ~2.6'", "45k lb"],
          ["RGN / LB", "Lowboy", "Well 24–30'", "8.5'", "11'+", "GC 1–1.5'", "45k+ lb"],
          ["RGNE", "Extendable RGN", "Well to 50'", "8.5'", "11'+", "GC ~1.5'", "45k+ lb"],
        ],
      },
      {
        type: "p",
        text: "Enclosed / other (matcher only uses these if you type van, reefer, tilt, landoll, power only, drive-away):",
      },
      {
        type: "table",
        headers: ["Code", "Name", "Notes"],
        rows: [
          ["VA", "Dry van", "28–53' enclosed. Not for machinery unless it can be forklift-loaded."],
          ["Reefer", "Reefer", "Temp control. Not open deck."],
          ["CNST", "Conestoga", "Rolling tarp. ~8' cargo height."],
          ["Landoll", "Landoll", "Tilt/slide. Say landoll in the unit field."],
          ["Tilt", "Tilt trailer", "Hydraulic tilt, hotshot class."],
          ["Sprinter / Box", "Small enclosed", "Parcel / local. Not your hotshot book."],
        ],
      },
      {
        type: "list",
        items: [
          "Hotshot: pickup or medium-duty. Not all have ramps. Winch sometimes. Ramp cap ~18k lb.",
          "Step deck: two levels, usually a semi. Not all have ramps. Ramp cap ~30k lb.",
          "RGN: gooseneck comes off so machines drive into the well. No ramps needed.",
          "Power only = tractor, no trailer. Drive-away = hired driver in the unit. Piggyback = saddles for extra vehicles.",
        ],
      },
    ],
  },
  {
    id: "loads",
    title: "Load class",
    blurb: "Class is the worse of length vs weight. RGN, RGNE, lowboy, power only, drive-away are always TL.",
    blocks: [
      {
        type: "table",
        headers: ["Deck", "Parcel", "Partial", "LTL", "TL"],
        rows: [
          ["53' decks (F / SDL / van / reefer)", "<10' / <10k lb", "10.1–27' / 10–24k", "27–36' / 24–33k", "36–53' / 33–45k"],
          ["Hotshot", "<5' / <3k lb", "5.1–20' / 3–10k", "—", "20.1–40' / 10–20k"],
        ],
      },
      {
        type: "p",
        text: "Same machine can change class by trailer. 26' × 8.5' × 10' at 18,000 lb is TL on a hotshot and Partial on a step deck. If length says Parcel and weight says LTL, call it LTL.",
      },
    ],
  },
  {
    id: "units",
    title: "Common units",
    blurb: "Catalog guesses only. Ask for a photo and real specs before you quote.",
    blocks: [
      {
        type: "table",
        headers: ["Unit", "Usual L×W×H × lb", "First guess"],
        rows: [
          ["Day cab 1 axle", "24×8×9.5 × 14k", "SDL / Partial"],
          ["Day cab 2 axle", "26×8×9.5 × 16k", "SDL / Partial"],
          ["Sleeper cab", "28×8×13 × 20k", "RGN"],
          ["Midroof cab", "28×8×11–12 × 20k", "LSDL / LTL or RGN"],
          ["Dump 1 / 2 / 3 axle", "24–30×8×10–11 × 20–28k", "SDL then LSDL/RGN"],
          ["Cargo van", "27×8×10 × 16k", "SDL / Partial"],
          ["Garbage truck", "32–34×8×13–13.6 × 28k", "RGN"],
          ["School bus", "37–40×8×10–11 × 32k", "RGN"],
          ["Bucket / boom", "34×8×12.6–13.6 × 26–32k", "RGN"],
          ["Box truck / Hino NPR", "26×8×10–12 × 16–20k", "SDL or RGN"],
          ["Mini excavator", "10–25×5–9×7–10 × 2–20k+", "HS → RGN as it grows"],
          ["Telehandler", "17.5–24×8×8–10 × 16–40k", "SDL → RGN"],
        ],
      },
      {
        type: "p",
        text: "Two sleeper cabs on an LSDL: combine length and weight. Use the taller unit’s height. A lean on the upper deck can add about a foot.",
      },
    ],
  },
  {
    id: "auctions",
    title: "Auctions",
    blurb: "Pickup IDs and hours. Most yards: Mon–Fri 7–4. No heavy-duty loading unless noted.",
    blocks: [
      {
        type: "table",
        headers: ["Yard", "ID to ask", "Pickup notes"],
        rows: [
          ["Copart", "Lot number", "Gate appointment in Copart app (usually the client). Assist under 8k lb by appointment."],
          ["IAA", "Stock + buyer #", "Both required at pickup. No HD assist."],
          ["Ritchie Bros", "Lot + buyer #", "Release forms. HD assist by appointment (client)."],
          ["IronPlanet", "Lot + buyer #", "Call the yard 24h ahead. No HD assist."],
          ["Manheim", "Release form", "Open 7 days 7a–9p. Ask about HD assist."],
          ["Lyon’s", "Paddle + lot", "No HD assist."],
          ["Jeff Martin", "Bidder + lot", "No HD assist."],
          ["Yoder & Frey", "Lot + buyer #", "No HD assist."],
          ["JJ Kane", "Lot + buyer # + release", "No HD assist."],
        ],
      },
    ],
  },
  {
    id: "load-unload",
    title: "Loading help",
    blurb: "Decking = push/pull. Lifting = crane. Confirm who pays before you dispatch.",
    blocks: [
      {
        type: "table",
        headers: ["Help", "Kind", "Cap", "Ballpark"],
        rows: [
          ["Tow truck", "Deck (push)", "9k lb", "$150–200"],
          ["Flatbed / rollback", "Deck", "14k lb", "$300–400"],
          ["Wrecker", "Deck", "~20k lb", "$400–500"],
          ["Rotator wrecker", "Lift", "~20k lb", "~$700"],
          ["Crane", "Lift", "~25k lb+", "~$900+"],
        ],
      },
      {
        type: "p",
        text: "Call the drop-off: you are the broker, confirm address, hours, POC, whether they unload, and ETA from the carrier. Missing this burns driver time and money.",
      },
    ],
  },
  {
    id: "rules",
    title: "DOT / MC",
    blurb: "USDOT tracks safety. MC is operating authority for for-hire interstate regulated freight.",
    blocks: [
      {
        type: "list",
        items: [
          "FMCSA writes CMV safety rules. USDOT number is on every interstate commercial vehicle.",
          "MC number is for for-hire carriers, brokers, and forwarders moving regulated commodities across state lines. Not every DOT holder has an MC.",
          "Drivers: 21+ interstate, CDL at 26,001 lb GCWR, ELD. 11 hours driving in a 14-hour window — roughly 500–600 miles.",
          "Before you book a carrier: active MC/DOT, insurance, safety rating, right equipment. Then DL photo, truck with MC/DOT, plate — share with the pickup using your work email.",
        ],
      },
    ],
  },
  {
    id: "niches",
    title: "Niches",
    blurb: "Specialize. Heavy machinery, farm iron, trucks, boats, RVs — not ‘anything that rolls.’",
    blocks: [
      {
        type: "list",
        items: [
          "Small vehicles, trucks, heavy machinery, farm equipment, industrial material, empty trailers, boats, houses, RVs.",
          "Also: produce/reefer, containers, government, aircraft parts, palletized, live plants.",
          "Geographic: a state you know, or hard-to-reach yards. Industry: construction, ag, manufacturing.",
          "Escorts: width and height rules differ by state. Under 12' width and over-height poles — always check the state map before you dispatch.",
        ],
      },
    ],
  },
  {
    id: "boat",
    title: "Boats",
    blurb: "Beam = width. Height = draft + hull + cabin. Ask how they measure.",
    blocks: [
      {
        type: "table",
        headers: ["Length", "200–500 mi", "500–1000 mi", ">1000 mi"],
        rows: [
          ["<12'", "$1.75", "$1.40", "$1.25"],
          ["12–18'", "$2.00", "$1.45", "$1.30"],
          ["18–24'", "$2.25", "$1.50", "$1.45"],
          ["24–30'", "$2.50", "$1.85", "$1.75"],
          ["30–36'", "$3.50", "$2.25", "$1.90"],
          [">36'", "$4.00", "$2.50", "$2.15"],
        ],
      },
      { type: "p", text: "Those are training ballparks per mile class — not your quote. Size, distance, and extra services still move the number." },
    ],
  },
];

export function searchPlaybook(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return PLAYBOOK;
  return PLAYBOOK.filter((section) => {
    const hay = [
      section.title,
      section.blurb,
      ...section.blocks.flatMap((block) => {
        if (block.type === "p") return [block.text];
        if (block.type === "list") return block.items;
        if (block.type === "table") return [...block.headers, ...block.rows.flat()];
        return block.items.map((item) => `${item.title} ${item.meta || ""} ${item.body}`);
      }),
    ]
      .join(" ")
      .toLowerCase();
    return q.split(/\s+/).every((word) => hay.includes(word));
  });
}

export function playbookSection(id: string) {
  return PLAYBOOK.find((item) => item.id === id) || PLAYBOOK[0];
}
