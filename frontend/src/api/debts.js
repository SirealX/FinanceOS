import client from "./client";

export const getDebts = () => client.get("/debts");
export const createDebt = (data) => client.post("/debts", data);
export const updateDebt = (id, data) => client.put(`/debts/${id}`, data);
export const deleteDebt = (id) => client.delete(`/debts/${id}`);
export const payDebt = (id, data) => client.post(`/debts/${id}/pay`, data);
