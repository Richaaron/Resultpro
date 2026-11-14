import assert from "node:assert/strict";
import { test } from "node:test";
import { sendInvitationEmail } from "./invitation-email.js";

const invitation = {
  email: "teacher@example.com",
  role: "teacher",
  teacherName: "Ada Okafor",
  schoolName: "Harborview Academy",
  schoolSlug: "harborview-academy-abc123",
  token: "A".repeat(43),
};

const configuration = {
  apiKey: "test-key",
  from: "Aster <invites@example.com>",
  appBaseUrl: "https://aster.example.com",
};

test("reports missing email configuration without making a provider request", async () => {
  let requestCount = 0;
  const result = await sendInvitationEmail(invitation, {
    ...configuration,
    apiKey: "",
    fetchImpl: async () => { requestCount += 1; },
  });

  assert.equal(result.status, "not_configured");
  assert.equal(requestCount, 0);
});

test("sends a role-specific invitation with the school activation URL", async () => {
  let request;
  const result = await sendInvitationEmail(invitation, {
    ...configuration,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true };
    },
  });
  const payload = JSON.parse(request.options.body);

  assert.equal(result.status, "sent");
  assert.equal(request.url, "https://api.resend.com/emails");
  assert.deepEqual(payload.to, [invitation.email]);
  assert.equal(payload.from, configuration.from);
  assert.match(payload.text, /https:\/\/aster\.example\.com\/school\/harborview-academy-abc123#invite=A{43}/);
  assert.match(payload.html, /Hello Ada Okafor/);
});

test("sends student invitations to the verified student or guardian email", async () => {
  let payload;
  const result = await sendInvitationEmail({
    ...invitation,
    email: "guardian@example.com",
    role: "student",
    teacherName: undefined,
  }, {
    ...configuration,
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body);
      return { ok: true };
    },
  });

  assert.equal(result.status, "sent");
  assert.deepEqual(payload.to, ["guardian@example.com"]);
  assert.match(payload.text, /student portal/);
});

test("escapes untrusted school and teacher names in invitation HTML", async () => {
  let payload;
  await sendInvitationEmail({
    ...invitation,
    teacherName: "<img src=x>",
    schoolName: "<script>alert(1)</script>",
  }, {
    ...configuration,
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body);
      return { ok: true };
    },
  });

  assert.doesNotMatch(payload.html, /<script>|<img/);
  assert.match(payload.html, /&lt;script&gt;/);
  assert.match(payload.html, /&lt;img/);
});

test("reports provider and network failures for manual follow-up", async () => {
  const providerFailure = await sendInvitationEmail(invitation, {
    ...configuration,
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  assert.equal(providerFailure.status, "failed");
  assert.match(providerFailure.message, /send it manually/);

  const networkFailure = await sendInvitationEmail(invitation, {
    ...configuration,
    fetchImpl: async () => { throw new Error("network unavailable"); },
  });
  assert.equal(networkFailure.status, "failed");
  assert.match(networkFailure.message, /send it manually/);
});

test("rejects insecure non-local app URLs before sending", async () => {
  let requestCount = 0;
  const result = await sendInvitationEmail(invitation, {
    ...configuration,
    appBaseUrl: "http://aster.example.com",
    fetchImpl: async () => { requestCount += 1; return { ok: true }; },
  });

  assert.equal(result.status, "failed");
  assert.equal(requestCount, 0);
});
