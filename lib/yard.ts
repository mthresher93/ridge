export function looksLikeYardName(text: string) {
  return /\b(equipment|machinery|dealership|dealers?\b|rental|material handling|lift of|holt\s*cat|\bholt\b|briggs|kirby[- ]?smith|doggett|shoppa|hyster|komatsu|h&e|sunbelt|united rentals|toyota lift|cat dealer)\b/i.test(
    text,
  );
}
