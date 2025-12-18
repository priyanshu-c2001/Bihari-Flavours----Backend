const User = require("../models/user.model");
const Otp = require("../models/otp.model");
const { generateToken } = require("../utils/jwt");
const { formatPhoneNumber } = require("../utils/twilio");

const isProduction = process.env.USE_HTTPS === "true";

// =====================
// SIGNUP
// =====================
exports.signup = async (req, res) => {
  try {
    let { name, phone, password } = req.body;
    phone = formatPhoneNumber(phone);

    const otpEntry = await Otp.findOne({ phone });
    if (!otpEntry || otpEntry.status !== "verified") {
      return res.status(400).json({ success: false, message: "OTP not verified" });
    }

    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "User already exists" });
    }

    const newUser = await User.create({ name, phone, password, role: "user" });
    const token = generateToken(newUser);

    // Set JWT in cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "strict" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    const responseData = {
      success: true,
      message: "User created successfully",
      user: { name, phone, role: newUser.role }
    };

    // Send token in response in development
    if (!isProduction) responseData.token = token;

    res.status(201).json(responseData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Signup failed", error: error.message });
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
    if (!user) return res.status(400).json({ success: false, message: "User not found" });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ success: false, message: "Invalid credentials" });

    const token = generateToken(user);

    // Set JWT in cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "strict" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    const responseData = {
      success: true,
      message: "Login successful",
      user: { name: user.name, phone: user.phone, role: user.role }
    };

    // Send token in response in development
    if (!isProduction) responseData.token = token;

    res.status(200).json(responseData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Login failed", error: error.message });
  }
};

// =====================
// LOGOUT
// =====================
exports.logout = async (req, res) => {
  try {
    res.cookie("token", "", {
      httpOnly: true,
      secure: isProduction,
      expires: new Date(0)
    });

    res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Logout failed", error: error.message });
  }
};
