import client from "./client";

export const getBills = () => client.get("/bills/");
export const createBill = (data) => client.post("/bills/", data);
export const updateBill = (id, data) => client.put(`/bills/${id}`, data);
export const deleteBill = (id) => client.delete(`/bills/${id}`);
