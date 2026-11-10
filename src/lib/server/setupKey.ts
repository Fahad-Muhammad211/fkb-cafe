import "server-only";

// Switch for the one-time first-Admin signup. Admin signup is open only while no Admin exists, ADMIN_SETUP_KEY
// (at least 16 characters) is set in the server environment (.env.local or the host's environment
// settings), and the request comes from this machine (isLoopbackRequest in http.ts). The key is read here on the server only. It is never sent to the browser or
// typed into the UI. Without it, signup stays closed. Once the first Admin exists, signup is closed for
// good whatever the key says.

const MIN_KEY_LENGTH = 16;

export function isSetupKeyConfigured(): boolean {
  const key = process.env.ADMIN_SETUP_KEY?.trim() ?? "";
  return key.length >= MIN_KEY_LENGTH;
}
