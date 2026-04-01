import { IsString, MinLength } from 'class-validator';

export class ConfirmSessionRequest {
  @IsString()
  @MinLength(3)
  sessionId: string;
}
