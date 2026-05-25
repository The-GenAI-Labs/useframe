export interface ApiError {
    message: string;
    status?: number;
}

export interface SendMagicLinkPayload {
    email: string;
}

export interface SendMagicLinkResponse {
    success: boolean;
}
