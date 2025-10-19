import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCart } from "../context/CartContext.jsx";
import { createOrder, createPayment } from "../services/Api.js";

export default function PaymentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { clearCart } = useCart();

  const cartFromState = location.state?.cartItems || [];
  const cartFromStorage = (() => {
    try {
      return JSON.parse(localStorage.getItem("cart")) || [];
    } catch {
      return [];
    }
  })();

  const [cartItems, setCartItems] = useState([]);
  const [orderNumber, setOrderNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [paymentInfo, setPaymentInfo] = useState({ bankName: "", accountNumber: "" });

  const banks = ["FNB", "Standard Bank", "ABSA", "Nedbank", "Capitec", "Investec"];

  useEffect(() => {
    const items = cartFromState.length ? cartFromState : cartFromStorage;
    setCartItems(items);
    const randomOrder = "ORD" + Math.floor(100000 + Math.random() * 900000);
    setOrderNumber(randomOrder);
  }, [location.key]);

  const subtotal = cartItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const deliveryFee = 50;
  const vat = (subtotal + deliveryFee) * 0.15;
  const grandTotal = subtotal + deliveryFee + vat;

  const handlePlaceOrder = async () => {
    if (!cartItems.length) {
      alert("Your cart is empty.");
      return;
    }

    const buyer = JSON.parse(localStorage.getItem("user"));
    if (!buyer?.userId) {
      alert("Buyer information is missing. Please log in again.");
      return;
    }

    const addr = buyer.address || buyer.deliveryAddress || null;
    let deliveryAddress = "";
    if (addr && typeof addr === "object") {
      deliveryAddress = `${addr.street || ""}${addr.street ? ", " : ""}${addr.city || ""}${addr.city ? ", " : ""}${addr.zipCode || ""}`.trim();
    } else if (typeof addr === "string") {
      deliveryAddress = addr;
    }
    if (!deliveryAddress) {
      alert("Your account doesn't have a delivery address. Please add your address in your profile before placing an order.");
      return;
    }

    const orderItems = cartItems.map((item) => ({
      product: { productId: item.productId || item.id },
      quantity: item.quantity,
      priceAtPurchase: item.price,
    }));

    const orderData = {
      orderNumber,
      contactName: buyer.name || buyer.contact?.email || buyer.email || "",
      contactPhone: buyer.contact?.phoneNumber || buyer.phoneNumber || "",
      deliveryAddress,
      orderItems,
      paymentMethod,
      subtotal,
      deliveryFee,
      vat,
      grandTotal,
      status: "PENDING",
      buyer: { userId: buyer.userId },
    };

    try {
      const orderResponse = await createOrder(orderData);
      const savedOrder = orderResponse.data;

      try {
        const backendNumber = savedOrder.orderNumber || savedOrder.orderId || savedOrder.id;
        if (backendNumber) setOrderNumber(backendNumber);
      } catch (e) {}

      const paymentData = {
        paymentDate: new Date().toISOString().split("T")[0],
        paymentMethod,
        amount: grandTotal,
        status: paymentMethod === "eft" ? "PENDING" : "PAID",
        order: { orderId: savedOrder.orderId },
      };

      const paymentResponse = await createPayment(paymentData);

      try {
        savedOrder.payment = paymentResponse.data || { amount: paymentData.amount };
      } catch (e) {
        savedOrder.payment = { amount: paymentData.amount };
      }

      localStorage.setItem("latestOrder", JSON.stringify(savedOrder));
      clearCart();
      localStorage.removeItem("cart");

      try {
        window.dispatchEvent(new CustomEvent("order-created", { detail: savedOrder }));
      } catch (e) {
        const evt = document.createEvent("CustomEvent");
        evt.initCustomEvent("order-created", true, true, savedOrder);
        window.dispatchEvent(evt);
      }

      navigate("/orders", { state: { orderData: savedOrder } });
    } catch (error) {
      console.error("Error placing order:", error);
      let errorMessage = "Failed to place order. Please check your details and try again.";
      if (error?.response?.data) {
        if (typeof error.response.data === "string") {
          errorMessage = error.response.data;
        } else if (error.response.data.message) {
          errorMessage = error.response.data.message;
        } else {
          errorMessage = JSON.stringify(error.response.data);
        }
      } else if (error?.message) {
        errorMessage = error.message;
      }
      alert(errorMessage);
    }
  };

  // ✅ Updated to use backend image endpoint
  const getImageURL = (item) => {
    if (!item?.productId) return "/placeholder.png";
    return `http://localhost:8080/CarAccessories/product/image/${item.productId}`;
  };

  return (
    <div className="payment-page">
      <div className="main-content">
        {/* Order Details Section */}
        <div className="section">
          <h3>Order Details</h3>
          <div className="order-items">
            {cartItems.map((item) => (
              <div key={item.productId || item.id} className="order-item">
                <div className="image-box">
                  <img src={getImageURL(item)} alt={item.name} />
                </div>
                <div className="item-details">
                  <span className="item-name">{item.name}</span>
                  <span className="item-qty">x {item.quantity}</span>
                  <span className="item-price">R{(item.price * item.quantity).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="shipping-title">Your Shipping</p>
          <p className="shipping-info">
            3-5 Business Days. Please pay attention to phone/text messages from the logistics provider.
          </p>
        </div>

        {/* Payment Method Section */}
        <div className="section" id="payment-section">
          <h3>Payment Method</h3>
          <div className="payment-method">
            <label>
              <input
                type="radio"
                name="method"
                value="card"
                checked={paymentMethod === "card"}
                onChange={() => setPaymentMethod("card")}
              />
              Credit/Debit Card
            </label>
            <label>
              <input
                type="radio"
                name="method"
                value="eft"
                checked={paymentMethod === "eft"}
                onChange={() => setPaymentMethod("eft")}
              />
              Bank Transfer (EFT)
            </label>
          </div>

          <div className="payment-form">
            {paymentMethod === "eft" && (
              <>
                <label>
                  Select Your Bank:
                  <select
                    name="bankName"
                    value={paymentInfo.bankName}
                    onChange={(e) =>
                      setPaymentInfo({ ...paymentInfo, bankName: e.target.value })
                    }
                  >
                    <option value="">--Select Bank--</option>
                    {banks.map((bank) => (
                      <option key={bank} value={bank}>
                        {bank}
                      </option>
                    ))}
                  </select>
                </label>

                <p className="eft-info">
                  After clicking “Place Order”, please transfer the amount to our account:
                  <br />
                  <strong>Account: 123456789 | Bank: FNB | Branch Code: 250655</strong>
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Order Summary */}
      <div className="order-summary">
        <h3>Order Summary</h3>
        <p>
          <strong>Order Number:</strong> {orderNumber}
        </p>
        <hr />
        <p>Subtotal: R{subtotal.toFixed(2)}</p>
        <p>Delivery Fee: R{deliveryFee}</p>
        <p>VAT (15%): R{vat.toFixed(2)}</p>
        <p>
          <strong>Grand Total: R{grandTotal.toFixed(2)}</strong>
        </p>
        <button onClick={handlePlaceOrder} className="place-order-btn">
          Place Order
        </button>
      </div>

      {/* Styles */}
      <style>{`
        html, body, #root {
          height: 100%;
          margin: 0;
          background-color: #e9e8e8ff;
        }
        .payment-page {
          display: flex;
          gap: 30px;
          padding: 30px;
          font-family: sans-serif;
          background: #e9e8e8ff;
        }
        .main-content { flex: 2; }
        .section {
          background: #f1ededff;
          padding: 20px;
          margin-bottom: 20px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .section h3 { margin-bottom: 15px; }
        label { display: block; margin-bottom: 10px; font-weight: 500; }
        input, select {
          width: 100%;
          padding: 8px;
          margin-top: 5px;
          border-radius: 5px;
          border: 1px solid #ccc;
        }
        .shipping-title {
          font-size: 14px;
          font-weight: 600;
          margin-top: 10px;
          margin-bottom: 5px;
          color: #333;
        }
        .shipping-info {
          font-size: 12px;
          font-family: 'Comic Sans MS', 'Arial', sans-serif;
          color: #555;
        }
        .payment-method {
          display: flex;
          gap: 20px;
          margin-bottom: 15px;
        }
        .order-items {
          display: flex;
          gap: 15px;
          flex-wrap: wrap;
          margin-bottom: 15px;
        }
        .order-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: 15px;
        }
        .image-box {
          width: 80px;
          height: 80px;
          overflow: hidden;
          border-radius: 5px;
          background: #f0f0f0;
        }
        .image-box img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .item-details {
          margin-top: 5px;
          text-align: center;
        }
        .item-name { font-weight: 600; display: block; }
        .item-qty, .item-price { font-size: 0.9rem; color: #444; display: block; }
        .order-summary {
          flex: 1;
          position: sticky;
          top: 30px;
          background: #f1ededff;
          padding: 20px;
          border-radius: 10px;
          height: fit-content;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .order-summary p {
          font-family: 'Comic Sans MS', 'Arial', sans-serif;
          font-size: 14px;
          margin: 5px 0;
        }
        .order-summary strong { font-weight: 400; }
        .eft-info { font-size: 14px; color: #555; margin-top: 10px; }
        .place-order-btn {
          background: #09c;
          color: #fff;
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.3s;
          width: 100%;
        }
        .place-order-btn:hover { background: #2563eb; }
      `}</style>
    </div>
  );
}

