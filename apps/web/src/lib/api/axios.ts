import axios from "axios";

export const api = axios.create({
    baseURL: "/api",
    headers: { "Content-Type": "application/json" },
    withCredentials: true, // sends session cookie on every request
});

// attach auth token from session cookie automatically — no manual header needed
// because withCredentials handles it; interceptors here handle response errors globally

api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error?.response?.status;

        if (status === 401) {
            // session expired or missing — redirect to login
            if (typeof window !== "undefined") {
                window.location.href = "/login";
            }
        }

        // normalise error message so callers always get a string
        const message =
            error?.response?.data?.message ??
            error?.response?.data?.error ??
            error?.message ??
            "An unexpected error occurred";

        return Promise.reject(new Error(message));
    }
);
