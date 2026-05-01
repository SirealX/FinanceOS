/**
 * api/alerts.js — Axios wrappers for the alerts endpoints
 * Zero JSX. Zero business logic. Pure HTTP.
 */

import client from "./client";

const BASE = "/alerts";

export async function getAlerts(unreadOnly = false) {
  const res = await client.get(BASE + "/", {
    params: unreadOnly ? { unread_only: true } : {},
  });
  return res.data;
}

export async function getUnreadCount() {
  const res = await client.get(`${BASE}/unread-count`);
  return res.data;
}

export async function markRead(id) {
  const res = await client.put(`${BASE}/${id}/read`);
  return res.data;
}

export async function markAllRead() {
  const res = await client.put(`${BASE}/read-all`);
  return res.data;
}

export async function deleteAlert(id) {
  const res = await client.delete(`${BASE}/${id}`);
  return res.data;
}

export async function getAlertPreferences() {
  const res = await client.get(`${BASE}/preferences`);
  return res.data;
}

export async function updateAlertPreferences(data) {
  const res = await client.put(`${BASE}/preferences`, data);
  return res.data;
}

export async function connectTelegram(chatId) {
  const res = await client.post(`${BASE}/telegram/connect`, {
    chat_id: chatId,
  });
  return res.data;
}

export async function disconnectTelegram() {
  const res = await client.post(`${BASE}/telegram/disconnect`);
  return res.data;
}

export async function testTelegram() {
  const res = await client.post(`${BASE}/telegram/test`);
  return res.data;
}

export async function subscribePush(subscription) {
  const res = await client.post(`${BASE}/pwa/subscribe`, { subscription });
  return res.data;
}

export async function unsubscribePush() {
  const res = await client.post(`${BASE}/pwa/unsubscribe`);
  return res.data;
}
