# Scraping reconnaissance notes (2026-11-25)

## What we tested
| Approach | Result |
|---|---|
| Legacy `reviewlist.html?pagename=…` HTML fragment | **404**. Booking has removed this endpoint. |
| Hotel page `/hotel/au/<slug>.en-gb.html` in a real browser (Playwright) | Works. The first load passes through a bot challenge (`chal_t=` in the URL), then reviews are rendered. |
| Review data loaded by the page | The page calls the GraphQL operation `ReviewList` (`POST /dml/graphql`, persisted-query hash) whenever the user opens the reviews or changes page/sort. The response is clean JSON. |
| Calling Booking's internal API directly from a script (no browser) | **Not used.** We deliberately only read what the public page loads for a normal visitor. |

## Chosen method
Playwright (headless Chromium) behaves like a visitor:
1. Open the property page, accept/dismiss the cookie banner.
2. Open "Read all reviews", choose **Newest first** in `select[data-testid="reviews-sorter-component"]`.
3. Click `button[aria-label="Next page"]` until we reach reviews we already have (incremental) or the last page (full backfill).
4. **Primary parser:** listen to the page's own `ReviewList` network responses (`page.on('response')`) and read the structured JSON.
5. **Fallback parser:** if no JSON is captured (e.g. Booking changes the API), read the rendered cards via stable `data-testid` attributes.

## Fields available (ReviewList → `reviewCard[]`)
- `reviewUrl`: stable unique review ID → dedup key
- `reviewedDate` (unix seconds), `reviewScore` (0–10)
- `textDetails.title / positiveText / negativeText / lang / textTrivialFlag`
- `guestDetails.username / countryName / countryCode / guestTypeTranslation / anonymous`
- `bookingDetails.checkinDate / checkoutDate / numNights / customerType / roomType.name / stayStatus`
- `partnerReply.reply`: the hotel's response (lets us track "unanswered negative reviews")
- `helpfulVotesCount`, `isApproved`
- Page-level: `ratingScores[]` (sub-scores: staff, cleanliness, location…), `reviewsCount`

## DOM fallback selectors (`[data-testid=…]` inside `review-card`)
`review-avatar`, `review-room-name`, `review-num-nights`, `review-stay-date`, `review-traveler-type`, `review-date` ("Reviewed: 25 November 2026"), `review-title`, `review-score` ("Scored 5.0"), `review-positive-text`, `review-negative-text`.

## Observations / limitations
- The page header showed 129 reviews, but the list returned 74. Booking only lists part of its reviews (rating-only and older reviews appear to be left out). Our numbers describe the **listed** reviews.
- 10 reviews per UI page → roughly 8 page clicks per property for a full backfill.
- Olympic Paddington: hotelId 16211291, overall score 6.4.
