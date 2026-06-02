import axios from "axios";

const axiosClient = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
});

// Attach access token from localStorage to every request
axiosClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Refresh token on 401
axiosClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refresh = localStorage.getItem("refresh_token");
        const { data } = await axios.post("/api/v1/auth/refresh", null, {
          headers: { Authorization: `Bearer ${refresh}` },
        });
        localStorage.setItem("access_token", data.data.access_token);
        original.headers.Authorization = `Bearer ${data.data.access_token}`;
        return axiosClient(original);
      } catch {
        localStorage.clear();
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default axiosClient;
