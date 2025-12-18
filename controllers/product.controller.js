const Product = require("../models/product.model");
const cloudinary = require("../config/cloudinary");
const fs = require("fs");

// =====================
// ADD PRODUCT
// =====================
exports.addProduct = async (req, res) => {
  try {
    const { name, desc, price, quantity } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: "Product image is required" });
    }

    // Check if product with same name exists
    const existingProduct = await Product.findOne({ name: name.trim() });
    if (existingProduct) {
      return res.status(400).json({ success: false, message: "Product with this name already exists" });
    }

    // Upload image to Cloudinary
    const upload = await cloudinary.uploader.upload(req.file.path, {
      folder: "products",
    });

    // Remove temp file
    fs.unlinkSync(req.file.path);

    const newProduct = await Product.create({
      name: name.trim(),
      desc,
      price,
      quantity,
      photo: upload.secure_url,
    });

    res.status(201).json({
      success: true,
      message: "Product added successfully",
      product: newProduct,
    });
  } catch (error) {
    console.error("Add product error:", error);

    // Handle unique index error (MongoServerError code 11000)
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Product with this name already exists",
      });
    }

    res.status(500).json({ success: false, message: "Failed to add product", error: error.message });
  }
};


// =====================
// GET ALL PRODUCTS
// =====================
exports.getProducts = async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: products.length, products });
  } catch (error) {
    console.error("Get products error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch products", error: error.message });
  }
};

// =====================
// GET SINGLE PRODUCT
// =====================
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });
    res.status(200).json({ success: true, product });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch product", error: error.message });
  }
};

// =====================
// UPDATE PRODUCT
// =====================
exports.updateProduct = async (req, res) => {
  try {
    const { name, desc, price, quantity } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    // If new image uploaded
    if (req.file) {
      const upload = await cloudinary.uploader.upload(req.file.path, { folder: "products" });
      fs.unlinkSync(req.file.path);
      product.photo = upload.secure_url;
    }

    product.name = name || product.name;
    product.desc = desc || product.desc;
    product.price = price || product.price;
    product.quantity = quantity || product.quantity;

    await product.save();

    res.status(200).json({ success: true, message: "Product updated successfully", product });
  } catch (error) {
    console.error("Update product error:", error);
    res.status(500).json({ success: false, message: "Failed to update product", error: error.message });
  }
};

// =====================
// DELETE PRODUCT
// =====================
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    await Product.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: "Product deleted successfully" });
  } catch (error) {
    console.error("Delete product error:", error);
    res.status(500).json({ success: false, message: "Failed to delete product", error: error.message });
  }
};
