import axiosClient from "./client";

const investmentApi = {
  getCatalogues: () => axiosClient.get("/investments/catalogues"),
  getPortfolio: (params = {}) => axiosClient.get("/investments/portfolio", { params }),
  getSymbolDetail: (ticker, params = {}) =>
    axiosClient.get(`/investments/symbols/${encodeURIComponent(ticker)}`, { params }),
  getWalletsSummary: () => axiosClient.get("/investments/wallets/summary"),
  getOperations: (params = {}) => axiosClient.get("/investments/operations", { params }),
  createOperation: (data) => axiosClient.post("/investments/operations", data),
  createOperationsBulk: (operations) =>
    axiosClient.post("/investments/operations/bulk", { operations }),
  updateOperation: (id, data) => axiosClient.put(`/investments/operations/${id}`, data),
  deleteOperation: (id) => axiosClient.delete(`/investments/operations/${id}`),
};

export default investmentApi;
