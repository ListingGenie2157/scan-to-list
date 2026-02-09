
# Make Title Keyword Toggles Easily Accessible

## Problem
The keyword toggles (New, Vintage, Free Shipping, etc.) exist in a `TitlePreferencesModal` but are hidden inside the Create Listing Modal behind a small gear icon. You have to select an item, click List, then find the gear button -- which is not discoverable.

## Solution
Add a dedicated "Title Preferences" button to the main Dashboard so you can configure your keywords once from the top level, without needing to open a listing first.

## Changes

### 1. Add a "Title Preferences" button to the Dashboard header
- In `src/components/Dashboard.tsx`, add a settings/gear button in the top action bar (near other settings buttons)
- Label it clearly: "Title Keywords" or "Listing Preferences"
- Clicking it opens the existing `TitlePreferencesModal`

### 2. No changes needed to TitlePreferencesModal
- The modal already has all the toggle functionality (Condition Keywords, Shipping Keywords, Custom Prefixes/Suffixes)
- It already saves to `user_profiles` via the `update_title_preferences` RPC

### 3. Keep the gear icon in CreateListingModal as well
- Users can still access it from inside a listing for quick adjustments

## Technical Details
- Import `TitlePreferencesModal` into `Dashboard.tsx`
- Add state: `const [showTitlePrefs, setShowTitlePrefs] = useState(false)`
- Add a button (e.g., with a `Settings` or `Tags` icon from lucide-react) in the dashboard header area
- Render `<TitlePreferencesModal isOpen={showTitlePrefs} onClose={() => setShowTitlePrefs(false)} />`

This is a small, focused change -- just wiring up an existing component to a more visible location.
