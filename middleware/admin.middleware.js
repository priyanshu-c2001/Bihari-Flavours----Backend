// middleware/admin.middleware.js
const { protect } = require("./auth.middleware");

// Admin protect middleware
const adminProtect = [
  protect,
  (req, res, next) => {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied: Admins only",
      });
    }
    next();
  }
];

module.exports = { adminProtect };
