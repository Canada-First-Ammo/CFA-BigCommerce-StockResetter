require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const app = express();
app.use(bodyParser.json());
const port = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("CFA-StockResetter");
});

let currentInProgressProducts = [];

app.post("/webhook", (req, res) => {
  console.log(req.body);
  let productId = req.body.data.id;
  console.log("Received Webhook from BC for product ID " + productId);
  if (currentInProgressProducts.includes(productId)) {
    res.status(403);
  } else {
    currentInProgressProducts.push(productId);
    checkProductStock(productId);
    res.send("OK");
  }
});

async function checkProductStock(prod_id) {
  let productVariants = (
    await getBCJSONData(
      "https://api.bigcommerce.com/stores/udt1amkaxd/v3/catalog/products/" +
        prod_id +
        "/variants"
    )
  ).data;
  let productOptions = (
    await getBCJSONData(
      "https://api.bigcommerce.com/stores/udt1amkaxd/v3/catalog/products/" +
        prod_id +
        "/options"
    )
  ).data;

  if (productVariants.length == 1) {
    return; // Do nothing, no other variations to change to
  }

  console.log(JSON.stringify(productOptions));
  let updated = false;
  productVariants.forEach((variant) => {
    if (updated) {
      return;
    }
    if (variant.inventory_level > 0) {
      console.log("Setting Default Variant to " + variant.id);
      // Reset all values to not default
      productOptions.forEach((option) => {
        option.option_values.forEach((value) => {
          value.is_default = false;
        });
      });
      variant.option_values.forEach((value) => {
        productOptions.forEach((option) => {
          if (option.id == value.option_id) {
            option.option_values.forEach((optVal) => {
              if (optVal.id == value.id) {
                optVal.is_default = true;
              }
            });
          }
        });
      });
      updated = true;
    }
  });

  console.log(JSON.stringify(productOptions));
  productOptions.forEach(async (productOption) => {
    let res = await fetch(
      "https://api.bigcommerce.com/stores/udt1amkaxd/v3/catalog/products/" +
        prod_id +
        "/options/" +
        productOption.id,
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Auth-Token": process.env.AUTHTOKEN,
        },
        body: JSON.stringify(productOption),
        method: "PUT",
      }
    );
    if (res.status != 200) {
      console.log("Something went big wrong");
      console.log(res.status);
    }
  });
}

async function getBCJSONData(url) {
  let res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Auth-Token": process.env.AUTHTOKEN,
    },
  });
  if (res.status != 200) {
    console.log(
      "Something went wrong, Status code " +
        res.status +
        " when fetching " +
        url
    );
    return null;
  } else if (res.status == 204) {
    console.log("Couldn't get data, returned with 204.");
    emailMitch("Failed to get data", "Failed to get data from " + url);
    return null;
  }
  let json = await res.json();
  return json;
}

app.listen(port, () => {
  console.log(`CFA Stock Resetter listening on port ${port}`);
});
