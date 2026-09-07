export type HuntLane = {
  id: string;
  name: string;
  rank: "Best" | "Strong" | "Volume" | "Local";
  fit: string;
  legal: string;
  how: string;
  messageWhere: string;
};

function q(value: string) {
  return encodeURIComponent(value.trim() || "forklift");
}

function loc(value: string) {
  return value.trim() || "Texas";
}

export const HUNT_LANES: HuntLane[] = [
  {
    id: "machinery-trader",
    name: "Machinery Trader",
    rank: "Best",
    fit: "Dealers with phones. Highest chance they already ship.",
    legal: "Public classifieds you open yourself.",
    how: "Open a forklift / loader / CNC search. Paste or bookmarklet the ad.",
    messageWhere: "Call or email the number on the ad.",
  },
  {
    id: "equipment-trader",
    name: "Equipment Trader",
    rank: "Best",
    fit: "Same as Machinery Trader — commercial lots, not couches.",
    legal: "Public listings in your browser.",
    how: "Search heavy equipment. Prefer a dealer name and a phone.",
    messageWhere: "Call the dealer phone on the listing.",
  },
  {
    id: "tractorhouse",
    name: "TractorHouse",
    rank: "Strong",
    fit: "Ag and industrial yards. Recurring if they have a lot of machines.",
    legal: "Public listings.",
    how: "Search skid steers, tractors, telehandlers. Paste ads with a business name.",
    messageWhere: "Call or the site contact form — you send it.",
  },
  {
    id: "ritchie",
    name: "Ritchie Bros / IronPlanet",
    rank: "Strong",
    fit: "Auction lots that will need transport after the hammer.",
    legal: "Public auction catalogs.",
    how: "Open upcoming heavy equipment. Paste lots that look interstate.",
    messageWhere: "Use the seller/auction contact on the lot page.",
  },
  {
    id: "maps-dealers",
    name: "Google Maps dealers",
    rank: "Strong",
    fit: "Live yards: forklift, machinery, rental. These people already ship.",
    legal: "Public business listings, then their Contact page.",
    how: "Open Maps, click a dealer, copy name / phone / site into Paste.",
    messageWhere: "Call the published business number.",
  },
  {
    id: "facebook",
    name: "Facebook Marketplace",
    rank: "Volume",
    fit: "Volume, mixed quality. Commercial equipment only.",
    legal: "Your account, ads you open. No bots, no fake profiles.",
    how: "Search forklift / skid steer / CNC. Capture the ad. You message from your profile.",
    messageWhere: "Facebook message from your profile. You hit send.",
  },
  {
    id: "craigslist",
    name: "Craigslist heavy equipment",
    rank: "Local",
    fit: "Local commercial ads. Skip furniture.",
    legal: "Open the live ad. Copy what you see. No harvesters.",
    how: "Use heavy equipment search for a metro. Paste ads with a phone.",
    messageWhere: "Reply via the ad’s phone or CL reply-to.",
  },
];

export function huntSearchUrl(laneId: string, keywords = "forklift", location = "Texas") {
  const query = keywords.trim() || "forklift";
  const place = loc(location);
  const maps = `https://www.google.com/maps/search/${q(`${query} dealer ${place}`)}`;
  switch (laneId) {
    case "machinery-trader":
      return `https://www.machinerytrader.com/listings/search?keywords=${q(query)}`;
    case "equipment-trader":
      return `https://www.equipmenttrader.com/listing/search?keyword=${q(query)}`;
    case "tractorhouse":
      return `https://www.tractorhouse.com/listings/search?Keywords=${q(query)}`;
    case "ritchie":
      return `https://www.rbauction.com/search?keywords=${q(query)}`;
    case "maps-dealers":
      return maps;
    case "facebook":
      return `https://www.facebook.com/marketplace/search/?query=${q(query)}`;
    case "craigslist":
      return `https://${clSubdomain(place)}.craigslist.org/search/hvy?query=${q(query)}`;
    default:
      return maps;
  }
}

function clSubdomain(location: string) {
  const key = location.toLowerCase();
  if (/\bdallas\b|\btx\b|texas/.test(key)) return "dallas";
  if (/\bhouston\b/.test(key)) return "houston";
  if (/\bchicago\b|\bil\b/.test(key)) return "chicago";
  if (/\bphoenix\b|\baz\b/.test(key)) return "phoenix";
  if (/\bmiami\b|\bfl\b/.test(key)) return "miami";
  if (/\batlanta\b|\bga\b/.test(key)) return "atlanta";
  return "geo";
}

export function captureBookmarklet(origin = "http://localhost:6793", token = "") {
  const header = token ? `,'x-capture-token':'${token.replace(/'/g, "")}'` : "";
  return `javascript:(function(){var t=document.title||'';var u=location.href;var s=(window.getSelection&&String(window.getSelection())||document.body.innerText||'').slice(0,7000);fetch('${origin}/api/prospects/capture',{method:'POST',headers:{'Content-Type':'application/json'${header}},body:JSON.stringify({source:'Capture',url:u,title:t,pageText:s,description:s})}).then(function(r){return r.json()}).then(function(j){alert(j.ok?('Lumen saved · score '+(j.score||'?')+'/100'):(j.error||'Capture failed'))}).catch(function(){alert('Lumen is not running at ${origin}')});})();`;
}

export const HUNT_RULES = [
  "You open the listing. You capture it. Lumen never logs into Facebook or Craigslist for you.",
  "A phone or email only counts if it was on the page you copied.",
  "You send the message. No bots, no fake accounts, no invented rates.",
];
