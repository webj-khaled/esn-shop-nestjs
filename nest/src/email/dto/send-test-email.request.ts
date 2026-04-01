import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendTestEmailRequest {
  @IsEmail()
  to: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string;
}
