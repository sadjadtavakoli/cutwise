# Firebase Auth & Firestore — Design Spec

## Overview

Add user authentication (Google sign-in) and cloud storage (Firestore) to CutWise. Signed-in users can save/load projects and stock lists across devices. Non-signed-in users can use the app fully (enter data, optimize) but cannot save — clicking Save triggers a sign-in prompt.

## User Flow

### Not signed in
- App works normally: enter pieces, enter stock, optimize, get results
- "Save" buttons (project + stock list) are visible but trigger a sign-in modal when clicked
- Modal message: "Sign in to save your projects and access them from any device"
- Google sign-in button in the modal
- Load Presets still works (hardcoded, no auth)
- Export/Import JSON still works (local file operations, no auth)
- Project/stock list dropdowns are empty (nothing to load)

### Signed in
- Small user indicator in the header: avatar + display name + "Sign out" link
- Save/load/delete projects and stock lists work via Firestore
- Project and stock list dropdowns populate from Firestore on page load
- After signing in via the save-button modal, the save action completes automatically
- Constraints are saved per user in Firestore

### Sign out
- Clicking "Sign out" clears auth state
- Dropdowns empty, user indicator disappears
- App continues to work for entering data and optimizing

## Firebase Setup

### Project
- User creates a Firebase project at console.firebase.google.com (free Spark plan)
- Enables Google sign-in provider in Authentication settings
- Creates a Firestore database (production mode)

### Firestore Data Structure

```
users/
  {userId}/
    projects/
      {projectName}/
        name: string
        pieces: [{ name, length, width, thickness, quantity, canGlueWidth, grainSensitive }]
    stockLists/
      {listName}/
        name: string
        items: [{ name, type, length, width, thickness, price, quantity }]
    constraints/
      settings/
        kerfWidth: number
        minGlueStripWidth: number
        maxGlueJoints: number
        overageMargin: number
```

### Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### SDK Loading

Firebase JS SDK v10 (modular) loaded from CDN via importmap. Lazy-loaded — not fetched until user interacts with auth (clicks Save or Sign In). Keeps the app fast for users who never sign in.

## Technical Integration

### New Files

- `js/firebase-config.js` — Firebase project credentials. User fills in after creating Firebase project. Exports the config object.
- `js/auth.js` — Handles Firebase Auth:
  - `initAuth()` — initialize Firebase app + auth, listen for auth state changes
  - `signInWithGoogle()` — trigger Google sign-in popup
  - `signOut()` — sign out
  - `onAuthStateChanged(callback)` — notify when user signs in/out
  - `getCurrentUser()` — returns current user or null
  - `isSignedIn()` — boolean
  - Shows/hides sign-in modal
- `js/firestore-storage.js` — Same interface as `storage.js` but backed by Firestore:
  - `createFirestoreStorage(userId)` — returns storage object with same API:
    - `saveProject(name, project)`
    - `loadProject(name)` → Promise
    - `deleteProject(name)`
    - `listProjects()` → Promise
    - `saveStockList(name, stockList)`
    - `loadStockList(name)` → Promise
    - `deleteStockList(name)`
    - `listStockLists()` → Promise
    - `saveConstraints(constraints)`
    - `loadConstraints()` → Promise
  - Note: methods return Promises (unlike localStorage storage which is synchronous)

### Modified Files

- `index.html` — Firebase CDN importmap entries, sign-in modal HTML, user indicator in header
- `js/app.js` — Auth-aware save/load:
  - `currentStorage` variable switches between localStorage and Firestore
  - Save buttons check `isSignedIn()` — if not, show modal; if yes, save
  - Auth state change handler: switch storage, refresh dropdowns
  - All storage calls become async (await)
- `css/style.css` — Modal overlay, modal content, user indicator styles

### Unchanged Files

- models.js, optimizer.js, ilp-optimizer.js, cost.js, greedy.js, scanner.js, presets.js, ui.js, storage.js

## Sign-In Modal

Simple centered overlay:
- Dark semi-transparent backdrop
- White card with:
  - "Sign in to CutWise" heading
  - "Save your projects and access them from any device" subtext
  - Google sign-in button (styled per Google brand guidelines)
  - "Cancel" link to dismiss
- Closes automatically after successful sign-in
- If triggered by a save button click, the save completes after sign-in

## Error Handling

- Firebase fails to load (CDN down): Save buttons show "Cloud save unavailable" toast. App continues working without save.
- Firestore write fails: Show brief error message, data not lost (still in the form).
- Auth popup blocked: Show message "Please allow popups for sign-in".
- Offline: Firestore has built-in offline persistence. Data syncs when back online.
