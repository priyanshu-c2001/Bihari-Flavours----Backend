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
    }).populate('userId', 'name phone').sort({ createdAt: -1 });

    const cleanedOrders = await Promise.all(orders.map(cleanOrder));

    // Enrich with user data
    const enrichedOrders = cleanedOrders.map((order, idx) => ({
      ...order,
      user: orders[idx].userId
    }));

    res.status(200).json({ success: true, orders: enrichedOrders });
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
  console.log('🔄 updateOrderStatus:', req.body);
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { orderStatus } = req.body;

    const order = await Order.findById(id).session(session);
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });
    }

    // Update status
    order.orderStatus = orderStatus;

    // COD auto-paid when delivered
    if (order.paymentMethod === 'COD' && orderStatus === 'Delivered') {
      order.paymentStatus = 'Paid';
    }

    // Move to history on Delivered / Cancelled
    if (orderStatus === 'Delivered' || orderStatus === 'Cancelled') {
      const exists = await OrderHistory.findOne(
        { originalOrderId: order._id }
      ).session(session);

      if (!exists) {
        await OrderHistory.create(
          [
            {
              originalOrderId: order._id,
              userId: order.userId,
              items: order.items,
              totalAmount: order.totalAmount,
              shippingAddress: order.shippingAddress,
              orderStatus: order.orderStatus,
              paymentStatus: order.paymentStatus,
              paymentMethod: order.paymentMethod,
              transactionId: order.transactionId || null,
              completedAt: new Date(),
            },
          ],
          { session }
        );
      }

      await Order.deleteOne({ _id: order._id }, { session });

      await session.commitTransaction();
      session.endSession();

      return res.status(200).json({
        success: true,
        message: `Order ${orderStatus.toLowerCase()} and moved to history`,
      });
    }

    // Just save status update (Pending → Shipped)
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error('❌ updateOrderStatus error:', error);

    return res.status(500).json({
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
      .populate('userId', 'name phone')
      .sort({ completedAt: -1 });

    // Enrich with customerName/Phone and user data
    const enrichedHistory = history.map(h => {
      const obj = h.toObject ? h.toObject() : h;
      obj.customerName = obj.userId?.name || obj.shippingAddress?.name || '';
      obj.customerPhone = obj.userId?.phone || obj.shippingAddress?.phone || '';
      obj.user = obj.userId;
      return obj;
    });

    res.status(200).json({ success: true, orders: enrichedHistory });
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
    const order = await Order.findById(req.params.id).populate('userId', 'name phone');
    if (!order)
      return res.status(404).json({ success: false, message: 'Order not found' });

    const cleanedOrder = await cleanOrder(order);
    res.status(200).json({ 
      success: true, 
      order: cleanedOrder,
      user: order.userId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order',
    });
  }
};

// ----------------------------
// Get order history by ID (admin)
// ----------------------------
exports.getOrderHistoryById = async (req, res) => {
  try {
    const history = await OrderHistory.findById(req.params.id).populate('userId', 'name phone');
    if (!history)
      return res.status(404).json({ success: false, message: 'Order history not found' });

    const obj = history.toObject ? history.toObject() : history;
    obj.customerName = obj.userId?.name || obj.shippingAddress?.name || '';
    obj.customerPhone = obj.userId?.phone || obj.shippingAddress?.phone || '';

    res.status(200).json({ 
      success: true, 
      history: obj,
      user: obj.userId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order history',
    });
  }
};
