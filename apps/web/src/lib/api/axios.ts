import axios from "axios";

export const api = axios.create({
    baseURL: "/api",
    headers: { "Content-Type": "application/json" },
    withCredentials: true,
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error?.response?.status;

        if (status === 401) {
            if (typeof window !== "undefined") {
                window.location.href = "/login";
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
