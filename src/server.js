const http = require("https");
require("dotenv").config();
const express = require("express");
const app = express();

const uuid = require("uuid");

app.use(express.json());

const mongoose = require("mongoose");
const { timeStamp, Console } = require("console");
const { stringify } = require("querystring");
const { json } = require("express");
const zkBobBaseURL = "https://cloud-mvp.zkbob.com";
const uri = process.env.DATABASE_URI;
mongoose.connect(uri);

const connection = mongoose.connection;
connection.once("open", () => {
  console.log("DB connected.");
});

const PORT = process.env.PORT || 9081;
app.listen(PORT, () => {
  console.log(`Successfully served on port: ${PORT}.`);
});

const VendorSchema = new mongoose.Schema({
  _id: String,
  balance: Number,
  transactions: [
    {
      orderid: String,
      amount: Number,
      zkAddress: String,
      timestamp: Date,
      success: Boolean,
    },
  ],
  timestamp: Date,
});

const VendorModel = mongoose.model("Vendor", VendorSchema);

app.get("/getKey", async (req, res) => {
  const key = uuid.v4();
  const vendor = await VendorModel.create({
    _id: key.toString(),
    balance: 0,
    timestamp: new Date(),
  });
  //res.send({ Key: key });
  res.send({ Key: vendor });
});

app.get("/getPaymentStatus/:orderID/:api", async (req, res) => {
  const options = {
    method: "GET",
    hostname: "cloud-mvp.zkbob.com",
    port: null,
    path: "/history?id=" + process.env.ZKBOB_API,
    headers: {
      "Content-Length": "0",
    },
  };
  const chunks = [];

  //res.send(options.hostname + options.path);
  const ZKaddressRequest = http.request(options, function (zkBobRes) {
    zkBobRes.on("data", function (chunk) {
      chunks.push(chunk);
    });

    zkBobRes.on("end", async () => {
      const body = Buffer.concat(chunks);

      const stringResponse = body.toString();
      const transactionHistory = JSON.parse(stringResponse);

      const trxHistory = transactionHistory;

      const orderID = req.params.orderID;
      const api = req.params.api;

      const vendorData = await VendorModel.findById(api);

      const transactionArr = vendorData.transactions;

      const currentTransactioninZKPayserver = transactionArr.find(
        (ele) => ele.orderid == orderID
      );

      const currentZkAddr = currentTransactioninZKPayserver.zkAddress;

      const cloudTrxData = trxHistory.find((ele) => {
        console.log(ele.to, currentZkAddr);
        if (ele.to == currentZkAddr) {
        }
        return ele.to == currentZkAddr;
      });
      const coupon = cloudTrxData !== undefined ? cloudTrxData.txHash : "na";
      console.log(cloudTrxData + "asdf");
      if (cloudTrxData !== undefined) {
        if (currentTransactioninZKPayserver.success) {
          res.send({ status: "success", claimCupon: coupon });
        } else if (
          Number(cloudTrxData.amount) >
            Number(currentTransactioninZKPayserver.amount) - 5000 ||
          Number(cloudTrxData.amount) <
            Number(currentTransactioninZKPayserver.amount) + 5000
        ) {
          const updatedBalance =
            Number(vendorData.balance) +
            Number(currentTransactioninZKPayserver.amount);

          console.log(updatedBalance);

          const newTransactionArr = transactionArr.map((ele) => {
            if (ele.orderid === orderID) {
              ele.success = true;
              return true;
            } else return ele;
          });

          await VendorModel.findByIdAndUpdate(api, {
            balance: updatedBalance,
            transactions: newTransactionArr,
          });

          res.send({ status: "success", claimCupon: coupon });
        }
      } else {
        res.send({ status: "InProcess", claimCoupon: coupon });
      }
    });
  });
  ZKaddressRequest.end();
  //console.log(req.params);
  //check for the request to bob cloud list of transactions
  //check in transaction list
  //if found success ok else keep on trying
  //on success increase balance of vendor
  //and add transaction to the transaction array
});

app.get("/getAddressToPay/:amount/:orderID/:api", async (req, res) => {
  const requestURL =
    zkBobBaseURL + "/generateAddress?id=" + process.env.ZKBOB_API;

  const options = {
    method: "GET",
    hostname: "cloud-mvp.zkbob.com",
    port: null,
    path: "/generateAddress?id=" + process.env.ZKBOB_API,
    headers: {
      "Content-Length": "0",
    },
  };

  const ZKaddressRequest = http.request(options, function (zkBobRes) {
    const chunks = [];

    zkBobRes.on("data", function (chunk) {
      chunks.push(chunk);
    });

    zkBobRes.on("end", async () => {
      const body = Buffer.concat(chunks);

      const stringResponse = body.toString();
      const jsonResponse = JSON.parse(stringResponse);

      const latestAddress = jsonResponse.address;
      const amount = req.params.amount;
      console.log(amount);
      const orderID = req.params.orderID;
      const api = req.params.api;

      const vendorData = await VendorModel.findById(api);

      const transactionData = {
        orderid: orderID,
        amount: amount,
        zkAddress: latestAddress,
        timestamp: new Date(),
        success: false,
      };

      var isOrderIdPresent = false;

      const transactionArr = vendorData.transactions
        ? vendorData.transactions
        : undefined;

      transactionArr.forEach((trx) => {
        if (trx.orderid == orderID && !isOrderIdPresent) {
          isOrderIdPresent = true;
        }
      });

      if (isOrderIdPresent) {
        res.send(
          transactionArr.find((ele) => {
            return ele.orderid == orderID;
          })
        );
      } else {
        vendorData.transactions.push(transactionData);
      }

      await VendorModel.findByIdAndUpdate(api, vendorData);

      const responseJson = { address: latestAddress, orderId: orderID };

      res.send(transactionData);

      console.log(body.toString());
    });
  });

  ZKaddressRequest.end();

  //res.send(req.params)
  //store amount
  //get new address
  //store new address and amount and in waiting transactions
});

app.get("/withdrawAmountTo/:zkAddress/:api", async (req, res) => {
  console.log(req.params);
  const apiKey = req.params.api;
  const vendorData = await VendorModel.findById(apiKey);
  const zkPaybalance = vendorData.balance;

  //get bob balance

  const options = {
    method: "GET",
    hostname: "cloud-mvp.zkbob.com",
    port: null,
    path: "/account?id=" + process.env.ZKBOB_API,
    headers: {
      "Content-Length": "0",
    },
  };

  const ZKbobReq = http.request(options, function (zkRes) {
    const chunks = [];

    zkRes.on("data", function (chunk) {
      chunks.push(chunk);
    });

    zkRes.on("end", async () => {
      const body = Buffer.concat(chunks);
      const json = JSON.parse(body.toString());
      const cloudBalance = Number(json.balance);
      const zkaddr = req.params.zkAddress;

      if (Number(cloudBalance) > Number(zkPaybalance) + 100000000) {
        sendMoneyToZKAddr(zkaddr, zkPaybalance);
        await VendorModel.findByIdAndUpdate(apiKey, { balance: 0 });
        res.send({
          message:
            "success, wait for a while and check your bob account in bob ui",
        });
      } else {
        res.send({ meessage: "failure" });
      }
    });
  });

  ZKbobReq.end();

  //make vendor balance zero
  //send that amount to the givenn zk address
});

app.get("/getDashboardData/:api", async (req, res) => {
  const apiKey = req.params.api;

  const vendorData = await VendorModel.findById(apiKey);

  res.send(vendorData);
  //get vendor data
});

const sendMoneyToZKAddr = (zkAddr, amount) => {
  const options = {
    method: "POST",
    hostname: "cloud-mvp.zkbob.com",
    port: null,
    path: "/transfer",
    headers: {
      "Content-Type": "application/json",
    },
  };

  const req = http.request(options, function (res) {
    const chunks = [];

    res.on("data", function (chunk) {
      chunks.push(chunk);
    });

    res.on("end", function () {
      const body = Buffer.concat(chunks);
      console.log(body.toString());
    });
  });

  const jsonval = {
    accountId: process.env.ZKBOB_API,
    amount: amount,
    to: zkAddr,
  };

  const writeVal = JSON.stringify(jsonval);
  console.log(writeVal);
  req.write(writeVal);
  req.end();
};

//af92e721-6e10-4e8e-81c6-fcf7e19dd9a6

//70f6b19c-0b01-4415-bf59-d09d6e9f6091
