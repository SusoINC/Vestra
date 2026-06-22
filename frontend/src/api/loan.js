import axiosClient from "./client";

const loanApi = {
  list: () => axiosClient.get("/loans"),
  get: (id, params = {}) => axiosClient.get(`/loans/${id}`, { params }),
  create: (data) => axiosClient.post("/loans", data),
  update: (id, data) => axiosClient.put(`/loans/${id}`, data),
  remove: (id) => axiosClient.delete(`/loans/${id}`),
  simulate: (id, params) => axiosClient.get(`/loans/${id}/simulate`, { params }),
  euriborHistory: () => axiosClient.get("/loans/euribor/history"),
};

export default loanApi;
