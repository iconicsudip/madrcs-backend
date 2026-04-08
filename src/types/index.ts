export interface User {
    id: string;
    full_name: string;
    email: string;
    phone_number: string;
    password?: string;
    role: string;
    is_verified: boolean;
    created_at?: Date;
}

export interface AuthResponse {
    token?: string;
    refreshToken?: string;
    user?: Omit<User, 'password'>;
    mfaRequired?: boolean;
    userId?: string;
}
