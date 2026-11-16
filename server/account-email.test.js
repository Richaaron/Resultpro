import assert from "node:assert/strict";
import { test } from "node:test";
import { sendAccountWelcomeEmail, sendTeacherRegistrationEmail } from "./account-email.js";

const configuration = {
  apiKey: "test-key",
  from: "Aster <invites@example.com>",
  appBaseUrl: "https://aster.example.com",
};

test("emails new users their sign-in ID and password setup guidance without disclosing a password", async () => {
  let payload;
  const result = await sendAccountWelcomeEmail({
    email: "owner@example.com",
    userId: "account-123",
  }, {
    ...configuration,
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body);
      return { ok: true };
    },
  });

  assert.equal(result.status, "sent");
  assert.deepEqual(payload.to, ["owner@example.com"]);
  assert.match(payload.subject, /sign-in details/);
  assert.match(payload.text, /sign-in ID is your verified email address: owner@example\.com/);
  assert.match(payload.text, /account reference is: account-123/);
  assert.match(payload.text, /never emails passwords/);
  assert.match(payload.html, /https:\/\/aster\.example\.com/);
  assert.doesNotMatch(payload.text, /temporary password|password: \S+/i);
});

test("emails the teacher credentials to the school admin without adding a sign-in link", async () => {
  let payload;
  const result = await sendTeacherRegistrationEmail({
    adminEmail: "admin@example.com",
    teacherEmail: "teacher@example.com",
    teacherName: "Ada Okafor",
    teacherCode: "TCH-12345678",
    teacherPassword: "generated-secret-123",
    schoolName: "Harborview Academy",
  }, {
    ...configuration,
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body);
      return { ok: true };
    },
  });

  assert.equal(result.status, "sent");
  assert.deepEqual(payload.to, ["admin@example.com"]);
  assert.match(payload.text, /Teacher ID: TCH-12345678/);
  assert.match(payload.text, /Teacher password: generated-secret-123/);
  assert.match(payload.text, /Teacher sign-in email: teacher@example\.com/);
  assert.match(payload.text, /private channel/);
  assert.match(payload.text, /no account signup or email activation is required/);
  assert.doesNotMatch(payload.text, /https?:\/\//i);
  assert.doesNotMatch(payload.html, /href=/i);
  assert.match(payload.html, /Teacher password: <strong>generated-secret-123<\/strong>/);
});

test("reports missing email configuration without making a provider request", async () => {
  let requestCount = 0;
  const result = await sendTeacherRegistrationEmail({
    adminEmail: "admin@example.com",
    teacherEmail: "teacher@example.com",
    teacherName: "Ada Okafor",
    teacherCode: "TCH-12345678",
    teacherPassword: "generated-secret-123",
    schoolName: "Harborview Academy",
  }, {
    ...configuration,
    apiKey: "",
    fetchImpl: async () => { requestCount += 1; },
  });

  assert.equal(result.status, "not_configured");
  assert.equal(requestCount, 0);
});

test("reports provider and network failures without claiming email delivery", async () => {
  const providerFailure = await sendAccountWelcomeEmail({
    email: "owner@example.com",
    userId: "account-123",
  }, {
    ...configuration,
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  assert.equal(providerFailure.status, "failed");

  const networkFailure = await sendAccountWelcomeEmail({
    email: "owner@example.com",
    userId: "account-123",
  }, {
    ...configuration,
    fetchImpl: async () => { throw new Error("network unavailable"); },
  });
  assert.equal(networkFailure.status, "failed");
  assert.match(networkFailure.message, /could not be sent/);
});

test("rejects insecure app URLs for account welcome emails", async () => {
  let requestCount = 0;
  const result = await sendAccountWelcomeEmail({
    email: "owner@example.com",
    userId: "account-123",
  }, {
    ...configuration,
    appBaseUrl: "http://aster.example.com",
    fetchImpl: async () => { requestCount += 1; return { ok: true }; },
  });

  assert.equal(result.status, "failed");
  assert.equal(requestCount, 0);
});
