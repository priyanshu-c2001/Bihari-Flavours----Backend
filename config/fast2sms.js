module.exports = {
  baseURL: "https://www.fast2sms.com/dev/bulkV2",
  apiKey: process.env.FAST2SMS_API_KEY,
  senderId: process.env.FAST2SMS_SENDER_ID,
  otpRoute: process.env.FAST2SMS_OTP_ROUTE,
  txRoute: process.env.FAST2SMS_TX_ROUTE,
};
