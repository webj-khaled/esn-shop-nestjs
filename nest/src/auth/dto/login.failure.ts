export class LoginFailureResponse {
  status: 'failed' | 'rate_limited' | 'account_not_ready';
  message: string;
  recoveryAction: string;

  constructor(
    status: LoginFailureResponse['status'],
    message: string,
    recoveryAction: string,
  ) {
    this.status = status;
    this.message = message;
    this.recoveryAction = recoveryAction;
  }
}
