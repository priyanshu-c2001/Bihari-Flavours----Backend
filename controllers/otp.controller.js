const { sendOtpSMS, getPhoneVariants } = require("../utils/fast2sms.util");
const Otp = require("../models/otp.model");
const User = require("../models/user.model");
const { generateToken } = require("../utils/jwt");
const VALID_PURPOSES = ["signup", "login", "forgot"];



const isProduction = process.env.USE_HTTPS === "true";

const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "None" : "Lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
};

exports.sendOtpController = async (req, res) => {
  try {
    let { phone, purpose } = req.body;

    if (!phone || !purpose || !VALID_PURPOSES.includes(purpose)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone or purpose",
      });
    }

    // Normalize phone
    const { local, e164 } = getPhoneVariants(phone);

    const existingUser = await User.findOne({ phone: e164 });

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

    // Generate OTP (6-digit)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save OTP (overwrite previous)
    await Otp.findOneAndUpdate(
      { phone: e164, purpose },
      {
        phone: e164,
        purpose,
        otp,
        status: "pending",
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min
      },
      { upsert: true, new: true }
    );

    // Send OTP via Fast2SMS (10-digit only)
    await sendOtpSMS(local, otp);

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

exports.resendOtpController = async (req, res) => {
  try {
    let { phone, purpose } = req.body;

    if (!phone || !purpose || !VALID_PURPOSES.includes(purpose)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone or purpose",
      });
    }

    // Normalize phone
    const { local, e164 } = getPhoneVariants(phone);

    // Check existing OTP
    const existingOtp = await Otp.findOne({
      phone: e164,
      purpose,
      status: "pending",
    });

    if (!existingOtp) {
      return res.status(404).json({
        success: false,
        message: "No OTP found. Please request a new OTP.",
      });
    }

    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Update OTP
    await Otp.findOneAndUpdate(
      { phone: e164, purpose },
      {
        otp,
        status: "pending",
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // reset expiry
      },
      { new: true }
    );

    // DEV MODE: logs OTP instead of sending SMS
    await sendOtpSMS(local, otp);

    res.status(200).json({
      success: true,
      message: "OTP resent successfully",
      purpose,
    });

  } catch (error) {
    console.error("Resend OTP error:", error);
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

    if (!phone || !code || !purpose || !VALID_PURPOSES.includes(purpose)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request",
      });
    }

    // Normalize phone
    const { e164 } = getPhoneVariants(phone);

    // Find OTP entry
    const otpEntry = await Otp.findOne({
      phone: e164,
      purpose,
      status: "pending",
    });

    if (!otpEntry) {
      return res.status(400).json({
        success: false,
        message: "OTP not found or already used",
      });
    }

    // Check expiry
    if (otpEntry.expiresAt < new Date()) {
      otpEntry.status = "expired";
      await otpEntry.save();

      return res.status(400).json({
        success: false,
        message: "OTP expired",
      });
    }

    // Check OTP match
    if (otpEntry.otp !== code) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    /* =====================
       OTP VERIFIED
    ===================== */

    if (purpose === "login" || purpose === "forgot") {
      // 🔴 DELETE OTP for login & forgot
      await Otp.deleteOne({ _id: otpEntry._id });

      const user = await User.findOne({ phone: e164 }).select("-password");

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const token = generateToken(user);

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

      if (!isProduction) {
        responseData.token = token;
      }

      return res.status(200).json(responseData);
    }

    /* =====================
       SIGNUP FLOW
       (KEEP OTP)
    ===================== */

    otpEntry.status = "verified";
    await otpEntry.save();

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
    });

  } catch (error) {
    console.error("Verify OTP error:", error);
    res.status(500).json({
      success: false,
      message: "OTP verification failed",
    });
  }
};