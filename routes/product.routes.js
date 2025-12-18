const express = require("express");
const router = express.Router();
const upload = require("../middleware/multer");
const { protect } = require("../middleware/auth.middleware");
const { adminProtect } = require("../middleware/admin.middleware");
const {
  addProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
} = require("../controllers/product.controller");

// ✅ All routes require valid token
router.use(protect);

// ✅ Authenticated users (normal or admin) can view
router.get("/", getProducts);
router.get("/:id", getProductById);

// ✅ Admin-only routes
router.post("/", adminProtect, upload.single("photo"), addProduct);
router.put("/:id", adminProtect, upload.single("photo"), updateProduct);
router.delete("/:id", adminProtect, deleteProduct);

module.exports = router;
