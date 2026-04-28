import client from "./client";

export const getRecurring    = ()          => client.get("/recurring/");
export const createRecurring = (data)      => client.post("/recurring/", data);
export const updateRecurring = (id, data)  => client.put(`/recurring/${id}`, data);
export const deleteRecurring = (id)        => client.delete(`/recurring/${id}`);
export const logRecurring    = (id)        => client.post(`/recurring/${id}/log`);
