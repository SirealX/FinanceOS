import client from "./client";

export const getEarmarked    = ()         => client.get("/earmarked/");
export const createEarmarked = (data)     => client.post("/earmarked/", data);
export const updateEarmarked = (id, data) => client.put(`/earmarked/${id}`, data);
export const deleteEarmarked = (id)       => client.delete(`/earmarked/${id}`);
