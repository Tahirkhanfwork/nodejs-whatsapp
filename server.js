const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const db = require("./config/db");
const WhatsappMessage = require("./models/WhatsappMessage");

db()
  .then()
  .catch((err) => console.log(err));

dotenv.config();
const app = express();
app.use(express.json());

const { WEBHOOK_VERIFY_TOKEN, GRAPH_API_TOKEN, PORT, MONGO_URI } = process.env;

app.post("/webhook", async (req, res) => {
  const logEntry = `Incoming webhook message: ${JSON.stringify(req.body, null, 2)}`;
  console.log(logEntry);

  const entries = req.body.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const messageValue = change.value;
      const statuses = messageValue.statuses || [];
      const messages = messageValue.messages || [];

      for (const status of statuses) {
        const conversationId = status.conversation?.id || null;

        if (status.status === "read") {
          await WhatsappMessage.findOneAndUpdate(
            { conversationId, receiver: status.recipient_id },
            {
              messageId: status.id,
              sender: "whatsapp_business_account",
              receiver: status.recipient_id,
              timestamp: new Date(parseInt(status.timestamp) * 1000),
              status: status.status,
              conversationId,
              expirationTimestamp: new Date(parseInt(status.conversation?.expiration_timestamp) * 1000),
              pricing: status.pricing || {},
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        }
      }

      for (const message of messages) {
        await WhatsappMessage.findOneAndUpdate(
          { conversationId: messageValue.conversation?.id, sender: message.from },
          {
            messageId: message.id,
            sender: message.from,
            receiver: messageValue.metadata.display_phone_number,
            text: message.text?.body,
            timestamp: new Date(parseInt(message.timestamp) * 1000),
            status: "received",
            conversationId: messageValue.conversation?.id || message.id,
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
    }
  }

  res.sendStatus(200);
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
    console.log("Webhook verified successfully!");
  } else if (mode === undefined && token === undefined && challenge === undefined) {
    WhatsappMessage.find({}, (err, messages) => {
      if (err) {
        res.status(500).json({ error: "Error fetching log messages." });
      } else {
        res.status(200).json({ logMessages: messages });
      }
    });
  } else {
    res.sendStatus(403);
  }
});

app.get("/", (req, res) => {
  res.send(`<pre>Nothing to see here. Checkout README.md to start.</pre>`);
});

app.listen(PORT, () => {
  console.log(`Server is listening on port: ${PORT}`);
});
