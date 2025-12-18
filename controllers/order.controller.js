// controllers/order.controller.js
const Order = require('../models/order.model');
const TransactionModel = require('../models/transaction.model'); // renamed
const OrderHistory = require('../models/orderhistory.model'); // new
const Coupon = require('../models/coupon.model');
const razorpay = require('../config/razorpay');
const verifySignature = require('../utils/verifySignature');

// ----------------------------
// VERIFY COUPON BEFORE CREATING ORDER
// ----------------------------
exports.verifyCoupon = async (req, res) => {
  try {
    const { couponCode, totalAmount } = req.body;

    if (!couponCode)
      return res.status(400).json({ success: false, message: 'Coupon code is required' });

    const coupon = await Coupon.findOne({ code: couponCode, status: 'active' });
    if (!coupon)
      return res.status(400).json({ success: false, message: 'Invalid coupon' });

    if (totalAmount < coupon.minPurchase || totalAmount > coupon.maxPurchase)
      return res.status(400).json({ success: false, message: 'Coupon not applicable for this order amount' });

    if (coupon.usageLimit <= 0)
      return res.status(400).json({ success: false, message: 'Coupon usage limit reached' });

    res.status(200).json({
      success: true,
      coupon: {
        code: coupon.code,
        discountPercentage: coupon.discountPercentage,
        minPurchase: coupon.minPurchase,
        maxPurchase: coupon.maxPurchase
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to verify coupon', error: error.message });
  }
};

// ----------------------------
// CREATE ORDER
// ----------------------------
exports.createOrder = async (req, res) => {
  try {
    const { items, shippingAddress, paymentMethod, couponCode } = req.body;
    console.log("Create Order Request Body:", req.body);
    const userId = req.user._id;

    if (!items || items.length === 0)
      return res.status(400).json({ success: false, message: "Cart is empty" });

    // Check stock
    for (const i of items) {
      if (i.stockStatus === 'outofstock')
        return res.status(400).json({ success: false, message: `${i.name} is out of stock` });
    }

    // Calculate total amount
    let totalAmount = items.reduce((acc, i) => acc + i.price * i.quantity, 0);

    let coupon = null;
    if (couponCode) {
      // Lookup coupon by code (couponCode may be a string like 'WELCOME10')
      coupon = await Coupon.findOne({ code: couponCode, status: 'active' });
      if (!coupon) return res.status(400).json({ success: false, message: 'Coupon not found or inactive' });

      // Check purchase amount constraints
      if (totalAmount < coupon.minPurchase || totalAmount > coupon.maxPurchase) {
        return res.status(400).json({ success: false, message: 'Coupon not applicable for this order amount' });
      }

      if (coupon.usageLimit <= 0) {
        return res.status(400).json({ success: false, message: 'Coupon usage limit reached' });
      }

      totalAmount = totalAmount - (totalAmount * coupon.discountPercentage) / 100;

      // Temporarily reserve coupon usage
      coupon.usageLimit -= 1;
      await coupon.save();
    }

    // Create order
    const order = await Order.create({
      userId,
      items,
      shippingAddress: {
        name: shippingAddress.name || '',
        phone: shippingAddress.phone || '',
        street: shippingAddress.street || '',
        city: shippingAddress.city || '',
        state: shippingAddress.state || '',
        postalCode: shippingAddress.postalCode || '',
        country: shippingAddress.country || ''
      },
      paymentMethod,
      totalAmount,
      couponId: coupon?._id
    });

    let razorpayOrder = null;

    if (paymentMethod !== 'COD') {
      razorpayOrder = await razorpay.orders.create({
        amount: totalAmount * 100,
        currency: 'INR',
        receipt: order._id.toString()
      });

      // Save Razorpay order ID
      order.razorpayOrderId = razorpayOrder.id;
      await order.save();

      // Auto-delete unpaid orders after 2 hours and restore coupon usage if reserved
      setTimeout(async () => {
        try {
          const orderPending = await Order.findById(order._id);
          if (orderPending && orderPending.paymentStatus === 'Pending') {
            if (coupon) {
              // Reload the latest coupon document in case it changed elsewhere
              const latestCoupon = await Coupon.findById(coupon._id);
              if (latestCoupon) {
                latestCoupon.usageLimit = (latestCoupon.usageLimit || 0) + 1;
                await latestCoupon.save();
              }
            }
            await Order.findByIdAndDelete(order._id);
            console.log(`Deleted unpaid order ${order._id} after 2 hours`);
          }
        } catch (err) {
          console.error('Error in auto-delete unpaid order timeout:', err);
        }
      }, 2 * 60 * 60 * 1000);
    }

    res.status(200).json({ success: true, order, razorpayOrder });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ----------------------------
// RAZORPAY WEBHOOK
// ----------------------------
exports.razorpayWebhook = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature))
      return res.status(400).json({ success: false, message: 'Invalid signature' });

    const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.paymentStatus === 'Paid')
      return res.status(200).json({ success: true, message: 'Payment already processed' });

    order.paymentStatus = 'Paid';
    await order.save();

    // Create transaction
    const transaction = await TransactionModel.create({
      orderId: order._id,
      userId: order.userId,
      items: order.items,
      amount: order.totalAmount,
      paymentMethod: order.paymentMethod,
      paymentStatus: 'Success',
      transactionId: razorpay_payment_id
    });

    order.transactionId = transaction._id;
    await order.save();

    // ----------------------------
    // PUSH TO ORDER HISTORY
    // ----------------------------
    await OrderHistory.create({
      originalOrderId: order._id,
      userId: order.userId,
      items: order.items,
      totalAmount: order.totalAmount,
      shippingAddress: order.shippingAddress,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      transactionId: order.transactionId,
      completedAt: new Date()
    });

    res.status(200).json({ success: true, message: 'Payment verified', transaction });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ----------------------------
// GET USER ORDERS
// ----------------------------

exports.getUserOrders = async (req, res) => {
  try {
    const userId = req.user._id;

    // Fetch active orders
    const activeOrders = await Order.find({ userId })
      .populate('items.productId', 'name price')
      .lean();

    // Fetch completed orders from history
    const completedOrders = await OrderHistory.find({ userId })
      .populate('items.productId', 'name price')
      .lean();

    // Combine both arrays
    const allOrders = [...activeOrders, ...completedOrders];

    // Sort combined orders by createdAt descending (latest first)
    allOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Format orders for frontend
    const formattedOrders = allOrders.map(order => ({
      id: order._id,
      items: order.items.map(item => ({
        productId: item.productId._id,
        name: item.name,
        price: item.price,
        quantity: item.quantity
      })),
      totalAmount: order.totalAmount,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      placedDate: order.createdAt,
      shipping: {
        name: order.shippingAddress.name,
        phone: order.shippingAddress.phone,
        street: order.shippingAddress.street,
        city: order.shippingAddress.city,
        state: order.shippingAddress.state,
        postalCode: order.shippingAddress.postalCode,
        country: order.shippingAddress.country
      },
      isCompleted: completedOrders.some(h => h._id.equals(order._id))
    }));

    res.status(200).json({ success: true, orders: formattedOrders });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to fetch user orders', error: error.message });
  }
};
// ----------------------------
// GET ORDER DETAILS
// ----------------------------
exports.getOrderDetails = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const order = await Order.findOne({ _id: id, userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.status(200).json({ success: true, order });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to fetch order details', error: error.message });
  }
};

// ----------------------------
// VERIFY PAYMENT (frontend call)
// ----------------------------
exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment details' });
    }

    // Verify signature
    const isValid = verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) return res.status(400).json({ success: false, message: 'Invalid payment signature' });

    // Find order
    const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.paymentStatus === 'Paid') {
      return res.status(200).json({ success: true, message: 'Payment already verified', order });
    }

    // Mark as paid
    order.paymentStatus = 'Paid';
    await order.save();

    // Create transaction
    const transaction = await TransactionModel.create({
      orderId: order._id,
      userId: order.userId,
      items: order.items,
      amount: order.totalAmount,
      paymentMethod: order.paymentMethod,
      paymentStatus: 'Success',
      transactionId: razorpay_payment_id
    });

    order.transactionId = transaction._id;
    await order.save();

    // ----------------------------
    // PUSH TO ORDER HISTORY
    // ----------------------------
    await OrderHistory.create({
      originalOrderId: order._id,
      userId: order.userId,
      items: order.items,
      totalAmount: order.totalAmount,
      shippingAddress: order.shippingAddress,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      transactionId: order.transactionId,
      completedAt: new Date()
    });

    res.status(200).json({ success: true, message: 'Payment verified successfully', order, transaction });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Payment verification failed', error: error.message });
  }
};
