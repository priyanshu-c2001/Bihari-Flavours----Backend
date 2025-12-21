const mongoose = require('mongoose');
const crypto = require('crypto');

const Order = require('../models/order.model');
const TransactionModel = require('../models/transaction.model');
const OrderHistory = require('../models/orderhistory.model');
const Coupon = require('../models/coupon.model');
const Cart = require('../models/cart.model');
const razorpay = require('../config/razorpay');

/* ----------------------------
   VERIFY COUPON
---------------------------- */
exports.verifyCoupon = async (req, res) => {
  try {
    const { couponCode, totalAmount } = req.body;

    if (!couponCode) {
      return res.status(400).json({ success: false, message: 'Coupon code is required' });
    }

    const coupon = await Coupon.findOne({
      code: couponCode,
      status: 'active',
      usageLimit: { $gt: 0 },
      minPurchase: { $lte: totalAmount },
      maxPurchase: { $gte: totalAmount }
    });

    if (!coupon) {
      return res.status(400).json({ success: false, message: 'Coupon not applicable' });
    }

    res.status(200).json({
      success: true,
      coupon: {
        code: coupon.code,
        discountPercentage: coupon.discountPercentage,
        minPurchase: coupon.minPurchase,
        maxPurchase: coupon.maxPurchase
      }
    });
  } catch {
    res.status(500).json({ success: false, message: 'Coupon verification failed' });
  }
};

/* ----------------------------
   CREATE ORDER (TRANSACTION SAFE)
---------------------------- */
exports.createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { items, shippingAddress, paymentMethod, couponCode } = req.body;
    const userId = req.user._id;

    if (!items || !items.length) throw new Error('Cart is empty');

    let totalAmount = items.reduce((s, i) => s + i.price * i.quantity, 0);
    let coupon = null;

    if (couponCode) {
      coupon = await Coupon.findOneAndUpdate(
        {
          code: couponCode,
          status: 'active',
          usageLimit: { $gt: 0 },
          minPurchase: { $lte: totalAmount },
          maxPurchase: { $gte: totalAmount }
        },
        { $inc: { usageLimit: -1 } },
        { new: true, session }
      );

      if (!coupon) throw new Error('Coupon not applicable');
      totalAmount -= (totalAmount * coupon.discountPercentage) / 100;
    }

    const [order] = await Order.create([{
      userId,
      items,
      shippingAddress,
      paymentMethod,
      totalAmount,
      couponId: coupon?._id,
      paymentStatus: 'Pending'
    }], { session });

    /* COD FLOW */
    if (paymentMethod === 'COD') {
      await Cart.findOneAndUpdate(
        { userId },
        { $set: { cartItems: [], totalAmount: 0 } },
        { session }
      );

      await session.commitTransaction();
      session.endSession();

      return res.status(200).json({
        success: true,
        order,
        message: 'COD order placed successfully'
      });
    }

    /* ONLINE PAYMENT */
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(totalAmount * 100),
      currency: 'INR',
      receipt: order._id.toString()
    });

    order.razorpayOrderId = razorpayOrder.id;
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ success: true, order, razorpayOrder });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ success: false, message: error.message });
  }
};

/* ----------------------------
   RAZORPAY WEBHOOK (TRANSACTION SAFE)
---------------------------- */
exports.razorpayWebhook = async (req, res) => {
  console.log('🔔 Razorpay Webhook received');
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(req.body)
      .digest('hex');

    if (expectedSignature !== signature) {
      return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }

    const event = JSON.parse(req.body.toString());
    if (event.event !== 'payment.captured') {
      return res.status(200).json({ success: true, message: 'Event ignored' });
    }

    const payment = event.payload.payment.entity;
    const order = await Order.findOne({ razorpayOrderId: payment.order_id }).session(session);

    if (!order) throw new Error('Order not found');
    if (order.paymentStatus === 'Paid') {
      await session.commitTransaction();
      session.endSession();
      return res.status(200).json({ success: true, message: 'Already processed' });
    }

    order.paymentStatus = 'Paid';
    await order.save({ session });

    const exists = await TransactionModel.findOne({
      transactionId: payment.id
    }).session(session);

    if (!exists) {
      const txn = await TransactionModel.create([{
        orderId: order._id,
        userId: order.userId,
        items: order.items,
        amount: order.totalAmount,
        paymentMethod: order.paymentMethod,
        paymentStatus: 'Success',
        transactionId: payment.id
      }], { session });

      order.transactionId = txn[0]._id;
      await order.save({ session });
    }

    await Cart.findOneAndUpdate(
      { userId: order.userId },
      { $set: { cartItems: [], totalAmount: 0 } },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ success: true, message: 'Payment processed successfully' });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: 'Webhook processing failed' });
  }
};

/* ----------------------------
   GET USER ORDERS (FIXED SHAPE)
---------------------------- */
exports.getUserOrders = async (req, res) => {
  try {
    const userId = req.user._id;

    const activeOrders = await Order.find({ userId }).lean();
    const completedOrders = await OrderHistory.find({ userId }).lean();

    const completedSet = new Set(
      completedOrders.map(o => o.originalOrderId.toString())
    );

    const allOrders = [...activeOrders, ...completedOrders]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const formatted = allOrders.map(o => ({
      _id: o._id,
      items: o.items,
      totalAmount: o.totalAmount,
      orderStatus: o.orderStatus,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      placedDate: o.createdAt,
      shippingAddress: o.shippingAddress,
      isCompleted: completedSet.has(o._id.toString())
    }));

    res.status(200).json({ success: true, orders: formatted });

  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
};

/* ----------------------------
   GET ORDER DETAILS
---------------------------- */
exports.getOrderDetails = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.status(200).json({ success: true, order });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch order details' });
  }
};
