import { IsString } from 'class-validator';

export class LoginRequest {
  @IsString()
  identifier: string;

  @IsString()
  password: string;
}
