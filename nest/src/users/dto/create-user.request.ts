import { IsEmail, IsString, IsStrongPassword } from 'class-validator';

export class CreateUserRequest {
  @IsEmail()
  identifier: string;
  @IsStrongPassword()
  password: string;
}
