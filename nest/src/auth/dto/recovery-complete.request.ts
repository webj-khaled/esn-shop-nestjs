import { IsString, IsStrongPassword, MinLength } from 'class-validator';

export class RecoveryCompleteRequest {
  @IsString()
  @MinLength(20)
  token: string;

  @IsStrongPassword()
  password: string;
}
