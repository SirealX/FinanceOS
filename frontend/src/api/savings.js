import client from "./client";

export const getSavings = () => client.get("/savings");
export const createSavingsGoal = (data) => client.post("/savings", data);
export const updateSavingsGoal = (id, data) =>
  client.put(`/savings/${id}`, data);
export const logContribution = (id, amount) =>
  client.put(`/savings/${id}/contribute`, { amount });
export const deleteSavingsGoal = (id) => client.delete(`/savings/${id}`);
