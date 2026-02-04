import express from "express";

const app = express();
app.use(express.json());

app.post("/webhook", (req, res) => {
  console.log("✅ Webhook received!");
  console.log("Event:", req.headers["x-github-event"]);
  console.log(req.body);

  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("Server running");
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
