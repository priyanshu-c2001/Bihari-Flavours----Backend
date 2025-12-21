const User = require("../models/user.model");
const Otp = require("../models/otp.model");
const { generateToken } = require("../utils/jwt");
const { formatPhoneNumber } = require("../utils/twilio");

const isProduction = process.env.USE_HTTPS === "true";

/**
 * Unified cookie options
 * Works for:
 * - HTTPS browsers (cookies)
 * - Cross-domain frontend (Render / Vercel)
 */
const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "None" : "Lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
};

// =====================
// SIGNUP
// =====================
exports.signup = async (req, res) => {
  try {
    let { name, phone, password } = req.body;
    phone = formatPhoneNumber(phone);

    // OTP must be verified
    const otpEntry = await Otp.findOne({ phone });
    if (!otpEntry || otpEntry.status !== "verified") {
      return res.status(400).json({
        success: false,
        message: "OTP not verified",
      });
    }

    // Prevent duplicate user
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    // Create user
    const newUser = await User.create({
      name,
      phone,
      password,
      role: "user",
    });

    // Generate JWT (should contain minimal payload internally)
    const token = generateToken(newUser);

    // Set cookie (HTTPS browsers)
    res.cookie("token", token, cookieOptions);

    const responseData = {
      success: true,
      message: "User created successfully",
      user: {
        name: newUser.name,
        phone: newUser.phone,
        role: newUser.role,
      },
    };

    // Token only for HTTP / Postman / dev usage
    if (!isProduction) {
      responseData.token = token;
    }

    res.status(201).json(responseData);

  } catch (error) {
    console.error("Signup error:", error.message);
    res.status(500).json({
      success: false,
      message: "Signup failed",
    });
  }
};

// =====================
// SIGNIN
// =====================
exports.signin = async (req, res) => {
  try {
    let { phone, password } = req.body;
    phone = formatPhoneNumber(phone);

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone or password",
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone or password",
      });
    }

    const token = generateToken(user);

    // Set cookie
    res.cookie("token", token, cookieOptions);

    const responseData = {
      success: true,
      message: "Login successful",
      user: {
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
    };

    // Token only in dev / HTTP mode
    if (!isProduction) {
      responseData.token = token;
    }

    res.status(200).json(responseData);

  } catch (error) {
    console.error("Signin error:", error.message);
    res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
};

// =====================
// LOGOUT
// =====================
exports.logout = async (req, res) => {
  try {
    res.clearCookie("token", cookieOptions);

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });

  } catch (error) {
    console.error("Logout error:", error.message);
    res.status(500).json({
      success: false,
      message: "Logout failed",
    });
  }
};
