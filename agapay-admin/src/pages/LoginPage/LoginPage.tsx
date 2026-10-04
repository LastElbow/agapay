import React, { useMemo, useState } from "react";
import { isAxiosError } from "axios";
import { useNavigate } from "react-router-dom";
import {
  login as apiLogin,
  type LoginResponse,
} from "../../api/authService";
import { useAuth } from "../../context/AuthContext";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { FaHandHoldingHeart } from "react-icons/fa";

const DEVICE_ID_KEY = "adminDeviceId";
const DEVICE_NAME_KEY = "adminDeviceName";

const createFallbackDeviceId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const getOrCreateDeviceId = () => {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }
  const newId = (() => {
    if (typeof window !== "undefined") {
      const { crypto: globalCrypto } = window;
      if (globalCrypto && typeof globalCrypto.randomUUID === "function") {
        return globalCrypto.randomUUID();
      }
    }
    return createFallbackDeviceId();
  })();
  localStorage.setItem(DEVICE_ID_KEY, newId);
  return newId;
};

const getOrInitDeviceName = () => {
  const existing = localStorage.getItem(DEVICE_NAME_KEY);
  if (existing) {
    return existing;
  }
  const navigatorInfo = typeof window !== "undefined" ? window.navigator : undefined;
  const inferredName = navigatorInfo
    ? `${navigatorInfo.platform || "web"} · ${navigatorInfo.userAgent?.slice(0, 40) || "browser"}`
    : "Admin Console";
  localStorage.setItem(DEVICE_NAME_KEY, inferredName);
  return inferredName;
};

const LoginPage = () => {
  const [email, setEmail] = useState<string>("admin@example.com");
  const [password, setPassword] = useState<string>("Password123!");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const deviceId = useMemo(() => getOrCreateDeviceId(), []);
  const deviceName = useMemo(() => getOrInitDeviceName(), []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await apiLogin({
        email,
        password,
        deviceId,
        deviceName,
      });

      completeLogin(response);
    } catch (err) {
      const errorObj = err as unknown;
      if (isAxiosError(errorObj) && errorObj.response) {
        setError(errorObj.response.data?.message || "Invalid email or password");
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
      console.error("Login failed: ", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const completeLogin = (response: LoginResponse) => {
    setError(null);
    login(response.accessToken, response.user, response.refreshToken ?? null);
    navigate("/dashboard");
  };

  return (
    <div className="flex min-h-screen relative bg-physio-light overflow-hidden">
        {/* Background Decorative Blobs */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
            <div
                className="absolute top-0 left-1/4 w-96 h-96 bg-physio-accent rounded-full opacity-70 blur-3xl transform translate-x-10 -translate-y-12"
            />
            <div
                className="absolute top-0 right-1/4 w-96 h-96 bg-teal-100 rounded-full opacity-70 blur-3xl transform -translate-x-5 translate-y-5"
            />
            <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-green-100 rounded-full opacity-70 blur-3xl" />
        </div>

      <div className="z-10 w-full flex flex-col justify-center items-center px-6 py-12 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center mb-8">
            <div className="flex flex-row items-center gap-2 mb-8">
                <div className="w-10 h-10 bg-physio-primary rounded-lg flex items-center justify-center">
                    <FaHandHoldingHeart className="text-white w-5 h-5" />
                </div>
                <h2 className="text-2xl font-bold text-gray-800 tracking-tight">Agapay</h2>
            </div>
          
            <div className="w-full bg-white/80 backdrop-blur-sm p-8 rounded-3xl shadow-sm border border-white/50">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-gray-900">
                      Admin Portal
                    </h1>
                    <p className="mt-2 text-base text-gray-500">
                      Sign in to manage the application
                    </p>
                </div>
            
                <form className="space-y-6" onSubmit={handleSubmit}>
                    <div>
                    <label
                        htmlFor="email"
                        className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2"
                    >
                        Email address
                    </label>
                    <div className="mt-1">
                        <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="block w-full rounded-xl border border-gray-200 py-3 px-3.5 text-gray-900 shadow-sm placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-physio-primary focus:border-physio-primary sm:text-base sm:leading-6 bg-white outline-none transition-all"
                        placeholder="admin@agapay.com"
                        />
                    </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label
                                htmlFor="password"
                                className="block text-xs font-semibold text-gray-700 uppercase tracking-wide"
                            >
                                Password
                            </label>
                            
                        </div>
                    <div className="mt-1 relative">
                        <input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="block w-full rounded-xl border border-gray-200 py-3 px-3.5 pr-10 text-gray-900 shadow-sm placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-physio-primary focus:border-physio-primary sm:text-base sm:leading-6 bg-white outline-none transition-all"
                        placeholder="••••••••"
                        />
                         <button
                            type="button"
                            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-500 focus:outline-none"
                            onClick={() => setShowPassword(!showPassword)}
                        >
                            {showPassword ? (
                                <EyeOff className="h-5 w-5" aria-hidden="true" />
                            ) : (
                                <Eye className="h-5 w-5" aria-hidden="true" />
                            )}
                        </button>
                    </div>
                    </div>

                    {error && (
                    <div className="rounded-md bg-red-50 p-4 border border-red-200">
                        <div className="flex">
                        <div className="ml-3">
                            <h3 className="text-sm font-medium text-red-800">
                            {error}
                            </h3>
                        </div>
                        </div>
                    </div>
                    )}

                    <div>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex w-full justify-center items-center rounded-xl bg-physio-primary px-3 py-3.5 text-base font-bold leading-6 text-white shadow-sm hover:bg-physio-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-physio-primary disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
                    >
                        {isSubmitting ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : "Sign in"}
                    </button>
                    </div>
                </form>
            </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
