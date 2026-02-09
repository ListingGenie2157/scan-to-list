
# Fix Title Pipeline: 3 Surgical Changes

The ChatGPT analysis is correct. Here are the three problems and exact fixes:

## Problem 1: Deterministic title is built but not stored in `title`

**Current code** (line 603): `title: cleaned.masthead_title` -- stores only the raw masthead.
The good deterministic title (with keywords, issue info, etc.) goes into `suggested_title` only.

Since the UI displays `item.title || item.suggested_title`, users see the weak masthead-only value.

**Fix**: Set `title: deterministic_title` in the `inventory_items` upsert (line 603). Keep `suggested_title: deterministic_title` as well for backward compatibility.

---

## Problem 2: Auto-optimize overwrites `suggested_title` with AI-generated title

**Current code** (line 729): When `autoOptimize` is on, the AI's rewritten title replaces `suggested_title`, undoing the deterministic builder.

**Fix**: Remove the title from the auto-optimize update payload. AI should only write `description` (and optionally `suggested_price`). The deterministic title stays untouched.

Change lines 728-731 from:
```text
const optimizeUpdatePayload = {
  suggested_title: optimizeResult.optimizedListing.title,
  description: optimizeResult.optimizedListing.description,
};
```
to:
```text
const optimizeUpdatePayload = {
  description: optimizeResult.optimizedListing.description,
};
```

---

## Problem 3: Magazine misclassification + overzealous duplicate-word removal

**3a. Better magazine detection in the OCR prompt**: Add a rule to the vision prompt: "If a retail barcode or cover price is visible but no ISBN, treat as magazine." This catches craft magazines that don't say "Magazine" on the cover.

**3b. Fix duplicate-word removal**: The current dedup logic (lines 96-105) removes ALL repeated words, which strips useful words like "and", "&", or intentionally repeated brand names. Change it to only remove obvious consecutive duplicates like "Magazine Magazine" instead of global dedup.

---

## Summary of file changes

**File: `supabase/functions/process-book-cover/index.ts`**
1. Line 603: change `title: cleaned.masthead_title` to `title: deterministic_title`
2. Lines 96-105: Replace global word dedup with consecutive-only dedup (e.g., "Magazine Magazine" becomes "Magazine", but "Arts and Crafts and More" keeps both "and"s)
3. Line 729: Remove `suggested_title` from auto-optimize update payload (AI only writes description)
4. Lines 162-194: Add magazine detection rule to VISION_PROMPT: "If a retail barcode or cover price box is visible but no ISBN, set item_type = magazine"

**File: `supabase/functions/generate-ebay-listing/index.ts`**
5. Apply the same consecutive-only dedup fix to `buildMagazineTitle` (lines ~85-105 in that file)

After editing, redeploy both edge functions.
