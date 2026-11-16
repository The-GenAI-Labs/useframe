// The refresh cookie belongs to the API host, so nothing on useframe.in can
// tell a signed-in visitor before the session check returns. This flag (no
// token, just "was signed in here") lets the first paint show the app shell
// instead of the signed-out landing page; crawlers never have it.
const SESSION_HINT_KEY = "uf-signed-in";

export const SESSION_HINT_SCRIPT = `try{if(localStorage.getItem("${SESSION_HINT_KEY}")==="1")document.documentElement.dataset.session="1"}catch(e){}`;

export function setSessionHint(signedIn: boolean): void {
  try {
    if (signedIn) {
      localStorage.setItem(SESSION_HINT_KEY, "1");
      document.documentElement.dataset.session = "1";
    } else {
      localStorage.removeItem(SESSION_HINT_KEY);
      delete document.documentElement.dataset.session;
    }
  } catch {
    // storage blocked: fall back to the plain loading behaviour
  }
}
