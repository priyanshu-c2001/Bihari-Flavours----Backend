// server.js
const express = require("express");
const connectDB = require("./config/db");
require("dotenv").config();
const cookieParser = require("cookie-parser");
const cors = require("cors");

// Routes
const otpRoutes = require("./routes/otp.routes");
const userRoutes = require("./routes/user.routes");
const productRoutes = require("./routes/product.routes");
const cartRoutes = require("./routes/cart.routes");
const couponRoutes = require("./routes/coupon.routes");
const orderRoutes = require("./routes/order.routes"); 

const app = express();

// --------------------
// Middlewares
// --------------------
app.use(cors({
  origin: true,
  credentials: true
}));
connectDB();
app.use(cookieParser());


// --------------------
// Connect to MongoDB
// --------------------
app.use("/api/orders", orderRoutes); // ✅ Use order routes

// --------------------
// Routes
// --------------------
app.use(express.json());
app.use("/api/otp", otpRoutes);
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/coupons", couponRoutes);

// Base route
app.get("/", (req, res) => {
  res.send("API is running...");
});

// --------------------
// Start Server
// --------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Server running on port ${PORT}`));
