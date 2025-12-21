const mongoose = require('mongoose');
const Order = require('../models/order.model');
const OrderHistory = require('../models/orderhistory.model');
const Coupon = require('../models/coupon.model');

// ----------------------------
// Helper: Clean order object
// ----------------------------
const cleanOrder = async (order) => {
  const obj = order.toObject();

  delete obj.transactionId;

  if (obj.couponId) {
    const coupon = await Coupon.findById(obj.couponId).lean();
    if (coupon) {
      obj.coupon = {
        code: coupon.code,
        discountPercentage: coupon.discountPercentage,
      };
    }
  }

  delete obj.couponId;

  obj.customerName = obj.shippingAddress?.name || '';
  obj.customerPhone = obj.shippingAddress?.phone || '';

  return obj;
};

// ----------------------------
// Get active (pending/processing/shipped) orders
// ----------------------------
exports.getPendingOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      orderStatus: { $nin: ['Delivered', 'Cancelled'] }
    }).sort({ createdAt: -1 });

    const cleanedOrders = await Promise.all(orders.map(cleanOrder));

    res.status(200).json({ success: true, orders: cleanedOrders });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending orders',
    });
  }
};

// ----------------------------
// Update order status (SAFE)
// ----------------------------
exports.updateOrderStatus = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { orderStatus } = req.body;

    const order = await Order.findById(id).session(session);
    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    order.orderStatus = orderStatus;

    if (order.paymentMethod === 'COD' && orderStatus === 'Delivered') {
      order.paymentStatus = 'Paid';
    }

    if (orderStatus === 'Delivered' || orderStatus === 'Cancelled') {
      const exists = await OrderHistory.findOne(
        { originalOrderId: order._id }
      ).session(session);

      if (!exists) {
        const orderData = order.toObject();
        delete orderData._id;

        await OrderHistory.create([{
          ...orderData,
          originalOrderId: order._id,
          completedAt: new Date(),
        }], { session });
      }

      await Order.deleteOne({ _id: order._id }).session(session);

      await session.commitTransaction();
      session.endSession();

      return res.status(200).json({
        success: true,
        message: `Order ${orderStatus.toLowerCase()} and moved to history`,
      });
    }

    await order.save({ session });
    await session.commitTransaction();
    session.endSession();

    const cleanedOrder = await cleanOrder(order);
    res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
      order: cleanedOrder,
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    res.status(500).json({
      success: false,
      message: 'Failed to update order',
    });
  }
};

// ----------------------------
// Get all order history
// ----------------------------
exports.getOrderHistory = async (req, res) => {
  try {
    const history = await OrderHistory.find()
      .sort({ completedAt: -1 })
      .lean();

    res.status(200).json({ success: true, orders: history });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order history',
    });
  }
};

// ----------------------------
// Get order by ID (admin)
// ----------------------------
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order)
      return res.status(404).json({ success: false, message: 'Order not found' });

    const cleanedOrder = await cleanOrder(order);
    res.status(200).json({ success: true, order: cleanedOrder });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order',
    });
  }
};
