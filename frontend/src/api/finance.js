import axiosClient from "./client";

const financeApi = {
  // Catalogues
  getCatalogues: () => axiosClient.get("/finance/catalogues"),

  // Accounts
  getAccounts: () => axiosClient.get("/finance/accounts"),
  createAccount: (data) => axiosClient.post("/finance/accounts", data),
  updateAccount: (id, data) => axiosClient.put(`/finance/accounts/${id}`, data),
  deleteAccount: (id) => axiosClient.delete(`/finance/accounts/${id}`),

  // Import
  importExcel: (file) => {
    const form = new FormData();
    form.append("file", file);
    return axiosClient.post("/finance/import/excel", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  // Transactions
  getTransactions: (params = {}) =>
    axiosClient.get("/finance/transactions", { params }),
  getAllTransactions: (params = {}) =>
    axiosClient.get("/finance/transactions/all", { params }),
  updateTransaction: (id, data) =>
    axiosClient.put(`/finance/transactions/${id}`, data),
  unsplit: (id) =>
    axiosClient.post(`/finance/transactions/${id}/unsplit`),
  getPending: () => axiosClient.get("/finance/transactions/pending"),
  categorize: (id, data) =>
    axiosClient.put(`/finance/transactions/${id}/categorize`, data),
  split: (id, splits) =>
    axiosClient.post(`/finance/transactions/${id}/split`, { splits }),
  deleteTransaction: (id) =>
    axiosClient.delete(`/finance/transactions/${id}`),

  // Budgets
  getBudgets: (params = {}) => axiosClient.get("/finance/budgets", { params }),
  createBudgets: (data) => axiosClient.post("/finance/budgets", data),
  updateBudget: (id, data) => axiosClient.put(`/finance/budgets/${id}`, data),
  deleteBudget: (id) => axiosClient.delete(`/finance/budgets/${id}`),
  getBudgetComparison: (params = {}) =>
    axiosClient.get("/finance/budgets/comparison", { params }),
};

export default financeApi;
