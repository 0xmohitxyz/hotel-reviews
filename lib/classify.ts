import type { ClassifiedReview, Review, Sentiment, TopicHit } from "./types";

/**
 * Keyword-based topic classifier.
 *
 * Booking.com already splits every review into "liked" and "disliked" text,
 * so we match topic keywords separately in each part:
 *   keyword in "disliked" -> complaint about that topic
 *   keyword in "liked"    -> praise for that topic
 * This gives topic-level sentiment without an NLP model, and every result
 * can be explained by pointing at the matched word.
 */
export const TOPICS: { id: string; label: string; patterns: RegExp }[] = [
  {
    id: "cleanliness",
    label: "Cleanliness",
    patterns:
      /\b(clean\w*|dirt\w*|filth\w*|stain\w*|dust\w*|mou?ld\w*|hair|smell\w*|smelt|stink\w*|odou?r\w*|grim\w*|hygien\w*|cockroach\w*|roach\w*|bed ?bugs?|insects?|bugs?|spotless|tidy|untidy|musty|sheets? (were|was) (not|un))\b/i,
  },
  {
    id: "checkin",
    label: "Check-in experience",
    patterns:
      /\b(check[- ]?in\w*|check[- ]?out\w*|key ?(box|code|card|safe)|keys?|lock ?box|access code|codes?|self[- ]check\w*|arrival|arrived|late arrival|waited|waiting|instructions?|front desk|reception\w*|24 ?h(ou)?rs?)\b/i,
  },
  {
    id: "staff",
    label: "Staff & service",
    patterns:
      /\b(staff|receptionist\w*|manager|employee\w*|host|service|rude\w*|friendly|unfriendly|helpful|unhelpful|polite|impolite|attitude|customer service|welcom\w*|responsive|communicat\w*|(called|phoned|emailed) (them|the hotel))\b/i,
  },
  {
    id: "noise",
    label: "Noise",
    patterns:
      /\b(nois\w*|loud\w*|quiet\w*|sound\w*|thin walls?|traffic|party|parties|music|construction|banging|slamming|shouting|earplugs?|stadium|pub|bar next door)\b/i,
  },
  {
    id: "facilities",
    label: "Facilities",
    patterns:
      /\b(wi-?fi|internet|air ?con\w*|aircon|a\/c|heat\w*|lift|elevator|stairs|parking|car ?park|kitchen\w*|fridge|microwave|kettle|tv|television|laundry|breakfast|pool|gym|facilit\w*|amenit\w*|lounge|balcony|towels?|toiletries|hairdryer)\b/i,
  },
  {
    id: "location",
    label: "Location",
    patterns:
      /\b(location|located|central|walk\w*|walking distance|close to|near\w*|transport|station|bus|train|tram|light rail|restaurants?|cafes?|shops?|neighbou?rhood|area|suburb|cbd|city)\b/i,
  },
  {
    id: "room",
    label: "Room condition",
    patterns:
      /\b(rooms?|bed\w*|mattress\w*|pillows?|small|tiny|cramped|spacious|size|old|dated|tired|run[- ]?down|broken|worn|renovat\w*|maintenance|furniture|carpet\w*|window\w*|curtains?|blinds?|lighting|comfort\w*|uncomfortable)\b/i,
  },
  {
    id: "bathroom",
    label: "Bathroom & hot water",
    patterns:
      /\b(bathroom\w*|shower\w*|toilet\w*|hot water|water pressure|drain\w*|sink|basin|bath|ensuite|shared bathroom|leak\w*)\b/i,
  },
  {
    id: "value",
    label: "Value for money",
    patterns:
      /\b(price\w*|pric(ey|y)|value|money|expensive|overpriced|cheap\w*|cost\w*|worth|budget|afford\w*|fees?|charged?|deposit|refund\w*|bargain)\b/i,
  },
];

export const topicLabel = (id: string) =>
  TOPICS.find((t) => t.id === id)?.label ?? id;

/** Score thresholds (Booking.com scores are 1–10). */
export const POSITIVE_MIN = 8;
export const NEGATIVE_BELOW = 6;

export function sentimentFor(score: number): Sentiment {
  if (score >= POSITIVE_MIN) return "positive";
  if (score < NEGATIVE_BELOW) return "negative";
  return "mixed";
}

/** "Disliked" text that actually means "nothing to complain about". */
const NOTHING_RE =
  /^\s*(n\/?a|na|nil|none|nothing\.?|nothing (at all|really|to (dislike|complain about|report|mention))|no complaints?|no|-+|\.+|all good|everything was (good|great|perfect|fine))\s*[.!]*\s*$/i;

export function isEmptyComplaint(text: string): boolean {
  return !text.trim() || NOTHING_RE.test(text.trim());
}

export function topicsFor(liked: string, disliked: string): TopicHit[] {
  const hits: TopicHit[] = [];
  const dis = isEmptyComplaint(disliked) ? "" : disliked;
  for (const t of TOPICS) {
    if (dis && t.patterns.test(dis)) hits.push({ topic: t.id, polarity: "complaint" });
    if (liked && t.patterns.test(liked)) hits.push({ topic: t.id, polarity: "praise" });
  }
  return hits;
}

export function classify(r: Review): ClassifiedReview {
  // The title is written by the guest and often summarises the main point;
  // we attach it to the side that matches the overall score.
  const s = sentimentFor(r.score);
  const liked = s === "positive" ? `${r.title} ${r.liked}` : r.liked;
  const disliked = s === "negative" ? `${r.title} ${r.disliked}` : r.disliked;
  return { ...r, sentiment: s, topics: topicsFor(liked, disliked) };
}
