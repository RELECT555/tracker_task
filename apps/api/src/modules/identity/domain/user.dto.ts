export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  orgUnit: { id: string; name: string } | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
