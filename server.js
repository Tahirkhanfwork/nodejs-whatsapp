const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const db = require("./config/db");
const WhatsappMessage = require("./models/WhatsappMessage");

db()
  .then(() => console.log("Database connected successfully"))
  .catch((err) => console.log("Database connection error:", err));

dotenv.config();
const app = express();
app.use(express.json());

const { WEBHOOK_VERIFY_TOKEN, GRAPH_API_TOKEN, PORT, phone_number_id } = process.env;

app.post("/webhook", async (req, res) => {
  try {
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const status = req.body.entry?.[0]?.changes?.[0]?.value?.statuses?.[0];
    const contact = req.body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0];
    const metadata = req.body.entry?.[0]?.changes?.[0]?.value?.metadata;
    const messaging_product = req.body.entry?.[0]?.changes?.[0]?.value?.messaging_product;

    // Construct the data object
    const data = {
      messaging_product: messaging_product,  // Correctly assigned from the "value" field
      display_phone_number: metadata?.display_phone_number,
      phone_number_id: metadata?.phone_number_id,
      recipient_id: contact?.wa_id,
      contact_name: contact?.profile?.name,
      conversation_id: status?.conversation?.id || null,
      messages: [],
    };

    // Check if conversation exists
    let conversation = await WhatsappMessage.findOne({ conversation_id: data.conversation_id });

    if (!conversation) {
      console.log("No conversation found, creating a new one...");
      conversation = new WhatsappMessage(data);
    }

    // Only save user messages, not your own
    if (message?.from === data.recipient_id) {
      const userMessage = {
        message_id: message.id,
        message_text_body: message.text?.body || null,
        message_type: message.type,
        timestamp: message.timestamp,
      };

      // For interactive button replies, save button details
      if (message.type === "interactive" && message.interactive?.type === "button_reply") {
        userMessage.message_type = "button_reply";
        userMessage.button_id = message.interactive.button_reply.id;
        userMessage.button_title = message.interactive.button_reply.title;
      }

      conversation.messages.push(userMessage);
    }

    await conversation.save();

    res.sendStatus(200);
  } catch (error) {
    console.error("Error in /webhook route:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
    console.log("Webhook verified successfully!");
  } else {
    res.sendStatus(403);
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
