import "dotenv/config";

const PORT = process.env.PORT || 5000;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

async function runTests() {
  console.log("🧪 Starting end-to-end FlexPass API flow verification...");

  // 1. User login
  console.log("\n🔑 1. Logging in user (nipun@gmail.com)...");
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "nipun@gmail.com", password: "password123" }),
  });
  const loginData = await loginRes.json() as any;
  if (!loginData.success) {
    console.error("❌ Login failed:", loginData);
    process.exit(1);
  }
  const userToken = loginData.data.token;
  const initialBalance = loginData.data.user.credits_balance;
  console.log(`✅ Logged in successfully. Token length: ${userToken.length}. Initial Balance: ${initialBalance} credits.`);

  // 2. Fetch nearby gyms
  console.log("\n🏋️ 2. Fetching nearby gyms near Gold's Gym (28.6250, 77.3730)...");
  const gymsRes = await fetch(`${BASE_URL}/gyms/nearby?lat=28.6250&lng=77.3730`, {
    method: "GET",
  });
  const gymsData = await gymsRes.json() as any;
  if (!gymsData.success || gymsData.data.length === 0) {
    console.error("❌ Failed to fetch nearby gyms:", gymsData);
    process.exit(1);
  }
  const targetGym = gymsData.data[0];
  console.log(`✅ Found nearby gym: "${targetGym.name}" at distance ${targetGym.distance_meters}m. Current credit cost: ${targetGym.current_credit_cost}`);

  // 3. Try geofenced QR code generation far away (should FAIL)
  console.log("\n❌ 3. Attempting QR generation from far away (28.5000, 77.3000)...");
  const farRes = await fetch(`${BASE_URL}/checkin/generate-qr`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      gymId: targetGym.id,
      userLat: 28.5000,
      userLng: 77.3000,
    }),
  });
  const farData = await farRes.json() as any;
  if (farRes.status === 403 && !farData.success) {
    console.log(`✅ Successfully rejected. Response message: "${farData.message}"`);
  } else {
    console.error("❌ Geofence validation failed to reject far-away request:", farData);
    process.exit(1);
  }

  // 4. QR code generation close by (should SUCCEED)
  console.log("\n🎯 4. Requesting QR token standing AT the gym (28.6250, 77.3730)...");
  const qrRes = await fetch(`${BASE_URL}/checkin/generate-qr`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      gymId: targetGym.id,
      userLat: 28.6250,
      userLng: 77.3730,
    }),
  });
  const qrData = await qrRes.json() as any;
  if (!qrData.success) {
    console.error("❌ QR generation failed:", qrData);
    process.exit(1);
  }
  const qrToken = qrData.data.qr_token;
  console.log(`✅ QR generated: ${qrToken.substring(0, 15)}... Expires in: 15s`);

  // 5. Gym owner (admin) login
  console.log("\n🔑 5. Logging in Gym Owner/Admin (owner@gmail.com)...");
  const ownerLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@gmail.com", password: "password123" }),
  });
  const ownerLoginData = await ownerLoginRes.json() as any;
  if (!ownerLoginData.success) {
    console.error("❌ Owner login failed:", ownerLoginData);
    process.exit(1);
  }
  const ownerToken = ownerLoginData.data.token;
  console.log(`✅ Owner/Admin logged in successfully. Role: ${ownerLoginData.data.user.role}`);

  // 6. Scanner scans and validates QR code
  console.log("\n📱 6. Scanner validating the user QR code...");
  const valRes = await fetch(`${BASE_URL}/checkin/validate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ownerToken}`,
    },
    body: JSON.stringify({ token: qrToken }),
  });
  const valData = await valRes.json() as any;
  if (!valData.success) {
    console.error("❌ Validation failed:", valData);
    process.exit(1);
  }
  console.log(`✅ Punch-in SUCCESSFUL!`);
  console.log(` - Checked-in User: ${valData.data.user_name}`);
  console.log(` - Credits Deducted: ${valData.data.credits_deducted}`);
  console.log(` - Remaining Balance: ${valData.data.remaining_balance}`);

  // 7. Verify balance decrement
  console.log("\n💳 7. Checking user wallet balance to verify deduction...");
  const balRes = await fetch(`${BASE_URL}/credits/balance`, {
    method: "GET",
    headers: { Authorization: `Bearer ${userToken}` },
  });
  const balData = await balRes.json() as any;
  if (!balData.success || balData.data.credits_balance !== valData.data.remaining_balance) {
    console.error("❌ Wallet balance mismatch:", balData);
    process.exit(1);
  }
  console.log(`✅ Wallet balance verified: ${balData.data.credits_balance} credits.`);

  console.log("\n🎉 E2E Flow test completed successfully! All APIs are fully functional!");
}

runTests().catch(console.error);
