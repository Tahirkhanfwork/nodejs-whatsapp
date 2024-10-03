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
  const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const contact = req.body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0];
  const metadata = req.body.entry?.[0]?.changes?.[0]?.value?.metadata;

  // Save only incoming user messages, not your outgoing messages
  if (message?.from && message?.from !== phone_number_id) {
    const userPhoneNumber = message.from;
    const messageType = message.type;
    const messageTextBody = message.text?.body || null;
    const messageTimestamp = message.timestamp;
    const buttonReply = message?.interactive?.button_reply;

    // Prepare the message object
    const messageData = {
      message_id: message.id,
      message_type: messageType,
      message_text_body: messageTextBody,
      timestamp: messageTimestamp,
    };

    if (buttonReply) {
      messageData.button_id = buttonReply.id;
      messageData.button_title = buttonReply.title;
    }

    try {
      // Check if there's an existing document for this user/phone number
      const existingConversation = await WhatsappMessage.findOne({ contact_wa_id: userPhoneNumber });

      if (existingConversation) {
        // Update the existing document and append the new message
        await WhatsappMessage.updateOne(
          { contact_wa_id: userPhoneNumber },
          { $push: { messages: messageData } }
        );
      } else {
        // Create a new document for a new conversation
        const newConversation = new WhatsappMessage({
          messaging_product: metadata?.messaging_product,
          display_phone_number: metadata?.display_phone_number,
          phone_number_id: metadata?.phone_number_id,
          contact_name: contact?.profile?.name,
          contact_wa_id: userPhoneNumber,
          recipient_id: userPhoneNumber,
          messages: [messageData],
        });

        await newConversation.save();
      }
    } catch (error) {
      console.error("Error saving message to MongoDB:", error);
    }
  }

  res.sendStatus(200);
});

// Outgoing messages won't be saved
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

async function sendWhatsAppMessage(recipient, messageText) {
  const data = {
    messaging_product: 'whatsapp',
    to: recipient,
    text: { body: messageText },
  };

  try {
    const response = await axios.post(`https://graph.facebook.com/v20.0/${phone_number_id}/messages`, data, {
      headers: { Authorization: `Bearer ${GRAPH_API_TOKEN}` },
    });
  } catch (error) {
    console.error('Error sending message:', error.response ? error.response.data : error.message);
  }
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
