const mongoose = require("mongoose");
const { sendOrderStatusSMS } = require("../utils/fast2sms.util");
const User = require("./user.model");

/* ---------------- SUB SCHEMA ---------------- */
const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
});

/* ---------------- MAIN SCHEMA ---------------- */
const orderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: "Order must contain at least one item",
      },
    },

    totalAmount: { type: Number, required: true },

    shippingAddress: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      street: String,
      city: { type: String, required: true },
      state: { type: String, required: true },
      postalCode: String,
      country: { type: String, default: "India" },
    },

    orderStatus: {
      type: String,
      enum: ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"],
      default: "Pending",
    },

    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed"],
      default: "Pending",
    },

    paymentMethod: {
      type: String,
      enum: ["UPI", "COD", "Credit Card", "Debit Card", "Net Banking", "ONLINE"],
      required: true,
    },

    couponId: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon" },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: "TransactionModel" },
    razorpayOrderId: { type: String, unique: true, sparse: true, default: null },
  },
  { timestamps: true }
);

/* =====================
   🚨 HOOKS START HERE
===================== */

// 🆕 NEW ORDER CREATED
orderSchema.pre("save", function (next) {
  this._wasNew = this.isNew;
  next();
});

orderSchema.post("save", async function (doc) {
  if (!this._wasNew) return; // ✅ only new order

  try {
    const user = await User.findById(doc.userId);
    if (!user) return;

    console.log("🆕 Order placed");

    await sendOrderStatusSMS({
      phone: user.phone,
      orderId: doc._id,
      amount: doc.totalAmount,
      status: "Placed",
    });
  } catch (err) {
    console.error("Order create SMS error:", err);
  }
});

// 🔁 ORDER STATUS CHANGED
orderSchema.pre("findOneAndUpdate", async function (next) {
  try {
    const update = this.getUpdate();
    const newStatus = update.orderStatus || update.$set?.orderStatus;

    if (!newStatus) return next();

    const order = await this.model.findOne(this.getQuery());
    if (!order || order.orderStatus === newStatus) return next();

    this._orderBeforeUpdate = order;
    this._newStatus = newStatus;

    next();
  } catch (err) {
    next(err);
  }
});

orderSchema.post("findOneAndUpdate", async function () {
  try {
    if (!this._orderBeforeUpdate || !this._newStatus) return;

    const user = await User.findById(this._orderBeforeUpdate.userId);
    if (!user) return;
    console.log("Sending order status SMS to:", user.phone);

    await sendOrderStatusSMS({
      phone: user.phone,
      orderId: this._orderBeforeUpdate._id,
      amount: this._orderBeforeUpdate.totalAmount,
      status: this._newStatus,
    });
  } catch (err) {
    console.error("Order status SMS error:", err);
  }
});

/* =====================
   EXPORT MODEL
===================== */
module.exports = mongoose.model("Order", orderSchema);
