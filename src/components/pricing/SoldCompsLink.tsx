// File: src/components/pricing/SoldCompsLink.tsx
// Purpose: One-click open of eBay sold & completed search.
// ============================================================================
export function SoldCompsLink({ query }: { query: string }) {
  const url = new URL("https://www.ebay.com/sch/i.html");
  url.searchParams.set("_nkw", query);
  url.searchParams.set("LH_Sold", "1");
  url.searchParams.set("LH_Complete", "1");
  return (
    <a href={url.toString()} target="_blank" rel="noreferrer" className="underline text-sm">Check sold comps</a>
  );
}