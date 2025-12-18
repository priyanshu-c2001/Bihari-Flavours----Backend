const { sendOtp, verifyOtp, formatPhoneNumber } = require("../utils/twilio");
const Otp = require("../models/otp.model");
const User = require("../models/user.model");
const { generateToken } = require("../utils/jwt");
const isProduction = process.env.USE_HTTPS === "true";

// =====================
// SEND OTP
// =====================
exports.sendOtpController = async (req, res) => {
  try {
    let { phone, purpose } = req.body;
    if (!phone || !purpose) {
      return res.status(400).json({ success: false, message: "Phone and purpose are required" });
    }

    phone = formatPhoneNumber(phone);
    const existingUser = await User.findOne({ phone });

    if (purpose === "signup" && existingUser) {
      return res.status(400).json({ success: false, message: "User already exists!" });
    }
    if ((purpose === "login" || purpose === "forgot") && !existingUser) {
      return res.status(404).json({ success: false, message: "User not found!" });
    }

    // Send OTP via Twilio
    await sendOtp(phone);

    // Save / Update OTP in DB
    await Otp.findOneAndUpdate(
      { phone },
      { phone, verified: false, status: "pending", createdAt: new Date() },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true, message: "OTP sent successfully!", purpose });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to send OTP", error: error.message });
  }
};

// =====================
// RESEND OTP
// =====================
exports.resendOtpController = async (req, res) => {
  try {
    let { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: "Phone number is required" });
    }

    phone = formatPhoneNumber(phone);

    // Resend OTP via Twilio
    await sendOtp(phone);

    // Update OTP entry in DB
    await Otp.findOneAndUpdate(
      { phone },
      { verified: false, status: "pending", createdAt: new Date() },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true, message: "OTP resent successfully!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to resend OTP", error: error.message });
  }
};


// =====================
// VERIFY OTP
// =====================

exports.verifyOtpController = async (req, res) => {
  try {
    let { phone, code, purpose } = req.body;

    // Validate input
    if (!phone || !code || !purpose) {
      return res.status(400).json({
        success: false,
        message: "Phone, code, and purpose are required"
      });
    }

    phone = formatPhoneNumber(phone);

    // Verify OTP via Twilio
    const verification = await verifyOtp(phone, code);
    if (!verification || verification.status !== "approved") {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    // Mark OTP as verified in DB
    const otpEntry = await Otp.findOne({ phone });
    if (!otpEntry) {
      return res.status(404).json({ success: false, message: "OTP not found" });
    }

    otpEntry.verified = true;
    otpEntry.status = "verified";
    otpEntry.createdAt = new Date();
    await otpEntry.save();

    // Handle login or forgot password
    if (purpose === "login" || purpose === "forgot") {
      const user = await User.findOne({ phone }).select("-password");
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      const token = generateToken(user);

      // Send token in HTTP-only cookie only in production
      if (isProduction) {
        res.cookie("token", token, {
          httpOnly: true,
          secure: true,
          sameSite: "strict",
          maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
      }

      // Prepare response
      const responseData = {
        success: true,
        message: "OTP verified successfully!",
        user: { name: user.name, phone: user.phone, role: user.role }
      };

      // Include token in response only in development
      if (!isProduction) {
        responseData.token = token;
      }

      return res.status(200).json(responseData);
    }

    // For signup or other purposes, just return success
    return res.status(200).json({ success: true, message: "OTP verified successfully!" });
  } catch (error) {
    console.error("OTP verification error:", error);
    return res.status(500).json({
      success: false,
      message: "OTP verification failed",
      error: error.message
    });
  }
};