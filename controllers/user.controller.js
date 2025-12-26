const User = require("../models/user.model");
const Otp = require("../models/otp.model");
const { generateToken } = require("../utils/jwt");
const { getPhoneVariants } = require("../utils/fast2sms.util");

const isProduction = process.env.USE_HTTPS === "true";

/* ---------------- COOKIE OPTIONS ---------------- */
const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "None" : "Lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
};

/* =====================
   SIGNUP
===================== */
exports.signup = async (req, res) => {
  try {
    let { name, phone, password } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // Normalize phone → +91 format
    const { e164 } = getPhoneVariants(phone);

    // OTP must be verified for signup
    const otpEntry = await Otp.findOne({
      phone: e164,
      purpose: "signup",
      status: "verified",
    });

    if (!otpEntry) {
      return res.status(400).json({
        success: false,
        message: "OTP not verified",
      });
    }

    // Prevent duplicate user
    const existingUser = await User.findOne({ phone: e164 });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    // Create user
    const newUser = await User.create({
      name,
      phone: e164,
      password,
      role: "user",
    });

    // Cleanup OTP after successful signup
    await Otp.deleteOne({ _id: otpEntry._id });

    // Generate JWT
    const token = generateToken(newUser);

    // Set cookie
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

    if (!isProduction) {
      responseData.token = token;
    }

    return res.status(201).json(responseData);

  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({
      success: false,
      message: "Signup failed",
    });
  }
};

/* =====================
   SIGNIN (PASSWORD)
===================== */
exports.signin = async (req, res) => {
  try {
    let { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Phone and password are required",
      });
    }

    // Normalize phone → +91 format
    const { e164 } = getPhoneVariants(phone);

    const user = await User.findOne({ phone: e164 });
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

    if (!isProduction) {
      responseData.token = token;
    }

    return res.status(200).json(responseData);

  } catch (error) {
    console.error("Signin error:", error);
    return res.status(500).json({
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

    
    res.clearCookie("token");

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });

  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({
      success: false,
      message: "Logout failed",
    });
  }
};
