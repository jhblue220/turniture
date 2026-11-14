/* ===========================================================================
   The two values `auth.js` needs to reach the project's own Firebase.

   Both are public by design — they only name the project, they do not open
   it. What actually guards the data is the Firebase rules, which say a
   signed-in person may touch their own document and nothing else. So these
   two sitting in a public repository is the normal arrangement, not a leak.

   A service account key is NOT one of these and must never come near this
   file: that one really is a master key.

   Where to find them:
     Firebase console → ⚙ Project settings → General → Your apps → Web app
   =========================================================================== */

const FIREBASE = {
  apiKey:    '',          // "AIza..."
  projectId: ''           // "turniture-xxxxx"
};
