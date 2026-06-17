import Razorpay from "razorpay";
import { logger } from "./logger";

const key_id = process.env.RAZORPAY_KEY_ID || "rzp_test_mock";
const key_secret = process.env.RAZORPAY_KEY_SECRET || "mock_secret";

export const razorpay = new Razorpay({
  key_id,
  key_secret,
});

logger.info("Razorpay SDK initialized");
