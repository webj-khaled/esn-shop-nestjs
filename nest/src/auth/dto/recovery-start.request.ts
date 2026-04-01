import { IsString } from 'class-validator';

export class RecoveryStartRequest {
  @IsString()
  identifier: string;
}
