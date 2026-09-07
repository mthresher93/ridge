export type HuntRank = "Best" | "Strong" | "Volume" | "Local" | "Spot";

export type HuntLane = {
  id: string;
  name: string;
  rank: HuntRank;
  fit: string;
  legal: string;
  how: string;
  messageWhere: string;
};

export type HuntPlay = {
  id: string;
  title: string;
  rank: HuntRank;
  why: string;
  talkTo: string;
  laneIds: string[];
};

function q(value: string) {
  return encodeURIComponent(value.trim() || "forklift");
}

function loc(value: string) {
  return value.trim() || "Texas";
}

export function huntPlaceParts(place: string) {
  const raw = loc(place);
  const stateMatch = raw.match(/\b([A-Za-z]{2})\b\s*$/) || raw.match(/\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|hampshire|jersey|mexico|york|carolina|dakota|ohio|oklahoma|oregon|pennsylvania|rhode|tennessee|texas|utah|vermont|virginia|washington|wisconsin|wyoming)\b/i);
  const STATES: Record<string, string> = {
    texas: "TX",
    tx: "TX",
    california: "CA",
    ca: "CA",
    florida: "FL",
    fl: "FL",
    illinois: "IL",
    il: "IL",
    "new york": "NY",
    ny: "NY",
    georgia: "GA",
    ga: "GA",
    arizona: "AZ",
    az: "AZ",
    ohio: "OH",
    oh: "OH",
    pennsylvania: "PA",
    pa: "PA",
    "north carolina": "NC",
    nc: "NC",
  };
  const key = (stateMatch?.[1] || "").toLowerCase();
  const state = STATES[key] || (key.length === 2 ? key.toUpperCase() : "TX");
  return { label: raw, state };
}

export const HUNT_BRIEF = [
  "The money in this job is not the load board. It is a small book of yards that already move machines: dealers, rental houses, auction sellers.",
  "One dealer who ships every week beats fifty Marketplace ads. Ask to be backup freight, not their new exclusive.",
  "Haul only opens public search pages you could click yourself. You copy the listing. You send the message. No scraping, no bots, no fake numbers.",
];

export const HUNT_PRESETS = [
  { query: "forklift", place: "Texas" },
  { query: "skid steer", place: "Florida" },
  { query: "mini excavator", place: "Georgia" },
  { query: "telehandler", place: "California" },
  { query: "CNC machine", place: "Ohio" },
  { query: "dump truck", place: "Illinois" },
];

export const HUNT_LANES: HuntLane[] = [
  {
    id: "mt-dealers",
    name: "Machinery Trader dealer directory",
    rank: "Best",
    fit: "Named yards with phones. These people already deliver sold iron.",
    legal: "Public dealer directory. You open it.",
    how: "Filter by your state. Capture dealers with a lot of listings — that is recurring freight.",
    messageWhere: "Call the published dealer phone. Ask who books outbound freight.",
  },
  {
    id: "maps-dealers",
    name: "Google Maps dealers",
    rank: "Best",
    fit: "Live businesses you can walk into: forklift, machinery, lift truck.",
    legal: "Public Maps results, then their Contact page.",
    how: "Open a dealer, copy name / phone / site. Prefer a yard, not a broker storefront.",
    messageWhere: "Call the business number on Maps or the website.",
  },
  {
    id: "maps-rental",
    name: "Google Maps rental yards",
    rank: "Best",
    fit: "Rental houses move machines constantly. Recurring by design.",
    legal: "Public Maps listings.",
    how: "Search equipment rental. Capture the branch, not the corporate homepage.",
    messageWhere: "Ask for the branch manager or whoever dispatches deliveries.",
  },
  {
    id: "google-dealers",
    name: "Google dealer search",
    rank: "Best",
    fit: "Public web results: dealer + city + phone. Fast list-building.",
    legal: "Normal Google search you run yourself.",
    how: "Open results that look like a real yard. Skip lead-gen spam sites.",
    messageWhere: "Use the phone on their Contact page.",
  },
  {
    id: "cat-locator",
    name: "Caterpillar dealer locator",
    rank: "Strong",
    fit: "Cat dealers move heavy iron on a schedule. High-quality shippers.",
    legal: "Manufacturer’s public locator.",
    how: "Search your area. Capture the local store, then their contact page.",
    messageWhere: "Call the store. Ask who handles machine delivery.",
  },
  {
    id: "toyota-forklift",
    name: "Toyota forklift dealers",
    rank: "Strong",
    fit: "Authorized lift dealers. They already ship to customers.",
    legal: "Toyota’s public dealer finder.",
    how: "Find the county/zip dealer. Copy the published phone.",
    messageWhere: "Call the dealer. Backup for customer deliveries.",
  },
  {
    id: "bobcat-locator",
    name: "Bobcat dealer locator",
    rank: "Best",
    fit: "Skid steer and compact excavator dealers. They already deliver sold machines.",
    legal: "Manufacturer’s public locator. You open it.",
    how: "Find the local dealer. Copy the published phone.",
    messageWhere: "Call the store. Ask who books machine delivery.",
  },
  {
    id: "deere-locator",
    name: "John Deere dealer locator",
    rank: "Best",
    fit: "Ag and construction dealers. Recurring outbound freight.",
    legal: "Public dealer finder.",
    how: "Search your area. Capture the branch, not the corporate page.",
    messageWhere: "Call the dealership. Yard or product support books trucks.",
  },
  {
    id: "hyster-locator",
    name: "Hyster dealer locator",
    rank: "Strong",
    fit: "Lift truck dealers next to Toyota/Cat. Same shipper profile.",
    legal: "Public locator.",
    how: "Open the local dealer. Phone on the page.",
    messageWhere: "Call. Backup on customer deliveries.",
  },
  {
    id: "sunbelt",
    name: "Sunbelt Rentals locations",
    rank: "Best",
    fit: "National rental. Branches move iron constantly.",
    legal: "Public branch finder.",
    how: "Open a nearby branch. Capture that phone, not 1-800.",
    messageWhere: "Ask for the branch manager or dispatch.",
  },
  {
    id: "united-rentals",
    name: "United Rentals locations",
    rank: "Best",
    fit: "Same as Sunbelt. Recurring by design.",
    legal: "Public locations page.",
    how: "Pick a branch in your state. Copy the local number.",
    messageWhere: "Branch manager / dispatch.",
  },
  {
    id: "truck-paper",
    name: "TruckPaper listings",
    rank: "Best",
    fit: "Commercial trucks with dealer names. Dump, box, wrecker.",
    legal: "Public classifieds you open.",
    how: "Search dump / box / rollback. Prefer a dealer over a private seller.",
    messageWhere: "Number on the ad.",
  },
  {
    id: "commercial-truck",
    name: "Commercial Truck Trader",
    rank: "Best",
    fit: "Same lane as TruckPaper. Dealer lots first.",
    legal: "Public listings.",
    how: "Keyword search. Capture dealer + phone.",
    messageWhere: "Call the lot.",
  },
  {
    id: "fastline",
    name: "Fastline",
    rank: "Strong",
    fit: "Ag and industrial iron. Lots of dealer inventory.",
    legal: "Public search.",
    how: "Search your machine type. Skip household.",
    messageWhere: "Phone on the listing.",
  },
  {
    id: "auctiontime",
    name: "AuctionTime",
    rank: "Strong",
    fit: "Online auctions with pickup locations. Clock is real.",
    legal: "Public auction search.",
    how: "Note pickup city and end time. Capture the seller if named.",
    messageWhere: "Contact on the lot. You send it.",
  },
  {
    id: "bigiron",
    name: "BigIron",
    rank: "Strong",
    fit: "Farm and construction auctions. Removal windows after the sale.",
    legal: "Public catalog.",
    how: "Search heavy. Copy lot and location.",
    messageWhere: "Seller or auction contact.",
  },
  {
    id: "rock-dirt",
    name: "Rock & Dirt",
    rank: "Strong",
    fit: "Construction equipment classifieds. Dealer-heavy.",
    legal: "Public listings.",
    how: "Search your type and state. Capture business names.",
    messageWhere: "Number on the ad.",
  },
  {
    id: "machinery-trader",
    name: "Machinery Trader listings",
    rank: "Best",
    fit: "Inventory that has to move. Prefer dealer names over private-party ads.",
    legal: "Public classifieds you open yourself.",
    how: "Open a forklift / loader / CNC search. Capture ads with a business name and phone.",
    messageWhere: "Call or email the number on the ad.",
  },
  {
    id: "equipment-trader",
    name: "Equipment Trader listings",
    rank: "Best",
    fit: "Same game — commercial lots, not couches.",
    legal: "Public listings in your browser.",
    how: "Search heavy equipment. Skip household junk.",
    messageWhere: "Call the dealer phone on the listing.",
  },
  {
    id: "tractorhouse",
    name: "TractorHouse",
    rank: "Strong",
    fit: "Ag and industrial yards. Recurring if they have a lot of machines.",
    legal: "Public listings.",
    how: "Search skid steers, tractors, telehandlers with a business name.",
    messageWhere: "Call or the site contact form — you send it.",
  },
  {
    id: "ritchie",
    name: "Ritchie Bros / IronPlanet",
    rank: "Strong",
    fit: "After the hammer, someone has a removal deadline. Time-sensitive freight.",
    legal: "Public auction catalogs.",
    how: "Open upcoming heavy lots that look interstate.",
    messageWhere: "Seller/auction contact on the lot page.",
  },
  {
    id: "purple-wave",
    name: "Purple Wave",
    rank: "Strong",
    fit: "Online auctions. Winners need trucks off the seller’s yard.",
    legal: "Public auction site you open.",
    how: "Search your equipment type. Capture lots with a pickup location.",
    messageWhere: "Use the contact on the lot. You send it.",
  },
  {
    id: "govplanet",
    name: "GovPlanet",
    rank: "Strong",
    fit: "Government surplus iron. Pickup windows are real.",
    legal: "Public surplus catalog.",
    how: "Open heavy equipment. Note pickup location and dates.",
    messageWhere: "Contact on the lot or the buyer after they win — you reach out.",
  },
  {
    id: "copart",
    name: "Copart",
    rank: "Strong",
    fit: "Insurance / salvage lots. Ask for the lot number. Gate appointment is usually the client.",
    legal: "Public auction site you open. You log in as yourself if the yard requires it.",
    how: "Search heavy equipment. Capture lot #, pickup city, and hours (typically Mon–Fri 7–4).",
    messageWhere: "Buyer or seller on the lot. You send it.",
  },
  {
    id: "iaa",
    name: "IAA",
    rank: "Strong",
    fit: "Insurance Auto Auctions. Stock + buyer number required at pickup.",
    legal: "You open IAA. No scraping.",
    how: "Open a lot. Copy stock/buyer numbers if they are on the page.",
    messageWhere: "Contact on the lot. You send it.",
  },
  {
    id: "manheim",
    name: "Manheim",
    rank: "Strong",
    fit: "Dealer auction. Open 7 days. Release form from the client.",
    legal: "Public/dealer auction you open with your login if needed.",
    how: "Search commercial / heavy. Ask the client for the release form before pickup.",
    messageWhere: "Client or auction contact. You send it.",
  },
  {
    id: "linkedin-yards",
    name: "LinkedIn yards",
    rank: "Strong",
    fit: "Companies matching dealer / rental in your area. The listing was the excuse.",
    legal: "Your LinkedIn account. You run the search.",
    how: "Open company results. Then the About / Contact page. No scraping, no fake profiles.",
    messageWhere: "InMail or the number on their site. You hit send.",
  },
  {
    id: "linkedin-people",
    name: "LinkedIn people",
    rank: "Strong",
    fit: "Yard managers, operations, dispatch at those dealers.",
    legal: "Your account, people search you open.",
    how: "Search yard manager / operations + dealer + city. Connect with a short note.",
    messageWhere: "LinkedIn from your profile. You send it.",
  },
  {
    id: "importyeti",
    name: "ImportYeti",
    rank: "Strong",
    fit: "Public US import records. Only after you have a real company name — not a keyword hunt.",
    legal: "You type the legal name. We do not scrape ImportYeti.",
    how: "Open ImportYeti. Search a company you already captured. Skip if you only have a first name.",
    messageWhere: "Use the phone on that company’s own site. Do not invent an email.",
  },
  {
    id: "facebook",
    name: "Facebook Marketplace",
    rank: "Volume",
    fit: "Volume, mixed quality. Commercial equipment only. Usually a one-shot.",
    legal: "Your account, ads you open. No bots, no fake profiles.",
    how: "Search forklift / skid steer / CNC. Capture the ad. Message from your profile.",
    messageWhere: "Facebook message from your profile. You hit send.",
  },
  {
    id: "craigslist",
    name: "Craigslist heavy equipment",
    rank: "Local",
    fit: "Local commercial ads. Skip furniture.",
    legal: "Open the live ad. Copy what you see. No harvesters.",
    how: "Heavy equipment search for a metro. Paste ads with a phone.",
    messageWhere: "Ad phone or CL reply-to.",
  },
  {
    id: "uship",
    name: "uShip equipment",
    rank: "Spot",
    fit: "People already asking for a truck. Spot freight, not a book of business.",
    legal: "You log into your uShip account.",
    how: "Browse heavy equipment listings. Bid as yourself.",
    messageWhere: "uShip message from your account.",
  },
  {
    id: "dat",
    name: "DAT load board",
    rank: "Spot",
    fit: "Fills empty miles. Race-to-the-bottom if this is your only source.",
    legal: "Your paid DAT login. We do not scrape DAT.",
    how: "Filter hotshot / flatbed / partials in your lane.",
    messageWhere: "Call the broker on the posting.",
  },
  {
    id: "truckstop",
    name: "Truckstop load board",
    rank: "Spot",
    fit: "Same as DAT. Use it to fill today, not to find your customers.",
    legal: "Your Truckstop login.",
    how: "Post your truck or search matching equipment.",
    messageWhere: "Call the broker. You already know this drill.",
  },
];

export const HUNT_PLAYS: HuntPlay[] = [
  {
    id: "yards",
    title: "Recurring yards",
    rank: "Best",
    why: "Dealers and rental houses already ship. One good yard is the backbone of a hotshot book.",
    talkTo: "Yard manager, branch manager, or whoever books outbound freight. Ask to be backup when their guy can’t cover a sold machine.",
    laneIds: ["mt-dealers", "maps-dealers", "maps-rental", "google-dealers", "cat-locator", "toyota-forklift", "bobcat-locator", "deere-locator"],
  },
  {
    id: "oem",
    title: "OEM locators",
    rank: "Best",
    why: "The manufacturer already published the local dealer. That yard ships to customers. You are asking to be backup freight.",
    talkTo: "The store phone on the locator. Product support or the person who books deliveries.",
    laneIds: ["cat-locator", "toyota-forklift", "bobcat-locator", "deere-locator", "hyster-locator"],
  },
  {
    id: "rental",
    title: "Rental branches",
    rank: "Best",
    why: "Rental houses move machines every week. Capture the branch, not the 1-800 number.",
    talkTo: "Branch manager or dispatch.",
    laneIds: ["maps-rental", "sunbelt", "united-rentals"],
  },
  {
    id: "listings",
    title: "Live inventory",
    rank: "Best",
    why: "A listing is proof something might move. Prefer a dealer name and a phone over a private seller.",
    talkTo: "The number on the ad. If it is a dealer, treat it as a yard relationship, not a one-load bid.",
    laneIds: ["machinery-trader", "equipment-trader", "tractorhouse", "fastline", "rock-dirt"],
  },
  {
    id: "trucks",
    title: "Commercial trucks",
    rank: "Best",
    why: "Dump, box, and wrecker lots. Run the unit through Intel before you name a deck.",
    talkTo: "The dealer phone on the listing.",
    laneIds: ["truck-paper", "commercial-truck"],
  },
  {
    id: "auctions",
    title: "Auction clock",
    rank: "Strong",
    why: "When the hammer falls, someone has a removal deadline and storage fees. Speed matters more than a cheap rate.",
    talkTo: "Seller or auction contact on the lot. After they win, they need a truck off that yard.",
    laneIds: ["ritchie", "purple-wave", "govplanet", "copart", "iaa", "manheim", "auctiontime", "bigiron"],
  },
  {
    id: "people",
    title: "People at those yards",
    rank: "Strong",
    why: "The ad is the excuse. The relationship is the job. LinkedIn is public search you run while logged in as you.",
    talkTo: "Operations, yard, dispatch. Short note. You send it from your profile.",
    laneIds: ["linkedin-yards", "linkedin-people", "importyeti"],
  },
  {
    id: "volume",
    title: "Volume ads",
    rank: "Volume",
    why: "Marketplace and Craigslist are noisy. Use them for commercial iron only. Most are one-shots.",
    talkTo: "The seller on the ad, from your real account. No bots.",
    laneIds: ["facebook", "craigslist"],
  },
  {
    id: "spot",
    title: "Fill today",
    rank: "Spot",
    why: "Load boards pay less and get bid down. Keep them for empty miles. Do not build your book here.",
    talkTo: "The broker on the posting, from your own DAT / Truckstop / uShip login.",
    laneIds: ["uship", "dat", "truckstop"],
  },
];

export function huntSearchUrl(laneId: string, keywords = "forklift", location = "Texas") {
  const query = keywords.trim() || "forklift";
  const place = loc(location);
  const { state } = huntPlaceParts(place);
  const mapsDealer = `https://www.google.com/maps/search/${q(`${query} dealer ${place}`)}`;
  switch (laneId) {
    case "mt-dealers":
      return `https://www.machinerytrader.com/dealer/directory/construction-equipment-dealers/`;
    case "maps-dealers":
      return mapsDealer;
    case "maps-rental":
      return `https://www.google.com/maps/search/${q(`equipment rental ${place}`)}`;
    case "google-dealers":
      return `https://www.google.com/search?q=${q(`"${query} dealer" ${place} ${state} phone`)}`;
    case "cat-locator":
      return "https://www.cat.com/en_US/support/dealer-locator.html";
    case "toyota-forklift":
      return "https://www.toyotaforklift.com/find-a-dealer";
    case "bobcat-locator":
      return "https://www.bobcat.com/na/en/find-a-dealer";
    case "deere-locator":
      return "https://dealerlocator.deere.com/";
    case "hyster-locator":
      return "https://www.hyster.com/na/en-us/find-a-dealer/";
    case "sunbelt":
      return "https://www.sunbeltrentals.com/locations/";
    case "united-rentals":
      return "https://www.unitedrentals.com/locations";
    case "truck-paper":
      return `https://www.truckpaper.com/listings/search?Keywords=${q(query)}`;
    case "commercial-truck":
      return `https://www.commercialtrucktrader.com/listing/search?keyword=${q(query)}`;
    case "fastline":
      return `https://www.fastline.com/farm-equipment-for-sale?q=${q(query)}`;
    case "auctiontime":
      return `https://www.auctiontime.com/search?keywords=${q(query)}`;
    case "bigiron":
      return `https://www.bigiron.com/Search?keyword=${q(query)}`;
    case "rock-dirt":
      return `https://www.rockanddirt.com/equipment-for-sale/${q(query)}`;
    case "machinery-trader":
      return `https://www.machinerytrader.com/listings/search?keywords=${q(query)}`;
    case "equipment-trader":
      return `https://www.equipmenttrader.com/listing/search?keyword=${q(query)}`;
    case "tractorhouse":
      return `https://www.tractorhouse.com/listings/search?Keywords=${q(query)}`;
    case "ritchie":
      return `https://www.rbauction.com/search?keywords=${q(query)}`;
    case "purple-wave":
      return `https://www.purplewave.com/search?utf8=%E2%9C%93&search[keyword]=${q(query)}`;
    case "govplanet":
      return `https://www.govplanet.com/search?keywords=${q(query)}`;
    case "copart":
      return `https://www.copart.com/lotSearchResults?free=true&query=${q(query)}`;
    case "iaa":
      return `https://www.iaai.com/Search?Keyword=${q(query)}`;
    case "manheim":
      return `https://www.manheim.com/`;
    case "linkedin-yards":
      return `https://www.linkedin.com/search/results/companies/?keywords=${q(`${query} dealer ${place}`)}`;
    case "linkedin-people":
      return `https://www.linkedin.com/search/results/people/?keywords=${q(`yard manager OR operations ${query} dealer ${place}`)}`;
    case "importyeti":
      return "https://www.importyeti.com/";
    case "facebook":
      return `https://www.facebook.com/marketplace/search/?query=${q(query)}`;
    case "craigslist":
      return `https://${clSubdomain(place)}.craigslist.org/search/hvy?query=${q(query)}`;
    case "uship":
      return `https://www.uship.com/c/heavy-equipment/`;
    case "dat":
      return "https://www.dat.com/load-boards";
    case "truckstop":
      return "https://truckstop.com/";
    default:
      return mapsDealer;
  }
}

export type HuntPackItem = {
  id: string;
  name: string;
  rank: HuntRank;
  why: string;
  talkTo: string;
  url: string;
};

export function huntPack(keywords = "forklift", location = "Texas"): HuntPackItem[] {
  const topIds = ["mt-dealers", "maps-dealers", "machinery-trader", "maps-rental", "ritchie"];
  return topIds.map((id) => {
    const lane = HUNT_LANES.find((item) => item.id === id)!;
    return {
      id,
      name: lane.name,
      rank: lane.rank,
      why: lane.fit,
      talkTo: lane.messageWhere,
      url: huntSearchUrl(id, keywords, location),
    };
  });
}

export function huntPackText(keywords = "forklift", location = "Texas") {
  return huntPack(keywords, location)
    .map((item) => `${item.name}\n${item.url}`)
    .join("\n\n");
}

export function huntLane(id: string) {
  return HUNT_LANES.find((item) => item.id === id) || null;
}

function clSubdomain(location: string) {
  const key = location.toLowerCase();
  if (/\bdallas\b/.test(key)) return "dallas";
  if (/\bhouston\b/.test(key)) return "houston";
  if (/\bchicago\b|\bil\b/.test(key)) return "chicago";
  if (/\bphoenix\b|\baz\b/.test(key)) return "phoenix";
  if (/\bmiami\b/.test(key)) return "miami";
  if (/\batlanta\b|\bga\b/.test(key)) return "atlanta";
  if (/\btx\b|texas/.test(key)) return "dallas";
  return "geo";
}

export function captureBookmarklet(origin = "http://localhost:6793", token = "") {
  const header = token ? `,'x-capture-token':'${token.replace(/'/g, "")}'` : "";
  return `javascript:(function(){var t=document.title||'';var u=location.href;var s=(window.getSelection&&String(window.getSelection())||document.body.innerText||'').slice(0,7000);fetch('${origin}/api/prospects/capture',{method:'POST',headers:{'Content-Type':'application/json'${header}},body:JSON.stringify({source:'Capture',url:u,title:t,pageText:s,description:s})}).then(function(r){return r.json()}).then(function(j){alert(j.ok?('Haul saved · score '+(j.score||'?')+'/100. Work it: ${origin}/outreach?id='+(j.leadId||'')):(j.error||'Capture failed'))}).catch(function(){alert('Haul is not running at ${origin}')});})();`;
}

export const HUNT_RULES = [
  "You open the page. You capture it. Haul never logs into Facebook, Craigslist, DAT, or LinkedIn for you.",
  "A phone or email only counts if it was on the page you copied.",
  "You send the message. No bots, no fake accounts, no invented rates.",
];

export const HUNT_CONNECTIONS = [
  { name: "APIs", value: "None", detail: "Do not buy a Facebook, DAT, or Maps API. Haul does not call those. Open is a normal tab." },
  { name: "Start today", value: "Browser", detail: "Google, Machinery Trader, OEM locators, auction catalogs. No login required to look." },
  { name: "Your logins", value: "Optional", detail: "Facebook and LinkedIn if you hunt there. DAT/Truckstop only for empty miles, on their sites." },
  { name: "Ollama", value: "Optional", detail: "Local scoring when you paste. The desk works without it." },
];
