export type Property = {
  id: string;
  name: string;
  slug: string; // Booking.com URL slug
  url: string;
};

export const PROPERTIES: Property[] = [
  {
    id: "paddington",
    name: "Olympic Hotel Paddington",
    slug: "olympic-paddington",
    url: "https://www.booking.com/hotel/au/olympic-paddington.html",
  },
  {
    id: "potts-point",
    name: "Potts Point",
    slug: "venus-potts-point-sydney",
    url: "https://www.booking.com/hotel/au/venus-potts-point-sydney.html",
  },
  {
    id: "central-sydney",
    name: "Central Sydney",
    slug: "venus-surry-hills",
    url: "https://www.booking.com/hotel/au/venus-surry-hills.html",
  },
  {
    id: "darling-harbour",
    name: "Darling Harbour",
    slug: "chateau-de-venus",
    url: "https://www.booking.com/hotel/au/chateau-de-venus.html",
  },
];

export const propertyName = (id: string) =>
  PROPERTIES.find((p) => p.id === id)?.name ?? id;
