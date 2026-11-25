import { z } from "zod";

/** One guest review as stored (MongoDB document / JSON snapshot). */
export const ReviewSchema = z.object({
  id: z.string().min(1), // Booking's reviewUrl id, or a content hash (DOM fallback)
  propertyId: z.string(),
  score: z.number().min(0).max(10),
  reviewedAt: z.string(), // ISO timestamp (UTC)
  title: z.string().default(""),
  liked: z.string().default(""),
  disliked: z.string().default(""),
  lang: z.string().nullable().default(null),
  guestName: z.string().nullable().default(null),
  country: z.string().nullable().default(null),
  travellerType: z.string().nullable().default(null),
  room: z.string().nullable().default(null),
  nights: z.number().nullable().default(null),
  checkIn: z.string().nullable().default(null),
  checkOut: z.string().nullable().default(null),
  hotelReply: z.string().nullable().default(null),
  helpfulVotes: z.number().default(0),
  source: z.enum(["json", "dom"]),
  firstSeenAt: z.string(),
});
export type Review = z.infer<typeof ReviewSchema>;

export const ScrapeRunSchema = z.object({
  propertyId: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  status: z.enum(["ok", "degraded", "failed"]),
  pages: z.number(),
  seen: z.number(),
  inserted: z.number(),
  updated: z.number(),
  invalid: z.number(),
  listedOnBooking: z.number().nullable(),
  message: z.string().nullable(),
});
export type ScrapeRun = z.infer<typeof ScrapeRunSchema>;

export type Sentiment = "positive" | "mixed" | "negative";
export type TopicHit = { topic: string; polarity: "praise" | "complaint" };
export type ClassifiedReview = Review & {
  sentiment: Sentiment;
  topics: TopicHit[];
};
