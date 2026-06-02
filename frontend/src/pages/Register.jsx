import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import authApi from "../api/auth";
import useAuthStore from "../store/authStore";

const schema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  email: z.string().email("Email no válido"),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

export default function Register() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [apiError, setApiError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async ({ name, email, password }) => {
    setApiError("");
    try {
      const res = await authApi.register(name, email, password);
      const { user, access_token, refresh_token } = res.data.data;
      setAuth(user, access_token, refresh_token);
      navigate("/dashboard");
    } catch (err) {
      const msg = err.response?.data?.error?.message || "Error al crear la cuenta";
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
          <h2 className="text-white text-xl font-semibold mb-6">Crear cuenta</h2>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">

            {/* Name */}
            <div>
              <label className="block text-navy-300 text-sm font-medium mb-1.5">
                Nombre
              </label>
              <input
                type="text"
                autoComplete="name"
                placeholder="Tu nombre"
                {...register("name")}
                className="w-full bg-navy-900 border border-navy-600 text-white rounded-lg px-4 py-2.5
                           placeholder-navy-500 focus:outline-none focus:border-champagne
                           focus:ring-1 focus:ring-champagne transition text-sm"
              />
              {errors.name && (
                <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>
              )}
            </div>

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
                autoComplete="new-password"
                placeholder="Mínimo 8 caracteres"
                {...register("password")}
                className="w-full bg-navy-900 border border-navy-600 text-white rounded-lg px-4 py-2.5
                           placeholder-navy-500 focus:outline-none focus:border-champagne
                           focus:ring-1 focus:ring-champagne transition text-sm"
              />
              {errors.password && (
                <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label className="block text-navy-300 text-sm font-medium mb-1.5">
                Repetir contraseña
              </label>
              <input
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                {...register("confirmPassword")}
                className="w-full bg-navy-900 border border-navy-600 text-white rounded-lg px-4 py-2.5
                           placeholder-navy-500 focus:outline-none focus:border-champagne
                           focus:ring-1 focus:ring-champagne transition text-sm"
              />
              {errors.confirmPassword && (
                <p className="text-red-400 text-xs mt-1">{errors.confirmPassword.message}</p>
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
              className="w-full bg-champagne hover:bg-champagne-light text-navy-950 font-semibold
                         rounded-lg py-2.5 transition disabled:opacity-60 disabled:cursor-not-allowed text-sm mt-1"
            >
              {isSubmitting ? "Creando cuenta…" : "Crear cuenta"}
            </button>
          </form>

          {/* Link a login */}
          <p className="text-center text-navy-400 text-sm mt-6">
            ¿Ya tienes cuenta?{" "}
            <Link to="/login" className="text-champagne hover:text-champagne-light transition">
              Iniciar sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
