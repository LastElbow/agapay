import {
  env,
  normalizeBaseUrl,
  getJson,
  postJson,
  fetchJson,
  sleep,
} from "../onboarding-e2e/lib.mjs";
import { registerAndVerifyOtp } from "../onboarding-e2e/auth.mjs";

import { HubConnectionBuilder, HttpTransportType } from "@microsoft/signalr";

function baseUrl() {
  return normalizeBaseUrl(env("AGAPAY_API_BASE_URL", "http://localhost:5211"));
}

function asAuth(accessToken) {
  return { accessToken };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hubBase(base) {
  return String(base).replace(/\/?api$/i, "");
}

function pick(obj, ...keys) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
  }
  return undefined;
}

function normalizeId(value) {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

async function connectChatHub({ base, accessToken }) {
  const connection = new HubConnectionBuilder()
    .withUrl(`${hubBase(base)}/hubs/chat`, {
      accessTokenFactory: () => accessToken,
      transport: HttpTransportType.WebSockets,
      skipNegotiation: true,
    })
    .withAutomaticReconnect()
    .build();

  await connection.start();
  return connection;
}

function waitForEvent({ connection, eventName, predicate, timeoutMs = 8000 }) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);

    const handler = (payload) => {
      try {
        if (!predicate || predicate(payload)) {
          cleanup();
          resolve(payload);
        }
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    function cleanup() {
      clearTimeout(timer);
      try {
        connection.off(eventName, handler);
      } catch {}
    }

    connection.on(eventName, handler);
  });
}

async function sendTextMessage({ connection, receiverUserId, content }) {
  await connection.invoke("SendMessage", {
    receiverId: receiverUserId,
    content,
    messageType: "TEXT",
  });
}

async function sendImageMessage({
  connection,
  receiverUserId,
  imagePath,
  content = "",
}) {
  await connection.invoke("SendMessage", {
    receiverId: receiverUserId,
    content,
    imagePath,
    messageType: "IMAGE",
  });
}

async function fetchConversations({ base, accessToken }) {
  const res = await getJson(
    base,
    "/api/chat/conversations",
    asAuth(accessToken),
  );
  if (!res.ok) {
    throw new Error(
      `GET /api/chat/conversations failed ${res.status}: ${res.text}`,
    );
  }
  return Array.isArray(res.data) ? res.data : [];
}

async function fetchChatHistory({ base, accessToken, otherUserId }) {
  const res = await getJson(
    base,
    `/api/chat/history/${otherUserId}?limit=50`,
    asAuth(accessToken),
  );
  if (!res.ok) {
    throw new Error(
      `GET /api/chat/history/${otherUserId} failed ${res.status}: ${res.text}`,
    );
  }
  return res.data ?? null;
}

async function markHistoryRead({ base, accessToken, otherUserId }) {
  const res = await postJson(
    base,
    `/api/chat/history/${otherUserId}/read`,
    {},
    asAuth(accessToken),
  );
  if (!res.ok) {
    throw new Error(
      `POST /api/chat/history/${otherUserId}/read failed ${res.status}: ${res.text}`,
    );
  }
  return res.data ?? null;
}

async function endConversation({ base, accessToken, otherUserId }) {
  const res = await postJson(
    base,
    `/api/chat/conversations/${otherUserId}/end`,
    {},
    asAuth(accessToken),
  );
  if (!res.ok) {
    throw new Error(
      `POST /api/chat/conversations/${otherUserId}/end failed ${res.status}: ${res.text}`,
    );
  }
  return res.data ?? null;
}

async function reopenConversation({ base, accessToken, otherUserId }) {
  const res = await postJson(
    base,
    `/api/chat/conversations/${otherUserId}/reopen`,
    {},
    asAuth(accessToken),
  );
  if (!res.ok) {
    throw new Error(
      `POST /api/chat/conversations/${otherUserId}/reopen failed ${res.status}: ${res.text}`,
    );
  }
  return res.data ?? null;
}

async function blockUser({ base, accessToken, otherUserId }) {
  const res = await postJson(
    base,
    `/api/chat/block/${otherUserId}`,
    {},
    asAuth(accessToken),
  );
  if (!res.ok) {
    throw new Error(
      `POST /api/chat/block/${otherUserId} failed ${res.status}: ${res.text}`,
    );
  }
  return res.data ?? null;
}

async function unblockUser({ base, accessToken, otherUserId }) {
  const url = `${normalizeBaseUrl(base)}/api/chat/block/${otherUserId}`;
  const res = await fetchJson(url, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  // Backend returns 204 if not blocked.
  if (!res.ok && res.status !== 204) {
    throw new Error(
      `DELETE /api/chat/block/${otherUserId} failed ${res.status}: ${res.text}`,
    );
  }

  return res.data ?? null;
}

function findConversationForOther(conversations, otherUserId) {
  const needle = normalizeId(otherUserId);
  return conversations.find((c) => normalizeId(c?.otherUserId) === needle);
}

function normalizeMessageContent(m) {
  return String(pick(m, "content", "Content") ?? "");
}

function normalizeMessageType(m) {
  return String(pick(m, "messageType", "MessageType") ?? "TEXT").toUpperCase();
}

function normalizeImagePath(m) {
  return String(pick(m, "imagePath", "ImagePath") ?? "");
}

(async function main() {
  const base = baseUrl();
  console.log("Chat beyond proposals E2E smoke");
  console.log("  baseUrl:", base);

  const therapistAuth = await registerAndVerifyOtp({
    baseUrl: base,
    role: "PhysicalTherapist",
  });
  const patientAuth = await registerAndVerifyOtp({
    baseUrl: base,
    role: "Patient",
  });

  const therapistUserId = therapistAuth.user?.id ?? therapistAuth.user?.Id;
  const patientUserId = patientAuth.user?.id ?? patientAuth.user?.Id;

  assert(therapistUserId, "Therapist auth did not return user.id");
  assert(patientUserId, "Patient auth did not return user.id");

  console.log("Therapist userId:", therapistUserId);
  console.log("Patient userId  :", patientUserId);

  const therapistConn = await connectChatHub({
    base,
    accessToken: therapistAuth.accessToken,
  });
  const patientConn = await connectChatHub({
    base,
    accessToken: patientAuth.accessToken,
  });

  try {
    // ------------------------------------------------------------
    // 1) TEXT message realtime (ReceiveMessage) + persistence (history)
    // ------------------------------------------------------------
    const msg1 = `E2E chat text 1 ${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const therapistSeen1 = waitForEvent({
      connection: therapistConn,
      eventName: "ReceiveMessage",
      predicate: (p) => normalizeMessageContent(p) === msg1,
    });

    const patientSeen1 = waitForEvent({
      connection: patientConn,
      eventName: "ReceiveMessage",
      predicate: (p) => normalizeMessageContent(p) === msg1,
    });

    await sendTextMessage({
      connection: therapistConn,
      receiverUserId: patientUserId,
      content: msg1,
    });

    await therapistSeen1;
    await patientSeen1;

    // Give the server a moment to persist and update summaries
    await sleep(250);

    const patientConvos1 = await fetchConversations({
      base,
      accessToken: patientAuth.accessToken,
    });
    const patientSummary1 = findConversationForOther(
      patientConvos1,
      therapistUserId,
    );
    assert(
      patientSummary1,
      "Expected patient conversation summary after first message",
    );

    const unread1 = Number(
      pick(patientSummary1, "unreadCount", "UnreadCount") ?? 0,
    );
    assert(unread1 >= 1, `Expected unreadCount >= 1, got ${unread1}`);

    const history1 = await fetchChatHistory({
      base,
      accessToken: patientAuth.accessToken,
      otherUserId: therapistUserId,
    });

    const messages1 = Array.isArray(history1?.messages)
      ? history1.messages
      : [];
    const found1 = messages1.find(
      (m) =>
        normalizeMessageContent(m) === msg1 &&
        normalizeMessageType(m) === "TEXT",
    );
    assert(found1, "Expected message in patient chat history");

    // Also validate IMAGE messages (without requiring a real upload)
    const imagePath1 = `e2e/chat-${Date.now()}-${Math.random().toString(16).slice(2)}.png`;

    const therapistSeenImg1 = waitForEvent({
      connection: therapistConn,
      eventName: "ReceiveMessage",
      predicate: (p) =>
        normalizeMessageType(p) === "IMAGE" &&
        normalizeImagePath(p) === imagePath1,
    });

    const patientSeenImg1 = waitForEvent({
      connection: patientConn,
      eventName: "ReceiveMessage",
      predicate: (p) =>
        normalizeMessageType(p) === "IMAGE" &&
        normalizeImagePath(p) === imagePath1,
    });

    await sendImageMessage({
      connection: therapistConn,
      receiverUserId: patientUserId,
      imagePath: imagePath1,
    });
    await therapistSeenImg1;
    await patientSeenImg1;

    await sleep(250);

    const historyImg1 = await fetchChatHistory({
      base,
      accessToken: patientAuth.accessToken,
      otherUserId: therapistUserId,
    });

    const messagesImg1 = Array.isArray(historyImg1?.messages)
      ? historyImg1.messages
      : [];
    const foundImg1 = messagesImg1.find(
      (m) =>
        normalizeMessageType(m) === "IMAGE" &&
        normalizeImagePath(m) === imagePath1,
    );
    assert(foundImg1, "Expected image message in patient chat history");

    // ------------------------------------------------------------
    // 2) Mark as read -> unreadCount should drop
    // ------------------------------------------------------------
    const readRes = await markHistoryRead({
      base,
      accessToken: patientAuth.accessToken,
      otherUserId: therapistUserId,
    });

    const updated = Number(
      readRes?.UpdatedMessages ?? readRes?.updatedMessages ?? 0,
    );
    assert(updated >= 1, `Expected UpdatedMessages >= 1, got ${updated}`);

    await sleep(150);

    const patientConvos2 = await fetchConversations({
      base,
      accessToken: patientAuth.accessToken,
    });
    const patientSummary2 = findConversationForOther(
      patientConvos2,
      therapistUserId,
    );
    assert(
      patientSummary2,
      "Expected patient conversation summary after mark read",
    );

    const unread2 = Number(
      pick(patientSummary2, "unreadCount", "UnreadCount") ?? 0,
    );
    assert(
      unread2 === 0,
      `Expected unreadCount === 0 after read, got ${unread2}`,
    );

    // ------------------------------------------------------------
    // 3) Close conversation -> sending is rejected, then reopen
    // ------------------------------------------------------------
    const closedByPatientOnTherapist = waitForEvent({
      connection: therapistConn,
      eventName: "ConversationClosed",
      predicate: (p) =>
        normalizeId(p?.closedByUserId) === normalizeId(patientUserId),
    });

    const closedByPatientOnPatient = waitForEvent({
      connection: patientConn,
      eventName: "ConversationClosed",
      predicate: (p) =>
        normalizeId(p?.closedByUserId) === normalizeId(patientUserId),
    });

    await endConversation({
      base,
      accessToken: patientAuth.accessToken,
      otherUserId: therapistUserId,
    });
    await closedByPatientOnTherapist;
    await closedByPatientOnPatient;

    const msgClosed = `E2E chat should reject ${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const rejectedClosed = waitForEvent({
      connection: therapistConn,
      eventName: "MessageRejected",
      predicate: (p) =>
        String(p?.reason ?? "").toLowerCase() === "conversation_closed",
    });

    await sendTextMessage({
      connection: therapistConn,
      receiverUserId: patientUserId,
      content: msgClosed,
    });
    await rejectedClosed;

    const reopenedOnTherapist = waitForEvent({
      connection: therapistConn,
      eventName: "ConversationReopened",
      predicate: (p) =>
        normalizeId(p?.initiatorUserId) === normalizeId(patientUserId),
    });

    const reopenedOnPatient = waitForEvent({
      connection: patientConn,
      eventName: "ConversationReopened",
      predicate: (p) =>
        normalizeId(p?.initiatorUserId) === normalizeId(patientUserId),
    });

    await reopenConversation({
      base,
      accessToken: patientAuth.accessToken,
      otherUserId: therapistUserId,
    });
    await reopenedOnTherapist;
    await reopenedOnPatient;

    const msg2 = `E2E chat text 2 ${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const therapistSeen2 = waitForEvent({
      connection: therapistConn,
      eventName: "ReceiveMessage",
      predicate: (p) => normalizeMessageContent(p) === msg2,
    });

    const patientSeen2 = waitForEvent({
      connection: patientConn,
      eventName: "ReceiveMessage",
      predicate: (p) => normalizeMessageContent(p) === msg2,
    });

    await sendTextMessage({
      connection: therapistConn,
      receiverUserId: patientUserId,
      content: msg2,
    });

    await therapistSeen2;
    await patientSeen2;

    // ------------------------------------------------------------
    // 4) Block/unblock -> sending is rejected, then allowed again
    // ------------------------------------------------------------
    const blockedToPatient = waitForEvent({
      connection: patientConn,
      eventName: "BlockStatusChanged",
      predicate: (p) =>
        normalizeId(p?.blockedUserId) === normalizeId(therapistUserId) &&
        Boolean(p?.isBlocked),
    });

    const blockedToTherapist = waitForEvent({
      connection: therapistConn,
      eventName: "BlockedByOther",
      predicate: (p) =>
        normalizeId(p?.blockedByUserId) === normalizeId(patientUserId),
    });

    await blockUser({
      base,
      accessToken: patientAuth.accessToken,
      otherUserId: therapistUserId,
    });
    await blockedToPatient;
    await blockedToTherapist;

    const msgBlocked = `E2E chat should reject blocked ${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const rejectedBlocked = waitForEvent({
      connection: therapistConn,
      eventName: "MessageRejected",
      predicate: (p) =>
        String(p?.reason ?? "").toLowerCase() === "blocked_by_other",
    });

    await sendTextMessage({
      connection: therapistConn,
      receiverUserId: patientUserId,
      content: msgBlocked,
    });
    await rejectedBlocked;

    const unblockedToPatient = waitForEvent({
      connection: patientConn,
      eventName: "BlockStatusChanged",
      predicate: (p) =>
        normalizeId(p?.blockedUserId) === normalizeId(therapistUserId) &&
        p?.isBlocked === false,
    });

    const unblockedToTherapist = waitForEvent({
      connection: therapistConn,
      eventName: "UnblockedByOther",
      predicate: (p) =>
        normalizeId(p?.unblockedByUserId) === normalizeId(patientUserId),
    });

    await unblockUser({
      base,
      accessToken: patientAuth.accessToken,
      otherUserId: therapistUserId,
    });
    await unblockedToPatient;
    await unblockedToTherapist;

    const msg3 = `E2E chat text 3 ${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const therapistSeen3 = waitForEvent({
      connection: therapistConn,
      eventName: "ReceiveMessage",
      predicate: (p) => normalizeMessageContent(p) === msg3,
    });

    const patientSeen3 = waitForEvent({
      connection: patientConn,
      eventName: "ReceiveMessage",
      predicate: (p) => normalizeMessageContent(p) === msg3,
    });

    await sendTextMessage({
      connection: therapistConn,
      receiverUserId: patientUserId,
      content: msg3,
    });

    await therapistSeen3;
    await patientSeen3;

    console.log("Chat beyond proposals E2E: PASS");
  } finally {
    try {
      await therapistConn.stop();
    } catch {}
    try {
      await patientConn.stop();
    } catch {}
  }
})().catch((err) => {
  console.error("Chat beyond proposals E2E: FAIL");
  console.error(err?.stack || err);
  process.exitCode = 1;
});
