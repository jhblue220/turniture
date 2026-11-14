/* ===========================================================================
   Who is signed in. No DOM here — the page reads this and redraws, the way
   it does with `Cart`.

   Firebase Authentication over its plain REST interface, called with
   `fetch`. Firebase also ships a JavaScript library, but this site is
   written without libraries and there is no build step to feed one through,
   and the REST interface asks for nothing the browser cannot already do.

   Two tokens come back from a sign-in:

     idToken       proves who you are to Firebase. Lasts an hour.
     refreshToken  buys a fresh idToken. Lasts until you sign out.

   Both are kept in localStorage so a reload does not sign you out. Signing
   out is a matter of dropping them — the server keeps no session to end.
   =========================================================================== */

const Auth = (() => {

  const ID   = 'https://identitytoolkit.googleapis.com/v1/accounts:';
  const TOK  = 'https://securetoken.googleapis.com/v1/token';
  const KEEP = 'turniture.auth';

  /* An idToken is swapped out before it actually expires — a request that
     sets off mid-swap would otherwise come back unauthorised. */
  const EARLY = 5 * 60 * 1000;

  let me = null;                       // { uid, email, idToken, refreshToken, at }
  let pending = null;                  // the refresh in flight, so two callers share one
  const watchers = [];

  const ready = () => !!(FIREBASE.apiKey && FIREBASE.projectId);
  const emit  = () => watchers.forEach(f => f(user()));

  /* ── keeping it across reloads ─────────────────────────────────────────
     A browser in private mode throws rather than storing, and some refuse
     to read back. Neither is worth breaking the page over: the person just
     has to sign in again. */

  function remember(){
    try {
      if (me) localStorage.setItem(KEEP, JSON.stringify(me));
      else    localStorage.removeItem(KEEP);
    } catch (e) { /* nothing kept; this session still works */ }
  }

  function recall(){
    try {
      const raw = localStorage.getItem(KEEP);
      if (raw) me = JSON.parse(raw);
    } catch (e) { me = null; }
  }

  /* ── talking to Firebase ───────────────────────────────────────────────
     Every failure arrives the same way: HTTP 400 with a short code in
     `error.message`. They are turned into something a person can read,
     and anything unrecognised falls back to the code itself rather than
     to silence. */

  const SAID = {
    EMAIL_EXISTS:              'That e-mail is already signed up.',
    EMAIL_NOT_FOUND:           'Wrong e-mail or password.',
    INVALID_PASSWORD:          'Wrong e-mail or password.',
    INVALID_LOGIN_CREDENTIALS: 'Wrong e-mail or password.',
    INVALID_EMAIL:             'That is not an e-mail address.',
    MISSING_PASSWORD:          'Put in a password.',
    USER_DISABLED:             'That account has been turned off.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many tries. Give it a minute.',
    OPERATION_NOT_ALLOWED:     'E-mail sign-in is switched off in Firebase.'
  };

  function said(code){
    if (!code) return 'Something went wrong. Try again.';
    // WEAK_PASSWORD arrives as "WEAK_PASSWORD : Password should be at least…"
    const head = code.split(' ')[0];
    if (head === 'WEAK_PASSWORD') return 'Password needs 6 characters or more.';
    return SAID[head] || head.replace(/_/g, ' ').toLowerCase();
  }

  async function ask(what, body){
    if (!ready()) throw new Error('Firebase is not configured yet.');
    const r = await fetch(`${ID}${what}?key=${FIREBASE.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(said(out.error && out.error.message));
    return out;
  }

  /* what a sign-up and a sign-in both hand back */
  function took(out){
    me = {
      uid:          out.localId,
      email:        out.email,
      idToken:      out.idToken,
      refreshToken: out.refreshToken,
      at:           Date.now() + (+out.expiresIn || 3600) * 1000
    };
    remember();
    emit();
    return user();
  }

  /* ── in and out ────────────────────────────────────────────────────── */

  const signUp = (email, password) =>
    ask('signUp', { email, password, returnSecureToken: true }).then(took);

  const signIn = (email, password) =>
    ask('signInWithPassword', { email, password, returnSecureToken: true }).then(took);

  const resetPassword = email =>
    ask('sendOobCode', { requestType: 'PASSWORD_RESET', email }).then(() => true);

  function signOut(){
    me = null;
    pending = null;
    remember();
    emit();
  }

  /* ── the hourly swap ───────────────────────────────────────────────────
     `token()` is what the rest of the site calls before a request that has
     to be signed. It hands back one that is good for a while yet, trading
     the refresh token in first if the current one is close to running out.

     A refresh that is refused means the account is gone or the token was
     withdrawn, and the only honest answer is to sign the person out. */

  async function token(){
    if (!me) return null;
    if (Date.now() < me.at - EARLY) return me.idToken;
    if (pending) return pending;

    pending = (async () => {
      const r = await fetch(`${TOK}?key=${FIREBASE.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(me.refreshToken)}`
      });
      if (!r.ok) { signOut(); return null; }
      const out = await r.json();
      me.idToken      = out.id_token;
      me.refreshToken = out.refresh_token || me.refreshToken;
      me.at           = Date.now() + (+out.expires_in || 3600) * 1000;
      remember();
      return me.idToken;
    })().finally(() => { pending = null; });

    return pending;
  }

  /* Nobody outside needs the tokens, so what goes out is the person. */
  const user = () => (me ? { uid: me.uid, email: me.email } : null);

  recall();
  /* A token left over from last time may already be stale; swapping it now
     means the first signed request does not have to wait, and a withdrawn
     account is noticed at once rather than on the first save. */
  if (me) token();

  return {
    signUp, signIn, signOut, resetPassword, token, user,
    ready,
    inAt:     () => !!me,
    onChange: f => { watchers.push(f); return f; }
  };
})();
