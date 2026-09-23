import axios from "axios";
import { getCurrentAccessToken, refreshAccessToken } from "@/lib/authContext";

const API_SERVICE_URL = process.env.NEXT_PUBLIC_API_SERVICE_URL ?? "http://localhost:4000";

export const api = axios.create({
    baseURL: `${API_SERVICE_URL}/api`,
    headers: { "Content-Type": "application/json" },
    withCredentials: true,
});

api.interceptors.request.use((config) => {
    const token = getCurrentAccessToken();
    if (token) {
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error?.config;
        const status = error?.response?.status;

        if (status === 401 && originalRequest && !originalRequest._retried) {
            originalRequest._retried = true;
            const newToken = await refreshAccessToken();

            if (newToken) {
                originalRequest.headers = originalRequest.headers ?? {};
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                return api(originalRequest);
            }

            if (typeof window !== "undefined") {
                window.location.href = "/signin";
            }
        }

        const message =
            error?.response?.data?.message ??
            error?.response?.data?.error ??
            error?.message ??
            "An unexpected error occurred";

        return Promise.reject(new Error(message));
    }
);
