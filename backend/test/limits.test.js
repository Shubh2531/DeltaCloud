import test from "node:test";
import assert from "node:assert/strict";
import { LIMITS, apiKey, authKey, emailOf, ipOf } from "../src/lib/limits.js";

const req = (ip, body = {}, headers = {}) => ({ ip, body, headers });

test("students on the same campus Wi-Fi get separate sign-in buckets", () => {
  const campus = "203.0.113.7";
  const a = authKey(req(campus, { email: "amy@school.edu" }));
  const b = authKey(req(campus, { email: "ben@school.edu" }));
  assert.notEqual(a, b);
});

test("one person retrying is counted in one bucket, whatever the email casing or spacing", () => {
  const ip = "198.51.100.4";
  assert.equal(authKey(req(ip, { email: " Amy@School.edu " })), authKey(req(ip, { email: "amy@school.edu" })));
});

test("a room of 300 signing up at once fits under the shared-network ceiling", () => {
  // Register + verify + one resend, per student.
  const requestsPerStudent = 3;
  assert.ok(300 * requestsPerStudent <= LIMITS.authPerIp.limit);
  // But one person still can't hammer the sign-in steps.
  assert.ok(LIMITS.authPerPerson.limit <= 20);
});

test("signed-in users are counted per session, signed-out per IP", () => {
  const ip = "192.0.2.10";
  const token = "a".repeat(40) + "XYZ";
  assert.equal(apiKey(req(ip, {}, { authorization: `Bearer ${token}` })), `t:${token.slice(-32)}`);
  assert.equal(apiKey(req(ip)), `ip:${ip}`);
  // Too-short or malformed headers fall back to the IP.
  assert.equal(apiKey(req(ip, {}, { authorization: "Bearer short" })), `ip:${ip}`);
  assert.equal(apiKey(req(ip, {}, { authorization: "Basic abcdefghijklmnopqrstuvwxyz" })), `ip:${ip}`);
});

test("keys stay short and safe with odd input", () => {
  assert.equal(emailOf({}), "");
  assert.equal(emailOf(req("1.1.1.1", { email: 12345 })), "12345");
  assert.equal(emailOf(req("1.1.1.1", { email: "x".repeat(1000) })).length, 254);
  assert.equal(ipOf({}), "unknown");
  assert.equal(ipOf({ socket: { remoteAddress: "10.0.0.1" } }), "10.0.0.1");
});
