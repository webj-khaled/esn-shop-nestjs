export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface OrderCompletionTemplateInput {
  orderId: number;
  totalAmount: number;
  currency: string;
  items: Array<{
    productName: string;
    shirtColor: string | null;
    shirtSize: string | null;
    quantity: number;
    totalAmount: number;
  }>;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatCurrency = (amount: number, currency: string) =>
  new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: currency || 'EUR',
    currencyDisplay: 'symbol',
  }).format(amount);

export const buildWelcomeEmail = (appName: string): EmailTemplate => ({
  subject: `Welcome to ${appName}`,
  html: `
    <h2>Welcome to ${escapeHtml(appName)}.</h2>
    <p>Your account is ready and you can start ordering anytime.</p>
    <p>Thanks for joining us.</p>
  `,
  text: `Welcome to ${appName}. Your account is ready and you can start ordering anytime.`,
});

export const buildPasswordResetEmail = (
  appName: string,
  resetUrl: string,
  expiresInMinutes: number,
): EmailTemplate => ({
  subject: `${appName} password reset`,
  html: `
    <h2>Reset your password</h2>
    <p>We received a request to reset your password.</p>
    <p>
      <a href="${escapeHtml(
        resetUrl,
      )}" target="_blank" rel="noopener noreferrer">Reset password</a>
    </p>
    <p>This link expires in ${expiresInMinutes} minutes.</p>
    <p>If you did not request this, you can ignore this email.</p>
  `,
  text: `Reset your password:\n${resetUrl}\nThis link expires in ${expiresInMinutes} minutes.`,
});

export const buildOrderCompletedEmail = (
  appName: string,
  input: OrderCompletionTemplateInput,
): EmailTemplate => {
  const getSelectionText = (
    item: OrderCompletionTemplateInput['items'][number],
  ) => {
    const parts = [
      item.shirtColor ? `Color: ${item.shirtColor.toUpperCase()}` : '',
      item.shirtSize ? `Size: ${item.shirtSize.toUpperCase()}` : '',
    ].filter(Boolean);

    return parts.join(' | ');
  };

  const itemListHtml = input.items
    .map((item) => {
      const selection = getSelectionText(item);
      const selectionSuffix = selection ? ` (${escapeHtml(selection)})` : '';

      return `<li>${escapeHtml(item.productName)} x ${item.quantity}${selectionSuffix} - ${formatCurrency(
        item.totalAmount,
        input.currency,
      )}</li>`;
    })
    .join('');

  const itemListText = input.items
    .map((item) => {
      const selection = getSelectionText(item);
      const selectionSuffix = selection ? ` (${selection})` : '';

      return `${item.productName} x ${item.quantity}${selectionSuffix} - ${formatCurrency(
        item.totalAmount,
        input.currency,
      )}`;
    })
    .join('\n');

  const total = formatCurrency(input.totalAmount, input.currency);

  return {
    subject: `${appName} order #${input.orderId} confirmed`,
    html: `
      <h2>Payment successful</h2>
      <p>Your order #${input.orderId} is confirmed.</p>
      <ul>${itemListHtml}</ul>
      <p><strong>Total:</strong> ${total}</p>
    `,
    text: `Payment successful. Order #${input.orderId} is confirmed.\n${itemListText}\nTotal: ${total}\n For questions, email us at Finance.salzburg@esnaustria.org`,
  };
};
