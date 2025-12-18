// utils/twilio.js
const twilio = require("twilio");

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

/**
 * Format phone number to E.164 format (+91 for India)
 * @param {string} phone
 * @returns {string} formatted phone number
 */
const formatPhoneNumber = (phone) => {
  phone = phone.replace(/\s+/g, "");
  if (!phone.startsWith("+")) {
    phone = "+91" + phone;
  }
  return phone;
};

/**
 * Send OTP via Twilio Verify
 * @param {string} phone
 * @returns {Promise}
 */
const sendOtp = async (phone) => {
  phone = formatPhoneNumber(phone);
  return await client.verify.v2
    .services(process.env.TWILIO_VERIFY_SID)
    .verifications.create({ to: phone, channel: "sms" });
};

/**
 * Verify OTP via Twilio Verify
 * @param {string} phone
 * @param {string} code
 * @returns {Promise}
 */
const verifyOtp = async (phone, code) => {
  phone = formatPhoneNumber(phone);
  return await client.verify.v2
    .services(process.env.TWILIO_VERIFY_SID)
    .verificationChecks.create({ to: phone, code });
};

module.exports = {
  client,
  formatPhoneNumber,
  sendOtp,
  verifyOtp,
};
