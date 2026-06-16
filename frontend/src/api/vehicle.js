import axiosClient from "./client";

const vehicleApi = {
  list: () => axiosClient.get("/vehicles"),
  get: (id) => axiosClient.get(`/vehicles/${id}`),
  create: (data) => axiosClient.post("/vehicles", data),
  update: (id, data) => axiosClient.put(`/vehicles/${id}`, data),
  remove: (id) => axiosClient.delete(`/vehicles/${id}`),

  listFuel: (id) => axiosClient.get(`/vehicles/${id}/fuel`),
  createFuel: (id, data) => axiosClient.post(`/vehicles/${id}/fuel`, data),
  updateFuel: (logId, data) => axiosClient.put(`/vehicles/fuel/${logId}`, data),
  deleteFuel: (logId) => axiosClient.delete(`/vehicles/fuel/${logId}`),
};

export default vehicleApi;
