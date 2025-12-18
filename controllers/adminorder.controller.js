// controllers/admin.controller.js
const Order = require('../models/order.model');
const OrderHistory = require('../models/orderhistory.model');
const Coupon = require('../models/coupon.model');

// ----------------------------
// Helper: Clean order object
// ----------------------------
const cleanOrder = async (order) => {
  const obj = order.toObject();
  delete obj.transactionId;

  // Include coupon details if present
  if (obj.couponId) {
    const coupon = await Coupon.findById(obj.couponId);
    if (coupon) {
      obj.coupon = {
        name: coupon.code,
        discountPercentage: coupon.discountPercentage,
      };
    }
  }
  delete obj.couponId;

  // Include name and phone from shippingAddress
  obj.customerName = obj.shippingAddress?.name || '';
  obj.customerPhone = obj.shippingAddress?.phone || '';

  return obj;
};

// ----------------------------
// Get all pending orders (COD or Paid online)
// ----------------------------
exports.getPendingOrders = async (req, res) => {
  try {
    const orders = await Order.find({}).sort({ createdAt: -1 });

    const cleanedOrders = await Promise.all(orders.map(cleanOrder));

    res.status(200).json({ success: true, orders: cleanedOrders });
  } catch (error) {
    console.error('❌ getPendingOrders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending orders',
      error: error.message,
    });
  }
};

// ----------------------------
// Update order status
// ----------------------------
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { orderStatus } = req.body;

    const order = await Order.findById(id);
    if (!order)
      return res.status(404).json({ success: false, message: 'Order not found' });

    // Update status
    order.orderStatus = orderStatus;

    // Auto-complete COD payments when delivered
    if (order.paymentMethod === 'COD' && orderStatus === 'Delivered') {
      order.paymentStatus = 'Paid';
    }

    // Check if we need to move to history
    if (orderStatus === 'Delivered' || orderStatus === 'Cancelled') {
      const { _id, ...orderData } = order.toObject();
      
      // Save to OrderHistory
      await OrderHistory.create({
        ...orderData,
        originalOrderId: _id,
        completedAt: new Date(),
      });

      // Remove from active orders
      await Order.findByIdAndDelete(_id);

      return res.status(200).json({
        success: true,
        message: `Order ${orderStatus.toLowerCase()} and moved to history`,
      });
    }

    // Otherwise, just save updated status
    await order.save();

    const cleanedOrder = await cleanOrder(order);
    res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
      order: cleanedOrder,
    });
  } catch (error) {
    console.error('❌ updateOrderStatus:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order',
      error: error.message,
    });
  }
};


// ----------------------------
// Get all order history
// ----------------------------
// controllers/orderHistory.controller.js


// Clean & populate order history
const cleanOrderhistory = async (order) => {
  const orderObj = order.toObject();

  // Add coupon info if exists
  if (orderObj.couponId) {
    const coupon = await Coupon.findById(orderObj.couponId);
    orderObj.coupon = coupon ? { code: coupon.code, discount: coupon.discount } : null;
  }

  return orderObj;
};

// GET /orders/admin/history
exports.getOrderHistory = async (req, res) => {
  try {
    const history = await OrderHistory.find().sort({ completedAt: -1 });
    const cleanedHistory = await Promise.all(history.map(cleanOrderhistory));

    res.status(200).json({ success: true, orders: cleanedHistory });
  } catch (error) {
    console.error('❌ getOrderHistory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order history',
      error: error.message,
    });
  }
};

// ----------------------------
// Get specific order by ID (admin)
// ----------------------------
exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);

    if (!order)
      return res.status(404).json({ success: false, message: 'Order not found' });

    const cleanedOrder = await cleanOrder(order);
    res.status(200).json({ success: true, order: cleanedOrder });
  } catch (error) {
    console.error('❌ getOrderById:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order',
      error: error.message,
    });
  }
};
