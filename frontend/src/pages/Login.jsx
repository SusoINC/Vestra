import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import authApi from "../api/auth";
import useAuthStore from "../store/authStore";

const schema = z.object({
  email: z.string().email("Email no válido"),
  password: z.string().min(1, "Contraseña obligatoria"),
});

export default function Login() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [apiError, setApiError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async ({ email, password }) => {
    setApiError("");
    try {
      const res = await authApi.login(email, password);
      const { user, access_token, refresh_token } = res.data.data;
      setAuth(user, access_token, refresh_token);
      navigate("/dashboard");
    } catch (err) {
      const msg = err.response?.data?.error?.message || "Error al iniciar sesión";
      setApiError(msg);
    }
  };

  return (
    <div className="min-h-screen bg-navy-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold tracking-widest text-champagne">VESTRA</h1>
          <p className="text-navy-400 text-xs mt-2 tracking-widest uppercase">
            Finanzas · Inversiones · Gastos · Vehículos
          </p>
        </div>

        {/* Card */}
        <div className="bg-navy-800 rounded-2xl p-8 shadow-2xl border border-navy-700">
          <h2 className="text-white text-xl font-semibold mb-6">Iniciar sesión</h2>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">

            {/* Email */}
            <div>
              <label className="block text-navy-300 text-sm font-medium mb-1.5">
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                placeholder="tu@email.com"
                {...register("email")}
                className="w-full bg-navy-900 border border-navy-600 text-white rounded-lg px-4 py-2.5
                           placeholder-navy-500 focus:outline-none focus:border-champagne
                           focus:ring-1 focus:ring-champagne transition text-sm"
              />
              {errors.email && (
                <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-navy-300 text-sm font-medium mb-1.5">
                Contraseña
              </label>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                {...register("password")}
                className="w-full bg-navy-900 border border-navy-600 text-white rounded-lg px-4 py-2.5
                           placeholder-navy-500 focus:outline-none focus:border-champagne
                           focus:ring-1 focus:ring-champagne transition text-sm"
              />
              {errors.password && (
                <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>
              )}
            </div>

            {/* API error */}
            {apiError && (
              <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-2.5">
                <p className="text-red-400 text-sm">{apiError}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-champagne hover:bg-champagne-light text-[#0a1020] font-semibold
                         rounded-lg py-2.5 transition disabled:opacity-60 disabled:cursor-not-allowed text-sm"
            >
              {isSubmitting ? "Entrando…" : "Iniciar sesión"}
            </button>
          </form>

          {/* Link a registro */}
          <p className="text-center text-navy-400 text-sm mt-6">
            ¿Sin cuenta?{" "}
            <Link to="/register" className="text-champagne hover:text-champagne-light transition">
              Crear una
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
