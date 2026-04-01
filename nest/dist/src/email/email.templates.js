"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOrderCompletedEmail = exports.buildPasswordResetEmail = exports.buildWelcomeEmail = void 0;
const escapeHtml = (value) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const formatCurrency = (amount, currency) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    currencyDisplay: 'code',
}).format(amount);
const buildWelcomeEmail = (appName) => ({
    subject: `Welcome to ${appName}`,
    html: `
    <h2>Welcome to ${escapeHtml(appName)}.</h2>
    <p>Your account is ready and you can start ordering anytime.</p>
    <p>Thanks for joining us.</p>
  `,
    text: `Welcome to ${appName}. Your account is ready and you can start ordering anytime.`,
});
exports.buildWelcomeEmail = buildWelcomeEmail;
const buildPasswordResetEmail = (appName, resetUrl, expiresInMinutes) => ({
    subject: `${appName} password reset`,
    html: `
    <h2>Reset your password</h2>
    <p>We received a request to reset your password.</p>
    <p>
      <a href="${escapeHtml(resetUrl)}" target="_blank" rel="noopener noreferrer">Reset password</a>
    </p>
    <p>This link expires in ${expiresInMinutes} minutes.</p>
    <p>If you did not request this, you can ignore this email.</p>
  `,
    text: `Reset your password:\n${resetUrl}\nThis link expires in ${expiresInMinutes} minutes.`,
});
exports.buildPasswordResetEmail = buildPasswordResetEmail;
const buildOrderCompletedEmail = (appName, input) => {
    const itemListHtml = input.items
        .map((item) => `<li>${escapeHtml(item.productName)} x ${item.quantity} - ${formatCurrency(item.totalAmount, input.currency)}</li>`)
        .join('');
    const itemListText = input.items
        .map((item) => `${item.productName} x ${item.quantity} - ${formatCurrency(item.totalAmount, input.currency)}`)
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
exports.buildOrderCompletedEmail = buildOrderCompletedEmail;
//# sourceMappingURL=email.templates.js.map