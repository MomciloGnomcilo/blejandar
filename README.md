# 🗓️ When Can We All Hang?

A group availability calendar. Everyone secretly marks their free hours — results only reveal once **everyone** has submitted.

---

## 🚀 Deploy in 15 minutes (Firebase + Vercel)

### Step 1 — Set up Firebase (free)

1. Go to **https://console.firebase.google.com**
2. Click **"Create a project"** → give it any name → Continue
3. Once created, click **"</> Web"** to add a web app → give it a name → Register
4. Copy the `firebaseConfig` object shown to you
5. Open `src/firebase.js` in this project and paste your config values in

Then set up the database:
6. In the Firebase console sidebar, click **"Firestore Database"**
7. Click **"Create database"**
8. Choose **"Start in test mode"** (good for 30 days, fine to start)
9. Pick any region → Done

---

### Step 2 — Run locally to test

```bash
npm install
npm start
```

Open http://localhost:3000 — create a group, share the link with yourself in another tab, submit picks, watch the reveal!

---

### Step 3 — Deploy to Vercel (free)

**Option A — GitHub (recommended):**
1. Push this folder to a GitHub repo
2. Go to **https://vercel.com** → sign up → "Add New Project"
3. Import your GitHub repo → click **Deploy**
4. Done! You get a live URL like `your-app.vercel.app`

**Option B — Vercel CLI:**
```bash
npm install -g vercel
vercel
```
Follow the prompts — it deploys automatically.

---

### Step 4 — Lock down Firebase (when ready)

Once tested, update your Firestore rules in the Firebase console:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /groups/{groupId} {
      allow read: if true;
      allow write: if true;
      // For production, tighten these rules as needed
    }
  }
}
```

---

## How it works

1. **Admin** creates a group with a fixed member list → gets a shareable link
2. **Each member** opens the link → picks their name → marks free hour blocks by clicking/dragging
3. **Hits Submit** → picks are locked permanently
4. **Once everyone submits** → results auto-reveal with celebration 🎉
5. Golden glowing cells = everyone is free at that time

---

## Project structure

```
src/
  App.js        ← entire app (screens: home, admin, group)
  firebase.js   ← your Firebase config goes here
  index.js      ← React entry point
public/
  index.html
package.json
```
