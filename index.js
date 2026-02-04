const express = require("express");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

app.post("/webhook", (req, res) => {
  console.log("GitHub Event:", req.headers["x-github-event"]);
  console.log(req.body);

  res.send("Webhook received!");
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
