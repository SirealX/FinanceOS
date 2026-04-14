import client from "./client";

export const getTransactions = () => client.get("/transactions/");
export const createTransaction = (data) => client.post("/transactions/", data);
export const updateTransaction = (id, data) =>
  client.put(`/transactions/${id}`, data);
export const deleteTransaction = (id) => client.delete(`/transactions/${id}`);
