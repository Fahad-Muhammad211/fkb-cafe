// When MongoDB cannot be used, the Admin login and sign-up APIs answer 503 with a message that names the
// cause (blocked or refused connection, invalid URI, placeholder password) instead of a generic one, and
// never include the connection string or credentials. Runs `next start` with a deliberately broken
// MONGODB_URI; no database is ever reached.
//
// Run: npm run build, then node --test tests/database-errors.test.mjs

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { json, randomGmail, startTestEnvironment, TEST_PASSWORD } from "./harness.mjs";

const SECRET_USER = "secretuser";
const SECRET_PASS = "SuperSecretPass123";

const cases = [
  {
    name: "a refused connection (like an Atlas IP block)",
    uri: `mongodb://${SECRET_USER}:${SECRET_PASS}@127.0.0.1:1/?directConnection=true`,
    code: "database_network_blocked",
    message: /refused the connection.*Network Access/i,
  },
  { name: "an invalid connection string", uri: "not-a-mongodb-uri", code: "database_invalid_uri", message: /not valid/i },
  {
    name: "a password placeholder left in the URI",
    uri: `mongodb+srv://${SECRET_USER}:<db_password>@cluster0.example.mongodb.net/`,
    code: "database_not_configured",
    message: /not configured/i,
  },
];

for (const c of cases) {
  describe(`database error: ${c.name}`, () => {
    let env;
    before(async () => {
      env = await startTestEnvironment({ dbEnv: { MONGODB_URI: c.uri } });
    });
    after(async () => {
      await env?.stop();
    });

    test("login and sign-up return 503 with the specific cause and no secrets", async () => {
      const login = await json("POST", `${env.base}/api/admin/session`, { body: { email: randomGmail(), password: TEST_PASSWORD } });
      const signup = await json("POST", `${env.base}/api/admin/accounts`, { body: { name: "Db Check", email: randomGmail(), password: TEST_PASSWORD } });
      for (const [label, res] of [["login", login], ["sign-up", signup]]) {
        assert.equal(res.status, 503, `${label}: ${res.text}`);
        assert.equal(res.data.code, c.code, `${label}: ${res.text}`);
        assert.match(res.data.error, c.message, label);
        for (const secret of [SECRET_USER, SECRET_PASS, c.uri, "127.0.0.1", "example.mongodb.net"]) {
          assert.equal(res.text.includes(secret), false, `${label} response leaked "${secret}"`);
        }
      }
      // The server log names the cause too, with the credentials removed.
      const log = env.serverLog.join("");
      assert.match(log, /\[api\]/);
      assert.equal(log.includes(SECRET_PASS), false, "the password reached the server log");
    });
  });
}
