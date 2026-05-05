import client from "./client";

export const getDebts        = ()         => client.get("/debts/");
export const getCreditCards  = ()         => client.get("/debts/credit-cards");
export const createDebt      = (data)     => client.post("/debts/", data);
export const updateDebt      = (id, data) => client.put(`/debts/${id}`, data);
export const deleteDebt      = (id)       => client.delete(`/debts/${id}`);
export const payDebt         = (id, data) => client.post(`/debts/${id}/pay`, data);
export const chargeDebt      = (id, data) => client.post(`/debts/${id}/charge`, data);
export const getAmortization = (id)       => client.get(`/debts/${id}/amortization`);
