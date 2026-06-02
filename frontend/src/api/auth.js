import axiosClient from "./client";

const authApi = {
  register: (name, email, password) =>
    axiosClient.post("/auth/register", { name, email, password }),

  login: (email, password) =>
    axiosClient.post("/auth/login", { email, password }),

  refresh: () =>
    axiosClient.post("/auth/refresh"),

  me: () =>
    axiosClient.get("/auth/me"),

  logout: () =>
    axiosClient.post("/auth/logout"),
};

export default authApi;
