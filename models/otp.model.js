const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["pending", "verified", "expired"],
      default: "pending",
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 600, // expires after 10 minutes
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Otp", otpSchema);
