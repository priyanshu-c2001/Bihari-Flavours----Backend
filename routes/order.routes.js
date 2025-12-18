// routes/order.routes.js
const router = require('express').Router();
const express = require('express');

const {
  createOrder,
  razorpayWebhook,
  getUserOrders,
  getOrderDetails,
  verifyPayment,
  verifyCoupon,
} = require('../controllers/order.controller');

const {
  getPendingOrders,
  updateOrderStatus,
  getOrderHistory,
  getOrderById,
} = require('../controllers/adminorder.controller');

const { protect } = require('../middleware/auth.middleware');
const { adminProtect } = require('../middleware/admin.middleware');

// --------------------
// USER ROUTES
// --------------------

// Verify coupon before creating order
router.post('/verify-coupon', protect, verifyCoupon);

// Create a new order (protected)
router.post('/create', protect, createOrder);

// Get all orders of the logged-in user
router.get('/my-orders', protect, getUserOrders);

// Get details of a specific order for the logged-in user
router.get('/my-orders/:id', protect, getOrderDetails);

// Razorpay webhook (called by Razorpay; public route)
router.post(
  '/razorpay-webhook',
  express.raw({ type: 'application/json' }),
  razorpayWebhook
);

// Verify payment manually (frontend call after payment)
router.post('/verify-payment', protect, verifyPayment);

// --------------------
// ADMIN ROUTES
// --------------------

// Get all pending or paid orders
router.get('/admin/orders', protect, adminProtect, getPendingOrders);

// Update order status
router.patch('/admin/orders/:id', protect, adminProtect, updateOrderStatus);

// Get specific order by ID (admin view)
router.get('/admin/orders/details/:id', protect, adminProtect, getOrderById);

// Get all order history
router.get('/admin/history', protect, adminProtect, getOrderHistory);

module.exports = router;
