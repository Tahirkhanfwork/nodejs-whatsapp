const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const db = require("./config/db");
const WhatsappMessage = require("./models/WhatsappMessage");

dotenv.config();
db()
  .then(() => console.log("Database connected successfully"))
  .catch((err) => console.log("Database connection error:", err));

const app = express();
app.use(express.json());

const { WEBHOOK_VERIFY_TOKEN, GRAPH_API_TOKEN, PORT, phone_number_id } = process.env;

app.post("/webhook", async (req, res) => {
  try {
    console.log('Webhook Received:', JSON.stringify(req.body, null, 2)); // Debugging the full payload

    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const contact = req.body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0];
    const metadata = req.body.entry?.[0]?.changes?.[0]?.value?.metadata;

    // Ensure we have a message from the user and not our own outgoing messages
    if (message?.from && message?.from !== phone_number_id) {
      const userPhoneNumber = message.from;
      const messageType = message.type;
      const messageTimestamp = message.timestamp;
      const messageTextBody = message?.text?.body || null;
      const buttonReply = message?.interactive?.button_reply;

      // Prepare the message object
      const messageData = {
        message_id: message.id,
        message_type: messageType,
        timestamp: messageTimestamp,
      };

      if (messageType === "text") {
        messageData.message_text_body = messageTextBody;
      } else if (messageType === "interactive" && buttonReply) {
        messageData.button_id = buttonReply.id;
        messageData.button_title = buttonReply.title;
      }

      console.log('Message Data:', messageData); // Debugging message data

      // Check if there is an existing document for this user based on contact_wa_id
      const existingConversation = await WhatsappMessage.findOne({ contact_wa_id: userPhoneNumber });

      if (existingConversation) {
        // Update the existing document with the new message
        console.log('Existing conversation found, updating...');
        await WhatsappMessage.updateOne(
          { contact_wa_id: userPhoneNumber },
          { $push: { messages: messageData } }
        );
      } else {
        // Create a new document for this user
        console.log('No conversation found, creating a new one...');
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
        console.log('New conversation saved successfully');
      }
    } else {
      console.log("Message is from our own number or invalid");
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Error in /webhook route:", error);
    res.sendStatus(500); // Respond with error status if something goes wrong
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
    console.log('Message sent:', response.data); // Debugging the response
  } catch (error) {
    console.error('Error sending message:', error.response ? error.response.data : error.message);
  }
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
