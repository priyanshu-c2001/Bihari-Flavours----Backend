const { sendOtp, verifyOtp, formatPhoneNumber } = require("../utils/twilio");
const Otp = require("../models/otp.model");
const User = require("../models/user.model");
const { generateToken } = require("../utils/jwt");

const isProduction = process.env.USE_HTTPS === "true";

const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "None" : "Lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
};

const VALID_PURPOSES = ["signup", "login", "forgot"];

// =====================
// SEND OTP
// =====================
exports.sendOtpController = async (req, res) => {
  try {
    let { phone, purpose } = req.body;

    if (!phone || !purpose || !VALID_PURPOSES.includes(purpose)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone or purpose",
      });
    }

    phone = formatPhoneNumber(phone);

    const existingUser = await User.findOne({ phone });

    if (purpose === "signup" && existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    if ((purpose === "login" || purpose === "forgot") && !existingUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    await sendOtp(phone);

    await Otp.findOneAndUpdate(
      { phone },
      { phone, verified: false, status: "pending", createdAt: new Date() },
      { upsert: true, new: true }
    );

    res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      purpose,
    });

  } catch (error) {
    console.error("Send OTP error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to send OTP",
    });
  }
};

// =====================
// RESEND OTP
// =====================
exports.resendOtpController = async (req, res) => {
  try {
    let { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    phone = formatPhoneNumber(phone);

    await sendOtp(phone);

    await Otp.findOneAndUpdate(
      { phone },
      { verified: false, status: "pending", createdAt: new Date() },
      { upsert: true, new: true }
    );

    res.status(200).json({
      success: true,
      message: "OTP resent successfully",
    });

  } catch (error) {
    console.error("Resend OTP error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to resend OTP",
    });
  }
};

// =====================
// VERIFY OTP
// =====================
exports.verifyOtpController = async (req, res) => {
  try {
    let { phone, code, purpose } = req.body;

    if (!phone || !code || !VALID_PURPOSES.includes(purpose)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request",
      });
    }

    phone = formatPhoneNumber(phone);

    const verification = await verifyOtp(phone, code);
    if (!verification || verification.status !== "approved") {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    const otpEntry = await Otp.findOne({ phone });
    if (!otpEntry) {
      return res.status(404).json({
        success: false,
        message: "OTP not found",
      });
    }

    otpEntry.verified = true;
    otpEntry.status = "verified";
    otpEntry.createdAt = new Date();
    await otpEntry.save();

    // Login / Forgot flow
    if (purpose === "login" || purpose === "forgot") {
      const user = await User.findOne({ phone }).select("-password");

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const token = generateToken(user);

      // Always set cookie (safe for dev & prod)
      res.cookie("token", token, cookieOptions);

      const responseData = {
        success: true,
        message: "OTP verified successfully",
        user: {
          name: user.name,
          phone: user.phone,
          role: user.role,
        },
      };

      // Token only exposed in dev / HTTP mode
      if (!isProduction) {
        responseData.token = token;
      }

      return res.status(200).json(responseData);
    }

    // Signup flow → only verification
    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
    });

  } catch (error) {
    console.error("Verify OTP error:", error.message);
    res.status(500).json({
      success: false,
      message: "OTP verification failed",
    });
  }
};
